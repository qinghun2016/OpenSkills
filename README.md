# OpenSkills

<p align="center">
  <img src="icon.svg" alt="OpenSkills" width="80"/>
</p>

AI Skills 自进化管理工具 - 让 AI Agent 能够自主提议、审查和应用技能改进。

> **平台说明**：当前版本仅针对 **Windows 上的 Cursor** 做了开发和适配，macOS / Linux / VS Code 等其他场景未做完整测试与适配，使用可能存在兼容性问题。

## 功能概述

### 自进化机制

```
提议 → 管理员审查 → 人类终审（可选） → 应用
```

- **提议者**：Agent / Human / Crawler，提交改进提议
- **管理员**：Agent 或人类，审查并决策提议
- **人类终审**：可选，根据 `adminMode` 配置决定是否介入

### 主要功能

- **Proposals 管理**：创建、查看、审批或拒绝技能改进提议
- **可视化管理**：现代化 Web 界面，支持暗色/亮色主题
- **GitHub 爬取**：自动发现优质开源 Skills 并生成提议
- **自动唤醒**：定时提醒审查 pending proposals
- **交接机制**：上下文超限时自动压缩并交接
- **Diff 预览与应用**：直观查看改动，一键应用或回滚
- **历史记录**：完整的变更历史，支持回滚

## 快速开始

### 环境要求

- **平台**：当前版本仅针对 **Windows + Cursor** 开发与适配；其他平台（macOS、Linux、VS Code）未做完整测试
- **Cursor**（推荐，VS Code 未完整适配）
- Node.js >= 18.0.0
- npm >= 9.0.0

### 方式一：插件启动（推荐，日常使用）

**API 和 Web 由 OpenSkills 插件在 Cursor/VS Code 启动时自动启动，不再需要单独运行 Docker 或 npm run dev。**

1. **安装并启用插件**：
   - 克隆项目：`git clone https://github.com/your-org/openskills.git`
   - 进入 `packages/extension`，运行 `npm install && npm run compile`
   - 按 F5 启动扩展开发模式，或打包安装到 Cursor
   - **打包后自动更新到本机**：在仓库根目录执行 `npm run pack:install`（或 `cd packages/extension && npm run package:install`），会先打包再自动安装到 Cursor/VS Code，重载窗口即可用新版本

2. **自动启动服务**：
   - 打开已初始化 OpenSkills 的工作区（或运行命令 **OpenSkills: Initialize**）
   - 插件激活后会自动启动内嵌 API 与 Web 服务
   - 默认端口：API **3847**、Web **3848**（可在设置中修改 `openskills.apiPort` / `openskills.webPort`）

3. **访问 Web 界面**：
   - 运行命令 **OpenSkills: Open Web UI**
   - 或浏览器打开 http://localhost:3848

若默认端口被占用，插件会自动换端口并提示。

卸载时扩展会关闭 Webview、内嵌服务与进程并释放目录，通常无需额外操作。若卸载后该扩展目录仍存在或删除时提示被占用，请**完全退出 Cursor（关闭所有窗口）**后再手动删除 `C:\Users\<用户名>\.cursor\extensions\openskills.openskills-0.1.0`。

📖 **详细指南**: [快速入门文档](./docs/QUICK_START.md)

### 方式二：开发调试模式（可选）

如需开发调试 API/Web 本身（非插件），可手动启动：

```bash
# 克隆项目
git clone https://github.com/your-org/openskills.git
cd openskills && npm install

# 启动 API + Web 开发服务器
npm run dev

# 或分别启动
npm run dev:api  # API 端口由环境变量 PORT 决定（见 packages/api）
npm run dev:web  # Web 端口由 VITE_PORT 决定，默认 3848
```

注意：此模式 API 端口由 `PORT` 决定，Web 端口由 `VITE_PORT` 决定（默认 3848）；与插件模式的 3847/3848 一致。工作区根目录优先使用环境变量 `WORKSPACE_ROOT`，未设置时使用 `OPENSKILLS_WORKSPACE` 或从当前工作目录推断（见 packages/api）。

### 安装 Cursor Agent CLI（可选，用于触发唤醒功能）

**触发唤醒**功能需要 Cursor Agent CLI 来真正启动 Cursor Agent。安装 Cursor 编辑器 ≠ 有 `agent` 命令，CLI 需单独安装。

#### macOS / Linux / Windows (WSL)

```bash
# 安装 Cursor Agent CLI
curl https://cursor.com/install -fsSL | bash

# 将 ~/.local/bin 加入 PATH（如果尚未加入）
export PATH="$HOME/.local/bin:$PATH"

# 验证安装
agent --version
```

