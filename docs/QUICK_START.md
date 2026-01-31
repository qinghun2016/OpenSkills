# OpenSkills 快速入门

## 前置要求

- **Cursor** 编辑器 或 **VS Code**
- **Node.js** >= 18.0.0
- **Agent CLI 工具**（任选其一）

## 1. 安装 Agent CLI

OpenSkills 支持多种 Agent CLI 工具，根据你的环境选择一种安装：

### 选项 A：Cursor Agent CLI（推荐 Cursor 用户）

```bash
# macOS / Linux / Windows (WSL)
curl https://cursor.com/install -fsSL | bash
export PATH="$HOME/.local/bin:$PATH"
agent --version
```

Windows 本机推荐安装 WSL 后执行，或在 Git Bash 中执行。

### 选项 B：OpenCode CLI（推荐 VS Code + Go 用户）

```bash
# 需要 Go 1.21+
go install github.com/opencode-ai/opencode@latest
opencode --version
```

### 选项 C：Claude Code CLI（推荐 VS Code + Claude 用户）

```bash
# 需要 Node.js 18+
npm install -g @anthropic-ai/claude-code
claude --version
```

## 1.1 配置 CLI 类型

在 VS Code / Cursor 设置中配置使用的 CLI 类型：

```json
{
  "openskills.agentCliType": "cursor"  // 可选: "cursor" | "opencode" | "claude"
}
```

或通过设置界面搜索 `openskills.agentCliType` 进行配置。

## 2. 安装 OpenSkills 插件

### 开发模式（F5 调试）

```bash
git clone https://github.com/qinghun2016/OpenSkills.git
cd OpenSkills && npm install
cd packages/extension && npm run compile
```

在 Cursor 中打开项目，按 **F5** 启动扩展开发模式。

### 打包安装

```bash
cd OpenSkills
npm run pack:install
```

重载 Cursor 窗口后生效。

## 3. 初始化项目

1. 在 Cursor 中打开 OpenSkills 项目（或任意工作区）
2. 运行命令 **OpenSkills: Initialize**
3. 插件自动创建 `.openskills/` 配置与 `skills-admin` Skill

## 4. 首次配置

1. 复制 `.env.example` 为 `.env`，设置 `GITHUB_TOKEN`（爬虫需要，可选）
2. 若使用插件初始化，`.openskills/config.json` 已自动生成；否则复制 `config.json.example` 为 `config.json`

## 5. 开始使用

- **打开 Web**：运行 **OpenSkills: Open Web UI** 或访问 http://localhost:3848
- **创建提议**：Web 界面 → Create Proposal
- **触发唤醒**：运行 **OpenSkills: Trigger Wake**（需已安装 Agent CLI）
- **审查提议**：Proposals 页面 → 批准或拒绝

## 常用命令

| 命令 | 功能 |
|------|------|
| OpenSkills: Initialize | 初始化项目 |
| OpenSkills: Open Web UI | 打开 Web 管理界面 |
| OpenSkills: Trigger Wake | 触发 Agent 审查 pending proposals |
| OpenSkills: Diagnose | 系统诊断 |

## 配置说明

编辑 `.openskills/config.json`：

- `adminMode`：`human_only` / `agent_only` / `agent_then_human`
- `wake.enabled`：是否启用定时唤醒
- `crawl.enabled`：是否启用 GitHub 爬虫
- `crawl.githubToken`：留空，使用 `.env` 中的 `GITHUB_TOKEN`

## 故障排查

- **端口占用**：插件会自动换端口，或修改设置中的 `openskills.apiPort` / `openskills.webPort`
- **CLI 不可用**：运行 **OpenSkills: Diagnose**，确认 `agent --version` 可执行
- **CLI 登录**：首次触发唤醒时，终端会显示登录链接，点击完成 Cursor 账号登录（与编辑器登录分开）

详见 [TROUBLESHOOTING.md](./guides/TROUBLESHOOTING.md)。
