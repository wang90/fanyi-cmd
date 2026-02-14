# 安装说明

## 方式1: 使用 npm link（推荐）

在项目目录下运行：

```bash
cd /Users/wang90/ai-cmd
npm link
```

如果遇到权限问题，可以使用 `sudo`：

```bash
sudo npm link
```

## 方式2: 全局安装

```bash
cd /Users/wang90/ai-cmd
sudo npm install -g .
```

## 方式3: 使用别名（临时方案）

如果无法全局安装，可以在 `~/.zshrc` 或 `~/.bashrc` 中添加别名：

```bash
# 添加到 ~/.zshrc
echo 'alias fanyi="node /Users/wang90/ai-cmd/bin/fanyi.js"' >> ~/.zshrc
source ~/.zshrc
```

## 方式4: 直接使用 node 运行

```bash
node /Users/wang90/ai-cmd/bin/fanyi.js hello
node /Users/wang90/ai-cmd/bin/fanyi.js web
```

## 验证安装

安装后运行：

```bash
fanyi -v
fanyi -h
```

如果显示版本和帮助信息，说明安装成功。

## 使用 npm scripts（开发推荐）

即使没有全局安装 `fanyi` 命令，也可以使用 npm scripts：

```bash
# 启动Web界面
npm run web
# 或
npm start

# 构建前端
npm run build

# 前端开发模式（热重载）
npm run dev:web
```

这样就不需要全局安装，直接在项目目录下使用即可。
