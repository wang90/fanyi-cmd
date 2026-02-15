import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
import { spawn } from 'child_process';
import { translate as previewTranslate, askStream as askAIStream } from '../src/providers.js';
import { saveAskHistory, saveHistory } from '../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const ISO6391 = require('iso-639-1') as { getName: (code: string) => string };

const app = express();
const PORT = 3000;

// MongoDB连接
let db: import('mongodb').Db | null = null;
let client: import('mongodb').MongoClient | null = null;
const DB_NAME = 'ai-cmd';
const COLLECTION_NAME = 'history';
const CONFIG_COLLECTION_NAME = 'config';
const LANGUAGE_COLLECTION_NAME = 'languages';
const CONFIG_DOC_ID = 'default';
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_LANGUAGES: Array<{ code: string; name: string; isSourceOnly?: boolean }> = [
  { code: 'auto', name: '自动检测', isSourceOnly: true },
  { code: 'zh', name: '中文' },
  { code: 'en', name: '英语' },
  { code: 'ja', name: '日语' },
  { code: 'ko', name: '韩语' },
  { code: 'fr', name: '法语' },
  { code: 'de', name: '德语' },
  { code: 'es', name: '西班牙语' },
  { code: 'ru', name: '俄语' },
  { code: 'pt', name: '葡萄牙语' },
  { code: 'it', name: '意大利语' },
  { code: 'ar', name: '阿拉伯语' },
  { code: 'vi', name: '越南语' },
];

function getDocTitle(relativePath: string): string {
  const filename = path.basename(relativePath, '.md');
  return filename.replace(/[-_]/g, ' ');
}

interface DocEntry {
  path: string;
  title: string;
  scope: string;
}

