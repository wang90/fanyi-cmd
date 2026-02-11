import { translate as translateText, PROVIDERS } from './providers.js';
import { saveHistory } from './db.js';

export default async function translateWord(text, config) {
  const { from = 'auto', to = 'zh', provider = 'libre', apiKeys = {} } = config;
  
  try {
    const result = await translateText(text, { provider, from, to, apiKeys });
    
    // 保存翻译历史到数据库
    try {
      await saveHistory(text, result, { provider, from, to });
    } catch (err) {
      // 如果数据库未连接，静默失败
      console.warn('⚠️  无法保存历史记录（数据库可能未启动）');
    }
    
    return result;
  } catch (err) {
    const providerName = PROVIDERS[provider]?.name || provider;
    console.error(`❌ ${providerName}翻译出错:`, err.message);
    return '';
  }
}
