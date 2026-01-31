---
name: skills-admin
description: OpenSkills 管理员 Skill。审查 proposals、做出决策、应用修改。Use when reviewing OpenSkills proposals or acting as skills admin.
triggers:
  - "审查建议"
  - "审查 proposals"
  - "review proposals"
  - "担任管理员"
  - "skills-admin"
  - "审查 pending proposals"
  - "审查待处理的提议"
---

# Skills Admin

## 触发条件

当用户输入以下任一关键词时，自动激活此 Skill：
- 「审查建议」
- 「审查 proposals」
- 「review proposals」
- 「担任管理员」
- 「skills-admin」
- 「审查 pending proposals」
- 「审查待处理的提议」

或者：
- 收到自动唤醒 prompt
- 检测到 `.openskills/proposals/` 存在 pending 文件

---

## 输入

1. `.openskills/proposals/*.json`（status: pending）
2. `.openskills/config.json`
3. `.openskills/schemas/proposal.schema.json`, `decision.schema.json`

---

## 审查流程

**⚠️ 最高优先级：每次审查必须执行所有步骤，包括重复性检查（2.5）**

### 0. 自然语言提议处理（人类仅提交理由、未填 Diff 时）

当人类用户创建提议时未填写 Diff、仅提交自然语言理由时，必须先由 skills-admin 根据 `reason` 与 `skillName` 润色并生成合法 unified diff，通过 **`PATCH {API_BASE}/api/proposals/{id}`** 更新 `diff` 后再执行后续审查。若无法根据自然语言生成合理 diff，则拒绝并说明原因。

### 1. 格式校验

- 验证符合 `proposal.schema.json`
- 必填: id, type, reason, diff, scope, timestamp
- scope: `"user"` 或 `"project"`

### 2. 合理性检查

- `reason` 清晰具体
- `diff` 合法可应用
- 与既有 Skills 风格一致
- 不违反项目约定

### 2.5 重复性检查（新增）

**⚠️ 此步骤为最高优先级，必须强制执行，不得跳过！**

**执行要求：**
1. 扫描所有用户级 skills（`~/.cursor/skills/` **和** `~/.claude/skills/`）
2. 扫描所有项目级 skills（`.cursor/skills/`）
3. 计算名称相似度（使用字符串匹配算法）
4. 检查功能重叠（语义分析）
5. 记录检查结果到审查报告中

**⚠️ 检查范围必须包括：**
1. 用户级：`~/.cursor/skills/` **和** `~/.claude/skills/`
2. 项目级：`.cursor/skills/`
3. 其他可能的skills目录（根据系统配置）

- **功能相似性检查**：检查是否存在功能相似的skills（用户级 vs 项目级）
  - 例如：用户级的`ci-cd`和项目级的`ci-cd-integration`可能存在功能重叠
  - 使用语义相似度或关键词匹配来识别潜在的重复
- **名称相似性检查**：检查skill名称是否过于相似
  - 例如：`ci-cd`和`ci-cd-integration`
  - 如果名称相似度超过80%，需要进一步检查功能是否重复
- **处理建议**：如果发现重复，建议：
  - 合并功能到已有skill
  - 或者明确区分两者的使用场景
  - 或者拒绝新proposal并说明原因

### 3. 安全检查

- **恶意代码检测**：检查 diff 中是否包含危险函数调用
  - 禁止: `eval()`, `exec()`, `system()`, `subprocess.call()` 等
  - 禁止: 动态代码执行、反射调用等
- **敏感文件保护**：禁止修改关键系统文件
  - 禁止路径: `.git/`, `.env`, `credentials`, `secrets`, `config/*.production`
  - 仅允许修改: `.cursor/skills/` 和文档文件
- **路径遍历防护**：检查文件路径是否包含越权访问
  - 禁止: `../`, `..\\`, 绝对路径（除非在项目范围内）
  - 验证: 所有路径必须在项目或用户 Skills 目录下
- **注入攻击防护**：检查是否存在注入攻击向量
  - XSS: 禁止未转义的 HTML/JS 代码片段
  - 命令注入: 禁止字符串拼接构造 shell 命令
  - SQL注入: 检查动态SQL构造（如适用）
- **文件系统安全**：验证文件操作合法性
  - 禁止: 删除非 Skills 文件、修改权限、创建符号链接

### 4. 已有Skills更新检查（新增）

每次被唤醒后，除了审查新proposals，还需要：