function collectMarkdownDocs(): DocEntry[] {
  const docs: DocEntry[] = [];
  const readmePath = path.join(PROJECT_ROOT, 'README.md');
  if (fs.existsSync(readmePath)) {
    docs.push({
      path: 'README.md',
      title: getDocTitle('README.md'),
      scope: 'root',
    });
  }

  const docsDir = path.join(PROJECT_ROOT, 'docs');
  if (fs.existsSync(docsDir)) {
    const entries = fs.readdirSync(docsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
      const relativePath = `docs/${entry.name}`.replace(/\\/g, '/');
      docs.push({
        path: relativePath,
        title: getDocTitle(relativePath),
        scope: 'docs',
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

function getConfigPath(): string {
  return path.resolve(process.env.HOME || process.env.USERPROFILE || '', '.ai-config.json');
}

interface AppConfig {
  from?: string;
  to?: string;
  provider?: string;
  apiKeys?: Record<string, string>;
  token?: string;
}

interface LanguageEntry {
  code: string;
  name: string;
  isSourceOnly?: boolean;
}

function normalizeLanguageCode(code: string): string {
  return (code || '').toString().trim().toLowerCase();
}

function isValidLanguageCode(code: string): boolean {
  if (code === 'auto') return true;
  // 支持 BCP47 的简化形态：<language> 或 <language>-<region>
  const match = /^([a-z]{2})(?:-([a-z]{2}))?$/.exec(code);
  if (!match) return false;
  const language = match[1];
  return Boolean(ISO6391.getName(language));
}

async function ensureDefaultLanguages(): Promise<void> {
  if (!db) return;
  const collection = db.collection<any>(LANGUAGE_COLLECTION_NAME);
  const count = await collection.countDocuments();
  if (count > 0) return;
  const now = new Date().toISOString();
  await collection.insertMany(
    DEFAULT_LANGUAGES.map((item, index) => ({
      code: item.code,
      name: item.name,
      isSourceOnly: Boolean(item.isSourceOnly),
      sort: index,
      createdAt: now,
      updatedAt: now,
    }))
  );
}

function normalizeConfig(config: AppConfig = {}): Required<Omit<AppConfig, 'token'>> & { apiKeys: Record<string, string> } {
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
  return normalized as Required<Omit<AppConfig, 'token'>> & { apiKeys: Record<string, string> };
}

function sanitizeConfigForClient(config: AppConfig = {}): {
  from: string;
  to: string;
  provider: string;
  tokenProviders: string[];
  tokenConfigured: Record<string, boolean>;
} {
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

function readConfigFromFile(): ReturnType<typeof normalizeConfig> | null {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as AppConfig;
  return normalizeConfig(fileConfig);
}

function writeConfigToFile(config: AppConfig): void {
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function loadPersistedConfig(): Promise<ReturnType<typeof normalizeConfig>> {
  if (db) {
    try {
      const configCollection = db.collection<any>(CONFIG_COLLECTION_NAME);
      const saved = await configCollection.findOne({ _id: CONFIG_DOC_ID });
      if (saved) {
        const { _id, ...configData } = saved;
        return normalizeConfig(configData as AppConfig);
      }
    } catch {
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

async function persistConfig(config: AppConfig): Promise<void> {
  if (db) {
    const configCollection = db.collection<any>(CONFIG_COLLECTION_NAME);
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

async function connectDB(): Promise<void> {
  if (db) {
    return; // 已经连接
  }
  try {
    client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    db = client.db(DB_NAME);
    await ensureDefaultLanguages();
    console.log('✅ MongoDB连接成功');
  } catch (error) {
    console.error('❌ MongoDB连接失败:', (error as Error).message);
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
    res.status(500).json({ error: (error as Error).message });
  }
});

// 保存配置
app.post('/api/config', async (req, res) => {
  try {
    const persistedConfig = await loadPersistedConfig();
    const body = (req.body || {}) as AppConfig;
    const nextConfig = normalizeConfig({
      ...persistedConfig,
      ...body,
      // token 统一走专用接口，普通配置保存不覆盖现有 token
      apiKeys: persistedConfig.apiKeys || {},
    });
    await persistConfig(nextConfig);
    res.json({ success: true, message: '配置已保存' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
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
    res.status(500).json({ success: false, error: (error as Error).message });
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
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 语言列表（数据库）
app.get('/api/languages', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接，无法加载语言列表' });
    }
    await ensureDefaultLanguages();
    const collection = db.collection<any>(LANGUAGE_COLLECTION_NAME);
    const languages = await collection
      .find({})
      .project({ _id: 0, code: 1, name: 1, isSourceOnly: 1, sort: 1 })
      .sort({ sort: 1, code: 1 })
      .toArray();
    res.json({ success: true, languages });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 新增语言
app.post('/api/languages', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接，无法新增语言' });
    }
    const code = normalizeLanguageCode((req.body?.code || '').toString());
    const name = (req.body?.name || '').toString().trim();
    const isSourceOnly = Boolean(req.body?.isSourceOnly);
    if (!code || !name) {
      return res.status(400).json({ success: false, error: 'code 和 name 不能为空' });
    }
    if (!isValidLanguageCode(code)) {
      return res.status(400).json({
        success: false,
        error: 'code 不合法，请使用标准语言代码（ISO 639-1，如 en / vi / ar 或 zh-cn）',
        reference: 'https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry',
      });
    }

    const collection = db.collection<any>(LANGUAGE_COLLECTION_NAME);
    await ensureDefaultLanguages();
    const exists = await collection.findOne({ code });
    if (exists) {
      return res.status(409).json({ success: false, error: `语言 ${code} 已存在` });
    }
    const now = new Date().toISOString();
    const maxSortDoc = await collection.find({}).sort({ sort: -1 }).limit(1).next();
    const sort = Number.isFinite(Number(maxSortDoc?.sort)) ? Number(maxSortDoc?.sort) + 1 : 0;
    await collection.insertOne({
      code,
      name,
      isSourceOnly,
      sort,
      createdAt: now,
      updatedAt: now,
    });
    res.json({ success: true, language: { code, name, isSourceOnly, sort } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 更新语言
app.put('/api/languages/:code', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接，无法更新语言' });
    }
    const code = normalizeLanguageCode(decodeURIComponent((req.params?.code || '').toString()));
    if (!code) {
      return res.status(400).json({ success: false, error: 'code 不能为空' });
    }
    const updates: Partial<LanguageEntry> = {};
    if (typeof req.body?.name === 'string') {
      const name = req.body.name.trim();
      if (!name) {
        return res.status(400).json({ success: false, error: 'name 不能为空' });
      }
      updates.name = name;
    }
    if (typeof req.body?.isSourceOnly === 'boolean') {
      updates.isSourceOnly = req.body.isSourceOnly;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: '没有可更新字段' });
    }
    if (code === 'auto') {
      updates.isSourceOnly = true;
    }

    const collection = db.collection<any>(LANGUAGE_COLLECTION_NAME);
    await ensureDefaultLanguages();
    const result = await collection.updateOne(
      { code },
      {
        $set: {
          ...updates,
          updatedAt: new Date().toISOString(),
        },
      }
    );
    if (!result.matchedCount) {
      return res.status(404).json({ success: false, error: '语言不存在' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 删除语言
app.delete('/api/languages/:code', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, error: '数据库未连接，无法删除语言' });
    }
    const code = normalizeLanguageCode(decodeURIComponent((req.params?.code || '').toString()));
    if (!code) {
      return res.status(400).json({ success: false, error: 'code 不能为空' });
    }
    if (code === 'auto') {
      return res.status(400).json({ success: false, error: 'auto 为系统内置项，不允许删除' });
    }
    const collection = db.collection<any>(LANGUAGE_COLLECTION_NAME);
    await ensureDefaultLanguages();
    const result = await collection.deleteOne({ code });
    if (!result.deletedCount) {
      return res.status(404).json({ success: false, error: '语言不存在' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 文档列表
app.get('/api/docs', (req, res) => {
  try {
    const docs = collectMarkdownDocs();
    res.json({ success: true, docs });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
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
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// 预览翻译（不写入历史，仅用于测试当前配置）
app.post('/api/preview', async (req, res) => {
  try {
    const text = (req.body?.text || 'hello').toString();
    const cfg = (req.body || {}) as { provider?: string; from?: string; to?: string };
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
    const err = error as { statusCode?: number; message?: string };
    const statusCode = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
    res.status(statusCode).json({ success: false, error: err.message || String(error) });
  }
});

// AI问答（写入历史）
app.post('/api/ask', async (req, res) => {
  try {
    const question = (req.body?.question || '').toString().trim();
    if (!question) {
      return res.status(400).json({ success: false, error: '问题不能为空' });
    }

    const cfg = (req.body || {}) as { provider?: string };
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
    } catch {
      // 问答结果优先，历史写入失败不影响主流程
    }
    res.end();
  } catch (error) {
    const err = error as { statusCode?: number; message?: string };
    const statusCode = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
    console.error(
      '[API /api/ask] 请求失败:',
      JSON.stringify({
        statusCode,
        provider: (req.body as { config?: { provider?: string } })?.config?.provider || 'deepseek',
        questionLength: ((req.body as { question?: string })?.question || '').toString().trim().length,
        error: err?.message || String(error),
      })
    );
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(statusCode).json({ success: false, error: err.message || String(error) });
  }
});

// 获取配置方案列表
app.get('/api/config-presets', (req, res) => {
  const presetsPath = path.resolve(process.env.HOME || process.env.USERPROFILE || '', '.ai-presets.json');
  try {
    if (fs.existsSync(presetsPath)) {
      const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
      // 确保返回的是数组
      res.json(Array.isArray(presets) ? presets : []);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('读取配置方案失败:', (error as Error).message);
    res.json([]);
  }
});

// 保存配置方案
app.post('/api/config-presets', (req, res) => {
  const presetsPath = path.resolve(process.env.HOME || process.env.USERPROFILE || '', '.ai-presets.json');
  try {
    let presets: Array<{ name: string; config: unknown; createdAt?: string; updatedAt?: string }> = [];
    if (fs.existsSync(presetsPath)) {
      const data = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
      // 确保 presets 是数组
      presets = Array.isArray(data) ? data : [];
    }

    const { name, config: presetConfig } = req.body as { name?: string; config?: unknown };

    if (!name || !presetConfig) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 检查是否已存在同名方案
    const existingIndex = presets.findIndex((p) => p.name === name);
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
    console.error('保存配置方案失败:', (error as Error).message);
    res.status(500).json({ error: (error as Error).message });
  }
});

// 删除配置方案
app.delete('/api/config-presets/:name', (req, res) => {
  const presetsPath = path.resolve(process.env.HOME || process.env.USERPROFILE || '', '.ai-presets.json');
  try {
    if (!fs.existsSync(presetsPath)) {
      return res.json({ success: true, presets: [] });
    }

    const data = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));
    const presets = Array.isArray(data) ? data : [];
    const filtered = presets.filter((p: { name: string }) => p.name !== decodeURIComponent(req.params.name));

    fs.writeFileSync(presetsPath, JSON.stringify(filtered, null, 2));
    res.json({ success: true, presets: Array.isArray(filtered) ? filtered : [] });
  } catch (error) {
    console.error('删除配置方案失败:', (error as Error).message);
    res.status(500).json({ error: (error as Error).message });
  }
});

// 获取翻译历史
app.get('/api/history', async (req, res) => {
  try {
    if (!db) {
      // 数据库未连接时返回空数组，而不是503错误
      return res.json([]);
    }
    const collection = db.collection<any>(COLLECTION_NAME);
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
    console.error('获取历史记录失败:', (error as Error).message);
    res.json([]);
  }
});

// 删除历史记录
app.delete('/api/history/:id', async (req, res) => {
  try {
    if (!db) {
      return res.json({ success: false, message: '数据库未连接' });
    }
    const collection = db.collection<any>(COLLECTION_NAME);
    const id = req.params.id;
    let result: { deletedCount: number };
    try {
      result = await collection.deleteOne({ _id: new ObjectId(id) });
    } catch {
      result = await collection.deleteOne({ _id: id });
    }
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    console.error('删除历史记录失败:', (error as Error).message);
    res.json({ success: false, message: (error as Error).message });
  }
});

// 清空历史记录
app.delete('/api/history', async (req, res) => {
  try {
    if (!db) {
      return res.json({ success: false, message: '数据库未连接' });
    }
    const collection = db.collection<any>(COLLECTION_NAME);
    await collection.deleteMany({});
    res.json({ success: true });
  } catch (error) {
    console.error('清空历史记录失败:', (error as Error).message);
    res.json({ success: false, message: (error as Error).message });
  }
});

// 保存翻译历史（供CLI调用）- 已移至 src/db.ts
// 保留此导出以保持向后兼容
export { saveHistory };

// 处理未匹配的API路由
app.use('/api/*', (req, res) => {
  console.log('404 - API路由未找到:', req.method, req.path);
  res.status(404).json({ error: 'API路由未找到', path: req.path, method: req.method });
});

// 静态文件服务（React构建后的文件）- 必须在API路由之后
const webBuildPath = path.join(__dirname, '../web/dist');
app.use(express.static(webBuildPath));

// 所有其他GET请求返回React应用（必须在所有API路由之后）
app.get('*', (req, res) => {
  const indexPath = path.join(webBuildPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('Web界面未构建，请先运行 npm run build');
  }
});

function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function ensureWebBuild(): Promise<void> {
  const webDir = path.join(__dirname, '../web');
  const indexPath = path.join(webBuildPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return;
  }

  console.log('⚙️ 检测到 Web 界面未构建，正在自动构建...');
  try {
    await runCommand('pnpm', ['build'], webDir);
    console.log('✅ Web 界面构建完成');
  } catch (pnpmError) {
    console.warn(`⚠️ 使用 pnpm 构建失败: ${(pnpmError as Error).message}`);
    console.log('🔁 尝试使用 npm 继续构建...');
    await runCommand('npm', ['run', 'build'], webDir);
    console.log('✅ Web 界面构建完成');
  }
}

// 启动服务器
export async function startServer(): Promise<void> {
  await ensureWebBuild();
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
