/**
 * OpenSkills 项目初始化脚本
 * 在新项目中初始化 OpenSkills 所需的目录结构和配置文件
 *
 * 使用方法：
 *   npx ts-node scripts/init-project.ts [project-path]
 *
 * 如果不提供 project-path，将在当前目录初始化
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message: string): void {
  log(`✓ ${message}`, colors.green);
}

function info(message: string): void {
  log(`ℹ ${message}`, colors.blue);
}

function warn(message: string): void {
  log(`⚠ ${message}`, colors.yellow);
}

function error(message: string): void {
  log(`✗ ${message}`, colors.red);
}

// 默认配置
const DEFAULT_CONFIG = {
  adminMode: 'agent_then_human',
  skillsAdminSkillRef: 'skills-admin',
  proposalValidity: {
    retentionDays: 90,
  },
  crawl: {
    enabled: true,
    schedule: '0 */4 * * *',
    minStars: 100,
    topics: ['cursor-skills'],
    githubToken: '',
  },
  wake: {
    enabled: true,
    schedule: '0 */4 * * *',
    reminderPrompt: '检查 pending proposals 并继续审查',
  },
  handoff: {
    maxContextTokens: 50000,
    compressWhenAbove: 40000,
  },
};

// Proposal Schema
const PROPOSAL_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://openskills.dev/schemas/proposal.schema.json',
  title: 'Proposal',
  description: '定义技能提案的结构',
  type: 'object',
  required: ['id', 'skillName', 'scope', 'reason', 'diff', 'status'],
  properties: {
    id: { type: 'string', description: '提案唯一标识符' },
    skillName: { type: 'string', minLength: 1, description: '技能名称' },
    scope: { type: 'string', enum: ['user', 'project'], description: '技能作用域' },
    reason: { type: 'string', maxLength: 500, description: '提案理由' },
    diff: { type: 'string', description: '变更内容 (unified diff)' },
    trigger: { type: 'string', description: '触发来源' },
    proposerMeta: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['agent', 'human', 'crawler'] },
        repo: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    status: { type: 'string', enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  },
};

// Decision Schema
const DECISION_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://openskills.dev/schemas/decision.schema.json',
  title: 'Decision',
  description: '定义决策的结构',
  type: 'object',
  required: ['proposalId', 'decision', 'reason', 'decidedBy', 'decidedAt'],
  properties: {
    proposalId: { type: 'string', description: '关联的提案 ID' },
    decision: { type: 'string', enum: ['approve', 'reject'], description: '决策结果' },
    reason: { type: 'string', description: '决策理由' },
    decidedBy: { type: 'string', description: '决策者' },
    decidedAt: { type: 'string', format: 'date-time', description: '决策时间' },
    appliedAt: { type: 'string', format: 'date-time', description: '应用时间' },
  },
};

// Preferences Schema
const PREFERENCES_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://openskills.dev/schemas/preferences.schema.json',
  title: 'Preferences',
  description: '用户偏好设置',
  type: 'object',
  properties: {
    theme: { type: 'string', enum: ['light', 'dark', 'system'], default: 'system' },
    sidebarCollapsed: { type: 'boolean', default: false },
    defaultProposalFilter: { type: 'string', enum: ['all', 'pending', 'approved', 'rejected'] },
    notifications: {
      type: 'object',
      properties: {
        newProposal: { type: 'boolean', default: true },
        decisionMade: { type: 'boolean', default: true },
        wakeTriggered: { type: 'boolean', default: false },
      },
    },
  },
};

// Bootstrap Skill 内容
const BOOTSTRAP_SKILL = `---
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

// Skills Admin Skill 内容
const SKILLS_ADMIN_SKILL = `---
name: skills-admin
description: OpenSkills 管理员 Skill。审查 proposals、做出决策、应用修改。Use when reviewing OpenSkills proposals or acting as skills admin.
---

# Skills Admin

