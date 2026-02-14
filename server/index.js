import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { translate as previewTranslate, askStream as askAIStream } from '../src/providers.js';
import { saveAskHistory } from '../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// MongoDB连接
let db = null;
let client = null;
const DB_NAME = 'ai-cmd';
const COLLECTION_NAME = 'history';
const CONFIG_COLLECTION_NAME = 'config';
const CONFIG_DOC_ID = 'default';
const PROJECT_ROOT = path.resolve(__dirname, '..');

function getDocTitle(relativePath) {
  const filename = path.basename(relativePath, '.md');
  return filename.replace(/[-_]/g, ' ');
}

function collectMarkdownDocs() {
  const roots = [
    { absDir: PROJECT_ROOT, scope: 'root' },
    { absDir: path.join(PROJECT_ROOT, 'docs'), scope: 'docs' },
  ];
  const docs = [];
  const seen = new Set();

  for (const root of roots) {
    if (!fs.existsSync(root.absDir)) continue;
    const entries = fs.readdirSync(root.absDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
      const absPath = path.join(root.absDir, entry.name);
      const relativePath = path.relative(PROJECT_ROOT, absPath).replace(/\\/g, '/');
      if (seen.has(relativePath)) continue;
      seen.add(relativePath);
      docs.push({
        path: relativePath,
        title: getDocTitle(relativePath),
        scope: root.scope,
      });
    }
  }

  docs.sort((a, b) => {
    if (a.path === 'README.md') return -1;
    if (b.path === 'README.md') return 1;
    return a.path.localeCompare(b.path);
  });
  return docs;
}

function getConfigPath() {
  return path.resolve(process.env.HOME || process.env.USERPROFILE, '.ai-config.json');
}

function normalizeConfig(config = {}) {
  const normalized = { ...config };
  if (normalized.token && !normalized.apiKeys) {
    normalized.apiKeys = {};
  }
  if (!normalized.provider) {
    normalized.provider = 'libre';
  }
  if (!normalized.from) {
    normalized.from = 'auto';
  }
  if (!normalized.to) {
    normalized.to = 'zh';
  }
  if (!normalized.apiKeys || typeof normalized.apiKeys !== 'object') {
    normalized.apiKeys = {};
  }
  return normalized;
}

function sanitizeConfigForClient(config = {}) {
  const normalized = normalizeConfig(config);
  const tokenEntries = Object.entries(normalized.apiKeys || {});
  const tokenProviders = tokenEntries.map(([provider]) => provider);
  const tokenConfigured = Object.fromEntries(
    tokenEntries.map(([provider, value]) => [provider, Boolean((value || '').toString().trim())])
  );

  return {
    from: normalized.from,
    to: normalized.to,
    provider: normalized.provider,
    tokenProviders,
    tokenConfigured,
  };
}

function readConfigFromFile() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  return normalizeConfig(fileConfig);
}