#### Windows 本机（无 WSL）

**推荐方式：使用 WSL**

1. 安装 WSL：`wsl --install`
2. 在 WSL 中执行上述安装命令

**备选方式：Git Bash**

在 Git Bash 中执行安装命令，并将 `~/.local/bin` 加入 PATH。

**详细说明**：参考 [Cursor CLI 官方文档](https://cursor.com/docs/cli/installation) 或 `QUICK_REFERENCE.md` 中的安装步骤。

> **注意**：未安装 CLI 时，扩展的「触发唤醒」功能会提示安装或改用手动在聊天输入「审查建议」。详见 `docs/ARCHITECTURE_FIX.md`。

## 项目结构

```
openskills/
├── .openskills/                # OpenSkills 配置与数据
│   ├── config.json            # 系统配置
│   ├── proposals/             # 待审查提议
│   ├── decisions/             # 审查决策记录
│   ├── history/               # 变更历史
│   └── schemas/               # JSON Schema 格式规范
├── .cursor/
│   └── skills/                # 项目级 Skills
│       ├── open-skills-bootstrap/  # 自进化机制说明
│       └── skills-admin/      # 管理员 Skill
├── packages/
│   ├── api/                   # REST API 服务
│   │   └── src/
│   │       ├── routes/        # API 路由
│   │       ├── services/      # 业务逻辑
│   │       ├── crawler/       # GitHub 爬虫
│   │       ├── scheduler/     # 定时任务调度
│   │       └── types/         # 类型定义
│   ├── web/                   # Web 前端 (React + Vite)
│   │   └── src/
│   │       ├── components/    # UI 组件
│   │       ├── pages/         # 页面
│   │       ├── hooks/         # React Hooks
│   │       └── api/           # API 客户端
│   └── extension/             # VS Code 扩展
│       └── src/
│           ├── commands/      # 命令实现
│           ├── providers/     # TreeView 提供者
│           └── webview/       # Webview 面板
├── scripts/                   # 工具脚本
│   ├── init-project.ts        # 项目初始化
│   └── verify-flow.ts         # 端到端验证
├── docs/                      # 文档
└── package.json               # Monorepo 根配置
```

## 配置说明

配置文件位于 `.openskills/config.json`：

```json
{
  "adminMode": "agent_then_human",
  "skillsAdminSkillRef": "skills-admin",
  "proposalValidity": {
    "retentionDays": 90
  },
  "crawl": {
    "enabled": true,
    "schedule": "0 */4 * * *",
    "minStars": 100,
    "topics": ["cursor-skills"],
    "githubToken": ""
  },
  "wake": {
    "enabled": true,
    "schedule": "0 */4 * * *",
    "reminderPrompt": "检查 pending proposals 并继续审查"
  },
  "handoff": {
    "maxContextTokens": 50000,
    "compressWhenAbove": 40000
  }
}
```

### 字段说明

| 字段 | 说明 |
|------|------|
| `adminMode` | 审查模式：`human_only`（仅人类） / `agent_only`（仅 Agent，自动应用） / `agent_then_human`（Agent 初审 + 人类终审） |
| `skillsAdminSkillRef` | 管理员 Skill 引用名称 |
| `proposalValidity.retentionDays` | Proposal 保留天数 |

**注意**：在 `agent_only` 模式下，Agent 批准提议后会自动通过 API 应用修改，无需用户确认。这避免了 Agent 直接编辑文件时被 Cursor 要求用户确认的问题。
| `crawl.enabled` | 是否启用自动爬取 |
| `crawl.schedule` | 爬取定时任务 (Cron 表达式) |
| `crawl.minStars` | 最低 Star 数过滤 |
| `crawl.topics` | 搜索主题列表 |
| `crawl.githubToken` | GitHub API Token |
| `wake.enabled` | 是否启用自动唤醒 |
| `wake.schedule` | 唤醒定时任务 (Cron 表达式) |
| `wake.reminderPrompt` | 唤醒提示信息 |
| `handoff.maxContextTokens` | 最大上下文 Token 数 |
| `handoff.compressWhenAbove` | 触发压缩的 Token 阈值 |

### 扩展配置

在 **VS Code/Cursor 的设置**（`Ctrl+,` → 搜索 "OpenSkills"）中配置，**不在** `.openskills/config.json`：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `openskills.useAgentCliForSkills` | boolean | `true` | 是否使用 Cursor Agent CLI 创建和管理 skills。如果禁用或 Agent CLI 不可用，将使用直接创建方式。 |
| `openskills.wakeUseAgentCli` | boolean | `true` | 触发唤醒时用 Cursor Agent CLI 真正启动 Agent；否则仅调 API + 提示手动开聊天 |
| `openskills.wakeAgentPrompt` | string | `""` | 唤醒 Agent 时使用的 prompt；为空则用默认 prompt |

### skills-admin 的创建方式

从 v0.1.0 开始，`skills-admin` 的创建方式已更新：

- **优先方式**：通过 **Cursor Agent CLI** 让 Agent 创建 skills-admin
- **降级方案**：如果 Agent CLI 不可用或配置禁用（`openskills.useAgentCliForSkills = false`），使用直接创建方式（写入预定义内容）

**优势**：
- 符合自进化理念：skills-admin 由 Agent 创建，而非硬编码
- 智能优化：Agent 可以根据项目情况优化 skills-admin 内容
- 灵活降级：即使没有 Agent CLI，也能正常工作

**创建流程**：
1. 检查配置 `openskills.useAgentCliForSkills`
2. 如果启用，检查 Agent CLI 是否可用
3. 通过 Agent CLI 创建（如果可用），否则降级到直接创建
4. 验证文件是否创建成功

详见 `docs/ARCHITECTURE_FIX.md` 中的详细说明。

## API 端点

### Proposals

- `GET /api/proposals` - 列出提议
- `GET /api/proposals/:id` - 获取单个提议
- `POST /api/proposals` - 创建提议
- `PATCH /api/proposals/:id` - 更新提议状态
- `DELETE /api/proposals/:id` - 删除提议

### Decisions

- `GET /api/decisions` - 列出决策
- `GET /api/decisions/:proposalId` - 获取决策
- `POST /api/decisions` - 创建决策
- `POST /api/decisions/:proposalId/apply` - 应用批准的决策
- `GET /api/decisions/:proposalId/validate` - 验证 Diff 是否可应用
- `GET /api/decisions/:proposalId/preview` - 预览应用结果

### History

- `GET /api/history` - 列出历史记录
- `GET /api/history/:id` - 获取历史条目
- `POST /api/history/:id/rollback` - 回滚到指定版本
- `GET /api/history/:id/can-rollback` - 检查是否可回滚

### Crawler

- `GET /api/crawler/status` - 获取爬虫状态
- `POST /api/crawler/trigger` - 手动触发爬取
- `GET /api/crawler/runs` - 列出爬取记录
- `GET /api/crawler/repos` - 列出缓存的仓库

### Scheduler

- `GET /api/scheduler/status` - 获取调度器状态
- `POST /api/scheduler/wake/trigger` - 手动触发唤醒
- `POST /api/scheduler/crawl/trigger` - 手动触发爬取
- `POST /api/scheduler/handoff/trigger` - 手动触发交接

## 开发

### 运行测试

```bash
npm test

# 或使用 Makefile
make test
```

### 构建

```bash
npm run build

# 或使用 Makefile
make build
```

## 部署

**日常使用**：安装 OpenSkills 插件，API 与 Web 随插件启动（端口 3847/3848）。

**生产部署**（无插件环境）：

```bash
npm install && npm run build
# API: node packages/api/dist/index.js
# Web: npx serve packages/web/dist
```

### CI/CD

项目已配置 CI/CD 流程：
- ✅ 自动化测试和代码检查
- ✅ 构建产物上传
- ✅ 安全漏洞扫描
- ✅ 部署工作流（见 `.github/workflows/deploy.yml`）

📖 **详细指南**: 
- [部署文档](./docs/DEPLOYMENT.md)
- [CI/CD 指南](./docs/CI_CD_GUIDE.md)

### 目录权限

- **用户级 Skills**：`~/.cursor/skills/` — 全局生效
- **项目级 Skills**：`<project>/.cursor/skills/` — 仅当前项目生效，覆盖同名用户级 Skill

## 故障排查

详细故障排查（端口占用、环境等）见 [docs/guides/TROUBLESHOOTING.md](./docs/guides/TROUBLESHOOTING.md)。

### 常见错误及解决方案

#### 错误: "Proposal not found"
**原因**: 提供的 Proposal ID 不存在或已被删除  
**解决方案**:
- 使用 `GET /api/proposals` 列出所有可用的 proposals
- 检查 ID 是否正确（应该是 UUID 格式）
- 确认 proposal 文件存在于 `.openskills/proposals/` 目录

#### 错误: "Schema validation failed"
**原因**: 提交的数据不符合 JSON Schema 定义  
**解决方案**:
- 检查必填字段是否完整：`id`, `skillName`, `scope`, `reason`, `diff`, `status`
- 确认 `scope` 值为 `"user"` 或 `"project"`
- 确认 `status` 值为 `"pending"`, `"approved"` 或 `"rejected"`
- 查看 `.openskills/schemas/` 中的 schema 定义

#### 错误: "Failed to apply diff"
**原因**: Diff 格式错误或与目标文件不匹配  
**解决方案**:
- 验证 diff 使用 unified diff 格式
- 使用 `GET /api/decisions/:proposalId/validate` 预先验证
- 使用 `GET /api/decisions/:proposalId/preview` 预览应用结果
- 检查目标 SKILL.md 文件是否被手动修改过

#### 错误: "Port 3847 (或 3848) already in use"
**原因**: 插件默认端口被其他进程占用  
**解决方案**:
- 插件会自动换端口并提示，查看 OpenSkills 输出面板获取实际端口
- 或在设置中修改 `openskills.apiPort` / `openskills.webPort`
- 查找占用端口的进程: `lsof -i :3847` (Mac/Linux) 或 `netstat -ano | findstr :3847` (Windows)

#### 错误: "Port already in use"（npm run dev 模式）
**原因**: 手动启动 API/Web 时端口被占用  
**解决方案**:
- 修改 API 端口: `PORT=<新端口> npm run dev:api`（例如 `PORT=3847 npm run dev:api`）
- 或使用插件启动模式（推荐）

#### 错误: "Permission denied" (文件权限错误)
**原因**: 没有足够的权限读写文件  
**解决方案**:
- 确认当前用户对 `.openskills/` 和 `.cursor/skills/` 有读写权限
- 在 Unix 系统上: `chmod -R 755 .openskills .cursor`
- 检查文件是否被其他程序锁定

### 日志与调试

#### 日志位置
- **API 日志**: 控制台输出 (stdout/stderr)
- **请求日志**: 每个 HTTP 请求都会输出 `[timestamp] METHOD /path`
- **错误日志**: 包含完整的错误堆栈信息

#### 启用调试模式
```bash
# Linux/Mac
DEBUG=openskills:* npm run dev

# Windows (PowerShell)
$env:DEBUG="openskills:*"
npm run dev

# 或设置 Node 调试
NODE_OPTIONS="--inspect" npm run dev:api
```

#### 查看详细错误信息
在代码中查看 `packages/api/src/index.ts` 的错误处理中间件

### 常见问题 (FAQ)

**Q: 如何重置系统状态？**  
A: 删除 `.openskills/proposals/`, `.openskills/decisions/`, `.openskills/history/` 目录下的所有 JSON 文件，保留 schemas 和 config.json

**Q: 如何备份数据？**  
A: 复制整个 `.openskills/` 目录即可，所有数据都以 JSON 文件形式存储

**Q: Web 界面无法连接到 API**  
A: 
- **插件模式**：确认插件已激活并启动服务（查看 OpenSkills 输出面板），默认端口 3847/3848
- **手动模式**：确认 API 服务已启动 (`npm run dev:api`)，端口由 `PORT` 环境变量或 API 服务默认值决定
- 检查浏览器控制台的网络请求错误，确认请求的端口与实际 API 端口一致

**Q: 如何查看某个 Skill 的修改历史？**  
A: 使用 `GET /api/history?skillName=<name>` 查询 API，或在 Web 界面的 **Proposals** 页使用「已批准」筛选查看已应用记录（History 页已下线）

**Q: Agent 提议被拒绝后如何重新提交？**  
A: 创建新的 proposal，旧的 proposal 会保留在系统中用于审计

**Q: 如何切换 adminMode？**  
A: 编辑 `.openskills/config.json` 中的 `adminMode` 字段，可选值：`"human_only"`, `"agent_only"`, `"agent_then_human"`

### 获取帮助

如果遇到未列出的问题：
1. 查看 [GitHub Issues](https://github.com/your-org/openskills/issues)
2. 提交新的 Issue 并附上错误日志
3. 查阅完整的 API 文档: 访问 `http://localhost:3847/api`（插件模式）或 `http://localhost:<API_PORT>/api`（手动模式，端口由 `PORT` 或配置决定）

## 审计文档

系统审计报告和修复记录位于 [`docs/audit/`](./docs/audit/) 目录：

- **[审计报告](./docs/audit/AUDIT_REPORT.md)**: 完整的代码审计报告（15个问题）
- **[验收标准](./docs/audit/ACCEPTANCE_CRITERIA.md)**: 详细的验收标准和进度
- **[实施总结](./docs/audit/IMPLEMENTATION_SUMMARY.md)**: 修复实施总结和质量评估

**审计结果**: ✅ 全部问题已修复（15/15），系统评分从 8.5/10 提升至 9.6/10

## License

MIT
