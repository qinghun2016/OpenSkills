# OpenSkills 快速参考

## 🚀 快速启动

```bash
# 1. 启动 Docker 服务
docker-compose -f docker-compose.dev.yml up -d

# 2. 访问 Web 界面
# http://localhost:3848  # 插件模式默认端口

# 3. 启动扩展（可选）
# 按 F5，选择 "运行扩展"
```

## 🔧 常用修复命令

```bash
# 重启 API 服务
docker restart openskills-api-dev

# 重启 Web 服务
docker restart openskills-web-dev

# 查看 API 日志
docker logs openskills-api-dev --tail 50

# 查看 Web 日志
docker logs openskills-web-dev --tail 50
```

## 📋 已修复的 BUG 摘要

| BUG | 文件 | 状态 |
|-----|------|------|
| Vite 代理配置 | `vite.config.ts`, `docker-compose.dev.yml` | ✅ 已修复 |
| Button asChild 冲突 | `Button.tsx` | ✅ 已修复 |
| API 监听地址 | `api/src/index.ts` | ✅ 已修复 |
| 缺少 API 路由 | `api/src/index.ts` | ✅ 已修复 |
| 空指针错误 | `Dashboard.tsx`, `AdminPanel.tsx` | ✅ 已修复 |
| API 数据解析 | `api/index.ts` | ✅ 已修复 |
| triggerWake 路径 | `api/index.ts` | ✅ 已修复 |
| Config 保存失败 | `routes/config.ts`, `routes/preferences.ts` | ✅ 已修复 |
| Crawler 数据格式 | `routes/crawler.ts` | ✅ 已修复 |
| Scheduler 状态 | `scheduler/wakeScheduler.ts`, `scheduler/crawlScheduler.ts` | ✅ 已修复 |

## ⚙️ 关键配置

### Docker 环境变量
- `WORKSPACE_ROOT=/app` (API 服务)
- `VITE_API_URL=http://api:3000` (Web 服务)

### 默认配置
- Wake 调度: `*/5 * * * *` (每5分钟)
- Crawler 调度: `*/10 * * * *` (每10分钟)
- Admin Mode: `agent_only`

## 🎯 测试检查清单

