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

## Trigger conditions
<!-- 触发条件 -->

When the user uses any of the following phrases, this skill is activated:
- 「审查建议」
- 「审查 proposals」
- 「review proposals」
- 「担任管理员」
- 「skills-admin」
- 「审查 pending proposals」
- 「审查待处理的提议」

Or:
- 收到自动唤醒 prompt
- 通过 API 检测到存在 pending proposals（`GET /api/proposals?status=pending`）

**⚠️ API-Only：所有 OpenSkills 操作必须通过 API 完成，禁止直接创建/修改 `.openskills/` 或 `.cursor/skills/` 下的文件。详见 `.cursor/rules/openskills-api-only.mdc`。**

---

## 输入

**API 基地址**：由唤醒指令开头「当前 OpenSkills API 基地址为: …」提供，或环境变量 `OPENSKILLS_API_URL`。插件模式默认 `http://localhost:3847`，**切勿使用 localhost:3000**（该端口为 npm 手动启动时的默认，与插件不一致）。

1. **通过 API 获取**：`GET {API基地址}/api/proposals?status=pending` 获取待审查提议（禁止直接读 `.openskills/proposals/` 目录）
2. 可只读读取：`.openskills/config.json`、`.openskills/schemas/proposal.schema.json`、`decision.schema.json`（仅读不触发确认）

---

## 审查流程

**⚠️ 最高优先级：每次审查必须执行所有步骤，包括重复性检查（2.5）**

### 0. 自然语言提议处理（人类仅提交理由、未填 Diff 时）

**当人类用户在「创建提议」时未填写 Diff、仅提交了自然语言理由时，必须先由 skills-admin 润色并生成合法 diff，再执行后续审查。**

- **识别**：若 `proposal.diff` 为占位符（例如包含「自然语言提议」「由 skills-admin 润色」或长度很短、明显非 unified diff），则视为「仅自然语言提议」。
- **责任**：根据 `reason` 与 `skillName`（及 scope）润色并生成合法的 **unified diff** 或 **新建 SKILL 的完整内容**（再转为 unified diff）。
  - 新建 skill：生成符合 SKILL.md 规范的 frontmatter + 正文，再按 `--- /dev/null`、`+++ b/.cursor/skills/{skillName}/SKILL.md` 形式生成 diff。
  - 修改已有 skill：若可推断目标文件，生成与现有内容一致的 unified diff。
- **更新提议**：通过 **`PATCH {API_BASE}/api/proposals/{id}`**，请求体 `{ "diff": "生成的合法 diff 字符串" }`，仅可对 status 为 pending 的提议更新 diff。
- **再审查**：更新 diff 后，从「1. 格式校验」开始重新执行完整审查流程（含重复性检查、安全检查等）。
- **若无法生成**：若根据自然语言无法推断出合理、安全的 diff，则**拒绝**该提议，并在决策理由中说明「无法根据提议理由生成合法 diff，建议补充具体变更内容或目标文件」。

### 1. 格式校验

- 验证符合 `proposal.schema.json`
- 必填: id, skillName, scope, reason, diff, trigger, proposerMeta, status（与 proposal.schema.json 一致）
- scope: `"user"` 或 `"project"`
- 若 diff 仍为占位符或不可应用，须先完成「0. 自然语言提议处理」或拒绝

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

### 2.6 同一事件/触发词冲突检查

**⚠️ 必须执行：审查时检查不同 skill 对同一事件（触发词）的处理是否冲突。**

**执行要求：**
1. 扫描所有用户级与项目级 skills 的 frontmatter 中的 `triggers`（触发词列表）。
2. 若多个 skill 共享同一或高度重合的触发词，则检查各自对该事件/场景的处理逻辑是否冲突：
   - 行为是否矛盾（例如一个要求必须做 A、另一个禁止做 A）；
   - 优先级或执行顺序是否需明确；
   - 是否会导致用户或 Agent 困惑（同一句话触发多个不一致的指引）。
3. 若发现冲突，须在审查结论中记录，并采取其一：
   - 建议合并为单一 skill 或明确分工（如按场景拆分触发词）；
   - 在 skill 文档中注明优先级或适用边界；
   - 拒绝会加剧冲突的 proposal 并说明原因。
4. 将「同一事件冲突检查」结果写入审查报告。