function writeConfigToFile(config) {
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function loadPersistedConfig() {
  if (db) {
    try {
      const configCollection = db.collection(CONFIG_COLLECTION_NAME);
      const saved = await configCollection.findOne({ _id: CONFIG_DOC_ID });
      if (saved) {
        const { _id, ...configData } = saved;
        return normalizeConfig(configData);
      }
    } catch (error) {
      // MongoDB配置读取失败时回退到文件配置
    }
  }

  const fileConfig = readConfigFromFile();
  if (fileConfig) {
    return fileConfig;
  }

  return normalizeConfig({
    from: 'auto',
    to: 'zh',
    provider: 'libre',
    apiKeys: {},
  });
}

async function persistConfig(config) {
  if (db) {
    const configCollection = db.collection(CONFIG_COLLECTION_NAME);
    await configCollection.updateOne(
      { _id: CONFIG_DOC_ID },
      {
        $set: {
          ...config,
          updatedAt: new Date().toISOString(),
        },
        $setOnInsert: {
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    );
  }

  // 保持与 CLI 的文件配置兼容
  writeConfigToFile(config);
}

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
app.get('/api/config', async (req, res) => {
  try {
    const config = await loadPersistedConfig();
    res.json(sanitizeConfigForClient(config));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 保存配置
app.post('/api/config', async (req, res) => {
  try {
    const persistedConfig = await loadPersistedConfig();
    const body = req.body || {};
    const nextConfig = normalizeConfig({
      ...persistedConfig,
      ...body,
      // token 统一走专用接口，普通配置保存不覆盖现有 token
      apiKeys: persistedConfig.apiKeys || {},
    });
    await persistConfig(nextConfig);
    res.json({ success: true, message: '配置已保存' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 按 provider 获取 token（按需读取）
app.get('/api/token/:provider', async (req, res) => {
  try {
    const provider = decodeURIComponent((req.params?.provider || '').toString().trim().toLowerCase());
    if (!provider) {
      return res.status(400).json({ success: false, error: 'provider 不能为空' });
    }

    const persistedConfig = await loadPersistedConfig();
    const token = (persistedConfig.apiKeys?.[provider] || '').toString();
    res.json({
      success: true,
      provider,
      token,
      configured: Boolean(token.trim()),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 按 provider 保存 token
app.post('/api/token/:provider', async (req, res) => {
  try {
    const provider = decodeURIComponent((req.params?.provider || '').toString().trim().toLowerCase());
    if (!provider) {
      return res.status(400).json({ success: false, error: 'provider 不能为空' });
    }

    const token = (req.body?.token || '').toString();
    const persistedConfig = await loadPersistedConfig();
    const nextApiKeys = {
      ...(persistedConfig.apiKeys || {}),
      [provider]: token,
    };
    const nextConfig = normalizeConfig({
      ...persistedConfig,
      apiKeys: nextApiKeys,
    });

    await persistConfig(nextConfig);
    res.json({
      success: true,
      provider,
      configured: Boolean(token.trim()),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 文档列表
app.get('/api/docs', (req, res) => {
  try {
    const docs = collectMarkdownDocs();
    res.json({ success: true, docs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 文档内容
app.get('/api/docs/content', (req, res) => {
  try {
    const docPath = (req.query?.path || '').toString().trim();
    if (!docPath) {
      return res.status(400).json({ success: false, error: 'path 不能为空' });
    }

    const docs = collectMarkdownDocs();
    const matched = docs.find((item) => item.path === docPath);
    if (!matched) {
      return res.status(404).json({ success: false, error: '文档不存在或不可访问' });
    }

    const absPath = path.join(PROJECT_ROOT, matched.path);
    const content = fs.readFileSync(absPath, 'utf-8');
    res.json({
      success: true,
      doc: {
        path: matched.path,
        title: matched.title,
        content,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 预览翻译（不写入历史，仅用于测试当前配置）
app.post('/api/preview', async (req, res) => {
  try {
    const text = (req.body?.text || 'hello').toString();
    const cfg = req.body || {};
    const persistedConfig = await loadPersistedConfig();
    const previewConfig = {
      provider: cfg.provider || persistedConfig.provider || 'libre',
      from: cfg.from || persistedConfig.from || 'auto',
      to: cfg.to || persistedConfig.to || 'zh',
      // token 仅从后端持久化配置读取，不信任前端传入
      apiKeys: persistedConfig.apiKeys || {},
    };
    const result = await previewTranslate(text, previewConfig);
    res.json({ success: true, text, result });
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

// AI问答（写入历史）
app.post('/api/ask', async (req, res) => {
  try {
    const question = (req.body?.question || '').toString().trim();
    if (!question) {
      return res.status(400).json({ success: false, error: '问题不能为空' });
    }

    const cfg = req.body || {};
    const persistedConfig = await loadPersistedConfig();
    const askConfig = {
      provider: cfg.provider || persistedConfig.provider || 'deepseek',
      // token 仅从后端持久化配置读取，不信任前端传入
      apiKeys: persistedConfig.apiKeys || {},
    };
    let wroteChunk = false;
    const answer = await askAIStream(question, askConfig, (chunk) => {
      if (!wroteChunk) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Accel-Buffering', 'no');
        wroteChunk = true;
      }
      res.write(chunk);
    });

    if (!wroteChunk) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.write(answer || '');
    }
    try {
      await saveAskHistory(question, answer || '', {
        provider: askConfig.provider || 'deepseek',
      });
    } catch (historyErr) {
      // 问答结果优先，历史写入失败不影响主流程
    }
    res.end();
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    console.error(
      '[API /api/ask] 请求失败:',
      JSON.stringify({
        statusCode,
        provider: req.body?.config?.provider || 'deepseek',
        questionLength: ((req.body?.question || '').toString().trim()).length,
        error: error?.message || String(error),
      })
    );
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

// 获取配置方案列表
app.get('/api/config-presets', (req, res) => {
  const presetsPath = path.resolve(process.env.HOME || process.env.USERPROFILE, '.ai-presets.json');
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
  const presetsPath = path.resolve(process.env.HOME || process.env.USERPROFILE, '.ai-presets.json');
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
  const presetsPath = path.resolve(process.env.HOME || process.env.USERPROFILE, '.ai-presets.json');
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
    const type = (req.query?.type || 'all').toString();
    const filter = type === 'qa' || type === 'translation' ? { type } : {};
    const history = await collection
      .find(filter)
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
