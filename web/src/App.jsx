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
  const [activeTab, setActiveTab] = useState('config');
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

  return (
    <div className="app">
      <div className="container">
        <div className="header">
          <h1 className="title">🌐 翻译工具配置</h1>
        </div>

        <div className="content-wrapper">
          <div className="layout">
            <aside className="sidebar">
              <div className="tabs">
                <button
                  className={`tab ${activeTab === 'config' ? 'active' : ''}`}
                  onClick={() => setActiveTab('config')}
                >
                  ⚙️ 配置
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
              {activeTab === 'config' && (
                <div className="config-layout">
                  <div className="config-panel">
                    <div className="form-row">
                      <div className="form-group provider-group">
                        <label>翻译服务提供商</label>
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
                          <option value="auto">自动检测</option>
                          <option value="zh">中文</option>
                          <option value="en">英语</option>
                          <option value="ja">日语</option>
                          <option value="ko">韩语</option>
                          <option value="fr">法语</option>
                          <option value="de">德语</option>
                          <option value="es">西班牙语</option>
                          <option value="ru">俄语</option>
                        </select>
                      </div>

                      <div className="form-group lang-group">
                        <label>目标语言</label>
                        <select
                          value={config.to || 'zh'}
                          onChange={(e) => setConfig({ ...config, to: e.target.value })}
                        >
                          <option value="zh">中文</option>
                          <option value="en">英语</option>
                          <option value="ja">日语</option>
                          <option value="ko">韩语</option>
                          <option value="fr">法语</option>
                          <option value="de">德语</option>
                          <option value="es">西班牙语</option>
                          <option value="ru">俄语</option>
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
