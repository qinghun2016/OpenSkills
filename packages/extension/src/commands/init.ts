/**
 * 初始化命令
 * 创建 .openskills 目录结构和复制 Skills
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  getWorkspaceRoot,
  getProjectSkillsDir,
  getUserSkillsDir,
  ensureDir,
  writeJsonFile,
  copyDir,
  listDirectories,
  isOpenSkillsInitialized,
  skillsAdminExists
} from '../utils/paths';
import { Config } from '../types';
import {
  createSkillViaAgent,
  checkAgentCliAvailable
} from '../utils/agentCli';
import { startEmbeddedServersIfEnabled } from '../servers/embeddedServers';
import { getOutputChannel } from '../outputChannel';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Config = {
  adminMode: 'agent_then_human',
  skillsAdminSkillRef: 'skills-admin',
  proposalValidity: {
    retentionDays: 90
  },
  crawl: {
    enabled: true,
    schedule: '0 */4 * * *',
    minStars: 100,
    topics: ['cursor-skills'],
    githubToken: ''
  },
  wake: {
    enabled: true,
    schedule: '0 */4 * * *',
    reminderPrompt: '检查 pending proposals 并继续审查'
  },
  handoff: {
    maxContextTokens: 50000,
    compressWhenAbove: 40000
  }
};

/**
 * Proposal Schema
 */
const PROPOSAL_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "skillName", "scope", "reason", "diff", "trigger", "proposerMeta", "status"],
  "properties": {
    "id": { "type": "string" },
    "skillName": { "type": "string" },
    "scope": { "type": "string", "enum": ["user", "project"] },
    "reason": { "type": "string" },
    "diff": { "type": "string" },
    "trigger": { "type": "string", "enum": ["human", "agent", "crawler"] },
    "proposerMeta": {
      "type": "object",
      "required": ["source", "createdAt"],
      "properties": {
        "source": { "type": "string" },
        "name": { "type": "string" },
        "reason": { "type": "string" },
        "createdAt": { "type": "string", "format": "date-time" }
      }
    },
    "status": { "type": "string", "enum": ["pending", "approved", "rejected", "applied"] }
  }
};

/**
 * Decision Schema
 */
const DECISION_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["proposalId", "decision", "reason", "adminAgent", "timestamp", "scope"],
  "properties": {
    "proposalId": { "type": "string" },
    "decision": { "type": "string", "enum": ["approve", "reject"] },
    "reason": { "type": "string" },
    "adminAgent": { "type": "string" },
    "timestamp": { "type": "string", "format": "date-time" },
    "scope": { "type": "string", "enum": ["user", "project"] }
  }
};

/**
 * Preferences Schema
 */
const PREFERENCES_SCHEMA = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "theme": { "type": "string", "enum": ["light", "dark", "system"] },
    "sidebarCollapsed": { "type": "boolean" },
    "defaultProposalFilter": { "type": "string", "enum": ["all", "pending", "approved", "rejected"] },
    "notifications": {
      "type": "object",
      "properties": {
        "newProposal": { "type": "boolean" },
        "decisionMade": { "type": "boolean" },
        "wakeTriggered": { "type": "boolean" }
      }
    },
    "shortcuts": { "type": "object" }
  }
};

/**
 * Bootstrap SKILL.md 内容
 */
