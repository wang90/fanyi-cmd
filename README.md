# ai-cmd

一个以 `ai` 为默认入口的命令行 AI 工具，保留 `fanyi` 作为翻译子能力，并提供 Web 配置面板。

## 核心定位

- `ai`：通用 AI 问答命令（主入口）
- `fanyi`：翻译命令（兼容原有习惯）
- `web` 面板：统一管理配置、Token、翻译预览和历史记录

## 快速开始

```bash
# 安装依赖
npm install
cd web && npm install && cd ..

# 开发模式（建议开两个终端）
# 终端1：后端 + API
npm run web
# 终端2：前端热更新
npm run dev:web
```

打开：

- Web 配置页：`http://localhost:3000`
- 前端开发页：`http://localhost:3001`

## 命令行用法

### 1) AI 问答（主入口）

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

- `ai` 仅支持 `deepseek / qwen / openai`
- `libre` 是翻译引擎，不支持通用问答

### 2) 翻译（保留 fanyi）

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
-p, --provider <provider>  翻译提供商（libre/deepseek/qwen/openai）
```

## Web 面板说明

当前 Web 页面已调整为 AI 优先，包含 4 个区块：

- `AI 助手`：模拟 `ai <问题>`，可直接提问和查看回答
- `翻译配置 (fanyi)`：管理翻译 provider、源/目标语言、翻译预览
- `Token 管理`：统一维护所有 provider 的 token（含自定义 provider 入口）
- `历史记录`：查看/删除翻译历史

## Token 配置（推荐）

### 方式 1：Web 统一管理（推荐）

在 `Token 管理` 页面可直接维护：

- 内置 token：`deepseek`、`qwen`、`openai`
- 自定义 token：例如 `claude`、`kimi`（先建入口，后续可接入）

保存后写入同一份配置文件：`~/.fanyi-config.json`

### 方式 2：环境变量

```bash
export DEEPSEEK_API_KEY="your-deepseek-api-key"
export DASHSCOPE_API_KEY="your-qwen-api-key"
export OPENAI_API_KEY="your-openai-api-key"
```

### 方式 3：直接编辑配置文件

`~/.fanyi-config.json` 示例：

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

## 支持语言（fanyi）

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

## 安装命令

推荐：

```bash
./install.sh
```

或者：

```bash
npm link
```

安装后可直接使用：

```bash
ai -h
fanyi -h
```

## 相关文档

- 安装说明：`INSTALL.md`
- Web 说明：`WEB_SETUP.md`
- 快速上手：`QUICKSTART.md`