**检查范围：** 用户级 `~/.cursor/skills/`、`~/.claude/skills/` 与项目级 `.cursor/skills/` 下所有 SKILL.md 的 triggers。

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

### 4. 同步 Cursor 全局用户规则（新增，全自动）

**⚠️ 此步骤必须每次唤醒时自动执行，无需用户干预！**

每次被唤醒后，除了审查新proposals，还需要：

1. **自动读取 Cursor 全局用户规则**
   - Cursor 的全局用户规则在 Agent 上下文中可见（在 `<user_rules>` 部分）
   - 从当前对话上下文中提取所有用户规则
   - 规则通常包括：
     - "Use OpenSkills"
     - "Always respond in Chinese-simplified"
     - 其他通过 Settings > General > Rules for AI 配置的规则

2. **自动同步规则到文件系统**
   - 将提取的规则转换为格式：`{ rules: [{ content: "规则内容", description: "规则描述（可选）" }] }`
   - 调用 API `POST /api/cursor-rules/sync` 传递规则内容
   - 如果规则已存在且内容相同，跳过更新
   - 如果规则有变化，自动更新 `.mdc` 文件

3. **规则文件格式**
   - 文件路径：`~/.cursor/rules/cursor-user-rules.mdc`
   - 包含 frontmatter：`description`, `alwaysApply: true`, `source: cursor-global-settings`, `lastSynced`
   - 规则内容按顺序列出，每个规则有描述（如果有）

4. **执行步骤（全自动，必须执行）**
   ```
   步骤 1：从当前上下文中提取 user_rules
   - 查找 <user_rules> 标签或 user_rules 部分
   - 提取所有规则内容
   - 如果没有找到规则，跳过同步（可能用户没有配置规则）
   
   步骤 2：将规则转换为 API 格式
   - 将每条规则转换为 { content: "...", description: "..." } 格式
   - 如果规则没有描述，使用规则内容的前 50 个字符作为描述
   
   步骤 3：调用 API 同步规则
   - 使用 **当前 OpenSkills API 基地址**（由唤醒指令开头「当前 OpenSkills API 基地址为: …」提供，或环境变量 OPENSKILLS_API_URL） + `/api/cursor-rules/sync` 发起 HTTP POST
   - **切勿使用硬编码 localhost:3000**；插件模式默认端口为 3847，以唤醒指令或配置为准
   - 请求体：{ rules: [...] }
   - 如果 API 不可用，记录警告但继续执行其他步骤
   
   步骤 4：记录同步结果
   - 如果成功：输出 "[Skills Admin] 已同步 {n} 条 Cursor 用户规则"
   - 如果失败：输出警告信息，但不中断审查流程
   ```

5. **执行时机**
   - 每次 skills-admin 被唤醒时**自动执行**（无需用户干预）
   - 在审查 proposals 之前执行（第一步）
   - 确保规则文件始终与 Cursor 设置保持同步

6. **示例代码（供 Agent 参考）**
   ```javascript
   // API 基地址：从唤醒指令中「当前 OpenSkills API 基地址为: …」解析，或使用环境变量 OPENSKILLS_API_URL，否则默认 http://localhost:3847（切勿使用 3000）
   const apiBase = process.env.OPENSKILLS_API_URL || 'http://localhost:3847';
   
   const userRules = extractUserRulesFromContext();
   if (userRules && userRules.length > 0) {
     const rules = userRules.map(rule => ({
       content: rule,
       description: rule.substring(0, 50) + '...'
     }));
     
     await fetch(`${apiBase}/api/cursor-rules/sync`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ rules })
     });
   }
   ```

### 5. 已有Skills更新检查（新增）

每次被唤醒后，除了审查新proposals，还需要：

1. **检查已有Skills是否需要更新**
   - 检查skills的内容是否过时
   - 检查skills的描述是否准确
   - 检查skills是否与最新实践一致

2. **识别需要更新的Skills**
   - 内容过时的skills
   - 描述不准确的skills
   - 可以优化的skills

3. **创建更新 Proposal（必须通过 API）**
   - 如果发现需要更新的 skill，调用 `POST /api/proposals` 创建提议（禁止直接写 `.openskills/proposals/`）
   - 请求体含 `skillName`、`scope`、`reason`、`diff`、`trigger`、`proposerMeta`
   - 说明更新原因和具体变更