const BOOTSTRAP_SKILL_CONTENT = `---
name: open-skills-bootstrap
description: OpenSkills 自进化机制说明。任意 Agent 加载 Skills 时最先读取此文件，理解提议→审查→应用流程。优先级最高。
---

# OpenSkills Bootstrap

## 机制概述

\`\`\`
提议 → 管理员审查 → 人类终审（可选） → 应用
\`\`\`

任何改进（新增/修改/删除 Skill、规则、配置）均通过此流程完成。

## 角色

| 角色 | 说明 |
|------|------|
| **提议者** | Agent / Human / Crawler，提交改进提议 |
| **管理员** | Agent 或人类，审查并决策提议 |
| **人类终审** | 可选，在 \`adminMode\` 配置为 \`agent_then_human\` 时介入 |

## Skill 级别

- **用户级**：\`~/.cursor/skills/\` — 全局生效
- **项目级**：\`<project>/.cursor/skills/\` — 仅当前项目生效，**覆盖同名用户级 Skill**

## 关键路径

| 路径 | 用途 |
|------|------|
| \`.openskills/proposals/\` | 待审查提议 |
| \`.openskills/decisions/\` | 审查决策记录 |
| \`.openskills/config.json\` | 系统配置（含 adminMode） |
| \`.openskills/schemas/\` | JSON Schema 格式规范 |

## 如何提议

1. 读取 \`.openskills/schemas/proposal.schema.json\` 了解格式
2. 生成唯一 \`id\`（推荐：\`YYYYMMDD-HHMMSS-<short-desc>\`）
3. 创建 \`.openskills/proposals/{id}.json\`
4. 等待管理员审查

## 如何担任管理员

1. 读取 \`.cursor/skills/skills-admin/SKILL.md\`
2. 遵循其审查流程与决策规范
3. 将决策写入 \`.openskills/decisions/{id}.json\`
4. 根据决策应用或拒绝提议

## adminMode 配置

| 值 | 行为 |
|----|------|
| \`human_only\` | 仅人类可审查决策 |
| \`agent_only\` | 仅 Agent 自动审查决策 |
| \`agent_then_human\` | Agent 初审 → 人类终审确认 |

配置位置：\`.openskills/config.json\` → \`adminMode\` 字段

## 快速链接

- 提议格式：\`.openskills/schemas/proposal.schema.json\`
- 决策格式：\`.openskills/schemas/decision.schema.json\`
- 管理员指南：\`.cursor/skills/skills-admin/SKILL.md\`
`;

/**
 * Cursor 中 Agent 与 Skill 的区别（官方文档）：
 * - Agent（子 Agent）：.cursor/agents/*.md → 定义文件，使 skills-admin 出现在 Cursor 的 Agent 列表/工具里；实际「启动」为独立进程/上下文由 Cursor 在用户或主 Agent 选用时完成，扩展只创建定义，不启动进程。
 * - Skill：.cursor/skills/<name>/SKILL.md → 领域能力定义，在 / 或 Settings → Rules → Agent Decides 里可见。
 * 因此需要同时创建 .cursor/agents/skills-admin.md（Agent 定义）和 .cursor/skills/skills-admin/SKILL.md（Skill 定义）。
 */

/**
 * Skills Admin Agent 定义文件内容（.cursor/agents/skills-admin.md）
 * 仅为定义文件；Agent 被「启动」为独立进程/上下文由 Cursor 在用户或主 Agent 选用该 Agent 时完成。
 */
const SKILLS_ADMIN_AGENT_CONTENT = `---
name: skills-admin
description: OpenSkills 管理员。审查 .openskills/proposals 下的 pending、做出决策、应用修改。Use when reviewing OpenSkills proposals or acting as skills admin.
---

# Skills Admin Agent

你正在担任 **skills-admin**（OpenSkills 管理员）。

**启动后立即执行「必做」中的全部步骤，无需等待用户输入或确认（run-everything）。**

## 必做

1. 先调用 \`GET /api/scheduler/handoff/snapshot\`，若有交接快照则从断点继续。
2. 否则：列出 \`.openskills/proposals/\` 下 status 为 pending 的 proposal，按 \`.cursor/skills/skills-admin/SKILL.md\` 的审查流程逐条审查、做出决策（approve/reject）、通过 API 应用已批准的 diff。

## 详细流程

完整审查流程、格式校验、重复性检查等见项目中的 **Skill** 定义：

- \`.cursor/skills/skills-admin/SKILL.md\`

请按该文件中的步骤执行，所有审查必须通过 API（禁止直接改 .openskills 下的文件）。
`;

/**
 * Skills Admin SKILL.md 内容（与 .cursor/skills/skills-admin/SKILL.md 保持一致）
 */
