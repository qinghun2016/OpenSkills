---
name: skill-proposer
description: Periodically analyze skills and generate proposals (定期分析现有 skills，识别改进机会，自动生成 proposals).
triggers:
  - "生成提议"
  - "生成 proposals"
  - "分析 skills"
  - "检查 skills"
  - "skill-proposer"
  - "propose skills"
  - "analyze skills"
---

# Skill Proposer

## Trigger conditions
<!-- 触发条件 -->

This skill activates when the user uses any of these phrases:
- 「生成提议」
- 「生成 proposals」
- 「分析 skills」
- 「检查 skills」
- 「skill-proposer」
- 「propose skills」
- 「analyze skills」

Or:
- Scheduled (wake with skills-admin)
- When periodic skill analysis is needed

---

## Overview
<!-- 功能概述 -->

Skill Proposer:
1. **Scan all skills** (user- and project-level)
2. **Analyze each skill** (content quality, best practices, duplicate detection)
3. **Generate proposals** (update, merge, optimize)

---

## 精纲：标准提议的生成要求

**若未领会以下要点，分析并生成提议的效果会很差，无法产出可被 skills-admin 批准并应用的「标准提议」。**

### 标准提议的定义
- **每条 proposal 必须包含可应用的 unified diff**：`diff` 字段必须是针对**真实文件**的补丁，目标路径必须在 `.cursor/skills/` 或 `.cursor/rules/` 下（API 会校验，否则拒绝或 apply 失败）。
- **禁止占位符 diff**：不得使用 `--- a/x`、`+++ b/x` 或仅用于「占位」的假 diff；否则 skills-admin 会拒绝。
- **diff 必须与当前文件内容一致**：生成 diff 前必须**读取目标文件的当前内容**，保证 hunk 的上下文行与文件一致，否则 apply 会失败。

### 分析的深度要求
- **逐文件全文阅读**：对每个 SKILL.md 做**实质性分析**（内容质量、过时 API、缺失章节、与其它 skill 重复/冲突），而非仅扫描目录或 frontmatter。
- **一个改进点一条 proposal**：每个具体改进（如「某 skill 某处改用 v4 API」）对应一条 proposal，reason 写清原因与改动点，diff 只包含该改动。

### 与 skills-admin 的衔接
- skills-admin 会按「格式 → 合理性 → 重复性 → 安全」审查；**只有 diff 合法、路径在允许范围内、无安全问题的提议才会被批准**。
- 若仅提交自然语言理由而无合法 diff，skills-admin 可代为润色生成 diff（PATCH 更新提议），但 skill-proposer 应**直接产出合格 diff**，减少返工。

---

## 输入

1. 所有用户级 skills 目录：
   - `~/.cursor/skills/`（Windows: `%USERPROFILE%\.cursor\skills\`）
   - `~/.claude/skills/`（Windows: `%USERPROFILE%\.claude\skills\`）

2. 所有项目级 skills 目录：
   - `.cursor/skills/`（项目根目录下）

3. Proposal Schema：`.openskills/schemas/proposal.schema.json`（只读）

4. **通过 API 获取**现有 Proposals：`GET /api/proposals` 或 `GET /api/proposals?status=pending`（避免重复创建；禁止直接读 `.openskills/proposals/` 目录）

**⚠️ API-Only**：创建 proposal 必须使用 `POST /api/proposals`，禁止直接创建或写入 `.openskills/proposals/` 下的文件。详见 `.cursor/rules/openskills-api-only.mdc`。

---

## 执行流程

### 1. 扫描所有Skills

**必须扫描以下所有目录：**

```bash
用户级：
- ~/.cursor/skills/
- ~/.claude/skills/