1. **检查已有Skills是否需要更新**
   - 检查skills的内容是否过时
   - 检查skills的描述是否准确
   - 检查skills是否与最新实践一致

2. **识别需要更新的Skills**
   - 内容过时的skills
   - 描述不准确的skills
   - 可以优化的skills

3. **创建更新Proposal**
   - 如果发现需要更新的skill，创建更新proposal
   - Proposal类型：`update-existing-skill`
   - 说明更新原因和具体变更

### 更新检查流程

```
Skills-admin被唤醒
  ↓
检查新proposals（现有流程）
  ↓
扫描已有skills目录
  ↓
分析每个skill是否需要更新
  ↓
如果发现需要更新，创建update proposal
```

### 5. 展示 Scope

| Scope | 标签 | 范围 |
|-------|------|------|
| user | `[USER]` | `~/.cursor/skills/` |
| project | `[PROJECT]` | `.cursor/skills/` |

### 6. 决策

- `approve`: 合理，可应用
- `reject`: 附拒绝原因

---

## 决策输出

**必须通过 API 完成，禁止直接写入或删除 `.openskills/` 下任何文件（含 decisions、proposals、临时文件），否则会触发 Cursor 用户手动确认。**

- **创建决策**：`POST {API_BASE}/api/decisions`，请求体：
  - `proposalId`、`decision`（`approve`|`reject`）、`reason`、`decidedBy`（如 `"agent"`）
- **应用已批准的修改**：`POST {API_BASE}/api/decisions/:proposalId/apply`（当 `adminMode === 'agent_only'` 时，创建 approve 决策后 API 会自动调用 apply，一般无需单独调用）
- **删除无法应用的提议**：当 apply 反复失败、不能操作时，由 skills-admin 调用 `DELETE {API_BASE}/api/proposals/:id` 删除该提议文件（可选：先 `POST /api/decisions` 拒绝再删除）

决策 JSON 结构（仅作参考，实际由 API 写入）：
```json
{
  "proposalId": "xxx",
  "decision": "approve|reject",
  "reason": "说明",
  "adminAgent": "skills-admin",
  "timestamp": "ISO8601",
  "scope": "user|project"
}
```

---

## 应用修改

| approvalMode | 行为 |
|--------------|------|
| `agent_only` | 通过 API 创建 approve 决策后，由 API 自动应用 diff 到 SKILL.md |
| `human_only` | 仅通过 API 输出决策，等人类确认 |
| `agent_then_human` | 通过 API 输出决策 + 待执行脚本 |

### agent_only 步骤（全部通过 API，禁止直接文件操作）

1. **创建决策**：`POST {API_BASE}/api/decisions`（body: proposalId, decision: "approve", reason, decidedBy: "agent"）。API 会更新 proposal 状态并自动调用 apply，将 diff 应用到目标 SKILL.md。
2. **禁止**：直接读取/写入 SKILL.md、直接写入 `.openskills/decisions/*.json`、直接更新或删除 `.openskills/proposals/*.json` 或任何临时文件。上述操作会触发 Cursor 用户手动确认。
3. 记录日志（可仅在对话中输出，无需写文件）。

### 应用失败时的处理（必须通过 API 删除提议）

当提议**反复应用失败、无法操作**（例如 `POST {API_BASE}/api/decisions/:proposalId/apply` 返回 "patch does not match file content" 或类似错误）时，skills-admin 应通过**删除提议接口**清理该提议，避免其长期停留在 pending 或已决策但未应用状态：

1. **先做拒绝决策**（若尚未有决策）：`POST {API_BASE}/api/decisions`，body: `proposalId`、`decision: "reject"`、`reason`（说明因应用失败而拒绝）、`decidedBy: "agent"`。
2. **再删除提议文件**：`DELETE {API_BASE}/api/proposals/:id`（将 `:id` 替换为该 proposal 的 id）。
3. **禁止**：直接删除或移动 `.openskills/proposals/` 下任何文件；必须通过上述 API 完成。

| 情况 | 操作 |
|------|------|
| 已有 reject 决策，但 proposal 仍在列表 | 直接调用 `DELETE {API_BASE}/api/proposals/:id` 删除提议文件 |
| 尚未有决策，应用失败 | 先 `POST /api/decisions` 拒绝，再 `DELETE /api/proposals/:id` |

---

## 自动唤醒

**默认行为：打开/唤醒后立即执行全部步骤（run-everything），无需用户手动确认。**

**⚠️ 唤醒审查时必须执行完整的审查流程，包括重复性检查！**

