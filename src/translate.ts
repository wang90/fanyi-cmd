import { translate as translateText, PROVIDERS } from './providers.js';
import { saveHistory } from './db.js';
import type { TranslateConfig } from './providers.js';

export default async function translateWord(text: string, config: TranslateConfig): Promise<string> {
  const { from = 'auto', to = 'zh', provider = 'libre', apiKeys = {} } = config;

  try {
    const result = await translateText(text, { provider, from, to, apiKeys });

    // 保存翻译历史到数据库
    try {
      await saveHistory(text, result, { provider, from, to });
    } catch {
      // 如果数据库未连接，静默失败
      console.warn('⚠️  无法保存历史记录（数据库可能未启动）');
    }

    return result;
  } catch (err) {
    const providerName = PROVIDERS[provider]?.name || provider;
    console.error(`❌ ${providerName}翻译出错:`, (err as Error).message);
    return '';
  }
}