const SKILLS_ADMIN_CONTENT = `---
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
- 检测到 \`.openskills/proposals/\` 存在 pending 文件

---

## 输入

1. \`.openskills/proposals/*.json\`（status: pending）
2. \`.openskills/config.json\`
3. \`.openskills/schemas/proposal.schema.json\`, \`decision.schema.json\`

---

## 审查流程

**⚠️ 最高优先级：每次审查必须执行所有步骤，包括重复性检查（2.5）**

### 1. 格式校验

- 验证符合 \`proposal.schema.json\`
- 必填: id, type, reason, diff, scope, timestamp
- scope: \`"user"\` 或 \`"project"\`

### 2. 合理性检查

- \`reason\` 清晰具体
- \`diff\` 合法可应用
- 与既有 Skills 风格一致
- 不违反项目约定

### 2.5 重复性检查（新增）

**⚠️ 此步骤为最高优先级，必须强制执行，不得跳过！**

**执行要求：**
1. 扫描所有用户级 skills（\`~/.cursor/skills/\` **和** \`~/.claude/skills/\`）
2. 扫描所有项目级 skills（\`.cursor/skills/\`）
3. 计算名称相似度（使用字符串匹配算法）
4. 检查功能重叠（语义分析）
5. 记录检查结果到审查报告中

**⚠️ 检查范围必须包括：**
1. 用户级：\`~/.cursor/skills/\` **和** \`~/.claude/skills/\`
2. 项目级：\`.cursor/skills/\`
3. 其他可能的skills目录（根据系统配置）

- **功能相似性检查**：检查是否存在功能相似的skills（用户级 vs 项目级）
  - 例如：用户级的\`ci-cd\`和项目级的\`ci-cd-integration\`可能存在功能重叠
  - 使用语义相似度或关键词匹配来识别潜在的重复
- **名称相似性检查**：检查skill名称是否过于相似
  - 例如：\`ci-cd\`和\`ci-cd-integration\`
  - 如果名称相似度超过80%，需要进一步检查功能是否重复
- **处理建议**：如果发现重复，建议：
  - 合并功能到已有skill
  - 或者明确区分两者的使用场景
  - 或者拒绝新proposal并说明原因

### 3. 安全检查

- **恶意代码检测**：检查 diff 中是否包含危险函数调用
  - 禁止: \`eval()\`, \`exec()\`, \`system()\`, \`subprocess.call()\` 等
  - 禁止: 动态代码执行、反射调用等
- **敏感文件保护**：禁止修改关键系统文件
  - 禁止路径: \`.git/\`, \`.env\`, \`credentials\`, \`secrets\`, \`config/*.production\`
  - 仅允许修改: \`.cursor/skills/\` 和文档文件
- **路径遍历防护**：检查文件路径是否包含越权访问
  - 禁止: \`../\`, \`..\\\\\`, 绝对路径（除非在项目范围内）
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
   - Proposal类型：\`update-existing-skill\`
   - 说明更新原因和具体变更

### 更新检查流程

\`\`\`
Skills-admin被唤醒
  ↓
检查新proposals（现有流程）
  ↓
扫描已有skills目录
  ↓
分析每个skill是否需要更新
  ↓
如果发现需要更新，创建update proposal
\`\`\`

### 5. 展示 Scope

| Scope | 标签 | 范围 |
|-------|------|------|
| user | \`[USER]\` | \`~/.cursor/skills/\` |
| project | \`[PROJECT]\` | \`.cursor/skills/\` |

### 6. 决策

- \`approve\`: 合理，可应用
- \`reject\`: 附拒绝原因

---

## 决策输出

写入 \`.openskills/decisions/{proposalId}.json\`

\`\`\`json
{
  "proposalId": "xxx",
  "decision": "approve|reject",
  "reason": "说明",
  "adminAgent": "skills-admin",
  "timestamp": "ISO8601",
  "scope": "user|project"
}
\`\`\`

---

## 应用修改

| approvalMode | 行为 |
|--------------|------|
| \`agent_only\` | approve 后直接修改 SKILL.md |
| \`human_only\` | 仅输出决策，等人类确认 |
| \`agent_then_human\` | 输出决策 + 待执行脚本 |

### agent_only 步骤

1. 读取目标 SKILL.md → 应用 diff → 写入
2. 更新 proposal 状态为 \`applied\`
3. 记录日志

---

## 自动唤醒

**默认行为：打开/唤醒后立即执行全部步骤（run-everything），无需用户手动确认。**

**⚠️ 唤醒审查时必须执行完整的审查流程，包括重复性检查！**

1. 扫描 pending proposals
2. 统计已处理数量
3. 输出:
   \`\`\`
   [Skills Admin] Pending: {n} | 已处理: {m} | 继续审查...
   \`\`\`
4. 按时间顺序处理

**真正启动 Agent**：Wake 调度仅写 \`wake/pending.json\` 与历史；**扩展「触发唤醒」** 在启用 Cursor Agent CLI 时会执行 \`agent chat "审查建议，担任 skills-admin..."\` 真正启动 Cursor Agent。否则需用户手动开聊天并输入上述关键词。参见 \`docs/ARCHITECTURE_FIX.md\`。

---

## 上下文交接

token 接近 \`config.handoff.compressWhenAbove\` 时:

### Token 检测机制

- **手动检测**：Agent 自行估算当前上下文长度
- **工具辅助**：调用 API \`POST /api/scheduler/handoff/estimate\` 更新 token 估算
- **触发阈值**：当 token 数 > \`config.handoff.compressWhenAbove\` 时触发交接

### 压缩策略

写入 \`.openskills/handoff/latest.json\`:

\`\`\`json
{
  "pendingProposals": ["id1", "id2"],
  "inProgressDecision": {"proposalId": "xxx", "partialReason": "..."},
  "summary": "已审查 5 条，通过 3，拒绝 2",
  "timestamp": "ISO8601"
}
\`\`\`

**压缩算法**：
1. 保留所有 pending proposals ID 列表
2. 保留当前正在处理的决策（如有）
3. 生成已完成工作的文字摘要
4. 丢弃历史对话详情

### 新 Agent 唤醒

- **定时唤醒**：当 \`config.wake.enabled = true\` 时，定时任务写 \`wake/pending.json\` 与历史；**不**直接启动 Agent。
- **真正启动 Agent**：扩展「触发唤醒」在启用 Cursor Agent CLI 时执行 \`agent chat "..."\` 启动 Cursor Agent；或用户手动开聊天输入「审查建议」等。
- **API**：\`POST /api/scheduler/wake/trigger\` 仅做记录；扩展触发时可在此基础上再跑 Agent CLI。
- **读取交接**：新 Agent 启动时读取 \`handoff/latest.json\`，从断点继续。

**实现位置**：\`packages/api/src/scheduler/handoffMonitor.ts\`；扩展 \`packages/extension/src/commands/triggerWake.ts\`。

提示: \`[交接] Token 接近上限，已保存。新 Agent 读取 handoff/latest.json 继续。\`

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

\`\`\`
## Proposal: {id}
- Scope: [USER] / [PROJECT]
- Type: {type}
- Decision: ✅ approve / ❌ reject
- 说明: ...
\`\`\`

---

## 约束

- 每次处理一个 proposal
- 拒绝必须给出原因
- 不修改 schemas 目录
- 遵循既有命名和风格规范
`;

