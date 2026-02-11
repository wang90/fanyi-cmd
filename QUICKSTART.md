# 快速开始

## 首次使用

### 1. 安装依赖

```bash
# 安装主项目依赖
npm install

# 安装Web前端依赖
cd web && npm install && cd ..
```

### 2. 启动Web界面

**方式1: 使用 npm scripts（推荐）**
```bash
npm run web
```

**方式2: 使用命令行（需要先全局安装）**
```bash
fanyi web
```

### 3. 访问Web界面

在浏览器中打开：`http://localhost:3000`

## 开发模式

如果需要修改前端代码，可以使用开发模式（支持热重载）：

```bash
# 终端1: 启动后端服务器
npm run web

# 终端2: 启动前端开发服务器
npm run dev:web
```

前端开发服务器：`http://localhost:3001`  
后端API服务器：`http://localhost:3000`

## 常见问题

### 错误：Cannot find package 'express'

**原因：** 依赖未安装

**解决：**
```bash
npm install
cd web && npm install && cd ..
```

### 错误：Web界面未构建

**原因：** 前端未构建

**解决：**
```bash
npm run build
```

或者使用开发模式（无需构建）：
```bash
npm run dev:web  # 在另一个终端
```

### 网络问题

如果 `npm install` 很慢或失败，可以使用国内镜像：

```bash
npm install --registry=https://registry.npmmirror.com
cd web && npm install --registry=https://registry.npmmirror.com && cd ..
```
