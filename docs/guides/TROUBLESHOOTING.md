# 🔧 OpenSkills 故障排查和解决方案

## 当前问题诊断

### 问题 1: 路径配置错误
**症状**: API 日志显示 `Config not found at: F:\code\OpenSkills\packages\api\.openskills\config.json`  
**原因**: API 从 `packages/api` 目录启动，路径解析错误  
**状态**: ✅ 已在代码中修复

### 问题 2: 端口占用
**症状**: `Port 3847/3848 already in use`（插件模式）或 API/Web 端口已被占用（手动模式）  
**原因**: 之前的进程没有完全清理  
**解决**: 需要手动清理所有 Node.js 进程

## 🚀 推荐解决方案：分步启动

不要用 `npm run dev` 同时启动，而是**分别启动**：

### 步骤 1: 清理环境

打开 PowerShell（管理员权限），运行：

```powershell
# 杀掉所有 Node 进程
taskkill /F /IM node.exe /T

# 等待 3 秒
Start-Sleep -Seconds 3

# 验证端口已释放（<API_PORT> 为实际 API 端口；Web 默认 3848，可由 VITE_PORT 修改）
netstat -ano | findstr ":<API_PORT>"
netstat -ano | findstr ":3848"  # Web 默认端口
```

### 步骤 2: 启动 API 服务

打开一个新的终端窗口：

```bash
cd f:\code\OpenSkills
set OPENSKILLS_WORKSPACE=f:\code\OpenSkills
npm run dev:api
```

**等待看到**:
```
╔════════════════════════════════════════╗
║       OpenSkills API Server            ║
╠════════════════════════════════════════╣
║  URL: http://localhost:3847              ║  # 插件模式默认端口
║  API: /api                             ║
╚════════════════════════════════════════╝
```

### 步骤 3: 启动 Web 服务

打开另一个新的终端窗口：

```bash
cd f:\code\OpenSkills
npm run dev:web
```

**等待看到**:
```
VITE v5.4.21  ready in 579 ms

  ➜  Local:   http://localhost:3848/  # 插件模式默认端口
```

### 步骤 4: 访问页面

在浏览器打开：
- http://localhost:3848/proposals  # 插件模式

## ⚡ 快速修复脚本

我创建了一个 PowerShell 脚本来自动修复。运行：

```powershell
# 保存以下内容为 restart.ps1
# 然后运行: powershell -ExecutionPolicy Bypass -File restart.ps1
```

## 🔍 Skills-Admin 创建和唤醒问题

### 问题 1: Skills-Admin 文件已创建但 Cursor 无法识别

**症状**: 
- 文件 `.cursor/skills/skills-admin/SKILL.md` 存在
- 但在 Cursor 聊天中输入「审查建议」时，Agent 无法识别

**原因**: 
- Cursor 在启动时扫描 `.cursor/skills/` 目录
- 创建或修改文件后，需要重新加载窗口才能被识别

**解决方案**:
1. **方法 1（推荐）**: 运行命令 `OpenSkills: Health Check`，如果检测到需要重新加载，会提示你立即重新加载
2. **方法 2**: 手动重新加载窗口
   - 按 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (macOS)
   - 输入 `Developer: Reload Window`
   - 回车执行

### 问题 2: Skills-Admin 文件不存在

**症状**: 
- 状态栏显示错误图标
- 运行诊断时提示 skills-admin 不存在

**解决方案**:
1. **自动创建**: 扩展会在激活时自动创建，如果失败：
   - 运行 `OpenSkills: Initialize` 命令
   - 或运行 `OpenSkills: Health Check` 命令，会提示创建
2. **手动创建**: 运行 `OpenSkills: Auto Fix` 命令，会自动检测并修复

### 问题 3: 唤醒机制不工作

**症状**: 
- 有 pending proposals，但自动唤醒没有触发
- `wake/pending.json` 存在但 Agent 没有启动

**诊断步骤**:
1. 运行 `OpenSkills: Diagnose` 命令，查看完整诊断报告
2. 检查 `wake/pending.json` 文件：
   - 如果 `processed: true`，说明已处理过，不会再次触发
   - 如果 `processed: false` 且有 `pendingCount > 0`，应该触发唤醒
3. 检查 Cursor Agent CLI：
   - 运行 `agent --version` 验证 CLI 是否安装
   - 如果未安装，参考 `QUICK_REFERENCE.md` 中的安装指南

**解决方案**:
1. **手动触发**: 运行 `OpenSkills: Trigger Wake` 命令
2. **检查配置**: 确认 `.openskills/config.json` 中 `wake.enabled` 为 `true`
3. **安装 CLI**: 如果未安装 Cursor Agent CLI，安装后重启 Cursor

### 问题 3.1: 定时唤醒时「只输入不提交」或「挂着无输出」

**症状**:
- 定时器触发后，Agent 聊天输入框中出现了唤醒 prompt 和回车，但 Agent 并未自动开始执行（需手动按 Enter）
- 或使用非交互模式时，终端长时间无输出，看起来像挂着

**原因**: `agent chat` 在 Windows/定时唤醒时可能只填入输入框而不自动提交；`agent -p` 默认 `text` 格式只在结束时输出，执行过程中无显示。

**解决方案**:
1. **启用非交互模式（推荐）**: 设置 `openskills.wakeUsePrintMode` 为 `true`（默认已开启）
   - 使用 `agent -p -f --output-format stream-json`，终端会实时输出 NDJSON 进度（tool_call、assistant 等）
   - 打开「OpenSkills Wake」终端即可看到执行过程