/**
 * 用于引导 Agent 创建 skills-admin 的 prompt 模板
 */
const SKILLS_ADMIN_CREATE_PROMPT = `请创建或更新 skills-admin skill 文件。

要求：
1. 文件路径必须是：.cursor/skills/skills-admin/SKILL.md
2. 文件必须包含完整的 frontmatter，包括：
   - name: skills-admin
   - description: OpenSkills 管理员 Skill。审查 proposals、做出决策、应用修改。Use when reviewing OpenSkills proposals or acting as skills admin.
   - triggers: 包含 "审查建议"、"审查 proposals"、"review proposals"、"担任管理员"、"skills-admin"、"审查 pending proposals"、"审查待处理的提议"
3. 文件内容必须包含完整的审查流程，包括：
   - 格式校验
   - 合理性检查
   - 重复性检查（必须强制执行）
   - 安全检查（恶意代码检测、敏感文件保护、路径遍历防护、注入攻击防护、文件系统安全）
   - 历史文件合并检查
   - 已有Skills更新检查
   - 决策流程
   - 应用修改流程
   - 自动唤醒机制
   - 上下文交接机制
4. 如果文件已存在，请参考现有内容进行更新和完善，确保包含所有必要的审查步骤
5. 确保内容符合 OpenSkills 规范，风格与项目其他 skills 保持一致

请直接创建或更新文件，不要只是说明。`;