- [ ] Docker 服务运行正常
- [ ] API 健康检查通过 (http://localhost:3847/health)  # 插件模式
- [ ] Web 界面可访问 (http://localhost:3848)  # 插件模式
- [ ] 所有页面正常显示
- [ ] Config 保存功能正常
- [ ] Scheduler 已初始化
- [ ] 扩展：F5 后见 **侧边栏 OpenSkills 图标**（活动栏）与 **左下角状态栏**
- [ ] **触发唤醒**：若已安装 [Cursor Agent CLI](https://cursor.com/docs/cli/overview)，命令会启动 Agent；否则提示手动开聊天或安装 CLI（见 `docs/ARCHITECTURE_FIX.md`）

## 📍 扩展界面在哪（F5 调试后）

- **侧边栏**：点击左侧活动栏的 **OpenSkills** 图标（紫色圆角图标）→ 展开 **Skills** / **Proposals**
- **状态栏**：窗口 **左下角** 显示 `OpenSkills` 或 `X pending`，点击可打开面板
- **输出**：`查看` → `输出` → 选择 **OpenSkills** 可看激活日志与错误

## 🔧 故障排除快速命令

### 诊断命令

| 命令 | 功能 | 何时使用 |
|------|------|----------|
| `OpenSkills: Health Check` | 检查 skills-admin 状态 | 怀疑 skills-admin 无法识别时 |
| `OpenSkills: Diagnose` | 全面系统诊断 | 遇到任何问题时，先运行此命令 |
| `OpenSkills: Auto Fix` | 自动修复常见问题 | 发现配置或文件问题时 |

### 常见问题快速修复

1. **Skills-admin 无法识别**
   - 运行 `OpenSkills: Health Check`
   - 如果提示需要重新加载，选择"立即重新加载窗口"

2. **唤醒机制不工作**
   - 运行 `OpenSkills: Diagnose` 查看详细诊断
   - 检查 Agent CLI 是否安装
   - 手动触发：`OpenSkills: Trigger Wake`

3. **配置文件损坏**
   - 运行 `OpenSkills: Auto Fix`
   - 或运行 `OpenSkills: Initialize` 重新初始化

详细故障排除指南请参考 `TROUBLESHOOTING.md`

## 📖 用户操作手册

完整操作说明（含 **Cursor CLI 登录流程** 与 **CLI 权限/环境问题**）见：**[用户操作手册](用户操作手册.md)**。

- **CLI 登录**：编辑器登录 ≠ CLI 登录，首次使用「触发唤醒」时若终端出现「Signing in」，请**点击终端中的链接**在浏览器中完成 CLI 登录（仅需一次）。
- **CLI 权限**：若出现「找不到 agent」、下载/解压失败、写入权限错误等，请查阅用户操作手册中的「CLI 可能没有某些命令执行权限的问题」一节及 `TROUBLESHOOTING.md`。

---

## 🔌 Cursor Agent CLI 安装

### 为什么需要安装？

**触发唤醒**功能需要 Cursor Agent CLI 来真正启动 Cursor Agent。安装 Cursor 编辑器 ≠ 有 `agent` 命令，CLI 需单独安装。

### 安装步骤

#### macOS / Linux / Windows (WSL)

```bash
# 1. 安装 Cursor Agent CLI
curl https://cursor.com/install -fsSL | bash

# 2. 将 ~/.local/bin 加入 PATH（如果尚未加入）
# 在 ~/.bashrc 或 ~/.zshrc 中添加：
export PATH="$HOME/.local/bin:$PATH"

# 3. 重新加载 shell 配置
source ~/.bashrc  # 或 source ~/.zshrc

# 4. 验证安装
agent --version
```

#### Windows 本机（无 WSL）

**推荐方式：使用 WSL**

1. 安装 WSL（如果尚未安装）：
   ```powershell
   wsl --install
   ```

2. 在 WSL 中执行上述安装命令

**备选方式：Git Bash**

1. 在 Git Bash 中执行：
   ```bash
   curl https://cursor.com/install -fsSL | bash
   ```

2. 将 `~/.local/bin` 加入 PATH（编辑 `~/.bashrc`）

**纯 PowerShell（需参考官方文档）**

- 参考 [Cursor CLI 官方安装说明](https://cursor.com/docs/cli/installation) 获取 Windows 本机安装方法

### 验证安装

```bash
# 检查 agent 命令是否可用
agent --version

# 应该输出类似：agent version x.x.x
```

### CLI 登录（与编辑器登录分开）

- **编辑器已登录 ≠ CLI 已登录**。首次执行「触发唤醒」时，若终端出现「Signing in」和链接，请**点击终端中的链接**在浏览器中完成 CLI 登录，仅需一次。
- 扩展命令 **「OpenSkills: 打开 Cursor CLI 登录页」** 可打开官方 CLI 认证说明；若终端已显示登录链接，请优先点击终端中的链接。
- 详细说明与 **CLI 可能没有某些命令执行权限** 的排查见 **[用户操作手册](用户操作手册.md)**。

### 与 OpenSkills 的关系

- **触发唤醒**会执行 `agent chat "..."` 命令
- 未检测到 CLI 时，扩展会提示安装或改用手动在聊天输入「审查建议」
- 详见 `docs/ARCHITECTURE_FIX.md`

## 🧩 Skills-admin 与「唤醒 Agent」

- **skills-admin** 是 Cursor 的 **Skill**（`.cursor/skills/skills-admin/SKILL.md`），负责审查 proposals、做出决策。
- **唤醒 = 真正启动 Cursor Agent**：扩展的 **「触发唤醒」** 命令会（在启用且已安装 [Cursor Agent CLI](https://cursor.com/docs/cli/overview) 时）在项目目录执行 `agent chat "审查建议，担任 skills-admin..."`，**真正调用 Cursor Agent** 跑 skills-admin，而不是只写文件。
- **如何触发**：
  - **推荐**：侧边栏 / 命令面板 → **OpenSkills: Trigger Wake**。若已安装 Cursor CLI，会启动 Agent；否则仅调 API 记录 + 提示你手动开聊天或安装 CLI。
  - **管理员面板「手动唤醒」**：仅在 **Cursor 扩展面板内**（侧边栏 OpenSkills → 管理员）点击才执行 Trigger Wake 并启动 Agent；**在独立浏览器**中访问 /admin 点击该按钮只会调 API，**不会**启动 Agent。详见 `用户操作手册.md`。
  - **手动**：在 Cursor 聊天里输入 **「审查建议」**、**「review proposals」**、**「担任管理员」** 等，Cursor 加载 skills-admin 后按 SKILL 流程审查。
- **Wake 调度（cron）**：Config 里的 Wake 按 cron 定期检查 pending、写 `wake/pending.json` 与历史；**不**会直接跑 Agent。真正唤醒 Agent 的入口是**扩展的「触发唤醒」**（或你手动开聊天）。详见 `docs/ARCHITECTURE_FIX.md`。

## 📁 重要文件

- `交接文档.md` - 近期变更与待办（架构修复、初始化、Cursor CLI）
- `WORK_HANDOVER.md` - 详细工作交接与历史 BUG
- `docs/ARCHITECTURE_FIX.md` - 唤醒 Agent 架构修复说明
- `.openskills/config.json` - 项目配置
- `docker-compose.dev.yml` - Docker 配置
- `.vscode/launch.json` - 扩展调试配置
