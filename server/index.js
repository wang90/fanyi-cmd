import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { translate as previewTranslate } from '../src/providers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// MongoDB连接
let db = null;
let client = null;
const DB_NAME = 'fanyi-cli';
const COLLECTION_NAME = 'history';

async function connectDB() {
  if (db) {
    return; // 已经连接
  }
  try {
    client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ MongoDB连接成功');
  } catch (error) {
    console.error('❌ MongoDB连接失败:', error.message);
    console.log('提示: 请确保MongoDB服务已启动 (mongod)');
    db = null;
    client = null;
  }
}

// 中间件
app.use(cors());
app.use(express.json());

// API路由（必须在静态文件服务之前）

// 获取配置
app.get('/api/config', (req, res) => {
  const configPath = path.resolve(process.env.HOME || process.env.USERPROFILE, '.fanyi-config.json');
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      // 兼容旧配置格式
      if (config.token && !config.apiKeys) {
        config.apiKeys = {};
      }
      if (!config.provider) {
        config.provider = 'libre';
      }
      res.json(config);
    } else {
      res.json({ 
        from: 'auto', 
        to: 'zh', 
        provider: 'libre',
        apiKeys: {}
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 保存配置
app.post('/api/config', (req, res) => {
  const configPath = path.resolve(process.env.HOME || process.env.USERPROFILE, '.fanyi-config.json');
  try {
    const config = req.body;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    res.json({ success: true, message: '配置已保存' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 预览翻译（不写入历史，仅用于测试当前配置）
app.post('/api/preview', async (req, res) => {
  try {
    const text = (req.body?.text || 'hello').toString();
    const cfg = req.body?.config || {};
    const previewConfig = {
      provider: cfg.provider || 'libre',
      from: cfg.from || 'auto',
      to: cfg.to || 'zh',
      apiKeys: cfg.apiKeys || {},
    };
    const result = await previewTranslate(text, previewConfig);
    res.json({ success: true, text, result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// 获取配置方案列表
app.get('/api/config-presets', (req, res) => {
  const presetsPath = path.resolve(process.env.HOME || process.env.USERPROFILE, '.fanyi-presets.json');
  try {
    if (fs.existsSync(presetsPath)) {
      const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
      // 确保返回的是数组
      res.json(Array.isArray(presets) ? presets : []);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('读取配置方案失败:', error.message);
    res.json([]);
  }
});

// 保存配置方案
app.post('/api/config-presets', (req, res) => {
  const presetsPath = path.resolve(process.env.HOME || process.env.USERPROFILE, '.fanyi-presets.json');
  try {
    let presets = [];
    if (fs.existsSync(presetsPath)) {
      const data = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
      // 确保 presets 是数组
      presets = Array.isArray(data) ? data : [];
    }
    
    const { name, config: presetConfig } = req.body;
    
    if (!name || !presetConfig) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    // 检查是否已存在同名方案
    const existingIndex = presets.findIndex(p => p.name === name);
    if (existingIndex >= 0) {
      // 更新现有方案
      presets[existingIndex] = { name, config: presetConfig, updatedAt: new Date().toISOString() };
    } else {
      // 添加新方案，最多10个
      if (presets.length >= 10) {
        // 删除最旧的方案
        presets.shift();
      }
      presets.push({ name, config: presetConfig, createdAt: new Date().toISOString() });
    }
    
    fs.writeFileSync(presetsPath, JSON.stringify(presets, null, 2));
    res.json({ success: true, presets: Array.isArray(presets) ? presets : [] });
  } catch (error) {
    console.error('保存配置方案失败:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 删除配置方案
app.delete('/api/config-presets/:name', (req, res) => {
  const presetsPath = path.resolve(process.env.HOME || process.env.USERPROFILE, '.fanyi-presets.json');
  try {
    if (!fs.existsSync(presetsPath)) {
      return res.json({ success: true, presets: [] });
    }
    
    const data = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
    const presets = Array.isArray(data) ? data : [];
    const filtered = presets.filter(p => p.name !== decodeURIComponent(req.params.name));
    
    fs.writeFileSync(presetsPath, JSON.stringify(filtered, null, 2));
    res.json({ success: true, presets: Array.isArray(filtered) ? filtered : [] });
  } catch (error) {
    console.error('删除配置方案失败:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 获取翻译历史
app.get('/api/history', async (req, res) => {
  try {
    if (!db) {
      // 数据库未连接时返回空数组，而不是503错误
      return res.json([]);
    }
    const collection = db.collection(COLLECTION_NAME);
    const history = await collection
      .find({})
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();
    res.json(history);
  } catch (error) {
    // 出错时也返回空数组，避免前端报错
    console.error('获取历史记录失败:', error.message);
    res.json([]);
  }
});

// 删除历史记录
app.delete('/api/history/:id', async (req, res) => {
  try {
    if (!db) {
      return res.json({ success: false, message: '数据库未连接' });
    }
    const collection = db.collection(COLLECTION_NAME);
    const result = await collection.deleteOne({ _id: req.params.id });
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('删除历史记录失败:', error.message);
    res.json({ success: false, message: error.message });
  }
});

// 清空历史记录
app.delete('/api/history', async (req, res) => {
  try {
    if (!db) {
      return res.json({ success: false, message: '数据库未连接' });
    }
    const collection = db.collection(COLLECTION_NAME);
    await collection.deleteMany({});
    res.json({ success: true });
  } catch (error) {
    console.error('清空历史记录失败:', error.message);
    res.json({ success: false, message: error.message });
  }
});

// 保存翻译历史（供CLI调用）- 已移至 src/db.js
// 保留此导出以保持向后兼容
export { saveHistory } from '../src/db.js';

// 处理未匹配的API路由
app.use('/api/*', (req, res) => {
  console.log('404 - API路由未找到:', req.method, req.path);
  res.status(404).json({ error: 'API路由未找到', path: req.path, method: req.method });
});

// 静态文件服务（React构建后的文件）- 必须在API路由之后
const webBuildPath = path.join(__dirname, '../web/dist');
if (fs.existsSync(webBuildPath)) {
  app.use(express.static(webBuildPath));
}

// 所有其他GET请求返回React应用（必须在所有API路由之后）
app.get('*', (req, res) => {
  const indexPath = path.join(webBuildPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('Web界面未构建，请先运行 npm run build');
  }
});

// 启动服务器
export async function startServer() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`🚀 Web服务器已启动: http://localhost:${PORT}`);
    console.log(`📝 请在浏览器中打开上述地址进行配置和查看历史记录`);
  });
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