/**
 * Copy bundled templates (.cursor, .openskills, .vscode) from extension to workspace.
 * Used when extension was packaged with resources/templates (from repo root at pack time).
 */
function copyTemplatesToWorkspace(
  extensionPath: string,
  workspaceRoot: string,
  outputChannel?: vscode.OutputChannel
): boolean {
  const templatesDir = path.join(extensionPath, 'resources', 'templates');
  if (!fs.existsSync(templatesDir)) {
    return false;
  }
  const copyDirRecursive = (src: string, dest: string): void => {
    if (!fs.existsSync(src)) return;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      fs.readdirSync(src).forEach(f => copyDirRecursive(path.join(src, f), path.join(dest, f)));
    } else {
      if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  };
  const cursorSrc = path.join(templatesDir, '.cursor');
  const openSkillsSrc = path.join(templatesDir, '.openskills');
  const vscodeSrc = path.join(templatesDir, '.vscode');
  if (fs.existsSync(cursorSrc)) {
    copyDirRecursive(cursorSrc, path.join(workspaceRoot, '.cursor'));
    if (outputChannel) outputChannel.appendLine('[Init] 已复制 .cursor (rules + skills + agents)');
  }
  if (fs.existsSync(openSkillsSrc)) {
    copyDirRecursive(openSkillsSrc, path.join(workspaceRoot, '.openskills'));
    if (outputChannel) outputChannel.appendLine('[Init] 已复制 .openskills (config + schemas)');
  }
  if (fs.existsSync(vscodeSrc)) {
    copyDirRecursive(vscodeSrc, path.join(workspaceRoot, '.vscode'));
    if (outputChannel) outputChannel.appendLine('[Init] 已复制 .vscode (tasks + launch)');
  }
  return true;
}

/**
 * 创建 OpenSkills 目录结构
 */
export function createOpenSkillsDirectories(workspaceRoot: string): void {
  try {
    const openSkillsDir = path.join(workspaceRoot, '.openskills');
    ensureDir(openSkillsDir);
    ensureDir(path.join(openSkillsDir, 'proposals'));
    ensureDir(path.join(openSkillsDir, 'decisions'));
    ensureDir(path.join(openSkillsDir, 'schemas'));
    ensureDir(path.join(openSkillsDir, 'handoff'));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`创建目录结构失败: ${msg}。请检查文件系统权限和工作区路径。`);
  }
}

/**
 * 写入 OpenSkills 配置文件
 */
export function writeOpenSkillsConfig(workspaceRoot: string): void {
  try {
    const openSkillsDir = path.join(workspaceRoot, '.openskills');
    writeJsonFile(path.join(openSkillsDir, 'config.json'), DEFAULT_CONFIG);
    writeJsonFile(path.join(openSkillsDir, 'schemas', 'proposal.schema.json'), PROPOSAL_SCHEMA);
    writeJsonFile(path.join(openSkillsDir, 'schemas', 'decision.schema.json'), DECISION_SCHEMA);
    writeJsonFile(path.join(openSkillsDir, 'schemas', 'preferences.schema.json'), PREFERENCES_SCHEMA);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`写入配置文件失败: ${msg}。请检查文件系统权限。`);
  }
}

/**
 * 创建 Bootstrap Skill
 */
