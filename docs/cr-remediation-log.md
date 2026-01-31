# CR 整改执行日志

## 2026-01-31

### 阶段 0
- 创建 `docs/backups/cr-20260131/`、`docs/cr-remediation-tmp/` 目录结构。

### 阶段 1（路由顺序 + loadConfig try/catch）
- **备份**：`docs/backups/cr-20260131/` 下 `packages_api_src_routes_proposals_ts.backup`、`packages_api_src_routes_decisions_ts.backup`、`packages_api_src_routes_crawler_ts.backup`。
- **修改**：
  - `packages/api/src/routes/proposals.ts`：将 `GET /pending/count` 移到 `GET /:id` 之前。
  - `packages/api/src/routes/decisions.ts`：将 `GET /stats/summary` 移到 `GET /:proposalId` 之前。
  - `packages/api/src/routes/crawler.ts`：`loadConfig` 内对 `JSON.parse(fs.readFileSync(...))` 用 try/catch 包裹，失败时返回 null 并打日志。
- **回退**：从上述 `.backup` 复制回 `packages/api/src/routes/` 对应文件名（proposals.ts、decisions.ts、crawler.ts）即可。

### 阶段 2（路径校验 + diff 安全）
- **新增**：`packages/api/src/utils/pathValidation.ts`（sanitizeSkillName、isPathWithinWorkspace）、`packages/api/src/utils/diffSafety.ts`（checkDiffSafety、checkDiffTargetPaths）。
- **修改**：
  - `packages/api/src/utils/fileUtils.ts`：getSkillPath/getSkillDir 内使用 sanitizeSkillName 与 isPathWithinWorkspace 校验。
  - `packages/api/src/services/diffService.ts`：applyDiff 入口调用 checkDiffSafety，并对 project scope 做路径在 workspace 内检查。
  - `packages/api/src/services/proposalService.ts`：quickQualityCheck 改用 checkDiffSafety、checkDiffTargetPaths。
  - `packages/api/src/services/decisionService.ts`：getSkillPath 调用处加 try/catch，返回 400 友好错误。
  - `packages/api/src/index.ts`：GET /api/skills/:scope/:name 对 scope/name 校验，使用 safeName 拼路径，project 下对 skillPath 做 isPathWithinWorkspace 检查。
- **回退**：删除 pathValidation.ts、diffSafety.ts；从备份恢复 fileUtils.ts、diffService.ts、proposalService.ts、decisionService.ts、index.ts（若已做备份）。

### 阶段 3（拆分 index.ts）
- **新增**：`packages/api/src/config/schedulerConfig.ts`（getWorkspaceRoot、getOpenskillsPath、loadSchedulerConfig）、`packages/api/src/services/skillsScanService.ts`（scan + listAllSkills）、`packages/api/src/routes/skills.ts`（createSkillsRouter）、`packages/api/src/routes/cursorRules.ts`（createCursorRulesRouter）。
- **修改**：`packages/api/src/index.ts` 使用 config/schedulerConfig 与 skills/cursorRules 路由，移除内联扫描与 skills/cursor-rules 端点。
- **回退**：删除上述新文件；从备份恢复 index.ts。

### 阶段 4（Config schema、CORS、体量、USER_SKILLS_DIR、getBaseDir）
- **修改**：
  - `packages/api/src/routes/config.ts`：PUT/PATCH 使用白名单 filterConfigUpdates(req.body) 后再 updateConfig。
  - `packages/api/src/index.ts`：CORS 使用 origin 白名单（可配置 CORS_ORIGIN）；express.json limit 改为 2mb。
  - `packages/api/src/routes/proposals.ts`：500 时 detail 仅返回 message，不包含 stack。
  - `packages/api/src/utils/fileUtils.ts`：USER_SKILLS_DIR 改为 getUserSkillsDir() 按需解析；getBaseDir 优先 WORKSPACE_ROOT。
  - `README.md`：补充 WORKSPACE_ROOT / 工作区根目录说明。
- **回退**：从备份恢复 config.ts、index.ts、proposals.ts、fileUtils.ts、README.md。
