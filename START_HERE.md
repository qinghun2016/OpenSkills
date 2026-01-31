# 🚀 OpenSkills 本地启动指南

**推荐**：API 和 Web 由 OpenSkills 插件在 Cursor/VS Code 启动时自动启动；也可用 npm 本地启动。

## 📋 启动前检查

### 1. 安装并启用 OpenSkills 插件

- 在 Cursor/VS Code 中安装 OpenSkills 扩展
- 打开一个已初始化 OpenSkills 的工作区（或运行命令 **OpenSkills: Initialize**）

### 2. 插件内嵌启动

插件激活后会自动启动内嵌 API 与 Web 服务（若设置中「自动启动服务」已开启）：

- 🔌 API 默认端口: **3847**（可在设置 `openskills.apiPort` 修改）
- 🌐 Web 默认端口: **3848**（可在设置 `openskills.webPort` 修改）

访问 Web：运行命令 **OpenSkills: Open Web UI**，或浏览器打开 http://localhost:3848。若默认端口被占用，插件会自动换端口并在输出/提示中说明。

## 🎯 方式一：插件启动（推荐，日常使用）

无需额外操作，打开工作区后插件会自动启动 API 与 Web。

## 🎯 方式二：npm 本地启动（开发调试用）

在项目根目录打开终端：

```bash
# 安装依赖（首次运行）
npm install

# 启动 API + Web 开发服务器
npm run dev
```

- 🔌 API 端口由环境变量 `PORT` 决定（未设置时见 `packages/api/src/index.ts` 默认值），例如 `http://localhost:<PORT>`
- 🌐 Web 端口由环境变量 `VITE_PORT` 决定（未设置时默认 3848），例如 `http://localhost:<WEB_PORT>`

## 📦 安装 VS Code 扩展

### 方法 1: 开发模式测试（推荐）

1. 在 VS Code 中打开 OpenSkills 项目
2. 按 `F5` 或点击菜单 `Run > Start Debugging`
3. 会打开一个新的 VS Code 窗口（扩展开发主机）
4. 在新窗口中测试扩展功能

### 方法 2: 本地安装

1. 打开终端，进入扩展目录：
   ```bash
   cd packages/extension
   ```

2. 打包扩展：
   ```bash
   npm install -g @vscode/vsce
   vsce package
   ```

3. 安装生成的 `.vsix` 文件：
   - 在 VS Code 中按 `Ctrl+Shift+P`
   - 输入 "Extensions: Install from VSIX"
   - 选择生成的 `openskills-0.1.0.vsix` 文件

## 🔍 验证服务启动

### 检查 API 服务

在浏览器访问或使用 curl（将 `<API_PORT>` 替换为实际 API 端口，由 `PORT` 环境变量或扩展配置决定）：

```bash
# 健康检查
curl http://localhost:<API_PORT>/health

# API 端点列表
curl http://localhost:<API_PORT>/api
```

预期响应：
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "...",
  "version": "0.1.0",
  "uptime": 123.45
}
```

### 检查 Web 界面

浏览器访问实际 Web 地址（端口由 `VITE_PORT` 或扩展配置决定，默认 3848），例如 `http://localhost:<WEB_PORT>`。

应该看到 OpenSkills 的 Web 管理界面。

## 🎨 使用 VS Code 扩展

启动扩展后，你会在 VS Code 左侧看到：

### OpenSkills 视图

- **OpenSkills** - Skills 列表
- **Proposals** - 提议列表

### 可用命令

按 `Ctrl+Shift+P` 打开命令面板，输入 "OpenSkills"：

- `OpenSkills: Initialize` - 初始化项目
- `OpenSkills: Open Panel` - 打开管理面板
- `OpenSkills: Open Web UI` - 在浏览器打开 Web 界面
- `OpenSkills: Refresh` - 刷新列表
- `OpenSkills: Approve Proposal` - 批准提议
- `OpenSkills: Reject Proposal` - 拒绝提议
- `OpenSkills: Trigger Wake` - 手动触发唤醒

## 🎪 快速体验流程

### 1. 启动服务

```bash
npm run dev
```

### 2. 访问 Web 界面

浏览器打开实际 Web 地址（端口由 `VITE_PORT` 决定，默认 3848），例如 `http://localhost:<WEB_PORT>`。

### 3. 创建测试提议

在 Web 界面点击 "Create Proposal"，填写：

- **Skill Name**: `test-skill`
- **Scope**: `project`
- **Reason**: 测试 OpenSkills 功能
- **Diff**: 
  ```diff
  --- a/SKILL.md
  +++ b/SKILL.md
  @@ -1,0 +1,3 @@
  +# Test Skill
  +
  +这是一个测试技能。
  ```

点击 "Submit" 创建提议。

### 4. 在 VS Code 扩展中查看

1. 按 `F5` 启动扩展开发模式
2. 在新窗口的侧边栏查看 "Proposals"
3. 点击提议查看详情
4. 使用 ✓ 批准或 ✗ 拒绝

### 5. 查看已应用记录

在 Web 界面 **Proposals** 页使用「已批准」筛选查看已应用记录。

## 🐛 故障排查

### 端口被占用

**问题**: API 或 Web 端口已被占用

**解决方案**:
```bash
# 查找占用端口的进程（Windows）
netstat -ano | findstr :<API_PORT>
netstat -ano | findstr :<WEB_PORT>

# 修改 API 端口：设置环境变量 PORT=<新端口> 再运行 npm run dev:api；Web 端口可通过环境变量 VITE_PORT 修改
```

### 扩展无法连接 API

**问题**: 扩展显示 "无法连接到服务器"

**解决方案**:
1. 确认 API 服务正在运行：使用实际 API 地址，例如 `curl http://localhost:<API_PORT>/health`（端口见扩展配置或 `PORT` 环境变量）
2. 检查 VS Code 设置中的 `openskills.apiUrl` 配置
3. 在设置中修改为实际的 API 地址

### 热重载不工作

**问题**: 修改代码后没有自动刷新

**解决方案**: 使用 `npm run dev` 时 Vite 会热更新；若无效可重启 `npm run dev`。

## 📖 下一步

- 📘 查看完整文档: [README.md](./README.md)
- 🚀 部署指南: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)
- 🎓 快速入门: [docs/QUICK_START.md](./docs/QUICK_START.md)

## 💡 提示

### VS Code 调试技巧

1. 在 `packages/extension/src/extension.ts` 中设置断点
2. 按 `F5` 启动调试
3. 在扩展开发主机窗口中触发命令
4. 断点会在原 VS Code 窗口中暂停

### 查看与重启

- 使用 `npm run dev` 时，API 与 Web 日志在同一终端输出；按 `Ctrl+C` 停止后重新执行 `npm run dev` 即可重启。

## 🎉 开始使用

现在你可以：

1. ✅ 使用插件或 npm 启动开发环境
2. ✅ 在 Web 界面创建和管理提议
3. ✅ 使用 VS Code 扩展快速操作
4. ✅ 查看实时日志和调试

祝你使用愉快！遇到问题请查看 [故障排查文档](./README.md#故障排查)。