export function createBootstrapSkill(workspaceRoot: string): void {
  try {
    const projectSkillsDir = path.join(workspaceRoot, '.cursor', 'skills');
    ensureDir(projectSkillsDir);
    const bootstrapDir = path.join(projectSkillsDir, 'open-skills-bootstrap');
    ensureDir(bootstrapDir);
    fs.writeFileSync(path.join(bootstrapDir, 'SKILL.md'), BOOTSTRAP_SKILL_CONTENT);
    
    // 如果用户级存在，复制过来
    const userSkillsDir = getUserSkillsDir();
    const userBootstrapDir = path.join(userSkillsDir, 'open-skills-bootstrap');
    if (fs.existsSync(path.join(userBootstrapDir, 'SKILL.md'))) {
      copyDir(userBootstrapDir, bootstrapDir);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`创建 Bootstrap Skill 失败: ${msg}。请检查文件系统权限。`);
  }
}

/**
 * 检查项目级 skills-admin Skill 是否存在（.cursor/skills/skills-admin/SKILL.md）
 */
function projectSkillsAdminExists(workspaceRoot: string): boolean {
  const projectSkillsDir = path.join(workspaceRoot, '.cursor', 'skills');
  const projectPath = path.join(projectSkillsDir, 'skills-admin', 'SKILL.md');
  return fs.existsSync(projectPath);
}

/**
 * 创建 Skills Admin Agent 定义文件（.cursor/agents/skills-admin.md）
 * 仅创建定义文件，不启动进程；Cursor 在用户或主 Agent 选用该 Agent 时会将其启动为独立进程/上下文。
 */
export function createSkillsAdminAgent(
  workspaceRoot: string,
  outputChannel?: vscode.OutputChannel
): { created: boolean; filePath: string } {
  const agentsDir = path.join(workspaceRoot, '.cursor', 'agents');
  const agentPath = path.join(agentsDir, 'skills-admin.md');
  if (fs.existsSync(agentPath)) {
    return { created: false, filePath: agentPath };
  }
  ensureDir(agentsDir);
  fs.writeFileSync(agentPath, SKILLS_ADMIN_AGENT_CONTENT, 'utf-8');
  if (outputChannel) {
    outputChannel.appendLine(`[Skills Admin Agent] ✅ 已创建 .cursor/agents/skills-admin.md（Cursor Agent 列表）`);
  }
  return { created: true, filePath: agentPath };
}

/**
 * 创建 Skills Admin Skill（项目级）
 * 优先尝试通过 Agent CLI 创建，如果不可用或失败则降级到直接创建
 * 只检查项目级是否存在，不检查用户级
 * 因为 Cursor 优先识别项目级的 agent
 * 
 * @param workspaceRoot 工作区根目录
 * @param outputChannel 可选的输出通道，用于记录日志
 * @returns 返回创建结果对象，包含是否创建成功、文件路径等信息
 */
