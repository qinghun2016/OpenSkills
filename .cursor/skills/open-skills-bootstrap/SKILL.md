---
name: open-skills-bootstrap
description: OpenSkills self-evolution bootstrap. Agents load this first to understand propose→review→apply flow. Highest priority. (自进化机制说明，优先级最高)
triggers:
  - "OpenSkills"
  - "提议"
  - "bootstrap"
---

# OpenSkills Bootstrap

## Mechanism overview
<!-- 机制概述 -->

Flow: **Propose → Admin review → Human final review (optional) → Apply.** All improvements (add/change/delete Skill, rules, config) MUST go through this flow.
<!-- 提议 → 管理员审查 → 人类终审（可选） → 应用；任何改进均通过此流程完成。 -->

**⚠️ 强制要求：所有改进建议必须通过此流程，且必须通过 API 操作！**

- Agent **不能**直接在对话中输出改进建议
- Agent **必须**通过 API 创建 proposal 来提出改进（`POST /api/proposals`），**禁止**直接创建 `.openskills/proposals/` 下的文件
- 禁止绕过提议流程直接修改文件或输出建议
- 详见 `.cursor/rules/openskills-api-only.mdc`

**新增：Agent 自动提议机制**
- 在 `agent_only` 模式下，如果启用了 `agentAutoPropose`，Agent 创建的高质量提议可以**自动审查和应用**，无需用户确认
- 这避免了 Agent 直接编辑文件时需要用户确认的问题（peddling）
- Agent 会获得奖励分数，鼓励积极提议改进 skills 体系

## Roles
<!-- 角色 -->

| Role | Description |
|------|------|
| **Proposer** | Agent / Human / Crawler, submit improvement proposals |
| **Admin** | Agent or human, review and decide on proposals |
| **Human final review** | Optional, when adminMode is agent_then_human |

## Skill scope
<!-- Skill 级别 -->

- **User-level**: `~/.cursor/skills/` — applies globally
- **Project-level**: `<project>/.cursor/skills/` — project only; **overrides same-name user-level skill**

## Key paths
<!-- 关键路径 -->

| Path | Purpose |
|------|------|
| `.openskills/proposals/` | Pending proposals |
| `.openskills/decisions/` | Decision records |
| `.openskills/config.json` | Config (e.g. adminMode) |
| `.openskills/schemas/` | JSON Schema definitions |

## How to Propose
<!-- 如何提议 -->

**⚠️ This is the only valid way to propose improvements, and it must be done via API!**
<!-- 这是唯一合法的改进方式，且必须通过 API！ -->

Agent 在提出任何改进建议时，必须：
1. **通过 API 创建 proposal**（`POST /api/proposals`），禁止直接写 `.openskills/proposals/` 下的文件
2. 等待管理员审查
3. 根据审查结果应用或拒绝

1. 可只读读取 `.openskills/schemas/proposal.schema.json` 了解格式
2. 调用 `POST /api/proposals`，请求体包含 `skillName`、`scope`、`reason`、`diff`、`trigger`、`proposerMeta`（服务端生成 `id`）
3. 等待管理员审查（管理员通过 API 获取并决策）

## How to Act as Admin
<!-- 如何担任管理员 -->

**⚠️ Admin reviews all proposals and must operate via API; do not write files directly.**
<!-- 管理员会审查所有 proposals，且必须通过 API 操作，禁止直接写文件。 -->

If the Agent outputs suggestions without creating a proposal via API, the admin cannot review them and the suggestions will not be applied.
<!-- 如果 Agent 直接输出建议而没有通过 API 创建 proposal，管理员无法审查，建议也无法被应用。 -->

1. 读取 `.cursor/skills/skills-admin/SKILL.md`
2. 遵循其审查流程与决策规范
3. **通过 API 创建决策**：`POST /api/decisions`（body: `proposalId`、`decision`、`reason`、`decidedBy`），禁止直接写 `.openskills/decisions/`
4. 若批准且为 `agent_only`，**调用** `POST /api/decisions/{proposalId}/apply` 应用 diff，禁止直接修改 SKILL.md