### 6. Rules 与 Skills 书写约定（每次写文件时必遵）

**⚠️ 目的**：同一文件内英文作为规则正文、中文作为注释，模型以英文为准、人类可读中文说明；不单独维护 .en.mdc / SKILL.en.md 目录或文件。

**约定（skills-admin 在生成或应用任何 rule/skill 内容时必须遵守）**：
- **正文用英文**：`.cursor/rules/*.mdc` 与 `.cursor/skills/**/SKILL.md` 的**主体内容**（标题、条款、步骤、禁止/必须等）一律用**英文**书写，作为模型遵循的规则。
- **中文作注释**：在段落下或文末用**中文注释**补充说明，方式任选其一：
  - 行内：`<!-- 中文说明 -->`（Markdown 中不渲染，人类可读）；
  - 文末区块：`## 中文说明` 或 `## 注释`，下列中文要点。
- **Frontmatter**：`description` 建议英文为主，可附中文，如 `description: Agent startup MUST submit proposal first (Agent 启动时必须先提交提议)`。

**每次写/改 rule 或 skill 时**：生成的 diff 或拟应用的内容必须符合「英文正文 + 中文注释」；若发现既有文件主体为中文，应通过 proposal 改为英文正文+中文注释，以提升模型遵守率。

**禁止**：直接写入 `.cursor/rules/` 或 `.cursor/skills/` 下文件；须通过 API 创建 proposal 或应用 decision。

### 6.1 Rules/Skills 格式检查与翻译（每次唤醒必执行）

**⚠️ 此步骤必须每次唤醒时执行，不得跳过。目的：确保所有 rule/skill 文件主体为英文、中文仅作注释，以提升模型遵守率。**

**⚠️ 必须包含历史 skill/rule**：扫描范围是**所有既有/历史的** rules 与 skills，包括早已存在的、历史上创建的、以及本次新增的。不得只检查「本次涉及的」或「新改动的」文件；必须对 `.cursor/rules/` 与 `.cursor/skills/` 下**全部** .mdc 与 SKILL.md 逐文件检查并翻译需转换者。

**执行步骤（按顺序）**：
1. **列出全部文件**：列出项目级 `.cursor/rules/*.mdc` 与 `.cursor/skills/**/SKILL.md`**全部**（只读 list_dir/glob），**包括所有历史与既有文件**，不写文件。
2. **逐文件检查**：对**每一个**列出的文件只读读取内容；判断**主体内容**（标题、段落、列表项）是否为**英文**。若主体为中文或中英混杂（如标题/条款是中文），则视为「需转换」。
3. **对需转换的文件创建 proposal**：通过 API `POST /api/proposals` 创建提议，`reason` 写明「Convert to English rule + Chinese comments for better model compliance」，`diff` 为将该文件改写为「英文正文 + 中文注释」（正文用英文，中文用 `<!-- 中文 -->` 或 `## 中文说明` 区块）的 unified diff；`skillName` 填规则/技能名，`scope` 填 `project`，`trigger` 填 `agent`，`proposerMeta` 填 `{ "source": "agent", "name": "skills-admin-format-check" }`。
4. **输出结果**：在本次运行中输出 `[Skills Admin] Rules/Skills format: checked N files, M need conversion, created K proposals`（N=扫描文件数，M=需转换数，K=本次创建的 proposal 数）。

**应用涉及 rule/skill 的 proposal 时**：若待应用的 diff 主体为中文（非「英文正文+中文注释」），须先创建上述「改为英文正文+中文注释」的 proposal 并批准应用，再应用原 proposal；或拒绝原 proposal 并说明「Please resubmit with English as rule body and Chinese as comments only」。

### 更新检查流程

```
Skills-admin被唤醒
  ↓
【第一步】同步 Cursor 全局用户规则（全自动，必须执行）
  ↓
【第二步】执行 Rules/Skills 格式检查与翻译（§6.1，必执行）：扫描**所有历史与既有** .cursor/rules 与 .cursor/skills 下全部文件，主体为中文的创建「改为英文正文+中文注释」的 proposal
  ↓
【第三步】检查新 proposals（现有流程）
  ↓
【第四步】扫描已有 skills 目录
  ↓
【第五步】分析每个 skill 是否需要更新
  ↓
【第六步】若需更新，创建 update proposal
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

## 决策输出（必须通过 API）

**禁止**直接创建 `.openskills/decisions/{proposalId}.json` 文件。

**必须**调用 API 创建决策：

```http
POST /api/decisions
Content-Type: application/json