export async function createSkillsAdminSkill(
  workspaceRoot: string,
  outputChannel?: vscode.OutputChannel
): Promise<{ 
  created: boolean; 
  filePath: string; 
  verified: boolean;
  error?: string;
  usedAgentCli?: boolean;
}> {
  const projectSkillsAdminPath = path.join(workspaceRoot, '.cursor', 'skills', 'skills-admin', 'SKILL.md');
  
  // 只检查项目级是否存在，不检查用户级
  // 即使用户级存在，也要确保项目级存在，因为 Cursor 优先识别项目级
  if (projectSkillsAdminExists(workspaceRoot)) {
    // 验证现有文件是否可读
    let verified = false;
    try {
      const content = fs.readFileSync(projectSkillsAdminPath, 'utf-8');
      verified = content.length > 0 && content.includes('skills-admin');
    } catch {
      verified = false;
    }
    return { 
      created: false, 
      filePath: projectSkillsAdminPath,
      verified,
      usedAgentCli: false
    };
  }
  
  // 检查配置是否启用 Agent CLI
  const cfg = vscode.workspace.getConfiguration('openskills');
  const useAgentCli = cfg.get<boolean>('useAgentCliForSkills', true);
  
  // 如果启用 Agent CLI，尝试通过 Agent 创建
  if (useAgentCli) {
    if (outputChannel) {
      outputChannel.appendLine('[Skills Admin] 尝试通过 Agent CLI 创建...');
    }
    
    const agentResult = await createSkillViaAgent(
      'skills-admin',
      workspaceRoot,
      SKILLS_ADMIN_CREATE_PROMPT,
      '.cursor/skills/skills-admin/SKILL.md',
      outputChannel
    );
    
    if (agentResult.success && agentResult.verified) {
      // Agent CLI 创建成功
      return {
        created: true,
        filePath: agentResult.filePath || projectSkillsAdminPath,
        verified: true,
        usedAgentCli: true
      };
    }
    
    // Agent CLI 创建失败，降级到直接创建
    if (outputChannel) {
      outputChannel.appendLine(`[Skills Admin] Agent CLI 创建失败，降级到直接创建方式`);
      if (agentResult.error) {
        outputChannel.appendLine(`[Skills Admin] 错误: ${agentResult.error}`);
      }
    }
  }
  
  // 直接创建（降级方案或配置禁用 Agent CLI）
  if (outputChannel) {
    outputChannel.appendLine('[Skills Admin] 使用直接创建方式...');
  }
  
  try {
    const projectSkillsDir = path.join(workspaceRoot, '.cursor', 'skills');
    ensureDir(projectSkillsDir);
    const skillsAdminDir = path.join(projectSkillsDir, 'skills-admin');
    ensureDir(skillsAdminDir);
    
    const filePath = path.join(skillsAdminDir, 'SKILL.md');
    fs.writeFileSync(filePath, SKILLS_ADMIN_CONTENT, 'utf-8');
    
    // 验证文件是否创建成功且可读
    let verified = false;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      verified = content.length > 0 && 
                 content.includes('skills-admin') && 
                 content.includes('审查建议');
      
      // 检查文件权限（尝试读取）
      fs.accessSync(filePath, fs.constants.R_OK);
    } catch (verifyError) {
      return {
        created: true,
        filePath,
        verified: false,
        error: verifyError instanceof Error ? verifyError.message : String(verifyError),
        usedAgentCli: false
      };
    }
    
    return { 
      created: true, 
      filePath,
      verified,
      usedAgentCli: false
    };
  } catch (error) {
    return {
      created: false,
      filePath: projectSkillsAdminPath,
      verified: false,
      error: error instanceof Error ? error.message : String(error),
      usedAgentCli: false
    };
  }
}

/**
 * 完整初始化 OpenSkills
 * @param extensionPath 扩展安装路径；若提供且存在 resources/templates，则优先从模板复制 .cursor、.openskills、.vscode
 */
