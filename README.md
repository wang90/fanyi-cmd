# fanyi-cli

一个功能强大的命令行翻译工具，支持多个AI翻译服务提供商和Web可视化界面。

## 基本使用

```bash
fanyi apple                    # 使用LibreTranslate翻译为中文（免费）
fanyi 你好世界                  # 翻译为英语
fanyi hello -t ja             # 翻译为日语
fanyi apple -t en -f zh       # 从中文翻译为英语
fanyi hello -p deepseek       # 使用DeepSeek翻译
fanyi -v                      # 查看版本
fanyi -h                      # 查看帮助
fanyi -man                    # 显示详细手册
```

## 命令行选项

```bash
-t, --to <语言>              设置目标语言 (默认: zh)
-f, --from <语言>            设置源语言 (默认: auto)
-p, --provider <服务商>      设置翻译服务提供商
-man, --manual               显示详细使用手册
-h, --help                   显示帮助信息
-v, --version                显示版本信息
```

## 支持的翻译服务提供商

### LibreTranslate (默认，免费)
- 无需API Key
- 免费使用
- 适合日常翻译需求

### DeepSeek
- 需要API Key
- 环境变量: `DEEPSEEK_API_KEY`
- 获取API Key: https://platform.deepseek.com/

### 通义千问 (Qwen)
- 需要API Key
- 环境变量: `DASHSCOPE_API_KEY`
- 获取API Key: https://bailian.console.aliyun.com/

### ChatGPT (OpenAI)
- 需要API Key
- 环境变量: `OPENAI_API_KEY`
- 获取API Key: https://platform.openai.com/

## 支持的语言

- `zh` - 中文
- `en` - 英语
- `ja` - 日语
- `ko` - 韩语
- `fr` - 法语
- `de` - 德语
- `es` - 西班牙语
- `ru` - 俄语
- `pt` - 葡萄牙语
- `it` - 意大利语
- `ar` - 阿拉伯语
- `auto` - 自动检测（仅源语言）

## 命令

### Web界面

启动Web可视化界面进行配置和查看历史记录：

**方式1: 使用命令行**
```bash
fanyi web
```

**方式2: 使用 npm scripts（推荐用于开发）**
```bash
npm run web
# 或
npm start
# 或
npm run start:web
```

然后在浏览器中打开 `http://localhost:3000`

**开发模式（前端热重载）**
```bash
# 终端1: 启动后端服务器
npm run web

# 终端2: 启动前端开发服务器（支持热重载）
npm run dev:web
```
前端开发服务器会在 `http://localhost:3001` 运行，并自动代理 API 请求到后端。

### 交互式配置

**方式1: 使用命令行**
```bash
fanyi config
```

**方式2: 使用 npm scripts**
```bash
npm run config
```

**方式3: 命令行参数（快速设置）**
```bash
fanyi config -t en -f zh -p deepseek
# 或
npm run config -- -t en -f zh -p deepseek
```

### 查看手册

```bash
fanyi -man
# 或
fanyi --manual
```

### Web界面功能

- ⚙️ **配置管理**: 
  - 选择翻译服务提供商（LibreTranslate/DeepSeek/通义千问/ChatGPT）
  - 配置多个API Key
  - 设置源语言和目标语言
- 📜 **历史记录**: 查看、删除翻译历史记录
- 💾 **数据持久化**: 使用MongoDB本地存储历史记录

详细设置说明请查看 [WEB_SETUP.md](./WEB_SETUP.md)

## API Key配置

### 方式1: Web界面配置（推荐）
```bash
fanyi web
```
在Web界面中选择服务提供商并输入对应的API Key。

### 方式2: 环境变量配置
```bash
# DeepSeek
export DEEPSEEK_API_KEY="your-deepseek-api-key"

# 通义千问
export DASHSCOPE_API_KEY="your-qwen-api-key"

# ChatGPT
export OPENAI_API_KEY="your-openai-api-key"
```

### 方式3: 配置文件
配置文件位置: `~/.fanyi-config.json`

```json
{
  "provider": "deepseek",
  "from": "auto",
  "to": "zh",
  "apiKeys": {
    "deepseek": "your-api-key",
    "qwen": "your-api-key",
    "openai": "your-api-key"
  }
}
```

## 安装

### 1. 安装依赖

**重要：必须先安装依赖才能使用！**

```bash
# 安装主项目依赖
npm install

# 安装Web前端依赖
cd web && npm install && cd ..

# 构建Web前端（生产环境使用）
npm run build
```

如果遇到网络问题，可以使用国内镜像：
```bash
npm install --registry=https://registry.npmmirror.com
cd web && npm install --registry=https://registry.npmmirror.com && cd ..
```

### 2. 安装命令行工具

**方式1: 使用安装脚本（推荐）**
```bash
./install.sh
```

**方式2: 使用 npm link**
```bash
npm link
# 如果遇到权限问题，使用:
sudo npm link
```

**方式3: 全局安装**
```bash
sudo npm install -g .
```

**方式4: 使用别名（临时方案）**
```bash
# 添加到 ~/.zshrc 或 ~/.bashrc
echo 'alias fanyi="node /Users/wang90/fanyi-cli/bin/fanyi.js"' >> ~/.zshrc
source ~/.zshrc
```

**方式5: 直接使用**
```bash
node bin/fanyi.js hello
node bin/fanyi.js web
```

详细安装说明请查看 [INSTALL.md](./INSTALL.md)

## 依赖

- Node.js
- MongoDB (可选，用于存储历史记录)