作为 OpenSkills 管理员，你负责审查提议、做出决策、应用或拒绝变更。

## 审查流程

### 1. 检查待审查提议

\`\`\`bash
# 列出所有待审查提议
ls .openskills/proposals/
\`\`\`

或通过 API：

\`\`\`bash
curl http://localhost:<API_PORT>/api/proposals?status=pending
\`\`\`

### 2. 审查提议内容

对于每个提议，检查：

- **skillName**：目标技能名称是否正确
- **scope**：作用域是否合适（user/project）
- **reason**：提议理由是否充分
- **diff**：变更内容是否合理

### 3. 做出决策

\`\`\`json
{
  "proposalId": "<proposal-id>",
  "decision": "approve",  // 或 "reject"
  "reason": "审查通过，变更符合规范",
  "decidedBy": "agent"  // 或 "human"
}
\`\`\`

### 4. 应用变更

如果决策为 \`approve\`，调用 API 应用变更：

\`\`\`bash
curl -X POST http://localhost:<API_PORT>/api/decisions/<proposal-id>/apply
\`\`\`

## 审查标准

### 批准条件

- ✓ 变更内容清晰、有意义
- ✓ Diff 格式正确，可以应用
- ✓ 不引入安全风险
- ✓ 符合项目编码规范
- ✓ 提议理由充分

### 拒绝条件

- ✗ 变更内容模糊或无意义
- ✗ Diff 格式错误或无法应用
- ✗ 可能引入安全风险
- ✗ 违反项目规范
- ✗ 提议理由不充分

## 回滚操作

如果需要回滚已应用的变更：

1. 查找历史记录：\`GET /api/history\`
2. 检查是否可回滚：\`GET /api/history/<id>/can-rollback\`
3. 执行回滚：\`POST /api/history/<id>/rollback\`

## 自动唤醒

当 \`wake.enabled\` 为 true 时，系统会按 \`wake.schedule\` 定时提醒你审查待处理提议。

## API 端点参考

| 端点 | 说明 |
|------|------|
| \`GET /api/proposals?status=pending\` | 获取待审查提议 |
| \`POST /api/decisions\` | 创建决策 |
| \`POST /api/decisions/:id/apply\` | 应用决策 |
| \`GET /api/history\` | 获取变更历史 |
| \`POST /api/history/:id/rollback\` | 回滚变更 |
`;