{
  "proposalId": "xxx",
  "decision": "approve" | "reject",
  "reason": "说明",
  "decidedBy": "agent"
}
```

（服务端会更新 proposal 状态并写入 decision 文件。）

---

## 应用修改（必须通过 API）

| approvalMode | 行为 |
|--------------|------|
| `agent_only` | approve 后**调用 API** 应用 diff，禁止直接改文件 |
| `human_only` | 仅输出决策，等人类确认 |
| `agent_then_human` | 输出决策 + 待执行脚本 |

### agent_only 步骤（API-Only）

1. **调用** `POST /api/decisions/{proposalId}/apply` 应用已批准提议的 diff（禁止读取/写入 SKILL.md）
2. 服务端会更新 proposal 状态为 `applied` 并记录历史
3. 在对话中记录审查结果即可
4. **Batch review**: Use `node scripts/review-pending-decisions.js` for batch processing.
   - Default: Evaluates crawler proposals by quality (star count, content length, reason)
   - Flag `--approve-crawler`: Approve all crawler proposals (for initial import)
   - Decision history is tracked in `.openskills/crawled/decision-history/reviewed-skills.json`
   - Previously rejected proposals (with same content) are automatically skipped
<!-- 批量审查：运行 scripts/review-pending-decisions.js 处理 pending 提案。支持 --approve-crawler 参数批量导入。决策历史自动跟踪，避免重复审核。 -->

---

## 自动唤醒

**⚠️ 唤醒审查时必须执行完整的审查流程，包括重复性检查！**

### 唤醒流程

**新 Agent 启动后必须先检查交接快照，若有则从断点继续。**

1. **获取交接快照（第一步，必须执行）**
   - 调用 `GET /api/scheduler/handoff/snapshot`
   - 若返回 `data` 非空：根据 `pendingProposals`、`inProgressDecision`、`summary` 从断点继续，按 pending 列表继续审查，无需重新拉全量
   - **劳动成果共享**：若快照含 `touchedFiles` 或 `decisionsMade`，用作上一轮已涉及的文件与已做决策的记录，避免重复劳动；可据此跳过已审查过的文件或延续上下文
   - 若返回 `data` 为 null：无交接快照，按下面步骤正常执行

2. **同步 Cursor 全局用户规则**
   - 读取 Cursor 的全局用户规则（通过 Settings > General > Rules for AI 配置的）
   - 调用 API `POST /api/cursor-rules/sync` 同步规则到 `~/.cursor/rules/cursor-user-rules.mdc`
   - 如果规则已存在且内容相同，跳过更新
   - 如果规则有变化，更新 `.mdc` 文件

3. **执行 Rules/Skills 格式检查与翻译（必执行，见 §6.1）**
   - **必须对历史 skill/rule 执行**：列出 `.cursor/rules/*.mdc` 与 `.cursor/skills/**/SKILL.md` 的**全部文件（含所有历史与既有）**，逐文件只读检查主体是否为英文
   - 若主体为中文或中英混杂，则通过 `POST /api/proposals` 创建「改为英文正文+中文注释」的 proposal
   - 输出：`[Skills Admin] Rules/Skills format: checked N (all existing+historical), need conversion M, proposals created K`

4. **获取 pending proposals**（若步骤 1 无快照，或快照中需补充最新列表）
   - 调用 `GET /api/proposals?status=pending`（禁止直接扫描 `.openskills/proposals/` 目录）
   - 从返回结果统计 pending 数量

5. **统计已处理数量**
  - 输出:
    ```
    [Skills Admin] 已同步 Cursor 用户规则 | Pending: {n} | 已处理: {m} | 继续审查...
    ```
   - 若有交接快照，可输出: `[Skills Admin] 已从交接快照恢复，继续审查 {pendingProposals.length} 条...`

6. **按时间顺序处理 proposals**

**支持多种 Agent 环境**：OpenSkills 支持以下 Agent CLI 工具，可在扩展设置 `openskills.agentCliType` 中切换：

| 类型 | 命令 | 说明 |
|------|------|------|
| `cursor` | `agent chat "..."` | Cursor Agent CLI（默认） |
| `opencode` | `opencode "..."` | OpenCode CLI |
| `claude` | `claude "..."` | Claude Code CLI |

Wake 调度仅写 `wake/pending.json` 与历史；**扩展「触发唤醒」** 会根据配置的 CLI 类型执行对应命令启动 Agent。否则需用户手动开聊天并输入上述关键词。

**VS Code 兼容**：在 VS Code 中使用时，若 `.cursor` 目录不存在，扩展会自动使用 `.vscode` 目录存放 skills 和 rules。

扩展在发送命令前会对唤醒 prompt 做 trim、并先 show 终端再 sendText，以避免定时唤醒时「只输入不提交」。

---

## 上下文交接

token 接近 `config.handoff.compressWhenAbove` 时:

### Token 检测机制

- **手动检测**：Agent 自行估算当前上下文长度
- **工具辅助**：调用 API `POST /api/scheduler/handoff/estimate` 更新 token 估算
- **触发阈值**：当 token 数 > `config.handoff.compressWhenAbove` 时触发交接

### 压缩策略（必须通过 API）

**禁止**直接写入 `.openskills/handoff/latest.json`。

**必须**调用 API 保存交接快照；**为在不同交接的 skills-admin 之间共享劳动成果，必须填写文件级信息**：

```http
POST /api/scheduler/handoff/snapshot
Content-Type: application/json