## adminMode 配置

| 值 | 行为 |
|----|------|
| `human_only` | 仅人类可审查决策 |
| `agent_only` | 仅 Agent 自动审查决策（自动应用，无需用户确认） |
| `agent_then_human` | Agent 初审 → 人类终审确认 |

配置位置：`.openskills/config.json` → `adminMode` 字段

## Agent 自动提议机制

**新增功能**：Agent 可以自动创建提议并自动应用，无需用户确认。

### 配置

在 `.openskills/config.json` 中配置：

```json
{
  "adminMode": "agent_only",
  "agentAutoPropose": {
    "enabled": true,
    "qualityThreshold": {
      "minReasonLength": 20,
      "requireDiff": true
    }
  }
}
```

### 工作流程

1. **Agent 创建提议**：
   - Agent 分析 skills，发现需要改进的地方
   - **调用** `POST /api/proposals` 创建提议（禁止直接写 `.openskills/proposals/`）
   - 系统自动记录奖励（+1 分）

2. **自动质量检查**：
   - 检查提议理由长度（≥ 20 字符）
   - 检查是否有 diff 内容
   - 检查安全性（无危险代码、路径合法等）

3. **自动审查和应用**（如果质量通过）：
   - 通过 `POST /api/decisions` 创建 approve 决策
   - 通过 `POST /api/decisions/{proposalId}/apply` 应用 diff（禁止直接改文件）
   - 服务端更新 proposal 状态为 `applied`
   - 记录奖励（+5 分批准，+10 分应用）

4. **如果质量不通过**：
   - 提议保持 `pending` 状态
   - 等待 skills-admin 手动审查

### 优势

- ✅ **无需用户确认**：避免 peddling 问题
- ✅ **快速迭代**：高质量提议立即应用
- ✅ **安全可靠**：自动安全检查确保质量
- ✅ **奖励机制**：鼓励 Agent 积极提议

## Agent 奖励机制

**目的**：鼓励 Agent 积极提议，改进整个 skills 体系。

### 奖励分数

| 操作 | 分数 | 说明 |
|------|------|------|
| 创建提议 | +1 | 基础分数，鼓励提议 |
| 提议被批准 | +5 | 提议质量得到认可 |
| 提议被应用 | +10 | 提议成功应用到系统 |
| 高质量奖励 | +20 | 批准率 ≥ 80% 且应用率 ≥ 70% 的额外奖励 |

### 高质量标准

- 批准率 ≥ 80%（`config.reward.thresholds.highQuality.minApprovalRate`）
- 应用率 ≥ 70%（`config.reward.thresholds.highQuality.minAppliedRate`）
- 至少创建 5 个提议

### 查看奖励统计

通过 API 查看：

```bash
# 查看所有 Agent 统计
GET /api/rewards/stats

# 查看特定 Agent 统计
GET /api/rewards/stats?agentName=skills-admin

# 查看排行榜
GET /api/rewards/leaderboard?limit=10

# 查看奖励历史
GET /api/rewards/history?agentName=skills-admin&limit=50
```

### 配置

在 `.openskills/config.json` 中配置：

```json
{
  "reward": {
    "enabled": true,
    "scores": {
      "proposalCreated": 1,
      "proposalApproved": 5,
      "proposalApplied": 10,
      "highQualityBonus": 20
    },
    "thresholds": {
      "highQuality": {
        "minApprovalRate": 0.8,
        "minAppliedRate": 0.7
      }
    }
  }
}
```

## 快速链接

- 提议格式：`.openskills/schemas/proposal.schema.json`
- 决策格式：`.openskills/schemas/decision.schema.json`
- 管理员指南：`.cursor/skills/skills-admin/SKILL.md`
