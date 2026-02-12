#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { ask } from '../src/providers.js';

const program = new Command();
const configPath = path.resolve(process.env.HOME || process.env.USERPROFILE, '.fanyi-config.json');

const DEFAULT_CONFIG = {
  from: 'auto',
  to: 'zh',
  provider: 'deepseek',
  apiKeys: {},
};

function initConfig() {
  try {
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
      return;
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const nextConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      apiKeys: config.apiKeys || {},
    };
    fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2));
  } catch (err) {
    // 配置文件异常时，后续会退回默认配置
  }
}

function getConfig() {
  try {
    initConfig();
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return {
        ...DEFAULT_CONFIG,
        ...config,
        apiKeys: config.apiKeys || {},
      };
    }
  } catch (err) {
    // 读取失败时回退默认配置
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

program
  .name('ai')
  .description('AI 命令行助手')
  .version('1.0.0');

program
  .command('web')
  .description('启动 Web 配置界面')
  .action(async () => {
    console.log('正在启动Web服务器...');
    const { startServer } = await import('../server/index.js');
    await startServer();
  });

program
  .command('config')
  .description('设置 AI 默认配置')
  .option('-p, --provider <provider>', '设置默认AI服务提供商 (deepseek/qwen/openai)')
  .action((options) => {
    const config = getConfig();
    let changed = false;

    if (options.provider) {
      config.provider = options.provider.trim();
      changed = true;
    }

    if (!changed) {
      console.log('\n当前配置:');
      console.log(`   provider: ${config.provider}`);
      console.log(`\n配置文件位置: ${configPath}\n`);
      return;
    }

    saveConfig(config);
    console.log('\n✅ 配置已更新:');
    console.log(`   provider: ${config.provider}`);
    console.log(`   配置文件: ${configPath}\n`);
  });

program
  .option('-p, --provider <provider>', '本次问答使用的AI服务提供商 (deepseek/qwen/openai)')
  .argument('[question...]', '要提问的内容')
  .action(async (question, options) => {
    const input = question.join(' ').trim();
    if (!input) {
      program.outputHelp();
      return;
    }

    const config = getConfig();
    if (options.provider) {
      config.provider = options.provider;
    }

    try {
      const answer = await ask(input, config);
      console.log(`\n🤖 ${answer}\n`);
    } catch (err) {
      console.error(`\n❌ AI 问答失败: ${err.message}\n`);
      process.exitCode = 1;
    }
  });

program.parse();
