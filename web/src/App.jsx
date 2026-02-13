import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE = '/api';
const PROVIDERS = {
  libre: 'LibreTranslate (免费)',
  deepseek: 'DeepSeek',
  qwen: '通义千问',
  openai: 'ChatGPT',
};

function App() {
  const [activeTab, setActiveTab] = useState('assistant');
  const [config, setConfig] = useState({
    from: 'auto',
    to: 'zh',
    provider: 'libre',
    token: '',
    apiKeys: {},
  });
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [presets, setPresets] = useState([]);
  const [presetName, setPresetName] = useState('');
  const [previewText, setPreviewText] = useState('hello');
  const [previewResult, setPreviewResult] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [askProvider, setAskProvider] = useState('deepseek');
  const [askQuestion, setAskQuestion] = useState('');
  const [askAnswer, setAskAnswer] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [newTokenProvider, setNewTokenProvider] = useState('');
  const [newTokenValue, setNewTokenValue] = useState('');

  const AI_PROVIDERS = Object.fromEntries(
    Object.entries(PROVIDERS).filter(([key]) => key !== 'libre')
  );
  const BUILTIN_TOKEN_KEYS = Object.keys(AI_PROVIDERS);
  const customTokenEntries = Object.entries(config.apiKeys || {}).filter(
    ([key]) => !BUILTIN_TOKEN_KEYS.includes(key)
  );
  const LANG_OPTIONS = [
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

  useEffect(() => {
    loadConfig();
    loadHistory();
    loadPresets();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await axios.get(`${API_BASE}/config`);
      const loaded = res.data || {};
      setConfig({
        from: loaded.from || 'auto',
        to: loaded.to || 'zh',
        provider: loaded.provider || 'libre',
        token: loaded.token || '',
        apiKeys: loaded.apiKeys || {},
      });
      if (loaded.provider && loaded.provider !== 'libre') {
        setAskProvider(loaded.provider);
      }
    } catch (error) {
      showMessage('error', '加载配置失败: ' + error.message);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await axios.get(`${API_BASE}/history`);
      setHistory(res.data);
    } catch (error) {
      showMessage('error', '加载历史记录失败: ' + error.message);
    }
  };

  const saveConfig = async () => {
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/config`, config);
      showMessage('success', '配置已保存');
    } catch (error) {
      showMessage('error', '保存配置失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteHistory = async (id) => {
    try {
      await axios.delete(`${API_BASE}/history/${id}`);
      loadHistory();
      showMessage('success', '已删除');
    } catch (error) {
      showMessage('error', '删除失败: ' + error.message);
    }
  };

  const clearHistory = async () => {
    if (!window.confirm('确定要清空所有历史记录吗？')) return;
    try {
      await axios.delete(`${API_BASE}/history`);
      loadHistory();
      showMessage('success', '历史记录已清空');
    } catch (error) {
      showMessage('error', '清空失败: ' + error.message);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
  };

  const loadPresets = async () => {
    try {
      const res = await axios.get(`${API_BASE}/config-presets`);
      setPresets(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
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
      showMessage('error', '保存方案失败: ' + error.message);
    }
  };

  const loadPreset = (preset) => {
    if (!preset?.config) return;
    setConfig(preset.config);
    if (preset.config.provider && preset.config.provider !== 'libre') {
      setAskProvider(preset.config.provider);
    }
    showMessage('success', `已加载方案：${preset.name}`);
  };

  const deletePreset = async (name) => {
    try {
      const res = await axios.delete(`${API_BASE}/config-presets/${encodeURIComponent(name)}`);
      setPresets(Array.isArray(res.data?.presets) ? res.data.presets : []);
      showMessage('success', '方案已删除');
    } catch (error) {
      showMessage('error', '删除方案失败: ' + error.message);
    }
  };

  const runPreview = async () => {
    setPreviewLoading(true);
    setPreviewResult('');
    try {
      const res = await axios.post(`${API_BASE}/preview`, {
        text: previewText || 'hello',
        config,
      });
      setPreviewResult(res.data?.result || '');
      showMessage('success', '预览完成');
    } catch (error) {
      showMessage(
        'error',
        error?.response?.data?.error || ('预览失败: ' + error.message)
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
      const res = await axios.post(`${API_BASE}/ask`, {
        question,
        config: {
          ...config,
          provider: askProvider,
        },
      });
      setAskAnswer(res.data?.answer || '');
      showMessage('success', '回答已生成');
    } catch (error) {
      showMessage(
        'error',
        error?.response?.data?.error || ('问答失败: ' + error.message)
      );
    } finally {
      setAskLoading(false);
    }
  };

  const updateApiKey = (provider, value) => {
    const nextApiKeys = {
      ...(config.apiKeys || {}),
      [provider]: value,
    };
    setConfig({ ...config, apiKeys: nextApiKeys });
  };

  const removeApiKey = (provider) => {
    const nextApiKeys = { ...(config.apiKeys || {}) };
    delete nextApiKeys[provider];
    setConfig({ ...config, apiKeys: nextApiKeys });
    if (askProvider === provider) {
      setAskProvider('deepseek');
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
    updateApiKey(provider, newTokenValue.trim());
    setNewTokenProvider('');
    setNewTokenValue('');
    showMessage('success', `已添加 token 入口: ${provider}`);
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
                <button
                  className={`tab ${activeTab === 'assistant' ? 'active' : ''}`}
                  onClick={() => setActiveTab('assistant')}
                >
                  🤖 AI 助手
                </button>
                <button
                  className={`tab ${activeTab === 'config' ? 'active' : ''}`}
                  onClick={() => setActiveTab('config')}
                >
                  ⚙️ 翻译配置 (fanyi)
                </button>
                <button
                  className={`tab ${activeTab === 'tokens' ? 'active' : ''}`}
                  onClick={() => setActiveTab('tokens')}
                >
                  🔑 Token 管理
                </button>
                <button
                  className={`tab ${activeTab === 'history' ? 'active' : ''}`}
                  onClick={() => setActiveTab('history')}
                >
                  📜 历史记录 ({history.length})
                </button>
              </div>
            </aside>

            <main className="content-area">
              {activeTab === 'assistant' && (
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
                        onChange={(e) => setAskProvider(e.target.value)}
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
                      <input
                        type="password"
                        value={config.apiKeys?.[askProvider] || ''}
                        onChange={(e) => {
                          const nextApiKeys = {
                            ...(config.apiKeys || {}),
                            [askProvider]: e.target.value,
                          };
                          setConfig({ ...config, apiKeys: nextApiKeys });
                        }}
                        placeholder={`输入 ${AI_PROVIDERS[askProvider]} 的 Token`}
                      />
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
                    <button className="save-btn secondary" onClick={saveConfig} disabled={loading}>
                      {loading ? '保存中...' : '保存当前配置'}
                    </button>
                  </div>

                  <div className="assistant-answer-block">
                    <label className="assistant-label">回答输出</label>
                    <div className="assistant-answer">{askAnswer || '回答将显示在这里'}</div>
                  </div>
                </div>
              )}

              {activeTab === 'config' && (
                <div className="config-layout">
                  <div className="config-panel">
                    <div className="form-row">
                      <div className="form-group provider-group">
                        <label>翻译服务提供商 (fanyi)</label>
                        <select
                          className="provider-select"
                          value={config.provider || 'libre'}
                          onChange={(e) => setConfig({ ...config, provider: e.target.value })}
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
                        <input
                          type="password"
                          value={config.apiKeys?.[config.provider] || config.token || ''}
                          onChange={(e) => {
                            const nextApiKeys = {
                              ...(config.apiKeys || {}),
                              [config.provider || 'libre']: e.target.value,
                            };
                            setConfig({ ...config, token: e.target.value, apiKeys: nextApiKeys });
                          }}
                          placeholder={`输入 ${PROVIDERS[config.provider || 'libre']} 的 Token`}
                          disabled={(config.provider || 'libre') === 'libre'}
                        />
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

                    <button className="save-btn" onClick={saveConfig} disabled={loading}>
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

              {activeTab === 'tokens' && (
                <div className="tokens-panel">
                  <div className="assistant-head">
                    <h3>Token 管理中心</h3>
                    <p>统一管理所有 provider token，新增后可用于 ai / fanyi 命令与页面联调。</p>
                  </div>

                  <div className="tokens-list">
                    {BUILTIN_TOKEN_KEYS.map((provider) => (
                      <div className="token-item" key={provider}>
                        <div className="token-meta">
                          <div className="token-name">{provider}</div>
                          <div className="token-desc">{AI_PROVIDERS[provider]}</div>
                        </div>
                        <input
                          type="password"
                          className="token-input"
                          value={config.apiKeys?.[provider] || ''}
                          onChange={(e) => updateApiKey(provider, e.target.value)}
                          placeholder={`输入 ${AI_PROVIDERS[provider]} Token`}
                        />
                      </div>
                    ))}

                    {customTokenEntries.map(([provider, token]) => (
                      <div className="token-item custom" key={provider}>
                        <div className="token-meta">
                          <div className="token-name">{provider}</div>
                          <div className="token-desc">自定义 provider</div>
                        </div>
                        <input
                          type="password"
                          className="token-input"
                          value={token || ''}
                          onChange={(e) => updateApiKey(provider, e.target.value)}
                          placeholder={`输入 ${provider} Token`}
                        />
                        <button className="token-remove-btn" onClick={() => removeApiKey(provider)}>
                          删除
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="token-add-box">
                    <h4>新增自定义 Token 入口</h4>
                    <div className="token-add-row">
                      <input
                        className="token-input"
                        value={newTokenProvider}
                        onChange={(e) => setNewTokenProvider(e.target.value)}
                        placeholder="provider 名称（如 claude / kimi）"
                      />
                      <input
                        type="password"
                        className="token-input"
                        value={newTokenValue}
                        onChange={(e) => setNewTokenValue(e.target.value)}
                        placeholder="token（可先留空，后续再填）"
                      />
                      <button className="preview-btn" onClick={addCustomToken}>
                        添加入口
                      </button>
                    </div>
                  </div>

                  <button className="save-btn" onClick={saveConfig} disabled={loading}>
                    {loading ? '保存中...' : '💾 保存 Token 配置'}
                  </button>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="history-panel">
                  {history.length === 0 ? (
                    <div className="empty-state">暂无历史记录</div>
                  ) : (
                    <>
                      <div className="history-header">
                        <span>共 {history.length} 条记录</span>
                        <button className="clear-btn" onClick={clearHistory}>
                          🗑️ 清空全部
                        </button>
                      </div>
                      <div className="history-list">
                        {history.map((item) => (
                          <div key={item._id} className="history-item">
                            <div className="history-content">
                              <div className="history-text">
                                <span className="label">原文:</span>
                                <span className="text">{item.text}</span>
                              </div>
                              <div className="history-text">
                                <span className="label">译文:</span>
                                <span className="text result">{item.result}</span>
                              </div>
                              <div className="history-meta">
                                <span>{item.from} → {item.to}</span>
                                <span>{formatDate(item.timestamp)}</span>
                              </div>
                            </div>
                            <button className="delete-btn" onClick={() => deleteHistory(item._id)}>
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
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