2. **或使用 agent chat + 手动提交**: 将 `wakeUsePrintMode` 设为 `false`，触发后若内容已填入聊天框，手动按 Enter 提交

### 问题 4: 时间戳判断错误导致重复触发

**症状**: 
- 唤醒被重复触发
- `wake/pending.json` 的 `processed` 标记未正确设置

**原因**: 
- 旧版本使用时间戳判断，扩展重启后时间戳重置导致误判

**解决方案**:
- ✅ 已修复：新版本优先使用 `processed` 标记判断
- 如果仍有问题，运行 `OpenSkills: Auto Fix` 清理损坏的 `pending.json`

### 问题 5: Agent CLI 检测失败

**症状**: 
- 触发唤醒时提示 "未检测到 Cursor Agent CLI"
- 即使已安装 CLI，扩展仍无法检测到

**诊断**:
1. 运行 `OpenSkills: Diagnose` 查看 Agent CLI 状态
2. 手动验证：在终端运行 `agent --version`

**解决方案**:
1. **检查 PATH**: 确保 `~/.local/bin` (Linux/macOS) 或相应路径在 PATH 中
2. **重启 Cursor**: 安装 CLI 后需要重启 Cursor 或重新加载窗口
3. **Windows 特殊处理**: 
   - 推荐使用 WSL
   - 或在 Git Bash 中安装
   - 确保 PATH 配置正确

## 🛠️ 诊断和修复命令

### 健康检查
```bash
# 在命令面板中运行
OpenSkills: Health Check
```
- 检查 skills-admin 文件是否存在
- 检查文件内容是否完整
- 检查是否需要重新加载窗口

### 系统诊断
```bash
# 在命令面板中运行
OpenSkills: Diagnose
```
- 全面检查所有组件状态
- 生成诊断报告
- 提供修复建议

### 自动修复
```bash
# 在命令面板中运行
OpenSkills: Auto Fix
```
- 自动检测常见问题
- 一键修复可修复的问题
- 提示需要手动修复的问题

## 🐛 按 F5 调试扩展：Extension host did not start in 10 seconds

**症状**: 按 F5 启动「运行扩展」后，新窗口顶部出现提示：  
`Extension host did not start in 10 seconds, it might be stopped on the first line and needs a debugger to continue.`

**原因**: 扩展宿主进程已启动，但可能在**第一行被断点暂停**，等待调试器执行「继续」；或调试器尚未完成附加。VS Code/Cursor 内建 10 秒超时，超时后会显示该提示。

**按顺序尝试**:

1. **在「原窗口」按继续（最常见）**  
   - 在**你按 F5 的那个 Cursor 窗口**（不是新弹出的扩展开发主机窗口）  
   - 打开 **运行和调试** 视图（`Ctrl+Shift+D`）  
   - 点击工具栏上的 **继续**（▶️ 或按 **F5**）  
   - 扩展宿主可能正停在第 1 行，继续后新窗口中的扩展会正常加载  

2. **取消首行断点**  
   - 检查 `packages/extension/src/extension.ts` 或编译后的 `packages/extension/out/extension.js` 是否在**第一行**有断点（红点）  
   - 若有，点击该断点取消  

3. **再次按 F5 重新启动**  
   - 关闭弹出的「扩展开发主机」窗口  
   - 在原窗口再次按 F5 启动调试，有时第二次即可正常  

4. **确保编译够快**  
   - 启动前会执行 `preLaunchTask` 编译扩展  
   - 若编译很慢，可先在终端执行 `cd packages/extension && npm run compile`，再按 F5，减少等待  

**说明**: 10 秒超时为编辑器内置，无法在 `launch.json` 里修改。多数情况是扩展宿主已启动但被断点停住，在原窗口按「继续」即可。

---

## 📝 常见错误信息

### "未检测到工作区"
- **原因**: 未打开包含 `.openskills` 的项目文件夹
- **解决**: 打开项目根目录（包含 `.openskills` 的目录）

### "配置文件损坏"
- **原因**: `.openskills/config.json` 格式错误
- **解决**: 运行 `OpenSkills: Auto Fix` 或 `OpenSkills: Initialize`

### "无法读取 wake/pending.json"
- **原因**: 文件格式错误或损坏
- **解决**: 运行 `OpenSkills: Auto Fix` 清理损坏的文件

### "Cursor Agent CLI 不可用"
- **原因**: CLI 未安装或不在 PATH 中
- **解决**: 参考 `QUICK_REFERENCE.md` 安装 CLI

### 终端出现「Signing in」、要求点击链接登录
- **原因**: Cursor CLI 与编辑器使用**独立登录**，首次使用「触发唤醒」时需单独完成一次 CLI 登录
- **解决**: 点击终端中显示的链接在浏览器中完成登录（仅需一次）。详见 **[用户操作手册 - Cursor CLI 登录](用户操作手册.md#二cursor-cli-登录必读)**

### CLI 命令执行失败、权限错误、下载/解压失败
- **原因**: 可能是 PATH 不一致、杀毒拦截、目录权限、缺少依赖（如 ripgrep）等
- **解决**: 详见 **[用户操作手册 - CLI 可能没有某些命令执行权限的问题](用户操作手册.md#三cli-可能没有某些命令执行权限的问题)**，并运行 `OpenSkills: Diagnose` 查看诊断