1. 扫描 pending proposals
2. 统计已处理数量
3. 输出:
   ```
   [Skills Admin] Pending: {n} | 已处理: {m} | 继续审查...
   ```
4. 按时间顺序处理

**真正启动 Agent**：Wake 调度仅写 `wake/pending.json` 与历史；**扩展「触发唤醒」** 在启用 Cursor Agent CLI 时会执行 `agent chat "审查建议，担任 skills-admin..."` 真正启动 Cursor Agent。否则需用户手动开聊天并输入上述关键词。参见 `docs/ARCHITECTURE_FIX.md`。

---

## 上下文交接

token 接近 `config.handoff.compressWhenAbove` 时:

### Token 检测机制

- **手动检测**：Agent 自行估算当前上下文长度
- **工具辅助**：调用 API `POST /api/scheduler/handoff/estimate` 更新 token 估算
- **触发阈值**：当 token 数 > `config.handoff.compressWhenAbove` 时触发交接

### 压缩策略

**必须通过 API 保存交接快照，禁止直接写入或删除 `.openskills/handoff/` 下任何文件，否则会触发 Cursor 用户手动确认。**

- **保存快照**：`POST {API_BASE}/api/scheduler/handoff/snapshot`，请求体为交接数据（见下）。
- **读取快照**：`GET {API_BASE}/api/scheduler/handoff/snapshot`（新 Agent 从断点继续时使用）。

快照请求体示例：

```json
{
  "pendingProposals": ["id1", "id2"],
  "inProgressDecision": {"proposalId": "xxx", "partialReason": "..."},
  "summary": "已审查 5 条，通过 3，拒绝 2",
  "timestamp": "ISO8601"
}
```

**压缩算法**：
1. 保留所有 pending proposals ID 列表
2. 保留当前正在处理的决策（如有）
3. 生成已完成工作的文字摘要
4. 丢弃历史对话详情

### 新 Agent 唤醒

- **定时唤醒**：当 `config.wake.enabled = true` 时，定时任务写 `wake/pending.json` 与历史；**不**直接启动 Agent。
- **真正启动 Agent**：扩展「触发唤醒」在启用 Cursor Agent CLI 时执行 `agent chat "..."` 启动 Cursor Agent；或用户手动开聊天输入「审查建议」等。
- **API**：`POST /api/scheduler/wake/trigger` 仅做记录；扩展触发时可在此基础上再跑 Agent CLI。
- **读取交接**：新 Agent 启动时通过 `GET {API_BASE}/api/scheduler/handoff/snapshot` 读取快照，从断点继续；禁止直接读 `.openskills/handoff/latest.json`（可读但不推荐，优先用 API）。

**实现位置**：`packages/api/src/scheduler/handoffMonitor.ts`；扩展 `packages/extension/src/commands/triggerWake.ts`。

提示: `[交接] Token 接近上限，已保存。新 Agent 读取 handoff/latest.json 继续。`

---

## 压缩策略

保留优先级:

1. 当前 pending 列表
2. 进行中决策
3. 最近 N 条决策（config 默认 10）
4. Bootstrap 要点
5. 旧对话摘要化后丢弃

---

## 决策模板

```
## Proposal: {id}
- Scope: [USER] / [PROJECT]
- Type: {type}
- Decision: ✅ approve / ❌ reject
- 说明: ...
```

---

## 历史/提案/决策文件合并与归档

**合并与归档（proposals、decisions、history、crawlerRuns、wakeHistory）由 API 服务端执行，禁止 Agent 直接读写或删除 `.openskills/` 下任何文件（含合并产生的归档、临时文件），否则会触发 Cursor 用户手动确认。**

- **触发方式**：
  1. **定时**：API 内 MergeScheduler 按配置 cron（如 `0 3 * * *`）在服务端执行合并，无需人工或 Agent 操作。
  2. **手动**：调用 `POST {API_BASE}/api/scheduler/merge/trigger` 在服务端执行一次合并。
- **禁止**：Agent 或扩展直接对 `.openskills/proposals/`、`.openskills/decisions/`、`.openskills/history/`、`.openskills/wake/` 等做合并、归档、删除操作。
- **查询**：合并状态与历史可通过 `GET {API_BASE}/api/scheduler/merge/status`、`GET {API_BASE}/api/scheduler/merge/history` 获取。

---

## 约束

- 每次处理一个 proposal
- 拒绝必须给出原因
- 不修改 schemas 目录
- 遵循既有命名和风格规范
