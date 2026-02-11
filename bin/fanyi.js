#!/usr/bin/env node
import { Command } from 'commander';
import translateWord from '../src/translate.js';
import fs from 'fs';
import path from 'path';

const program = new Command();
const configPath = path.resolve(process.env.HOME || process.env.USERPROFILE, '.fanyi-config.json');

// 语言代码映射
const LANGUAGES = {
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
};

// 默认配置
const DEFAULT_CONFIG = {
  from: 'auto',
  to: 'zh',
  provider: 'libre',
  apiKeys: {}
};

// 初始化配置文件
function initConfig() {
  try {
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
    } else {
      // 兼容旧配置格式
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.token && !config.apiKeys) {
        config.apiKeys = {};
        delete config.token;
      }
      if (!config.provider) {
        config.provider = 'libre';
      }
      try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      } catch (err) {
        // 无法写入配置文件，使用内存中的配置
      }
    }
  } catch (err) {
    // 无法创建或写入配置文件，使用默认配置
  }
}

function getConfig() {
  try {
    initConfig();
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      // 确保所有必需字段存在
      return {
        ...DEFAULT_CONFIG,
        ...config,
        apiKeys: config.apiKeys || {}
      };
    }
  } catch (err) {
    // 配置文件读取失败，使用默认配置
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.warn('⚠️  无法保存配置文件:', err.message);
  }
}

// 显示手册
function showManual() {
  console.log(`
📖 fanyi 使用手册

基本用法:
  fanyi <文本>                   翻译文本
  fanyi <文本> -t <语言>         指定目标语言翻译
  fanyi <文本> -f <语言>         指定源语言翻译
  fanyi <文本> -p <服务商>       指定翻译服务提供商

命令:
  fanyi web                      启动Web配置界面
  fanyi config                   交互式配置
  fanyi -man, --manual           显示此手册
  fanyi -h, --help               显示帮助信息
  fanyi -v, --version            显示版本信息

选项:
  -t, --to <语言>                设置目标语言 (默认: zh)
  -f, --from <语言>              设置源语言 (默认: auto)
  -p, --provider <服务商>        设置翻译服务提供商
  -man, --manual                 显示详细使用手册

支持的翻译服务提供商:
  libre      LibreTranslate (免费，默认)
  deepseek   DeepSeek (需要API Key)
  qwen       通义千问 (需要API Key)
  openai     ChatGPT (需要API Key)

支持的语言代码:
  zh    中文          en    英语          ja    日语
  ko    韩语          fr    法语          de    德语
  es    西班牙语      ru    俄语          pt    葡萄牙语
  it    意大利语      ar    阿拉伯语      auto  自动检测

示例:
  fanyi hello                     # 使用LibreTranslate翻译为中文
  fanyi 你好 -t en                # 翻译为英语
  fanyi apple -t ja -f en         # 从英语翻译为日语
  fanyi hello -p deepseek         # 使用DeepSeek翻译
  fanyi web                       # 打开Web界面配置API Key

API Key配置:
  1. 通过Web界面配置: fanyi web
  2. 通过环境变量配置:
     export DEEPSEEK_API_KEY="your-key"
     export DASHSCOPE_API_KEY="your-key"
     export OPENAI_API_KEY="your-key"

配置文件位置: ` + configPath + `
`);
}

program
  .name('fanyi')
  .description('一个功能强大的命令行翻译工具')
  .version('1.0.0');

// web命令 - 启动Web界面
program
  .command('web')
  .description('启动Web配置界面')
  .action(async () => {
    console.log('正在启动Web服务器...');
    // 动态导入，避免CLI运行时加载express
    const { startServer } = await import('../server/index.js');
    await startServer();
  });

