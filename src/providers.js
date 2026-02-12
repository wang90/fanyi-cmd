import axios from 'axios';

// 翻译服务提供商配置
export const PROVIDERS = {
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
    name: 'LibreTranslate (免费)',
    baseUrl: 'https://libretranslate.de',
    apiKeyEnv: null,
    defaultModel: null,
  },
};

// 语言代码映射到中文名称
const LANGUAGE_NAMES = {
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
export function getLanguageName(code) {
  return LANGUAGE_NAMES[code] || code;
}

// 使用AI模型进行翻译
async function translateWithAI(provider, text, from, to, apiKey) {
  const providerConfig = PROVIDERS[provider];
  const fromLang = LANGUAGE_NAMES[from] || from;
  const toLang = LANGUAGE_NAMES[to] || to;
  
  const systemPrompt = `You are a professional translator. Translate the user's text from ${fromLang} to ${toLang}. Only return the translated text without any explanation or additional content.`;
  
  const url = `${providerConfig.baseUrl}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
  
  const data = {
    model: providerConfig.defaultModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    temperature: 0.3,
  };
  
  try {
    const response = await axios.post(url, data, { headers });
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    if (error.response) {
      throw new Error(`API错误: ${error.response.status} - ${error.response.data?.error?.message || JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

// 使用AI模型进行通用问答
async function askWithAI(provider, question, apiKey) {
  const providerConfig = PROVIDERS[provider];
  const url = `${providerConfig.baseUrl}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
  const data = {
    model: providerConfig.defaultModel,
    messages: [
      {
        role: 'system',
        content: 'You are a helpful AI assistant. Answer clearly and concisely in Chinese unless the user requests another language.',
      },
      { role: 'user', content: question },
    ],
    temperature: 0.7,
  };

  try {
    const response = await axios.post(url, data, { headers });
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    if (error.response) {
      throw new Error(`API错误: ${error.response.status} - ${error.response.data?.error?.message || JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

// 使用LibreTranslate进行翻译（免费服务）
async function translateWithLibre(text, from, to) {
  try {
    const response = await axios.post(
      `${PROVIDERS.libre.baseUrl}/translate`,
      {
        q: text,
        source: from,
        target: to,
        format: 'text',
      },
      {
        headers: { 'accept': 'application/json' },
      }
    );
    return response.data.translatedText;
  } catch (error) {
    if (error.response) {
      throw new Error(`LibreTranslate错误: ${error.response.status} - ${error.response.data?.error || JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

// 主翻译函数
export async function translate(text, config) {
  const { provider = 'libre', from = 'auto', to = 'zh', apiKeys = {} } = config;
  
  // 如果使用LibreTranslate（免费服务）
  if (provider === 'libre') {
    return await translateWithLibre(text, from, to);
  }
  
  // 使用AI模型翻译
  const providerConfig = PROVIDERS[provider];
  if (!providerConfig) {
    throw new Error(`未知的翻译服务提供商: ${provider}`);
  }
  
  // 获取API Key（优先使用配置中的，其次使用环境变量）
  let apiKey = apiKeys[provider];
  if (!apiKey && providerConfig.apiKeyEnv) {
    apiKey = process.env[providerConfig.apiKeyEnv];
  }
  
  if (!apiKey) {
    throw new Error(`请配置${providerConfig.name}的API Key。可以通过Web界面配置或设置环境变量${providerConfig.apiKeyEnv}`);
  }
  
  return await translateWithAI(provider, text, from, to, apiKey);
}

// 主问答函数
export async function ask(question, config) {
  const { provider = 'deepseek', apiKeys = {} } = config;
  const providerConfig = PROVIDERS[provider];

  if (!providerConfig) {
    throw new Error(`未知的AI服务提供商: ${provider}`);
  }

  if (provider === 'libre') {
    throw new Error('LibreTranslate 仅支持翻译，不支持通用问答。请将 provider 设置为 deepseek / qwen / openai。');
  }

  // 获取API Key（优先使用配置中的，其次使用环境变量）
  let apiKey = apiKeys[provider];
  if (!apiKey && providerConfig.apiKeyEnv) {
    apiKey = process.env[providerConfig.apiKeyEnv];
  }

  if (!apiKey) {
    throw new Error(`请配置${providerConfig.name}的API Key。可以通过Web界面配置或设置环境变量${providerConfig.apiKeyEnv}`);
  }

  return await askWithAI(provider, question, apiKey);
}
