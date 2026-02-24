# ai-cmd

一个 AI 命令行工具集：默认入口是 `ai`（通用问答），并保留 `fanyi`（翻译）命令，同时提供 Web 面板用于统一管理配置、Token 与历史记录。

## 功能概览

- `ai`：命令行 AI 问答，支持流式输出，支持 `deepseek / qwen / openai`
- `fanyi`：翻译命令，支持 `libre / deepseek / qwen / openai`
- Web 面板：AI 助手、翻译配置、Token 管理、历史记录
- 配置统一：CLI 与 Web 共用 `~/.ai-config.json`
- 历史记录：优先写入 MongoDB（本地可选），不可用时主功能不受阻

## 环境要求

- Node.js 18+
- npm 9+（或兼容版本）
- MongoDB（可选，仅用于持久化历史记录）

## 快速开始

```bash
# 1) 安装依赖
npm install
cd web && npm install && cd ..

# 2) 启动服务端（API + 静态页面）
npm run web

# 3) 可选：单独启动前端开发服务器（热更新）
npm run dev:web
```

默认地址：

- 服务端/生产静态页：`http://localhost:3000`
- Vite 开发页：`http://localhost:3001`（代理 `/api -> 3000`）

## CLI 使用

### `ai`（主入口）

```bash
ai 解释一下什么是 RAG
ai "帮我写一个 Python 快排"
ai -p qwen 总结这段文本
```

常用命令：

```bash
ai -h
ai config
ai config -p deepseek
ai web
```

说明：

- `ai` 仅支持问答型 provider：`deepseek / qwen / openai`
- `libre` 只用于翻译，不支持通用问答
- zsh 下可启用项目内集成：执行成功后，下一次命令行自动预填 `ai `

### `fanyi`（翻译命令）

```bash
fanyi hello
fanyi 你好 -t en
fanyi apple -t ja -f en
fanyi hello -p deepseek
fanyi web
```

翻译参数：

```bash
-t, --to <lang>            目标语言（默认 zh）
-f, --from <lang>          源语言（默认 auto）
-p, --provider <provider>  翻译服务（libre/deepseek/qwen/openai）
```

## Web 面板说明

Web 面板包含 4 个标签页：

- `AI 助手`：模拟 `ai <问题>`，支持流式回答
- `翻译配置 (fanyi)`：设置源/目标语言、翻译 provider、翻译预览
- `Token 管理`：集中管理内置和自定义 provider 的 token
- `历史记录`：查看、筛选和删除历史

## 配置与 Token

### 推荐方式：Web 面板配置

在 `Token 管理` 页面维护 token，保存后写入：

- `~/.ai-config.json`

### 环境变量方式

```bash
export DEEPSEEK_API_KEY="your-deepseek-api-key"
export DASHSCOPE_API_KEY="your-qwen-api-key"
export OPENAI_API_KEY="your-openai-api-key"
```

### 配置文件示例

```json
{
  "provider": "deepseek",
  "from": "auto",
  "to": "zh",
  "apiKeys": {
    "deepseek": "your-api-key",
    "qwen": "your-api-key",
    "openai": "your-api-key",
    "claude": "custom-key"
  }
}
```

## 支持语言（`fanyi`）

- `zh` 中文
- `en` 英语
- `ja` 日语
- `ko` 韩语
- `fr` 法语
- `de` 德语
- `es` 西班牙语
- `ru` 俄语
- `pt` 葡萄牙语
- `it` 意大利语
- `ar` 阿拉伯语
- `auto` 自动检测（仅源语言）

## 开发脚本

```bash
npm run dev        # node --watch server/index.js
npm run web        # 启动服务端
npm run start      # 启动服务端
npm run build      # 构建前端 web/dist
npm run dev:web    # 启动前端开发服务器（3001）
npm run preview:web
```

## 历史记录存储说明

- 项目会尝试连接 `mongodb://localhost:27017`
- MongoDB 可用时：写入数据库 `ai-cmd.history`
- MongoDB 不可用时：问答/翻译功能继续可用，仅历史能力受限

## 常见问题

- `OpenAI 402/429`：通常是额度不足或超限，检查 Billing 或切换 provider
- `网络连接失败`：检查代理、防火墙、DNS，或切换其他 provider
- `Web 页面提示未构建`：先执行 `npm run build`

## 安装为全局命令

```bash
./install.sh
# 或
npm link
```

安装后可直接执行：

```bash
ai -h
fanyi -h
```

如需启用 zsh 自动预填（项目内提供）：

```bash
source "$(pwd)/scripts/ai-shell.zsh"
```

建议将上面这行加入 `~/.zshrc`，或直接执行 `./install.sh` 自动写入。

## 文档目录

- 安装说明：`docs/INSTALL.md`
- Web 说明：`docs/WEB_SETUP.md`
- 快速上手：`docs/QUICKSTART.md`
- GitHub 使用文档：`docs/GITHUB_USAGE.md`
