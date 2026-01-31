# History 页下线修改清单 · 已批准/已应用/回滚说明

## 一、History 页下线 — 修改清单

### 1. 路由与导航

| 位置 | 修改内容 |
|------|----------|
| `packages/web/src/App.tsx` | 移除 `import { History }` 与 `<Route path="/history" element={<History />} />` |
| `packages/web/src/components/layout/Sidebar.tsx` | 移除侧边栏 `History` 导航项及 `History` 图标引用 |

### 2. 页面与组件删除

| 路径 | 说明 |
|------|------|
| `packages/web/src/pages/History.tsx` | 已删除（或此前已移除） |
| `packages/web/src/components/history/HistoryList.tsx` | 已删除 |
| `packages/web/src/components/history/index.ts` | 已删除 |

### 3. API 与 Hooks 清理

| 位置 | 修改内容 |
|------|----------|
| `packages/web/src/hooks/useApi.ts` | 移除 `useHistory`、`queryKeys.history` |
| `packages/web/src/api/index.ts` | 移除 `getHistory`；如仅此处使用 `HistoryEntry`，则一并移除该类型引用 |

### 4. 后端保留（未改动）

- `GET/POST /api/history` 及相关 `historyService` 仍存在；apply 流程照常写入 history，回滚 API 可用。
- 仅前端不再调用「列表」接口，History 作为独立页面已下线。

### 5. 查看已应用记录的替代方式

- 在 **Proposals** 页使用状态筛选 **「已批准」**（该筛选包含 `approved` 与 `applied`）查看已批准/已应用提议。

---

## 二、已批准 vs 已应用 — 差别说明

### 状态含义

| 状态 | 含义 | 数据来源 |
|------|------|----------|
| **已批准 (approved)** | 有人做了「批准」决策，proposal 状态为 `approved`。Diff **可能尚未**写入 SKILL 文件。 | `proposal.status === 'approved'` |
| **已应用 (applied)** | Diff **已经**写入 SKILL 文件；有 decision 的 `appliedAt` 及 history 记录。 | `decision.appliedAt` 存在 + history 表有对应条目 |

### 流程关系

1. **pending** → 有人 **批准** → **approved**（proposal 状态更新）。
2. **approved** → 有人 **应用**（调用 `POST /api/decisions/:proposalId/apply`）→ diff 写入 SKILL，`decision.appliedAt` 被设置，并创建 **history 条目**。

**特例**：`adminMode === 'agent_only'` 且由 **Agent 批准**时，批准后会自动执行 apply，无需再点「应用」。

### 当前实现里的重要点

- **Proposal 的 `status` 从未被设为 `applied`**。API 的 `PATCH /api/proposals/:id` 只接受 `pending` | `approved` | `rejected`，apply 流程也只更新 decision 与 history，不改 proposal.status。
- 因此列表里看到的始终是 `approved`；**「已应用」实际是以 `decision.appliedAt` 和 history 为准**，而不是以 `proposal.status === 'applied'`。
- 前端筛选「已批准」时会把 `approved` 与 `applied` 一起展示（`Proposals.tsx` 中 `statusFilter === 'approved'` 同时匹配这两种），故在 UI 上二者被合并呈现。

### 小结

- **已批准**：已决策通过，不一定已改文件。
- **已应用**：已改文件，且必有批准在前；但 proposal 仍显示为「已批准」，区分依赖 decision/history。

---

## 三、回滚 — 为何没看到回滚选项？

### 1. 两套回滚

| 回滚类型 | 后端 API | 前端入口 | 说明 |
|----------|----------|----------|------|
| **Preferences 历史回滚** | `POST /api/preferences/rollback/:historyId` | 有：Preferences 页「历史」卡片中的回滚按钮 | 可回滚偏好设置到某次历史版本 |
| **Proposal 应用回滚** | `POST /api/history/:id/rollback`、`GET /api/history/:id/can-rollback` | **无** | 可把某次对 SKILL 的 apply 撤销 |

### 2. Proposal 应用回滚为什么没有 UI？

- 旧版 **History 页**只提供「查看提案」跳转，**从未**暴露「回滚」按钮。
- History 页下线后，更没有任何界面调用 `POST /api/history/:id/rollback` 或 `GET /api/history/:id/can-rollback`。
- 因此：**不是「已应用不能回滚」，而是回滚能力只在后端存在，前端从未做入口。**

### 3. 回滚规则（后端）

- 仅当该 history 条目 **未** 被回滚过，且是 **该 skill 最近一次** 的变更时，才允许回滚（`historyService.canRollback`）。
- 若该 skill 之后还有新的 apply，则不能回滚到更早的版本。

### 4. 若要支持「已应用」回滚

- 需在前端增加回滚入口，例如：
  - 在 **Proposals** 详情（或列表）中，对「已应用」的提议展示「回滚」；
  - 或恢复/新增一个「应用历史」视图，列表展示 history 条目，每条可检查 `can-rollback` 并执行回滚。
- 调用现有 `GET /api/history/:id/can-rollback` 与 `POST /api/history/:id/rollback` 即可。

---

## 四、构建错误修复清单（与 History 无关）

以下为 `npm run build --workspace=packages/web` 曾报的部分问题，多与未使用变量、类型不一致有关；修复它们可恢复构建，但与 History 下线无直接关系。

| 文件 | 问题 | 建议修复 |
|------|------|----------|
| `packages/web/src/api/types.ts` | `DeciderType` 未定义（`HistoryEntry.appliedBy` 使用） | 在 types 中增加 `export type DeciderType = 'human' \| 'agent';` |
| `App.tsx` | `useEffect` / `useState` 等 import 未使用 | 删除未使用的 import |
| `AdminPanel.tsx` | `Bot`、`AlertTriangle`、`AdminStatus`、`SchedulerStatus`、`isLoadingMerge` 未使用 | 删除或使用 |
| `ScopeBadge`、`SourceBadge`、`StatusBadge` 等 | `React` 未使用 | 删 `import * as React` 或改用必要子项 |
| `CrawlerPanel` | `formatDate` 未使用 | 删除或使用 |
| `DecisionsList` | `useState` 未使用 | 删除或使用 |
| `DiffViewer` | `Code` 未使用 | 删除或使用 |
| `ProposalsList`、`SkillsList` | `Filter` 未使用 | 删除或使用 |
| `Pagination`、`Select` 等 | 未使用 import | 同上 |
| `Config` | `Settings`、`CardFooter` 未使用 | 删除或使用 |
| `Dashboard` | `Clock`、`TrendingUp`、`AlertCircle` 未使用；`useDecisions(5)` 参数错误 | 修参数为 `{ limit: 5 }`，清理未使用 import |
| `Preferences` | `useState`、`BellOff`、`formatDate` 未使用；`handleUpdatePreference` 与 `NotificationSettings` 类型不匹配 | 补全 `NotificationSettings` 必填字段或调整类型 |
| 若干 `pages/*` | `React` 未使用 | 统一清理 |

按上表逐项修改后，再跑 `npm run build --workspace=packages/web` 验证。
