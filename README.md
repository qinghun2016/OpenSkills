# OpenSkills

<p align="center">
  <img src="icon.svg" alt="OpenSkills" width="80"/>
</p>

AI Skills 自进化管理工具 — 让 Agent 自主提议、审查并应用技能改进。

## 功能

- **提议 → 审查 → 应用**：Agent / Human / Crawler 提交提议，skills-admin 审查，一键应用
- **Web 管理**：创建/审批提议、查看 Diff、管理 Skills
- **GitHub 爬取**：自动发现优质 Skills 并生成提议
- **定时唤醒**：定期提醒 Agent 审查 pending proposals
- **Diff 预览**：直观查看改动，支持应用与回滚

## 快速开始

### 环境要求

- **Cursor** 或 VS Code
- **Node.js** >= 18
- **Cursor Agent CLI**（必须，用于触发唤醒）

### 1. 安装 Agent CLI

安装 Cursor 编辑器 ≠ 安装 Agent CLI，需单独安装：

```bash
# macOS / Linux / WSL
curl https://cursor.com/install -fsSL | bash
export PATH="$HOME/.local/bin:$PATH"
agent --version
```

Windows 本机推荐使用 WSL，或参考 [Cursor CLI 文档](https://cursor.com/docs/cli/installation)。

### 2. 安装 OpenSkills

```bash
git clone https://github.com/qinghun2016/OpenSkills.git
cd OpenSkills && npm install
```

**开发模式**：在 Cursor 中打开项目，按 **F5** 启动扩展。

**打包安装**：
```bash
npm run pack:install
```
重载 Cursor 窗口后生效。

### 3. 初始化

运行命令 **OpenSkills: Initialize**，创建 `.openskills/` 配置与 skills-admin。

### 4. 使用

- **OpenSkills: Open Web UI** — 打开 Web 界面（http://localhost:3848）
- **OpenSkills: Trigger Wake** — 触发 Agent 审查 pending proposals
- 在 Web 界面创建提议、审批、应用

## 配置

### 首次配置

1. 复制 `.env.example` 为 `.env`，设置 `GITHUB_TOKEN`（爬虫可选）
2. 若未自动生成，复制 `.openskills/config.json.example` 为 `.openskills/config.json`

### 主要配置（`.openskills/config.json`）

| 字段 | 说明 |
|------|------|
| `adminMode` | `human_only` / `agent_only` / `agent_then_human` |
| `wake.enabled` | 是否启用定时唤醒 |
| `crawl.enabled` | 是否启用 GitHub 爬虫 |
| `crawl.githubToken` | 留空，使用 `.env` 中 `GITHUB_TOKEN` |

### 扩展设置（Cursor 设置）

| 配置 | 默认 | 说明 |
|------|------|------|
| `openskills.apiPort` | 3847 | API 端口 |
| `openskills.webPort` | 3848 | Web 端口 |
| `openskills.wakeUseAgentCli` | true | 唤醒时使用 Agent CLI |

## 项目结构

```
openskills/
├── .openskills/           # 配置与数据
│   ├── config.json        # 系统配置（从 config.json.example 复制）
│   ├── proposals/         # 提议
│   ├── decisions/         # 决策记录
│   └── schemas/           # JSON Schema
├── .cursor/skills/        # 项目级 Skills
│   ├── open-skills-bootstrap/
│   └── skills-admin/
├── packages/
│   ├── api/               # REST API
│   ├── web/               # Web 前端
│   └── extension/         # Cursor 扩展
└── docs/                  # 文档
```

## 开发

```bash
npm run dev        # 启动 API + Web
npm run build      # 构建
npm test           # 测试
```

API 默认端口 3000（npm），插件模式 3847；Web 默认 3848。

## 故障排查

- **端口占用**：插件自动换端口，或修改扩展设置中的端口
- **Trigger Wake 无反应**：确认已安装 Agent CLI（`agent --version`），重启 Cursor
- **CLI 首次使用**：终端会显示登录链接，点击完成 Cursor 账号登录（与编辑器登录分开）

详见 [docs/guides/TROUBLESHOOTING.md](docs/guides/TROUBLESHOOTING.md)。

## 文档

- [快速入门](docs/QUICK_START.md)
- [部署指南](docs/DEPLOYMENT.md)
- [GitHub Token 配置](docs/guides/GITHUB_TOKEN_SETUP.md)
- [如何唤醒](docs/guides/如何唤醒skills-admin.md)
- [用户操作手册](docs/guides/用户操作手册.md)

## License

MIT
