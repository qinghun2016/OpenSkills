# 提议生成问题分析与解决方案

## 问题描述

skills-admin 运行了这么久，但没有新的提议被 agent 自动提出。

## 问题分析

### 1. Crawler 未生成提议

**现状**：
- Crawler 已启用（`crawl.enabled: true`）
- 但 `githubToken` 为空，导致无法访问 GitHub API
- 爬取记录显示 `reposSearched: 0`，没有搜索到任何仓库

**证据**：
```json
// .openskills/crawled/runs/crawl-20260125-233235-fg48.json
{
  "stats": {
    "reposSearched": 0,
    "reposWithSkills": 0,
    "skillsFound": 0,
    "proposalsGenerated": 0
  }
}
```

### 2. Agent 自动提议机制缺失

**现状**：
- `skills-admin` 的 SKILL.md 中提到了"已有Skills更新检查"功能
- 该功能可以检查已有 skills 并创建更新 proposal
- **但需要 Agent 主动执行**，目前没有自动触发机制

**关键点**：
- `skills-admin` 主要是**审查**提议，而不是**生成**提议
- 虽然有"已有Skills更新检查"功能，但需要 Agent 在审查时主动执行
- 目前没有独立的 Agent 自动提议生成机制

## 解决方案

### 方案 1：配置 GitHub Token（推荐）

让 Crawler 正常工作，自动从 GitHub 发现新的 skills：

1. **获取 GitHub Token**：
   - 访问 https://github.com/settings/tokens
   - 创建 Personal Access Token（至少需要 `public_repo` 权限）

2. **配置 Token**：
   ```json
   {
     "crawl": {
       "enabled": true,
       "githubToken": "your_github_token_here"
     }
   }
   ```

3. **手动触发一次爬取**（测试）：
   - 通过 API：`POST /api/crawler/run`
   - 或等待定时任务执行（每天凌晨 2 点）

### 方案 2：增强 skills-admin 的自动提议功能

在 `skills-admin` 被唤醒时，除了审查现有 proposals，还应该：

1. **自动检查已有 Skills**：
   - 扫描所有用户级和项目级 skills
   - 分析是否需要更新（内容过时、描述不准确等）
   - 自动创建更新 proposals

2. **实现方式**：
   - 在 `skills-admin` 的 SKILL.md 中明确要求：每次唤醒时**必须**执行"已有Skills更新检查"
   - 或者在 wake 机制中增加自动提议生成的步骤

### 方案 3：创建独立的 Agent 提议生成机制

创建一个新的 Skill 或机制，专门负责：

1. **定期分析 Skills**：
   - 检查 skills 是否需要更新
   - 检查是否有重复或冲突的 skills
   - 检查是否有可以优化的地方

2. **自动生成 Proposals**：
   - 基于分析结果自动创建 proposals
   - 提交到 `.openskills/proposals/` 等待审查

## 当前提议来源

根据 OpenSkills 的设计，提议可以来自：

| 来源 | 状态 | 说明 |
|------|------|------|
| **Crawler** | ❌ 未工作 | 需要 GitHub Token |
| **Agent** | ⚠️ 部分实现 | 需要 Agent 主动执行 |
| **Human** | ✅ 可用 | 手动创建 |

## 建议

1. **立即行动**：配置 GitHub Token，让 Crawler 正常工作
2. **短期改进**：增强 `skills-admin` 的自动检查功能，确保每次唤醒时都执行
3. **长期规划**：考虑创建独立的 Agent 提议生成机制

## 相关文件

- 配置文件：`.openskills/config.json`
- Skills Admin：`.cursor/skills/skills-admin/SKILL.md`
- Bootstrap：`.cursor/skills/open-skills-bootstrap/SKILL.md`
- Crawler 实现：`packages/api/src/crawler/`
