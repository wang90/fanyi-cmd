import axios from 'axios';

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKeyEnv: string | null;
  defaultModel: string | null;
}

// 翻译服务提供商配置
export const PROVIDERS: Record<string, ProviderConfig> = {
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
  },
  qwen: {
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    defaultModel: 'qwen-plus',
  },
  openai: {
    name: 'ChatGPT',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    defaultModel: 'gpt-3.5-turbo',
  },
  libre: {
    name: 'Google Translate (免费)',
    baseUrl: 'https://translate.googleapis.com',
    apiKeyEnv: null,
    defaultModel: null,
  },
};

// 语言代码映射到中文名称
const LANGUAGE_NAMES: Record<string, string> = {
  zh: '中文',
  en: '英语',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  ru: '俄语',
  pt: '葡萄牙语',
  it: '意大利语',
  ar: '阿拉伯语',
  auto: '自动检测',
};

// 获取语言的中文名称
export function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code] || code;
}

interface ApiError extends Error {
  statusCode?: number;
}

function wrapProviderError(error: unknown, fallbackMessage: string, providerKey: string): ApiError {
  const errObj = error as { response?: { status?: number; data?: { error?: { message?: string } } }; code?: string; message?: string };
  if (errObj.response) {
    const statusCode = errObj.response.status ?? 500;
    const apiMessage = errObj.response.data?.error?.message || JSON.stringify(errObj.response.data);
    const isQuotaError = providerKey === 'openai' && (statusCode === 402 || statusCode === 429);
    const quotaHint = isQuotaError
      ? '（OpenAI 账户额度不足或已超限，请检查 Billing/充值，或先切换 deepseek/qwen）'
      : '';
    const err = new Error(
      `API错误: ${statusCode} - ${apiMessage}${quotaHint}`
    ) as ApiError;
    err.statusCode = statusCode;
    return err;
  }

  const networkErrorCodes = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'];
  const isNetworkIssue = networkErrorCodes.includes(errObj?.code);
  const providerConfig = PROVIDERS[providerKey];
  const providerHost = providerConfig?.baseUrl
    ? (() => {
      try {
        return new URL(providerConfig.baseUrl).host;
      } catch {
        return providerConfig.baseUrl;
      }
    })()
    : providerKey;
  const networkHint = isNetworkIssue
    ? `（当前网络无法连接 ${providerConfig?.name || providerKey} 接口 ${providerHost}，请检查网络/代理配置，或先切换其他 provider）`
    : '';
  const err = new Error(`${fallbackMessage}: ${errObj?.code || errObj?.message}${networkHint}`) as ApiError;
  err.statusCode = 502;
  return err;
}

function buildAskPayload(providerConfig: ProviderConfig, question: string, stream = false) {
  return {
    model: providerConfig.defaultModel,
    messages: [
      {
        role: 'system',
        content: 'You are a helpful AI assistant. Answer clearly and concisely in Chinese unless the user requests another language.',
      },
      { role: 'user', content: question },
    ],
    temperature: 0.7,
    stream,
  };
}

function buildTranslatePayload(providerConfig: ProviderConfig, text: string, from: string, to: string, stream = false) {
  const fromLang = LANGUAGE_NAMES[from] || from;
  const toLang = LANGUAGE_NAMES[to] || to;
  const systemPrompt = `You are a professional translator. Translate the user's text from ${fromLang} to ${toLang}. Only return the translated text without any explanation or additional content.`;

  return {
    model: providerConfig.defaultModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    temperature: 0.3,
    stream,
  };
}

async function readErrorBody(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json() as { error?: { message?: string } };
    return data?.error?.message || JSON.stringify(data);
  }
  return await response.text();
}

async function streamChatCompletion(
  provider: string,
  apiKey: string,
  payload: object,
  onChunk: (chunk: string) => void,
  actionLabel: string
): Promise<string> {
  const providerConfig = PROVIDERS[provider];
  const url = `${providerConfig.baseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const responseMessage = await readErrorBody(response);
    throw wrapProviderError(
      { response: { status: response.status, data: { error: { message: responseMessage } } } },
      `请求${providerConfig.name}${actionLabel}失败`,
      provider
    );
  }

  if (!response.body) {
    const err = new Error(`请求${providerConfig.name}${actionLabel}失败: 响应流为空`) as ApiError;
    err.statusCode = 502;
    throw err;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let lineBreakIndex = buffer.indexOf('\n');
    while (lineBreakIndex >= 0) {
      const line = buffer.slice(0, lineBreakIndex).trim();
      buffer = buffer.slice(lineBreakIndex + 1);

      if (line.startsWith('data:')) {
        const payloadStr = line.slice(5).trim();
        if (payloadStr && payloadStr !== '[DONE]') {
          try {
            const parsed = JSON.parse(payloadStr) as { choices?: Array<{ delta?: { content?: string } }> };
            const content = parsed?.choices?.[0]?.delta?.content || '';
            if (content) {
              fullText += content;
              onChunk?.(content);
            }
          } catch {
            // 忽略非JSON流片段，继续消费后续内容
          }
        }
      }
      lineBreakIndex = buffer.indexOf('\n');
    }
  }

  return fullText.trim();
}

async function askWithAIStream(provider: string, question: string, apiKey: string, onChunk: (chunk: string) => void): Promise<string> {
  const providerConfig = PROVIDERS[provider];
  return await streamChatCompletion(
    provider,
    apiKey,
    buildAskPayload(providerConfig, question, true),
    onChunk,
    '问答服务'
  );
}

// 使用AI模型进行翻译
async function translateWithAI(provider: string, text: string, from: string, to: string, apiKey: string): Promise<string> {
  const providerConfig = PROVIDERS[provider];
  return await streamChatCompletion(
    provider,
    apiKey,
    buildTranslatePayload(providerConfig, text, from, to, true),
    () => {},
    '翻译服务'
  );
}

// 使用AI模型进行通用问答
async function askWithAI(provider: string, question: string, apiKey: string): Promise<string> {
  const providerConfig = PROVIDERS[provider];
  const url = `${providerConfig.baseUrl}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
  const data = buildAskPayload(providerConfig, question);

  try {
    const response = await axios.post(url, data, { headers });
    return (response.data as { choices: Array<{ message: { content: string } }> }).choices[0].message.content.trim();
  } catch (error) {
    throw wrapProviderError(error, `请求${providerConfig.name}问答服务失败`, provider);
  }
}