项目级：
- .cursor/skills/
```

**对于每个目录：**
1. 列出所有子目录（每个 skill 一个目录）
2. 检查是否存在 `SKILL.md` 文件
3. 读取 skill 内容
4. 记录 skill 信息：
   - 名称
   - 路径
   - 作用域（user/project）
   - 内容
   - 最后修改时间

### 2. 分析每个Skill

对每个扫描到的 skill，执行以下分析：

#### 2.1 内容质量检查

- **完整性检查**：
  - 是否有完整的 frontmatter（name, description, triggers）
  - 是否有清晰的功能描述
  - 是否有使用示例
  - 是否有必要的文档结构

- **准确性检查**：
  - 代码示例是否有效
  - 链接是否可访问
  - 描述是否与实际功能一致

- **可读性检查**：
  - 格式是否规范
  - 是否有拼写错误
  - 是否有语法错误

#### 2.2 最佳实践对比

- **API 版本检查**：
  - 是否使用了最新版本的 API
  - 是否引用了已弃用的功能
  - 是否使用了过时的工具或库

- **代码风格检查**：
  - 是否符合项目编码规范
  - 是否遵循最佳实践
  - 是否有可以优化的地方

- **文档质量检查**：
  - 是否有足够的文档说明
  - 是否有清晰的示例
  - 是否有错误处理说明

#### 2.3 重复/冲突检测

- **名称相似性检查**：
  - 计算与其他 skills 的名称相似度
  - 如果相似度 > 80%，标记为潜在重复
  - 检查是否有功能重叠

- **功能相似性检查**：
  - 分析 skill 的功能描述
  - 使用关键词匹配识别相似功能
  - 检查用户级 vs 项目级是否有重复

- **冲突检测**：
  - 检查是否有相互冲突的 skills
  - 检查是否有功能重叠但使用场景不同的 skills

#### 2.4 优化建议

- **性能优化**：
  - 是否有可以优化的性能问题
  - 是否有不必要的操作

- **安全性检查**：
- **Crawler 鎻愪氦**锛歞iff 涓洰鏍囪矾寰勫繀椤讳负 .cursor/skills/{skillName}/SKILL.md锛堟垨 user 绾у搴旇矾寰勶級锛岀姝娇鐢?/xxx/SKILL.md 绛夐潪鏍囧噯璺緞锛屽惁鍒?skills-admin 浼氭嫆缁濄€俓n - 鍙戠幇鍚嶇О鐩镐技涓斿姛鑳介噸鍙犵殑 skills
  - 是否有安全风险
  - 是否有敏感信息泄露风险

- **可维护性检查**：
  - 代码是否易于维护
  - 是否有可以简化的地方

### 3. 生成Proposals

基于分析结果，生成以下类型的 proposals：

#### 3.1 更新Proposals（update-existing-skill）

**触发条件**：
- 内容过时（引用了过时的 API/工具）
- 描述不准确
- 不符合最新实践
- 有可以优化的地方

**创建步骤**（必须通过 API）：
1. 可只读读取 proposal schema
2. 生成 unified diff 格式的变更内容
   When diff contains non-ASCII (e.g. Chinese), send request with Content-Type: application/json; charset=utf-8 to avoid apply failure.
3. **调用** `POST /api/proposals`，请求体包含：`skillName`、`scope`、`reason`、`diff`、`trigger`、`proposerMeta`（服务端生成 `id`）
4. **禁止**直接创建 `.openskills/proposals/` 下的文件

**请求体示例**：
```json
{
  "skillName": "skill-name",
  "scope": "user|project",
  "reason": "详细说明更新原因和具体改进方案",
  "diff": "unified diff 格式的变更内容",
  "trigger": "agent",
  "proposerMeta": {
    "source": "agent",
    "name": "skill-proposer",
    "reason": "自动分析发现需要更新",
    "createdAt": "ISO8601 时间戳"
  }
}
```

#### 3.2 合并Proposals（merge-duplicate-skills）

**触发条件**：
- 发现功能重复的 skills
- 发现名称相似且功能重叠的 skills

**创建步骤**：
1. 识别需要合并的 skills
2. 分析合并方案
3. 生成合并 proposal

**Proposal 结构**：
```json
{
  "id": "20260126-120000-merge-skills",
  "skillName": "merged-skill-name",
  "scope": "user|project",
  "reason": "发现 skill1 和 skill2 功能重复，建议合并为一个 skill",
  "diff": "合并后的 skill 内容（unified diff）",
  "trigger": "agent",
  "proposerMeta": {
    "source": "agent",
    "name": "skill-proposer",
    "reason": "自动检测到重复 skills",
    "createdAt": "ISO8601 时间戳"
  },
  "status": "pending"
}
```

#### 3.3 优化Proposals（optimize-skill）

**触发条件**：
- 发现可以优化的地方
- 发现性能问题
- 发现可维护性问题

**创建步骤**：
1. 识别优化点
2. 生成优化方案
3. 创建优化 proposal

**Proposal 结构**：
```json
{
  "id": "20260126-120000-optimize-skill-name",
  "skillName": "skill-name",
  "scope": "user|project",
  "reason": "发现可以优化的地方：性能/可维护性/代码质量",
  "diff": "优化后的内容（unified diff）",
  "trigger": "agent",
  "proposerMeta": {
    "source": "agent",
    "name": "skill-proposer",
    "reason": "自动分析发现优化机会",
    "createdAt": "ISO8601 时间戳"
  },
  "status": "pending"
}
```

### 4. 避免重复创建

**检查机制**（通过 API）：
1. 在创建 proposal 前，调用 `GET /api/proposals?status=pending` 获取现有 pending proposals（禁止直接读 `.openskills/proposals/` 目录）
2. 如果已存在相同 skill 的 pending proposal，跳过创建
3. 如果已存在相同内容的 proposal，跳过创建

**去重策略**：
- 按 skill 名称去重
- 按更新原因去重
- 检查最近 7 天内是否已创建过类似 proposal

---

## 输出

### 分析报告

生成分析报告，包含：
- 扫描的 skills 总数
- 发现的问题数量
- 生成的 proposals 数量
- 详细的问题列表

### 创建的 Proposals

通过 `POST /api/proposals` 创建的 proposals 由服务端保存，等待 skills-admin 通过 API 审查。**禁止**直接写入 `.openskills/proposals/` 目录。

---

## 执行频率

- **定时执行**：与 skills-admin 一起被唤醒（根据 `config.wake.schedule`）
- **手动触发**：用户输入触发关键词
- **建议频率**：每天至少执行一次

---

## 与 skills-admin 的协作

1. **skill-proposer** 负责生成 proposals
2. **skills-admin** 负责审查 proposals
3. 两者可以同时被唤醒，但执行顺序：
   - 先执行 skill-proposer（生成 proposals）
   - 再执行 skills-admin（审查 proposals）

---

## 约束

- 每次分析最多处理 100 个 skills（避免超时）
- 每个 skill 的分析时间不超过 30 秒
- 每次执行最多生成 20 个 proposals（避免产生过多低质量提议）
- 只生成有意义的 proposals（过滤掉微小改进）

---

## 示例

### 示例 1：更新过时的 API

**发现**：`ci-cd` skill 中使用了已弃用的 GitHub Actions API v1

**生成 Proposal**：
```json
{
  "id": "20260126-120000-update-ci-cd-api",
  "skillName": "ci-cd",
  "scope": "project",
  "reason": "检测到使用了已弃用的 GitHub Actions API v1。GitHub 将在 2026 年 6 月停止支持 v1 API，建议更新为 v2 API。",
  "diff": "--- a/.cursor/skills/ci-cd/SKILL.md\n+++ b/.cursor/skills/ci-cd/SKILL.md\n@@ -15,3 +15,3 @@\n-使用 `actions/checkout@v1`\n+使用 `actions/checkout@v4`\n",
  "trigger": "agent",
  "proposerMeta": {
    "source": "agent",
    "name": "skill-proposer",
    "reason": "自动检测到过时的 API",
    "createdAt": "2026-01-26T12:00:00.000Z"
  },
  "status": "pending"
}
```

### 示例 2：合并重复的 Skills

**发现**：用户级 `ci-cd` 和项目级 `ci-cd-integration` 功能重复

**生成 Proposal**：
```json
{
  "id": "20260126-120000-merge-ci-cd-skills",
  "skillName": "ci-cd",
  "scope": "project",
  "reason": "发现用户级 `ci-cd` 和项目级 `ci-cd-integration` 功能重复。建议合并为一个 skill，保留更完整的功能。",
  "diff": "合并后的 skill 内容...",
  "trigger": "agent",
  "proposerMeta": {
    "source": "agent",
    "name": "skill-proposer",
    "reason": "自动检测到重复 skills",
    "createdAt": "2026-01-26T12:00:00.000Z"
  },
  "status": "pending"
}
```

---

## 相关文件

- Proposal Schema：`.openskills/schemas/proposal.schema.json`
- Skills Admin：`.cursor/skills/skills-admin/SKILL.md`
- Bootstrap：`.cursor/skills/open-skills-bootstrap/SKILL.md`