{
  "pendingProposals": ["id1", "id2"],
  "inProgressDecision": { "proposalId": "xxx", "partialReason": "..." },
  "summary": "已审查 5 条，通过 3，拒绝 2",
  "timestamp": "ISO8601",
  "touchedFiles": [".cursor/skills/foo/SKILL.md", ".cursor/rules/bar.mdc"],
  "decisionsMade": [
    { "proposalId": "id1", "decision": "approve", "files": [".cursor/skills/foo/SKILL.md"] },
    { "proposalId": "id2", "decision": "reject", "files": [] }
  ]
}
```

- **touchedFiles**（必填以共享劳动成果）：本轮会话中涉及的所有文件路径（如 diff 目标、已审查/已应用的 SKILL 或 rule 路径）
- **decisionsMade**（必填以共享劳动成果）：本轮已做出的决策列表，每项含 `proposalId`、`decision`（`approve`/`reject`）、可选 `files`（该决策涉及的文件）

**压缩算法**：
1. 保留所有 pending proposals ID 列表（可从 `GET /api/proposals?status=pending` 获取）
2. 保留当前正在处理的决策（如有）
3. 生成已完成工作的文字摘要
4. **收集本轮 touchedFiles 与 decisionsMade，一并写入快照**（供下一轮 skills-admin 共享劳动成果）
5. 丢弃历史对话详情
6. 调用 `POST /api/scheduler/handoff/snapshot` 保存上述内容

### 新 Agent 唤醒

- **定时唤醒**：当 `config.wake.enabled = true` 时，定时任务写 `wake/pending.json` 与历史；**不**直接启动 Agent。
- **真正启动 Agent**：扩展「触发唤醒」在启用 Cursor Agent CLI 时执行 `agent chat "..."` 启动 Cursor Agent；或用户手动开聊天输入「审查建议」等。
- **API**：`POST /api/scheduler/wake/trigger` 仅做记录；扩展触发时可在此基础上再跑 Agent CLI。
- **读取交接**：新 Agent 启动时**调用** `GET /api/scheduler/handoff/snapshot` 获取交接快照（若有则从断点继续），禁止直接读 `handoff/latest.json` 文件。

**实现位置**：`packages/api/src/scheduler/handoffMonitor.ts`；扩展 `packages/extension/src/commands/triggerWake.ts`。

提示: `[交接] Token 接近上限，已通过 API 保存快照。新 Agent 调用 GET /api/scheduler/handoff/snapshot 继续。`

---

## 压缩策略

保留优先级:

1. 当前 pending 列表
2. 进行中决策
3. **touchedFiles 与 decisionsMade**（供下一轮 skills-admin 共享劳动成果）
4. 最近 N 条决策（config 默认 10）
5. Bootstrap 要点
6. 旧对话摘要化后丢弃

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

## 约束

- 每次处理一个 proposal
- 拒绝必须给出原因
- 不修改 schemas 目录
- 遵循既有命名和风格规范