// config命令 - 交互式配置
const configCmd = program
  .command('config')
  .description('交互式配置翻译选项')
  .option('-t, --to <lang>', '设置目标语言')
  .option('-f, --from <lang>', '设置源语言')
  .option('-p, --provider <provider>', '设置翻译服务提供商')
  .action(async () => {
    // 解析命令行参数
    const args = process.argv.slice(process.argv.indexOf('config') + 1);
    const config = getConfig();
    let changed = false;

    // 解析选项
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-t' || args[i] === '--to') {
        if (args[i + 1] && !args[i + 1].startsWith('-')) {
          config.to = args[i + 1];
          changed = true;
          i++;
        }
      } else if (args[i] === '-f' || args[i] === '--from') {
        if (args[i + 1] && !args[i + 1].startsWith('-')) {
          config.from = args[i + 1];
          changed = true;
          i++;
        }
      } else if (args[i] === '-p' || args[i] === '--provider') {
        if (args[i + 1] && !args[i + 1].startsWith('-')) {
          config.provider = args[i + 1];
          changed = true;
          i++;
        }
      }
    }

    // 如果没有提供选项，使用交互式配置
    if (!changed) {
      const readline = await import('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(`当前目标语言: ${config.to} (${LANGUAGES[config.to] || config.to})，请输入新的目标语言代码 (直接回车跳过): `, (toLang) => {
        if (toLang.trim()) {
          config.to = toLang.trim();
          changed = true;
        }
        
        rl.question(`当前源语言: ${config.from} (${config.from === 'auto' ? '自动检测' : LANGUAGES[config.from] || config.from})，请输入新的源语言代码 (直接回车跳过): `, (fromLang) => {
          if (fromLang.trim()) {
            config.from = fromLang.trim();
            changed = true;
          }
          
          rl.question(`当前服务提供商: ${config.provider}，请输入新的服务提供商 (libre/deepseek/qwen/openai，直接回车跳过): `, (provider) => {
            if (provider.trim()) {
              config.provider = provider.trim();
              changed = true;
            }
            
            if (changed) {
              saveConfig(config);
              console.log(`\n✅ 配置已更新:`);
              console.log(`   目标语言: ${config.to} (${LANGUAGES[config.to] || config.to})`);
              console.log(`   源语言: ${config.from} (${config.from === 'auto' ? '自动检测' : LANGUAGES[config.from] || config.from})`);
              console.log(`   服务提供商: ${config.provider}\n`);
            } else {
              console.log('\n⚠️  未进行任何更改\n');
            }
            rl.close();
          });
        });
      });
    } else {
      // 命令行选项模式
      saveConfig(config);
      console.log(`\n✅ 配置已更新:`);
      console.log(`   目标语言: ${config.to} (${LANGUAGES[config.to] || config.to})`);
      console.log(`   源语言: ${config.from} (${config.from === 'auto' ? '自动检测' : LANGUAGES[config.from] || config.from})`);
      console.log(`   服务提供商: ${config.provider}\n`);
    }
  });

// 翻译命令（默认）
program
  .option('-t, --to <lang>', '设置目标语言')
  .option('-f, --from <lang>', '设置源语言')
  .option('-p, --provider <provider>', '设置翻译服务提供商 (libre/deepseek/qwen/openai)')
  .option('-man, --manual', '显示详细使用手册')
  .argument('[text...]', '要翻译的文字')
  .action(async (text, options) => {
    // 显示手册
    if (options.manual) {
      showManual();
      return;
    }

    const query = text.join(' ');
    if (!query) {
      program.outputHelp();
      return;
    }

    const config = getConfig();
    
    // 如果命令行指定了选项，优先使用命令行选项
    if (options.to) {
      config.to = options.to;
    }
    if (options.from) {
      config.from = options.from;
    }
    if (options.provider) {
      config.provider = options.provider;
    }

    const result = await translateWord(query, config);
    
    // 显示翻译结果
    const fromLang = config.from === 'auto' ? 'auto' : (LANGUAGES[config.from] || config.from);
    const toLang = LANGUAGES[config.to] || config.to;
    const providerName = config.provider === 'libre' ? 'LibreTranslate' : 
                        config.provider === 'deepseek' ? 'DeepSeek' :
                        config.provider === 'qwen' ? '通义千问' :
                        config.provider === 'openai' ? 'ChatGPT' : config.provider;
    console.log(`\n🔤 ${query}`);
    console.log(`   ${fromLang} → ${toLang} [${providerName}]`);
    console.log(`   ${result}\n`);
  });

program.parse();