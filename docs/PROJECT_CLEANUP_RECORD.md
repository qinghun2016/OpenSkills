# 项目整理记录

**整理日期**: 2026-01-31  
**目的**: 清理过期文档、与实现不符的文档、根目录重复文件，使项目更干净整洁。

---

## 一、已执行的整理项

### 1. 根目录重复文档 → 删除（以 docs/ 为唯一来源）

| 根目录文件 | 处理 | 说明 |
|------------|------|------|
| `WORK_HANDOVER.md` | 内容已合并到 `docs/handover/交接文档-20260124-工作交接.md`，索引已更新，根文件已删 | 完整 BUG 列表与配置交接保留在 docs |
| `交接文档.md` | 完整内容已写入 `docs/handover/交接文档.md`（覆盖原 stub），根文件已删 | 以 docs 为唯一版本 |
| `交接文档-20260125.md` | 已删 | 与 `docs/handover/交接文档-20260125.md` 重复 |
| `已有Skills更新检查报告-20260126.md` | 已删 | 与 `docs/reports/` 下同名文件重复 |
| `重复性检查报告-20260126.md` | 已删 | 与 `docs/reports/` 下同名文件重复 |
| `TROUBLESHOOTING.md` | 已删 | 与 `docs/guides/TROUBLESHOOTING.md` 内容一致，引用已改为 docs 路径 |

### 2. 文档内容与实现不符 → 已修正

| 文档 | 问题 | 修正 |
|------|------|------|
| `README.md` | 写「在 Web 界面的 History 页面筛选」历史记录 | History 页已下线，改为「可通过 API `GET /api/history` 或在 Proposals 页使用「已批准」筛选查看」 |
| `START_HERE.md` | 「查看历史记录 - 在 Web 界面点击 History」 | 改为「在 Proposals 页使用「已批准」筛选查看已应用记录」 |

### 3. 保留的文档（非过期、仍有效）

- `docs/HISTORY_PAGE_REMOVAL_AND_STATUS_ROLLBACK.md` — History 页下线与状态/回滚说明，作为历史记录保留
- `docs/ARCHITECTURE_FIX.md` — 架构修复说明，仍被 README/QUICK_REFERENCE 引用
- `docs/audit/`、`docs/technical/`、`docs/guides/` 等 — 按需保留，未发现与实现冲突

---

## 二、未删除但已记录的项目（第一轮）

- **RESTART_DOCKER.md**：已在第二轮删除（Docker 已移除）。
- **scripts/init-project.ts**：独立 CLI 初始化脚本（`npx ts-node scripts/init-project.ts`），扩展使用 `packages/extension` 内自带的 init 逻辑，未调用此脚本。保留作为无插件场景的备用方式。
- **scripts/post-proposal.json**：示例 proposal 请求体，用于测试或参考，保留。

---

## 三、整理后根目录文档清单（预期）

- `README.md` — 项目主文档（已修正 History 表述）
- `START_HERE.md` — 本地启动指南（已修正 History 表述）
- `CHANGELOG.md`、`CONTRIBUTING.md` — 常规项目文档
- `TROUBLESHOOTING.md` — **已删除**，请使用 `docs/guides/TROUBLESHOOTING.md`
- `docs/` — 所有详细文档、交接、报告、指南统一在此

---

## 四、不确定项

详见 **`docs/UNCERTAIN_ITEMS.md`**，供后续人工确认。

---

## 五、第二轮整理（根目录与 Docker/K8s，2026-01-31）

### 5.1 已删除 — Docker / K8s 相关

| 项 | 说明 |
|----|------|
| `docker/` 目录 | Dockerfile.api、Dockerfile.dev.api、Dockerfile.dev.web、Dockerfile.web、nginx.conf 已删 |
| `docker-compose.yml`、`docker-compose.dev.yml` | 已删 |
| `.dockerignore` | 已删 |
| `RESTART_DOCKER.md` | 已删（Docker 不再使用） |
| `k8s/` 目录 | configmap、deployment、ingress、namespace、pvc、README 已删；空目录 `docker/`、`k8s/` 若仍存在可本地手动删除 |

### 5.2 已删除 — 根目录过时脚本与批处理

| 项 | 说明 |
|----|------|
| `快速启动.bat` | Docker + npm 菜单，已删 |
| `重启服务.bat` | npm 重启脚本，已删 |
| `restart.ps1` | PowerShell 重启（硬编码路径），已删 |
| `install-agent-cli.bat`、`install-agent-cli.ps1` | Agent CLI 安装脚本，安装说明见文档，已删 |
| `install-extension.ps1` | 扩展手动安装脚本，推荐 F5 开发模式，已删 |

### 5.3 已更新 — CI/CD、Makefile、README、START_HERE

- **`.github/workflows/ci.yml`**：移除 Docker 镜像构建 job。
- **`.github/workflows/deploy.yml`**：部署包不再包含 docker/、docker-compose.yml；服务器步骤改为 npm ci 等。
- **`Makefile`**：移除 docker-build、docker-up、docker-down、docker-dev、docker-logs、docker-restart。
- **`README.md`**：环境要求去掉 Docker；部署小节改为 npm 方式；CI/CD 列表去掉 Docker 镜像构建。
- **`START_HERE.md`**：去掉 Docker 方式与故障排查中的 Docker 内容；保留插件 + npm 两种方式。
- **`docs/DEPLOYMENT.md`**、**`docs/CI_CD_GUIDE.md`**：顶部增加说明，Docker/K8s 内容仅作参考。
