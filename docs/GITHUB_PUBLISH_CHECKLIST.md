# GitHub 发布前检查清单

本文档汇总了将 OpenSkills 项目发布到 GitHub 前需要处理的事项。

---

## 一、敏感信息（必须处理）

### 1. GitHub Token 泄露 — 紧急

**位置：**
- `.openskills/config.json` — 第 17 行包含真实 `githubToken`
- `.openskills/crawled/runs/archived/2026-01-31.json` — 多处包含同一 token

**处理：**
1. **立即撤销** 泄露的 GitHub Token：访问 https://github.com/settings/tokens 撤销该 token
2. 新建 token 后仅通过环境变量 `GITHUB_TOKEN` 或本地 `.env` 使用，**不要** 写入 config.json
3. 确保 `.openskills/config.json` 被 `.gitignore` 排除，或提供 `config.json.example` 模板

### 2. 个人/团队信息

**位置：**
- `docs/guides/GITHUB_TOKEN_SETUP.md` 第 17 行：`用户名：RoyLuo1991` — 建议改为占位符

---

## 二、需要加入 .gitignore 的目录/文件

**项目当前没有根目录 `.gitignore`**，需要新建。建议忽略：

```
# Dependencies
node_modules/

# Build output
dist/
out/
packages/api/dist/
packages/web/dist/
packages/extension/out/
*.vsix
.vsix-pack/

# OpenSkills runtime data (含敏感配置与 token)
.openskills/config.json
.openskills/crawled/
.openskills/rewards/
.openskills/wake/
.openskills/history/
.openskills/merge/
.openskills/preferences-history/
.openskills/proposals/active/
.openskills/proposals/archived/
.openskills/decisions/
.openskills/preferences.json

# Environment & secrets
.env
.env.local
.env.*.local

# Temp files
tmp_*.json
tmp_*.diff
*.tmp
.openskills/tmp_*.json
.openskills/skill-proposer-report.md

# Logs & debug
*.log
.cursor/debug.log

# Editor
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Kuboard (可选：若为独立部署工具)
# kuboard-v4/
```

**说明：**
- `.openskills/schemas/` 建议**保留**（为项目结构所需）
- `.openskills/decisions/archived/` 若含业务决策记录，可考虑忽略

---

## 三、本地调试/环境绑定

### 1. Debug 遥测代码 — 需移除或条件化

**位置：** `packages/web/src/api/index.ts` 第 125、129 行

```typescript
fetch('http://127.0.0.1:7242/ingest/3b8ce49b-df8e-4d7e-9a9d-6bcf5663853e', ...)
```

- 向本地 7242 端口发送 proposal 等数据
- 属于调试/observability 逻辑，发布前应：
  - **移除** 该段代码，或
  - 用 `import.meta.env.DEV` / 环境变量包裹，仅开发时启用

### 2. localhost 与端口

- 代码中的 `localhost`、`127.0.0.1`、`3847`、`3000`、`3848` 为正常开发配置
- 通过环境变量（`PORT`、`VITE_API_URL`、`OPENSKILLS_API_URL` 等）覆盖，无需修改
- `.env.example` 已提供模板，可保留

### 3. .cursor/debug.log

- 含本地路径（如 `f:\code\OpenSkills\...`）及运行日志
- 应加入 `.gitignore`，且不应提交

---

## 四、安全风险

### 1. 已发现

| 类型         | 说明                                           |
|--------------|------------------------------------------------|
| Token 泄露   | config.json 和 crawled runs 中含 GitHub token  |
| Debug 外发   | api/index.ts 向 7242 端口发送 proposal 数据    |

### 2. kuboard-v4 配置

- `kuboard-v4/docker-compose.yaml` 中含数据库密码 `kuboardpwd`
- 为通用示例密码，若仅作示例可保留；若用于生产，应改为占位符 + 文档说明

---

## 五、不需要上传的文档

建议**不提交**或移至私有维基：

| 路径                         | 说明                                   |
|------------------------------|----------------------------------------|
| `docs/handover/`             | 内部交接文档，含团队/流程细节          |
| `docs/cr-remediation-tmp/`   | Code Review 临时修复备份               |
| `docs/backups/`              | 备份文件                               |
| `docs/reports/`              | 内部检查报告                           |
| `docs/audit/`                | 审计相关，视是否对外公开决定           |
| `docs/PROJECT_CLEANUP_RECORD.md` | 项目清理记录，可选                    |
| `docs/cr-remediation-log.md` | CR 修复日志，内部用                    |
| `docs/UNCERTAIN_ITEMS.md`    | 未决事项，内部用                       |
| `docs/verification-checklist.md` | 验证清单，内部用                   |

建议**保留**的文档：
- `README.md`、`CONTRIBUTING.md`、`CHANGELOG.md`
- `docs/QUICK_START.md`、`docs/DEPLOYMENT.md`
- `docs/guides/` 中的用户指南（去掉个人信息后）
- `docs/technical/` 中的技术设计文档（视开源范围决定）
- `docs/CI_CD_GUIDE.md`、`docs/CI_CD_SETUP_SUMMARY.md`

---

## 六、可能不需要的目录/文件

| 路径                  | 说明                                      |
|-----------------------|-------------------------------------------|
| `kuboard-v4/`         | 与 OpenSkills 无直接关系，可考虑移除      |
| `scripts/post-proposal.json` | 测试用模板，可保留或移至 `scripts/examples/` |
| `tmp_proposal_*.json` | 临时文件，应删除并加入 .gitignore         |
| `tmp-agent-startup.diff` | 临时 diff，应删除                       |

---

## 七、发布前执行顺序建议

1. 撤销泄露的 GitHub Token
2. 新建根目录 `.gitignore`，按上文配置
3. 从 `config.json` 中移除 `githubToken`，或确保 config.json 被忽略
4. 移除或条件化 `packages/web/src/api/index.ts` 中的 7242 遥测代码
5. 删除 `tmp_*.json`、`tmp-agent-startup.diff`、`.cursor/debug.log`
6. 清理不需要的文档（或移至 `.github/private/` 等）
7. 将 `docs/guides/GITHUB_TOKEN_SETUP.md` 中的 `RoyLuo1991` 改为占位符
8. 初始化 git：`git init`
9. 运行 `git add .` 后检查 `git status`，确认无敏感文件
10. 首次提交并推送

---

## 八、config.json 模板建议

若需保留配置结构供他人参考，可提供 `config.json.example`：

```json
{
  "adminMode": "agent_only",
  "crawl": {
    "enabled": true,
    "schedule": "0 2 * * *",
    "minStars": 100,
    "topics": ["cursor-skills", "skill"],
    "githubToken": ""
  }
}
```

并说明：`githubToken` 通过环境变量 `GITHUB_TOKEN` 或本地 `.env` 注入，不要写入配置文件。
