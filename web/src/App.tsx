import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './App.css';

const API_BASE = '/api';
const PROVIDERS: Record<string, string> = {
  libre: 'Google Translate (免费)',
  deepseek: 'DeepSeek',
  qwen: '通义千问',
  openai: 'ChatGPT',
};
const PROVIDER_LINKS: Record<string, string> = {
  deepseek: 'https://platform.deepseek.com/',
  qwen: 'https://bailian.console.aliyun.com/',
  openai: 'https://platform.openai.com/api-keys',
};
const CONFIG_PROVIDER_STORAGE_KEY = 'fanyi-config-provider';

interface Config {
  from: string;
  to: string;
  provider: string;
}

interface HistoryItem {
  _id: string;
  type?: string;
  question?: string;
  text?: string;
  answer?: string;
  result?: string;
  provider?: string;
  from?: string;
  to?: string;
  timestamp?: string;
}

interface Preset {
  name: string;
  config?: Config;
}

interface DocFile {
  path: string;
  title: string;
  scope?: string;
}

function App() {
  const location = useLocation();
  const [config, setConfig] = useState<Config>({
    from: 'auto',
    to: 'zh',
    provider: 'libre',
  });
  const [tokenProviders, setTokenProviders] = useState<string[]>([]);
  const [tokenConfigured, setTokenConfigured] = useState<Record<string, boolean>>({});
  const [tokenValues, setTokenValues] = useState<Record<string, string>>({});
  const [tokenEditable, setTokenEditable] = useState<Record<string, boolean>>({});
  const [tokenEditBaseline, setTokenEditBaseline] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string }>({ type: '', text: '' });
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [previewText, setPreviewText] = useState('hello');
  const [previewResult, setPreviewResult] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [askProvider, setAskProvider] = useState<string>(() => {
    if (typeof window === 'undefined') {
      return 'deepseek';
    }
    return window.localStorage.getItem('ai-ask-provider') || 'deepseek';
  });
  const [askQuestion, setAskQuestion] = useState('');
  const [askAnswer, setAskAnswer] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [newTokenProvider, setNewTokenProvider] = useState('');
  const [newTokenValue, setNewTokenValue] = useState('');
  const [tokenLoading, setTokenLoading] = useState<Record<string, boolean>>({});
  const [docFiles, setDocFiles] = useState<DocFile[]>([]);
  const [selectedDocPath, setSelectedDocPath] = useState('');
  const [docContent, setDocContent] = useState('');
  const [docLoading, setDocLoading] = useState(false);
  const tokenInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const AI_PROVIDERS = Object.fromEntries(
    Object.entries(PROVIDERS).filter(([key]) => key !== 'libre')
  ) as Record<string, string>;
  const BUILTIN_TOKEN_KEYS = Object.keys(AI_PROVIDERS);
  const customTokenProviders = tokenProviders.filter(
    (provider) => !BUILTIN_TOKEN_KEYS.includes(provider)
  );
  const LANG_OPTIONS: [string, string][] = [
    ['auto', '自动检测'],
    ['zh', '中文'],
    ['en', '英语'],
    ['ja', '日语'],
    ['ko', '韩语'],
    ['fr', '法语'],
    ['de', '德语'],
    ['es', '西班牙语'],
    ['ru', '俄语'],
  ];
  const HISTORY_FILTERS = [
    { key: 'all', label: '全部' },
    { key: 'qa', label: '问题类' },
    { key: 'translation', label: '翻译类' },
  ];

  useEffect(() => {
    loadConfig();
    loadHistory();
    loadPresets();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await axios.get(`${API_BASE}/config`);
      const loaded = res.data || {};
      const savedConfigProvider = typeof window !== 'undefined'
        ? window.localStorage.getItem(CONFIG_PROVIDER_STORAGE_KEY)
        : '';
      const nextConfigProvider = savedConfigProvider && PROVIDERS[savedConfigProvider]
        ? savedConfigProvider
        : (loaded.provider || 'libre');
      setConfig({
        from: loaded.from || 'auto',
        to: loaded.to || 'zh',
        provider: nextConfigProvider,
      });
      setTokenProviders(Array.isArray(loaded.tokenProviders) ? loaded.tokenProviders : []);
      setTokenConfigured(
        loaded.tokenConfigured && typeof loaded.tokenConfigured === 'object'
          ? loaded.tokenConfigured
          : {}
      );
      const savedAskProvider = typeof window !== 'undefined'
        ? window.localStorage.getItem('ai-ask-provider')
        : '';
      if (!savedAskProvider && loaded.provider && loaded.provider !== 'libre') {
        setAskProvider(loaded.provider);
      }
    } catch (error) {
      showMessage('error', '加载配置失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const loadHistory = async () => {
    try {
      const res = await axios.get(`${API_BASE}/history`);
      setHistory(res.data);
    } catch (error) {
      showMessage('error', '加载历史记录失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const normalizedHistory = history.map((item) => ({
    ...item,
    type: item.type === 'qa' ? 'qa' : 'translation',
  }));
  const filteredHistory = normalizedHistory.filter((item) => (
    historyFilter === 'all' ? true : item.type === historyFilter
  ));

  useEffect(() => {
    if (location.pathname === '/history') {
      loadHistory();
    }
    if (location.pathname === '/docs') {
      loadDocs();
    }
  }, [location.pathname]);

  const saveConfig = async (options: { silent?: boolean } = {}) => {
    const { silent = false } = options;
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/config`, config);
      if (!silent) {
        showMessage('success', '配置已保存');
      }
    } catch (error) {
      showMessage('error', '保存配置失败: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  const deleteHistory = async (id: string) => {
    const prevHistory = history;
    setHistory((prev) => prev.filter((item) => item._id !== id));
    try {
      const res = await axios.delete(`${API_BASE}/history/${id}`);
      if (res?.data?.success === false) {
        setHistory(prevHistory);
        showMessage('error', res.data?.message || '删除失败');
        return;
      }
      showMessage('success', '已删除');
    } catch (error) {
      setHistory(prevHistory);
      showMessage('error', '删除失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const clearHistory = async () => {
    if (!window.confirm('确定要清空所有历史记录吗？')) return;
    const prevHistory = history;
    setHistory([]);
    try {
      const res = await axios.delete(`${API_BASE}/history`);
      if (res?.data?.success === false) {
        setHistory(prevHistory);
        showMessage('error', res.data?.message || '清空失败');
        return;
      }
      showMessage('success', '历史记录已清空');
    } catch (error) {
      setHistory(prevHistory);
      showMessage('error', '清空失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const showMessage = (type: string, text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const getFriendlyApiError = (error: unknown, action = '请求失败') => {
    const err = error as { response?: { status?: number; data?: { error?: string } }; status?: number; message?: string };
    const status = err?.response?.status ?? err?.status;
    const rawMsg = err?.response?.data?.error || err?.message || `${action}: 未知错误`;
    if (status === 402 || status === 429) {
      return 'OpenAI 额度不足或已超限，请到 Billing 检查套餐与余额，或先切换 deepseek/qwen。';
    }
    return rawMsg;
  };

  const formatDate = (dateString?: string) => {
    const date = new Date(dateString || '');
    return date.toLocaleString('zh-CN');
  };

  const loadPresets = async () => {
    try {
      const res = await axios.get(`${API_BASE}/config-presets`);
      setPresets(Array.isArray(res.data) ? res.data : []);
    } catch {
      setPresets([]);
    }
  };

  const savePreset = async () => {
    const name = presetName.trim();
    if (!name) {
      showMessage('error', '请输入配置方案名称');
      return;
    }
    try {
      const res = await axios.post(`${API_BASE}/config-presets`, { name, config });
      setPresets(Array.isArray(res.data?.presets) ? res.data.presets : []);
      setPresetName('');
      showMessage('success', '配置方案已保存');
    } catch (error) {
      showMessage('error', '保存方案失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const loadPreset = (preset: Preset) => {
    if (!preset?.config) return;
    setConfig(preset.config);
    if (preset.config?.provider && typeof window !== 'undefined') {
      window.localStorage.setItem(CONFIG_PROVIDER_STORAGE_KEY, preset.config.provider);
    }
    if (preset.config.provider && preset.config.provider !== 'libre') {
      handleAskProviderChange(preset.config.provider);
    }
    showMessage('success', `已加载方案：${preset.name}`);
  };

  const deletePreset = async (name: string) => {
    try {
      const res = await axios.delete(`${API_BASE}/config-presets/${encodeURIComponent(name)}`);
      setPresets(Array.isArray(res.data?.presets) ? res.data.presets : []);
      showMessage('success', '方案已删除');
    } catch (error) {
      showMessage('error', '删除方案失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const loadDocContent = async (docPath: string) => {
    if (!docPath) return;
    setDocLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/docs/content`, {
        params: { path: docPath },
      });
      setSelectedDocPath(docPath);
      setDocContent(res.data?.doc?.content || '');
    } catch (error) {
      showMessage('error', '加载文档内容失败: ' + (error instanceof Error ? error.message : String(error)));
      setDocContent('');
    } finally {
      setDocLoading(false);
    }
  };

  const loadDocs = async () => {
    try {
      const res = await axios.get(`${API_BASE}/docs`);
      const docs = Array.isArray(res.data?.docs) ? res.data.docs : [];
      setDocFiles(docs);
      if (docs.length === 0) {
        setSelectedDocPath('');
        setDocContent('');
        return;
      }
      const nextPath = selectedDocPath && docs.some((item: DocFile) => item.path === selectedDocPath)
        ? selectedDocPath
        : (docs.find((item: DocFile) => item.path === 'README.md')?.path || docs[0].path);
      await loadDocContent(nextPath);
    } catch (error) {
      showMessage('error', '加载文档列表失败: ' + (error instanceof Error ? error.message : String(error)));
      setDocFiles([]);
      setSelectedDocPath('');
      setDocContent('');
    }
  };

  const fetchTokenByProvider = async (provider: string) => {
    if (!provider) return '';
    setTokenLoading((prev) => ({ ...prev, [provider]: true }));
    try {
      const res = await axios.get(`${API_BASE}/token/${encodeURIComponent(provider)}`);
      const token = (res.data?.token || '').toString();
      setTokenValues((prev) => ({ ...prev, [provider]: token }));
      setTokenConfigured((prev) => ({ ...prev, [provider]: Boolean(token.trim()) }));
      setTokenProviders((prev) => (prev.includes(provider) ? prev : [...prev, provider]));
      return token;
    } catch (error) {
      showMessage('error', '获取 token 失败: ' + (error instanceof Error ? error.message : String(error)));
      return '';
    } finally {
      setTokenLoading((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const saveTokenByProvider = async (provider: string) => {
    if (!provider) return false;
    setTokenLoading((prev) => ({ ...prev, [provider]: true }));
    try {
      const token = (tokenValues[provider] || '').toString();
      const res = await axios.post(`${API_BASE}/token/${encodeURIComponent(provider)}`, { token });
      const configured = Boolean(token.trim());
      setTokenConfigured((prev) => ({ ...prev, [provider]: configured }));
      setTokenProviders((prev) => (prev.includes(provider) ? prev : [...prev, provider]));
      if (res?.data?.success) {
        showMessage('success', configured ? `${provider} token 已保存` : `${provider} token 已清空`);
      }
      return true;
    } catch (error) {
      showMessage('error', '保存 token 失败: ' + (error instanceof Error ? error.message : String(error)));
      return false;
    } finally {
      setTokenLoading((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const setTokenValue = (provider: string, value: string) => {
    setTokenValues((prev) => ({ ...prev, [provider]: value }));
    setTokenConfigured((prev) => ({ ...prev, [provider]: Boolean((value || '').trim()) }));
    setTokenProviders((prev) => (prev.includes(provider) ? prev : [...prev, provider]));
  };

  const handleTokenEditAction = async (field: string, provider: string) => {
    if (!provider) return;
    const isEditing = Boolean(tokenEditable[field]);
    if (isEditing) {
      const currentToken = (tokenValues[provider] || '').toString();
      const baselineToken = (tokenEditBaseline[provider] || '').toString();
      if (currentToken === baselineToken) {
        setTokenEditable((prev) => ({ ...prev, [field]: false }));
        return;
      }
      const ok = await saveTokenByProvider(provider);
      if (ok) {
        setTokenEditable((prev) => ({ ...prev, [field]: false }));
        setTokenEditBaseline((prev) => ({ ...prev, [provider]: currentToken }));
      }
      return;
    }

    const fetchedToken = await fetchTokenByProvider(provider);
    setTokenEditBaseline((prev) => ({ ...prev, [provider]: (fetchedToken || '').toString() }));
    setTokenEditable((prev) => ({ ...prev, [field]: true }));
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const input = tokenInputRefs.current[field];
        if (!input) return;
        input.focus();
        if (typeof input.setSelectionRange === 'function') {
          const end = (input.value || '').length;
          input.setSelectionRange(end, end);
        }
      });
    }
  };

  const removeApiKey = async (provider: string) => {
    setTokenValue(provider, '');
    const ok = await saveTokenByProvider(provider);
    if (!ok) return;
    setTokenValues((prev) => ({ ...prev, [provider]: '' }));
    setTokenConfigured((prev) => ({ ...prev, [provider]: false }));
    if (askProvider === provider) {
      handleAskProviderChange('deepseek');
    }
  };

  const runPreview = async () => {
    setPreviewLoading(true);
    setPreviewResult('');
    try {
      const res = await axios.post(`${API_BASE}/preview`, {
        text: previewText || 'hello',
        provider: config.provider,
        from: config.from,
        to: config.to,
      });
      setPreviewResult(res.data?.result || '');
      showMessage('success', '预览完成');
    } catch (error) {
      showMessage(
        'error',
        getFriendlyApiError(error, '预览失败')
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const runAsk = async () => {
    const question = askQuestion.trim();
    if (!question) {
      showMessage('error', '请输入问题');
      return;
    }
    setAskLoading(true);
    setAskAnswer('');
    try {
      const response = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question,
          provider: askProvider,
        }),
      });

      if (!response.ok) {
        let errorMsg = '';
        try {
          const errJson = await response.json() as { error?: string };
          errorMsg = errJson?.error || '';
        } catch {
          errorMsg = await response.text();
        }
        const apiError = new Error(errorMsg || `问答失败: HTTP ${response.status}`) as Error & { status?: number };
        apiError.status = response.status;
        throw apiError;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        const text = await response.text();
        setAskAnswer(text || '');
        showMessage('success', '回答已生成');
        return;
      }

      const decoder = new TextDecoder('utf-8');
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunkText = decoder.decode(value, { stream: true });
        if (chunkText) {
          setAskAnswer((prev) => prev + chunkText);
        }
      }
      showMessage('success', '回答已生成');
    } catch (error) {
      showMessage(
        'error',
        getFriendlyApiError(error, '问答失败')
      );
    } finally {
      setAskLoading(false);
    }
  };

  const addCustomToken = () => {
    const provider = newTokenProvider.trim().toLowerCase();
    if (!provider) {
      showMessage('error', '请输入 token 标识名称');
      return;
    }
    if (provider === 'libre') {
      showMessage('error', 'libre 不需要 token');
      return;
    }
    setTokenValue(provider, newTokenValue.trim());
    setNewTokenProvider('');
    setNewTokenValue('');
    showMessage('success', `已添加 token 入口: ${provider}，请点击编辑后保存`);
  };

  const isTokenEditable = (field: string) => Boolean(tokenEditable[field]);
  const isTokenLoading = (provider: string) => Boolean(tokenLoading[provider]);
  const getTokenInputType = (field: string) => (isTokenEditable(field) ? 'text' : 'password');
  const getTokenDisplayValue = (provider: string, field: string) => {
    const raw = tokenValues[provider];
    if (typeof raw === 'string' && raw.length > 0) {
      return raw;
    }
    const shouldMask = tokenConfigured[provider] && !isTokenEditable(field);
    return shouldMask ? '****************' : '';
  };

  const handleAskProviderChange = (provider: string) => {
    setAskProvider(provider);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('ai-ask-provider', provider);
    }
  };

  const handleConfigProviderChange = (provider: string) => {
    setConfig((prev) => ({ ...prev, provider }));
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CONFIG_PROVIDER_STORAGE_KEY, provider);
    }
  };

  return (
    <div className="app">
      <div className="container">
        <div className="header">
          <h1 className="title">🤖 AI 命令行工具面板</h1>
          <p className="subtitle">默认命令为 ai，翻译功能继续使用 fanyi</p>
        </div>

        <div className="content-wrapper">
          <div className="layout">
            <aside className="sidebar">
              <div className="tabs">
                <NavLink
                  to="/assistant"
                  className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}
                >
                  🤖 AI 助手
                </NavLink>
                <NavLink
                  to="/config"
                  className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}
                >
                  ⚙️ 翻译配置 (fanyi)
                </NavLink>
                <NavLink
                  to="/tokens"
                  className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}
                >
                  🔑 Token 管理
                </NavLink>
                <NavLink
                  to="/history"
                  className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}
                >
                  📜 历史记录
                </NavLink>
                <NavLink
                  to="/docs"
                  className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}
                >
                  📚 文档中心
                </NavLink>
              </div>
            </aside>

            <main className="content-area">
              <Routes>
                <Route
                  path="/"
                  element={<Navigate to="/assistant" replace />}
                />
                <Route
                  path="/assistant"
                  element={(
                    <div className="assistant-panel">
                  <div className="assistant-head">
                    <h3>AI 问答</h3>
                    <p>这里模拟命令：`ai &lt;你的问题&gt;`</p>
                  </div>

                  <div className="form-row">
                    <div className="form-group provider-group">
                      <label>AI 服务提供商</label>
                      <select
                        className="provider-select"
                        value={askProvider}
                        onChange={(e) => handleAskProviderChange(e.target.value)}
                      >
                        {Object.entries(AI_PROVIDERS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group token-group">
                      <label>API Token</label>
                      <div className="token-input-row">
                        <input
                          ref={(node) => {
                            tokenInputRefs.current[`assistant-${askProvider}`] = node;
                          }}
                          type={getTokenInputType(`assistant-${askProvider}`)}
                          value={getTokenDisplayValue(askProvider, `assistant-${askProvider}`)}
                          onChange={(e) => setTokenValue(askProvider, e.target.value)}
                          placeholder={`输入 ${AI_PROVIDERS[askProvider]} 的 Token`}
                          readOnly={!isTokenEditable(`assistant-${askProvider}`)}
                        />
                        <button
                          type="button"
                          className="token-visibility-icon-btn"
                          onClick={() => handleTokenEditAction(`assistant-${askProvider}`, askProvider)}
                          disabled={isTokenLoading(askProvider)}
                          aria-label={isTokenEditable(`assistant-${askProvider}`) ? '保存 token' : '编辑 token'}
                          title={isTokenEditable(`assistant-${askProvider}`) ? '保存 token' : '编辑 token'}
                        >
                          {isTokenEditable(`assistant-${askProvider}`) ? '💾' : '✏️'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="assistant-question-block">
                    <label className="assistant-label">问题输入</label>
                    <textarea
                      className="assistant-textarea"
                      value={askQuestion}
                      onChange={(e) => setAskQuestion(e.target.value)}
                      placeholder="例如：解释一下什么是 RAG，并给一个简单例子"
                      rows={6}
                    />
                  </div>

                  <div className="assistant-actions">
                    <button className="save-btn" onClick={runAsk} disabled={askLoading}>
                      {askLoading ? '生成中...' : '发送问题'}
                    </button>
                    <button className="save-btn secondary" onClick={() => saveConfig()} disabled={loading}>
                      {loading ? '保存中...' : '保存当前配置'}
                    </button>
                  </div>

                  <div className="assistant-answer-block">
                    <label className="assistant-label">回答输出</label>
                    <div className="assistant-answer">{askAnswer || '回答将显示在这里'}</div>
                  </div>
                </div>
                  )}
                />

                <Route
                  path="/config"
                  element={(
                    <div className="config-layout">
                  <div className="config-panel">
                    <div className="form-row">
                      <div className="form-group provider-group">
                        <label>翻译服务提供商 (fanyi)</label>
                        <select
                          className="provider-select"
                          value={config.provider || 'libre'}
                          onChange={(e) => handleConfigProviderChange(e.target.value)}
                        >
                          {Object.entries(PROVIDERS).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group token-group">
                        <label>API Token (可选)</label>
                        <div className="token-input-row">
                          <input
                            ref={(node) => {
                              tokenInputRefs.current[`config-${config.provider || 'libre'}`] = node;
                            }}
                            type={getTokenInputType(`config-${config.provider || 'libre'}`)}
                            value={getTokenDisplayValue(config.provider || 'libre', `config-${config.provider || 'libre'}`)}
                            onChange={(e) => setTokenValue(config.provider || 'libre', e.target.value)}
                            placeholder={`输入 ${PROVIDERS[config.provider || 'libre']} 的 Token`}
                            disabled={(config.provider || 'libre') === 'libre'}
                            readOnly={
                              (config.provider || 'libre') === 'libre'
                                ? true
                                : !isTokenEditable(`config-${config.provider || 'libre'}`)
                            }
                          />
                          <button
                            type="button"
                            className="token-visibility-icon-btn"
                            onClick={() => handleTokenEditAction(`config-${config.provider || 'libre'}`, config.provider || 'libre')}
                            disabled={(config.provider || 'libre') === 'libre' || isTokenLoading(config.provider || 'libre')}
                            aria-label={isTokenEditable(`config-${config.provider || 'libre'}`) ? '保存 token' : '编辑 token'}
                            title={isTokenEditable(`config-${config.provider || 'libre'}`) ? '保存 token' : '编辑 token'}
                          >
                            {isTokenEditable(`config-${config.provider || 'libre'}`) ? '💾' : '✏️'}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group lang-group">
                        <label>源语言</label>
                        <select
                          value={config.from || 'auto'}
                          onChange={(e) => setConfig({ ...config, from: e.target.value })}
                        >
                          {LANG_OPTIONS.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group lang-group">
                        <label>目标语言</label>
                        <select
                          value={config.to || 'zh'}
                          onChange={(e) => setConfig({ ...config, to: e.target.value })}
                        >
                          {LANG_OPTIONS.filter(([value]) => value !== 'auto').map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <button className="save-btn" onClick={() => saveConfig()} disabled={loading}>
                      {loading ? '保存中...' : '💾 保存配置'}
                    </button>

                    <div className="preview-block">
                      <label className="preview-label">预览（模拟 `fanyi hello`）</label>
                      <div className="preview-row">
                        <input
                          className="preview-input"
                          value={previewText}
                          onChange={(e) => setPreviewText(e.target.value)}
                          placeholder="输入预览文本，默认 hello"
                        />
                        <button
                          className="preview-btn"
                          onClick={runPreview}
                          disabled={previewLoading}
                        >
                          {previewLoading ? '预览中...' : '预览翻译'}
                        </button>
                      </div>
                      {previewResult ? (
                        <div className="preview-result">{previewResult}</div>
                      ) : null}
                    </div>
                  </div>

                  <div className="presets-panel">
                    <h3 className="presets-title">配置方案 ({presets.length}/10)</h3>
                    <div className="preset-input-group">
                      <input
                        type="text"
                        className="preset-input"
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        placeholder="输入方案名称"
                      />
                      <button className="preset-save-btn" onClick={savePreset}>
                        保存
                      </button>
                    </div>
                    {presets.length === 0 ? (
                      <div className="empty-state preset-empty">暂无配置方案</div>
                    ) : (
                      <div className="presets-list">
                        {presets.map((preset, idx) => (
                          <div className="preset-item" key={`${preset.name}-${idx}`}>
                            <button className="preset-load-btn" onClick={() => loadPreset(preset)}>
                              {preset.name}
                            </button>
                            <button className="preset-del-btn" onClick={() => deletePreset(preset.name)}>
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                  )}
                />

                <Route
                  path="/tokens"
                  element={(
                    <div className="tokens-panel">
                  <div className="assistant-head">
                    <h3>Token 管理中心</h3>
                    <p>统一管理所有 provider token，新增后可用于 ai / fanyi 命令与页面联调。</p>
                  </div>

                  <div className="token-summary">
                    <span>内置入口 {BUILTIN_TOKEN_KEYS.length} 个</span>
                    <span>自定义入口 {customTokenProviders.length} 个</span>
                  </div>

                  <section className="token-section">
                    <h4 className="token-section-title">内置 Provider Token</h4>
                    <div className="tokens-list">
                      {BUILTIN_TOKEN_KEYS.map((provider) => (
                        <div className="token-item" key={provider}>
                          <div className="token-meta">
                            <div className="token-name">{provider}</div>
                            <div className="token-desc">{AI_PROVIDERS[provider]}</div>
                          </div>
                          <div className="token-input-wrap">
                            <div className="token-input-row">
                              <input
                                ref={(node) => {
                                  tokenInputRefs.current[`builtin-${provider}`] = node;
                                }}
                                type={getTokenInputType(`builtin-${provider}`)}
                                className="token-input"
                                value={getTokenDisplayValue(provider, `builtin-${provider}`)}
                                onChange={(e) => setTokenValue(provider, e.target.value)}
                                placeholder={`输入 ${AI_PROVIDERS[provider]} Token`}
                                readOnly={!isTokenEditable(`builtin-${provider}`)}
                              />
                              <button
                                type="button"
                                className="token-visibility-icon-btn"
                                onClick={() => handleTokenEditAction(`builtin-${provider}`, provider)}
                                disabled={isTokenLoading(provider)}
                                aria-label={isTokenEditable(`builtin-${provider}`) ? '保存 token' : '编辑 token'}
                                title={isTokenEditable(`builtin-${provider}`) ? '保存 token' : '编辑 token'}
                              >
                                {isTokenEditable(`builtin-${provider}`) ? '💾' : '✏️'}
                              </button>
                            </div>
                            {PROVIDER_LINKS[provider] ? (
                              <a
                                className="token-link"
                                href={PROVIDER_LINKS[provider]}
                                target="_blank"
                                rel="noreferrer"
                              >
                                官网: {PROVIDER_LINKS[provider]}
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="token-section">
                    <h4 className="token-section-title">自定义 Provider Token</h4>
                    <div className="tokens-list">
                      {customTokenProviders.length === 0 ? (
                        <div className="token-empty-tip">暂无自定义 provider，可在下方新增。</div>
                      ) : (
                        customTokenProviders.map((provider) => (
                          <div className="token-item custom" key={provider}>
                            <div className="token-meta">
                              <div className="token-name">{provider}</div>
                              <div className="token-desc">自定义 provider</div>
                            </div>
                            <div className="token-input-wrap">
                              <div className="token-input-row">
                                <input
                                  ref={(node) => {
                                    tokenInputRefs.current[`custom-${provider}`] = node;
                                  }}
                                  type={getTokenInputType(`custom-${provider}`)}
                                  className="token-input"
                                  value={getTokenDisplayValue(provider, `custom-${provider}`)}
                                  onChange={(e) => setTokenValue(provider, e.target.value)}
                                  placeholder={`输入 ${provider} Token`}
                                  readOnly={!isTokenEditable(`custom-${provider}`)}
                                />
                                <button
                                  type="button"
                                  className="token-visibility-icon-btn"
                                  onClick={() => handleTokenEditAction(`custom-${provider}`, provider)}
                                  disabled={isTokenLoading(provider)}
                                  aria-label={isTokenEditable(`custom-${provider}`) ? '保存 token' : '编辑 token'}
                                  title={isTokenEditable(`custom-${provider}`) ? '保存 token' : '编辑 token'}
                                >
                                  {isTokenEditable(`custom-${provider}`) ? '💾' : '✏️'}
                                </button>
                              </div>
                            </div>
                            <button className="token-remove-btn" onClick={() => removeApiKey(provider)}>
                              删除
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <div className="token-add-box">
                    <h4>新增自定义 Token 入口</h4>
                    <div className="token-add-row">
                      <input
                        className="token-input"
                        value={newTokenProvider}
                        onChange={(e) => setNewTokenProvider(e.target.value)}
                        placeholder="provider 名称（如 claude / kimi）"
                      />
                      <div className="token-input-wrap">
                        <div className="token-input-row">
                          <input
                            type="password"
                            className="token-input"
                            value={newTokenValue}
                            onChange={(e) => setNewTokenValue(e.target.value)}
                            placeholder="token（可先留空，后续再填）"
                          />
                        </div>
                      </div>
                      <button className="preview-btn" onClick={addCustomToken}>
                        添加入口
                      </button>
                    </div>
                  </div>

                  <button className="save-btn token-save-btn" onClick={() => saveConfig()} disabled={loading}>
                    {loading ? '保存中...' : '💾 保存 Token 配置'}
                  </button>
                </div>
                  )}
                />

                <Route
                  path="/history"
                  element={(
                    <div className="history-panel">
                  {history.length === 0 ? (
                    <div className="empty-state">暂无历史记录</div>
                  ) : (
                    <>
                      <div className="history-header">
                        <span>共 {filteredHistory.length} 条记录</span>
                        <button className="clear-btn" onClick={clearHistory}>
                          🗑️ 清空全部
                        </button>
                      </div>
                      <div className="history-filters">
                        {HISTORY_FILTERS.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            className={`history-filter-btn ${historyFilter === item.key ? 'active' : ''}`}
                            onClick={() => setHistoryFilter(item.key)}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                      <div className="history-list">
                        {filteredHistory.length === 0 ? (
                          <div className="empty-state">当前筛选暂无记录</div>
                        ) : (
                          filteredHistory.map((item) => (
                            <div key={item._id} className="history-item">
                              <div className="history-content">
                                <div className="history-text">
                                  <span className="label">{item.type === 'qa' ? '问题:' : '原文:'}</span>
                                  <span className="text">{item.question || item.text}</span>
                                </div>
                                <div className="history-text">
                                  <span className="label">{item.type === 'qa' ? '回答:' : '译文:'}</span>
                                  <span className="text result">{item.answer || item.result}</span>
                                </div>
                              </div>
                              <div className="history-side">
                                <div className="history-meta">
                                  {item.type === 'qa' ? (
                                    <span>问题类 · {item.provider || 'ai'}</span>
                                  ) : (
                                    <span>{item.from} → {item.to}</span>
                                  )}
                                  <span>{formatDate(item.timestamp)}</span>
                                </div>
                                <button className="delete-btn" onClick={() => deleteHistory(item._id)}>
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
                  )}
                />
                <Route
                  path="/docs"
                  element={(
                    <div className="docs-panel">
                      <div className="assistant-head">
                        <h3>文档中心</h3>
                        <p>浏览项目内的 Markdown 文档（README、docs 等）。</p>
                      </div>
                      <div className="docs-layout">
                        <aside className="docs-sidebar">
                          <div className="docs-sidebar-head">
                            <span>文档列表 ({docFiles.length})</span>
                            <button
                              type="button"
                              className="docs-refresh-btn"
                              onClick={loadDocs}
                              disabled={docLoading}
                            >
                              刷新
                            </button>
                          </div>
                          {docFiles.length === 0 ? (
                            <div className="empty-state">暂无可用文档</div>
                          ) : (
                            <div className="docs-list">
                              {docFiles.map((doc) => (
                                <button
                                  key={doc.path}
                                  type="button"
                                  className={`docs-item ${selectedDocPath === doc.path ? 'active' : ''}`}
                                  onClick={() => loadDocContent(doc.path)}
                                >
                                  <span className="docs-item-title">{doc.title}</span>
                                  <span className="docs-item-path">{doc.path}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </aside>
                        <section className="docs-view">
                          <div className="docs-current-path">{selectedDocPath || '请选择文档'}</div>
                          <div className="docs-content">
                            {docLoading ? (
                              <div className="docs-empty-tip">文档加载中...</div>
                            ) : docContent ? (
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{docContent}</ReactMarkdown>
                            ) : (
                              <div className="docs-empty-tip">暂无文档内容</div>
                            )}
                          </div>
                        </section>
                      </div>
                    </div>
                  )}
                />
                <Route
                  path="*"
                  element={<Navigate to="/assistant" replace />}
                />
              </Routes>
            </main>
          </div>
        </div>
      </div>

      {message.text && (
        <div className={`toast toast-${message.type} show`}>
          {message.text}
        </div>
      )}
    </div>
  );
}

export default App;
