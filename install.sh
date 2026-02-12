#!/bin/bash

# fanyi-cli 安装脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_PATH="$SCRIPT_DIR/bin/fanyi.js"
AI_BIN_PATH="$SCRIPT_DIR/bin/ai.js"

echo "🚀 正在安装 fanyi-cli..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

# 方式1: 尝试 npm link
echo "📦 尝试使用 npm link..."
if npm link 2>/dev/null; then
    # 检查 npm 全局 bin 目录是否在 PATH 中
    NPM_BIN_DIR="$(npm config get prefix)/bin"
    if [[ ":$PATH:" != *":$NPM_BIN_DIR:"* ]]; then
        echo "⚠️  npm 全局 bin 目录不在 PATH 中，正在添加..."
        if [ -n "$ZSH_VERSION" ]; then
            echo "export PATH=\"$NPM_BIN_DIR:\$PATH\"" >> "$HOME/.zshrc"
            echo "✅ 已添加到 ~/.zshrc"
            echo "请运行: source ~/.zshrc 或重新打开终端"
        elif [ -n "$BASH_VERSION" ]; then
            echo "export PATH=\"$NPM_BIN_DIR:\$PATH\"" >> "$HOME/.bashrc"
            echo "✅ 已添加到 ~/.bashrc"
            echo "请运行: source ~/.bashrc 或重新打开终端"
        fi
    fi
    echo "✅ 安装成功！"
    echo ""
    echo "现在可以使用以下命令："
    echo "  ai 你好"
    echo "  ai web"
    echo "  ai -h"
    echo ""
    echo "  fanyi hello"
    echo "  fanyi web"
    echo "  fanyi -h"
    exit 0
fi

# 方式2: 创建别名
echo "📝 npm link 失败，尝试创建 shell 别名..."

SHELL_RC=""
if [ -n "$ZSH_VERSION" ]; then
    SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ]; then
    SHELL_RC="$HOME/.bashrc"
fi

if [ -n "$SHELL_RC" ]; then
    # 检查别名是否已存在
    if ! grep -q "alias fanyi=" "$SHELL_RC" 2>/dev/null; then
        echo "alias fanyi=\"node $BIN_PATH\"" >> "$SHELL_RC"
    fi
    if ! grep -q "alias ai=" "$SHELL_RC" 2>/dev/null; then
        echo "alias ai=\"node $AI_BIN_PATH\"" >> "$SHELL_RC"
    fi
    echo "✅ 已添加命令别名到 $SHELL_RC（若已存在则跳过）"
    echo ""
    echo "请运行以下命令使别名生效："
    echo "  source $SHELL_RC"
    echo ""
    echo "或者重新打开终端窗口"
else
    echo "⚠️  无法自动检测 shell，请手动添加别名："
    echo "  alias ai=\"node $AI_BIN_PATH\""
    echo "  alias fanyi=\"node $BIN_PATH\""
fi

echo ""
echo "✅ 安装完成！"
echo ""
echo "使用方法："
echo "  ai 你好              # AI 问答"
echo "  ai web               # 启动Web界面"
echo "  ai -h                # 查看帮助"
echo ""
echo "  fanyi hello          # 翻译文本"
echo "  fanyi web            # 启动Web界面"
echo "  fanyi -h             # 查看帮助"
