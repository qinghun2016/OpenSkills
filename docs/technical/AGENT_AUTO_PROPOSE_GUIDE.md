# Agent 自动提议机制指南

## 概述

Agent 自动提议机制允许 Agent 在 `agent_only` 模式下自动创建、审查和应用高质量的提议，**无需用户确认**，从而避免 peddling 问题。

同时，系统提供奖励机制，鼓励 Agent 积极提议改进整个 skills 体系。

## 功能特性

### 1. 自动提议创建和应用

- ✅ **无需用户确认**：Agent 创建的高质量提议可以自动审查和应用
- ✅ **快速迭代**：高质量提议立即生效，无需等待
- ✅ **安全可靠**：自动安全检查确保提议质量
- ✅ **避免 Peddling**：不再需要用户确认文件编辑

### 2. 奖励机制

- ✅ **分数系统**：Agent 通过创建、批准、应用提议获得分数
- ✅ **高质量奖励**：达到高质量标准的 Agent 获得额外奖励
- ✅ **排行榜**：可以查看 Agent 贡献排行榜
- ✅ **历史记录**：所有奖励记录都有完整历史

## 配置

### 基本配置

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
  },
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

### 配置说明

#### agentAutoPropose

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | boolean | 是否启用自动提议机制 |
| `qualityThreshold.minReasonLength` | number | 提议理由最小长度（默认：20） |
| `qualityThreshold.requireDiff` | boolean | 是否要求必须有 diff（默认：true） |

#### reward

| 字段 | 类型 | 说明 |
|------|------|------|
| `enabled` | boolean | 是否启用奖励机制 |
| `scores.proposalCreated` | number | 创建提议的基础分数（默认：1） |
| `scores.proposalApproved` | number | 提议被批准时的分数（默认：5） |
| `scores.proposalApplied` | number | 提议被应用时的分数（默认：10） |
| `scores.highQualityBonus` | number | 高质量提议的额外奖励（默认：20） |
| `thresholds.highQuality.minApprovalRate` | number | 高质量的最低批准率（0-1，默认：0.8） |
| `thresholds.highQuality.minAppliedRate` | number | 高质量的最低应用率（0-1，默认：0.7） |

## 工作流程

### Agent 创建提议

1. **Agent 分析 skills**：
   - 扫描所有 skills 目录
   - 识别需要改进的地方
   - 生成改进方案

2. **创建 Proposal**：
   ```json
   {
     "id": "20260126-120000-update-skill-name",
     "skillName": "skill-name",
     "scope": "project",
     "reason": "详细说明更新原因...",
     "diff": "unified diff 格式的变更内容",
     "trigger": "agent",
     "proposerMeta": {
       "source": "agent",
       "name": "skills-admin",
       "reason": "自动检测到需要更新",
       "createdAt": "2026-01-26T12:00:00.000Z"
     },
     "status": "pending"
   }
   ```

3. **自动质量检查**：
   - ✅ 提议理由长度 ≥ `minReasonLength`
   - ✅ 包含 diff 内容（如果 `requireDiff: true`）
   - ✅ 安全检查：无危险代码、路径合法等
   - ✅ 只修改 Skills 目录

4. **自动审查和应用**（如果质量通过）：
   - 自动创建 approve 决策
   - 自动应用 diff 到目标文件
   - 更新 proposal 状态为 `applied`
   - 记录奖励分数

5. **如果质量不通过**：
   - 提议保持 `pending` 状态
   - 等待 skills-admin 手动审查

## 奖励系统

### 奖励分数

| 操作 | 分数 | 说明 |
|------|------|------|
| 创建提议 | +1 | 基础分数，鼓励提议 |
| 提议被批准 | +5 | 提议质量得到认可 |
| 提议被应用 | +10 | 提议成功应用到系统 |
| 高质量奖励 | +20 | 批准率 ≥ 80% 且应用率 ≥ 70% 的额外奖励 |

### 高质量标准

Agent 需要满足以下条件才能获得高质量奖励：

- **批准率** ≥ 80%（`config.reward.thresholds.highQuality.minApprovalRate`）
- **应用率** ≥ 70%（`config.reward.thresholds.highQuality.minAppliedRate`）
- **至少创建 5 个提议**

### 查看奖励统计

#### API 端点

```bash
# 查看所有 Agent 统计
GET /api/rewards/stats

# 查看特定 Agent 统计
GET /api/rewards/stats?agentName=skills-admin

# 查看排行榜（Top 10）
GET /api/rewards/leaderboard?limit=10

# 查看奖励历史
GET /api/rewards/history?agentName=skills-admin&limit=50
```

#### 响应示例

**Agent 统计**：
```json
{
  "success": true,
  "data": {
    "agentName": "skills-admin",
    "proposalsCreated": 10,
    "proposalsApproved": 9,
    "proposalsRejected": 1,
    "proposalsApplied": 8,
    "totalScore": 89,
    "lastProposalAt": "2026-01-26T12:00:00.000Z"
  }
}
```

**排行榜**：
```json
{
  "success": true,
  "data": [
    {
      "agentName": "skills-admin",
      "totalScore": 89,
      "proposalsCreated": 10,
      "proposalsApplied": 8
    },
    {
      "agentName": "skill-proposer",
      "totalScore": 45,
      "proposalsCreated": 5,
      "proposalsApplied": 4
    }
  ]
}
```

## 使用场景

### 场景 1：Agent 自动改进 Skills

1. Agent 扫描 skills 目录
2. 发现需要更新的 skill
3. 创建更新 proposal
4. 系统自动审查（质量检查）
5. 如果通过，自动应用
6. Agent 获得奖励分数

### 场景 2：技能自进化

1. `skill-proposer` 定期分析 skills
2. 识别改进机会
3. 自动创建 proposals
4. 系统自动审查和应用
5. Skills 体系持续改进

## 优势

### 1. 避免 Peddling

- **问题**：Agent 直接编辑文件时，Cursor 会要求用户确认
- **解决**：通过自动提议机制，Agent 通过 API 创建和应用提议，无需用户确认

### 2. 快速迭代

- 高质量提议立即应用
- 无需等待人工审查
- 系统持续自我改进

### 3. 安全可靠

- 自动安全检查
- 只允许修改 Skills 目录
- 防止恶意代码和路径遍历

### 4. 激励机制

- 奖励分数鼓励 Agent 积极提议
- 高质量奖励鼓励提高提议质量
- 排行榜展示 Agent 贡献

## 注意事项

### 1. 质量阈值

- 确保 `minReasonLength` 足够长，避免低质量提议
- 确保 `requireDiff: true`，避免空提议

### 2. 安全考虑

- 自动审查会检查安全性，但建议定期审查自动应用的提议
- 如果发现异常，可以禁用 `agentAutoPropose`

### 3. 奖励配置

- 可以根据需要调整奖励分数
- 高质量阈值可以根据实际情况调整

## 相关文件

- 配置文件：`.openskills/config.json`
- 奖励服务：`packages/api/src/services/agentRewardService.ts`
- 提议服务：`packages/api/src/services/proposalService.ts`
- Bootstrap：`.cursor/skills/open-skills-bootstrap/SKILL.md`