// 使用 Google Translate 进行翻译（免费服务）
async function translateWithGoogle(text: string, from: string, to: string): Promise<string> {
  try {
    const response = await axios.get<unknown[]>(
      `${PROVIDERS.libre.baseUrl}/translate_a/single`,
      {
        params: {
          client: 'gtx',
          sl: from || 'auto',
          tl: to,
          dt: 't',
          q: text,
        },
        timeout: 15000,
        headers: { accept: 'application/json' },
      }
    );

    const segments = Array.isArray(response?.data?.[0]) ? response.data[0] : [];
    const translated = (segments as Array<unknown>)
      .map((segment) => (Array.isArray(segment) ? segment[0] : ''))
      .join('')
      .trim();

    if (typeof translated !== 'string' || !translated.trim()) {
      throw new Error('Google Translate 返回了空翻译结果');
    }
    return translated;
  } catch (error) {
    throw wrapProviderError(error, '请求 Google Translate 翻译服务失败', 'libre');
  }
}

export interface TranslateConfig {
  provider?: string;
  from?: string;
  to?: string;
  apiKeys?: Record<string, string>;
  token?: string;
}

// 主翻译函数
export async function translate(text: string, config: TranslateConfig): Promise<string> {
  const { provider = 'libre', from = 'auto', to = 'zh', apiKeys = {}, token = '' } = config;

  // 如果使用 Google Translate（免费服务）
  if (provider === 'libre') {
    return await translateWithGoogle(text, from, to);
  }

  // 使用AI模型翻译
  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) {
    throw new Error(`未知的翻译服务提供商: ${provider}`);
  }

  // 获取API Key（优先使用配置中的，其次使用环境变量）
  let apiKey = apiKeys[provider];
  if (!apiKey && providerConfig.apiKeyEnv) {
    apiKey = process.env[providerConfig.apiKeyEnv] || '';
  }
  if (!apiKey && token) {
    // 兼容旧配置：仅保留 token 字段时仍可用
    apiKey = token;
  }

  if (!apiKey) {
    throw new Error(`请配置${providerConfig.name}的API Key。可以通过Web界面配置或设置环境变量${providerConfig.apiKeyEnv}`);
  }

  return await translateWithAI(provider, text, from, to, apiKey);
}

export interface AskConfig {
  provider?: string;
  apiKeys?: Record<string, string>;
  token?: string;
}

// 主问答函数
export async function ask(question: string, config: AskConfig): Promise<string> {
  const { provider = 'deepseek', apiKeys = {}, token = '' } = config;
  const providerConfig = PROVIDERS[provider];

  if (!providerConfig) {
    throw new Error(`未知的AI服务提供商: ${provider}`);
  }

  if (provider === 'libre') {
    throw new Error('Google Translate 仅支持翻译，不支持通用问答。请将 provider 设置为 deepseek / qwen / openai。');
  }

  // 获取API Key（优先使用配置中的，其次使用环境变量）
  let apiKey = apiKeys[provider];
  if (!apiKey && providerConfig.apiKeyEnv) {
    apiKey = process.env[providerConfig.apiKeyEnv] || '';
  }
  if (!apiKey && token) {
    apiKey = token;
  }

  if (!apiKey) {
    throw new Error(`请配置${providerConfig.name}的API Key。可以通过Web界面配置或设置环境变量${providerConfig.apiKeyEnv}`);
  }

  return await askWithAI(provider, question, apiKey);
}

export async function askStream(question: string, config: AskConfig, onChunk?: (chunk: string) => void): Promise<string> {
  const { provider = 'deepseek', apiKeys = {}, token = '' } = config;
  const providerConfig = PROVIDERS[provider];

  if (!providerConfig) {
    throw new Error(`未知的AI服务提供商: ${provider}`);
  }
  if (provider === 'libre') {
    throw new Error('Google Translate 仅支持翻译，不支持通用问答。请将 provider 设置为 deepseek / qwen / openai。');
  }

  let apiKey = apiKeys[provider];
  if (!apiKey && providerConfig.apiKeyEnv) {
    apiKey = process.env[providerConfig.apiKeyEnv] || '';
  }
  if (!apiKey && token) {
    apiKey = token;
  }
  if (!apiKey) {
    throw new Error(`请配置${providerConfig.name}的API Key。可以通过Web界面配置或设置环境变量${providerConfig.apiKeyEnv}`);
  }

  const pushChunk = typeof onChunk === 'function' ? onChunk : () => {};
  return await askWithAIStream(provider, question, apiKey, pushChunk);
}