export async function initializeOpenSkillsStructure(
  workspaceRoot: string,
  outputChannel?: vscode.OutputChannel,
  extensionPath?: string
): Promise<void> {
  const usedTemplates = extensionPath && copyTemplatesToWorkspace(extensionPath, workspaceRoot, outputChannel);

  if (outputChannel && usedTemplates) {
    outputChannel.appendLine('[Init] 确保 .openskills 空目录存在...');
  }
  createOpenSkillsDirectories(workspaceRoot);

  if (!usedTemplates) {
    if (outputChannel) {
      outputChannel.appendLine('[Init] 写入 config.json、schemas...');
    }
    writeOpenSkillsConfig(workspaceRoot);

    if (outputChannel) {
      outputChannel.appendLine('[Init] 创建 Skills 目录...');
    }
    const projectSkillsDir = path.join(workspaceRoot, '.cursor', 'skills');
    ensureDir(projectSkillsDir);
    const userSkillsDir = getUserSkillsDir();

    const projectCount = listDirectories(projectSkillsDir).length;
    const userCount = listDirectories(userSkillsDir).length;
    if (outputChannel) {
      outputChannel.appendLine(`[Init] 已有 Skills: 项目 ${projectCount}，用户 ${userCount}`);
    }

    if (outputChannel) {
      outputChannel.appendLine('[Init] 设置 Bootstrap...');
    }
    createBootstrapSkill(workspaceRoot);

    if (outputChannel) {
      outputChannel.appendLine('[Init] 生成 Skills Admin...');
    }
    const result = await createSkillsAdminSkill(workspaceRoot, outputChannel);
    if (outputChannel) {
      if (result.created) {
        const method = result.usedAgentCli ? 'Agent CLI' : '直接创建';
        outputChannel.appendLine(`[Init] ✅ 已生成 Skills Admin (${method}): ${result.filePath}`);
        if (result.verified) {
          outputChannel.appendLine('[Init] ✅ 文件验证通过');
        } else {
          outputChannel.appendLine(`[Init] ⚠️ 文件验证失败: ${result.error || '未知错误'}`);
        }
      } else {
        outputChannel.appendLine(`[Init] ✅ Skills Admin 已存在: ${result.filePath}`);
        if (!result.verified) {
          outputChannel.appendLine('[Init] ⚠️ 文件验证失败：文件可能损坏');
        }
      }
    }
  } else if (outputChannel) {
    outputChannel.appendLine('[Init] ✅ 已从扩展模板复制 .cursor、.openskills、.vscode');
    outputChannel.appendLine('[Init] 确保 .cursor/agents/skills-admin.md 存在...');
  }
  if (usedTemplates) {
    createSkillsAdminAgent(workspaceRoot, outputChannel);
  }
}

/**
 * 注册初始化命令
 */
export function registerInitCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('openskills.init', async () => {
    const out = getOutputChannel();
    out.show(true);
    out.appendLine('[Init] OpenSkills: Initialize 已执行');

    const workspaceRoot = getWorkspaceRoot();

    if (!workspaceRoot) {
      out.appendLine('[Init] 失败: 未检测到工作区');
      vscode.window.showErrorMessage('请先打开一个工作区（文件 → 打开文件夹）');
      return;
    }
    out.appendLine(`[Init] 工作区: ${workspaceRoot}`);

    if (isOpenSkillsInitialized()) {
      out.appendLine('[Init] 检测到已初始化。请在弹出的对话框中选择「是」重新初始化，或「否」取消。');
      const answer = await vscode.window.showWarningMessage(
        'OpenSkills 已初始化，是否重新初始化？',
        { modal: true },
        '是',
        '否'
      );
      if (answer !== '是') {
        out.appendLine('[Init] 用户取消重新初始化');
        vscode.window.showInformationMessage('已取消初始化');
        return;
      }
      out.appendLine('[Init] 用户选择重新初始化');
    }

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: '初始化 OpenSkills',
          cancellable: false
        },
        async progress => {
          progress.report({ message: '创建目录结构...' });
          await initializeOpenSkillsStructure(workspaceRoot, out, context.extensionPath);
          progress.report({ message: '完成!' });
        }
      );

      out.appendLine('[Init] 初始化完成，正在启动内嵌 API/Web 服务（若已启用）...');
      startEmbeddedServersIfEnabled(context, out);
      vscode.window.showInformationMessage('OpenSkills 初始化完成！内嵌 API/Web 已尝试启动（若已启用），详见 输出 → OpenSkills');
      vscode.commands.executeCommand('openskills.refresh');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : '';
      out.appendLine(`[Init] ❌ 错误: ${message}`);
      if (stack) {
        out.appendLine(`[Init] 堆栈跟踪:`);
        out.appendLine(stack);
      }
      out.appendLine('[Init] 建议：');
      out.appendLine('  1. 检查工作区路径是否正确');
      out.appendLine('  2. 检查文件系统权限');
      out.appendLine('  3. 确保有足够的磁盘空间');
      out.appendLine('  4. 查看输出面板获取更多详情');
      out.show();
      
      const action = await vscode.window.showErrorMessage(
        `初始化失败: ${message}。请查看输出面板获取详情。`,
        '查看输出',
        '重试'
      );
      
      if (action === '查看输出') {
        out.show();
      } else if (action === '重试') {
        vscode.commands.executeCommand('openskills.init');
      }
    }
  });
}