// 辅助函数
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath: string, data: object): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function writeText(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// 主初始化函数
async function initProject(projectPath: string): Promise<void> {
  log('\n╔════════════════════════════════════════════════════╗', colors.cyan);
  log('║       OpenSkills 项目初始化脚本                     ║', colors.cyan);
  log('╚════════════════════════════════════════════════════╝', colors.cyan);

  info(`\n目标目录: ${projectPath}\n`);

  // 检查目录是否存在
  if (!(await exists(projectPath))) {
    error(`目录不存在: ${projectPath}`);
    const create = await prompt('是否创建此目录？(y/n) ');
    if (create.toLowerCase() === 'y') {
      await ensureDir(projectPath);
      success('目录已创建');
    } else {
      error('初始化已取消');
      process.exit(1);
    }
  }

  // 定义路径
  const openskillsDir = path.join(projectPath, '.openskills');
  const proposalsDir = path.join(openskillsDir, 'proposals');
  const decisionsDir = path.join(openskillsDir, 'decisions');
  const historyDir = path.join(openskillsDir, 'history');
  const backupsDir = path.join(historyDir, 'backups');
  const schemasDir = path.join(openskillsDir, 'schemas');
  const cursorDir = path.join(projectPath, '.cursor');
  const skillsDir = path.join(cursorDir, 'skills');
  const bootstrapDir = path.join(skillsDir, 'open-skills-bootstrap');
  const adminDir = path.join(skillsDir, 'skills-admin');

  // 检查是否已初始化
  if (await exists(openskillsDir)) {
    warn('.openskills 目录已存在');
    const overwrite = await prompt('是否覆盖现有配置？(y/n) ');
    if (overwrite.toLowerCase() !== 'y') {
      info('保留现有配置');
    }
  }

  info('\n开始初始化...\n');

  // 步骤 1: 创建目录结构
  log('步骤 1: 创建目录结构', colors.blue);
  
  await ensureDir(proposalsDir);
  success('创建 .openskills/proposals/');
  
  await ensureDir(decisionsDir);
  success('创建 .openskills/decisions/');
  
  await ensureDir(backupsDir);
  success('创建 .openskills/history/backups/');
  
  await ensureDir(schemasDir);
  success('创建 .openskills/schemas/');
  
  await ensureDir(bootstrapDir);
  success('创建 .cursor/skills/open-skills-bootstrap/');
  
  await ensureDir(adminDir);
  success('创建 .cursor/skills/skills-admin/');

  // 步骤 2: 写入配置文件
  log('\n步骤 2: 写入配置文件', colors.blue);

  const configPath = path.join(openskillsDir, 'config.json');
  await writeJson(configPath, DEFAULT_CONFIG);
  success('写入 .openskills/config.json');

  // 步骤 3: 写入 Schemas
  log('\n步骤 3: 写入 Schemas', colors.blue);

  await writeJson(path.join(schemasDir, 'proposal.schema.json'), PROPOSAL_SCHEMA);
  success('写入 proposal.schema.json');

  await writeJson(path.join(schemasDir, 'decision.schema.json'), DECISION_SCHEMA);
  success('写入 decision.schema.json');

  await writeJson(path.join(schemasDir, 'preferences.schema.json'), PREFERENCES_SCHEMA);
  success('写入 preferences.schema.json');

  // 步骤 4: 写入 Bootstrap Skill
  log('\n步骤 4: 创建 Bootstrap Skill', colors.blue);

  await writeText(path.join(bootstrapDir, 'SKILL.md'), BOOTSTRAP_SKILL);
  success('写入 open-skills-bootstrap/SKILL.md');

  // 步骤 5: 写入 Skills Admin Skill
  log('\n步骤 5: 创建 Skills Admin Skill', colors.blue);

  await writeText(path.join(adminDir, 'SKILL.md'), SKILLS_ADMIN_SKILL);
  success('写入 skills-admin/SKILL.md');

  // 步骤 6: 创建 .gitignore 条目建议
  log('\n步骤 6: .gitignore 建议', colors.blue);
  info('建议将以下内容添加到 .gitignore：');
  console.log(`
# OpenSkills
.openskills/history/backups/
`);

  // 完成
  log('\n╔════════════════════════════════════════════════════╗', colors.green);
  log('║            初始化完成！                             ║', colors.green);
  log('╚════════════════════════════════════════════════════╝', colors.green);

  info('\n创建的文件和目录：');
  console.log(`
  ${projectPath}/
  ├── .openskills/
  │   ├── config.json
  │   ├── proposals/
  │   ├── decisions/
  │   ├── history/
  │   │   └── backups/
  │   └── schemas/
  │       ├── proposal.schema.json
  │       ├── decision.schema.json
  │       └── preferences.schema.json
  └── .cursor/
      └── skills/
          ├── open-skills-bootstrap/
          │   └── SKILL.md
          └── skills-admin/
              └── SKILL.md
`);

  info('下一步：');
  console.log(`
  1. 启动 API 服务: npm run dev:api
  2. 启动 Web 界面: npm run dev:web
  3. 安装 VS Code 插件（可选）
`);
}

// 运行初始化
const args = process.argv.slice(2);
const targetPath = args[0] ? path.resolve(args[0]) : process.cwd();

initProject(targetPath).catch((err) => {
  error(`初始化失败: ${err.message}`);
  process.exit(1);
});
