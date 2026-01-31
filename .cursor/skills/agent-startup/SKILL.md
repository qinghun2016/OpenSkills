---
<!-- When wake suggests skill-proposer then skills-admin, run proposer first. -->
<!-- API base: default http://localhost:3847 if not set. -->
name: agent-startup
description: Agent startup MUST submit at least one proposal via OpenSkills API; FIRST ACTION must be POST /api/proposals (Agent 启动时必须先提交提议)
triggers:
  - "agent-startup"
  - "启动提议"
  - "先提议"
alwaysApply: true
---

# Agent Startup: Must Submit Proposal First
<!-- 规则名：Agent 启动时必须提出改进想法 -->

**FIRST ACTION (before thinking or doing the user's request): You MUST attempt to call POST {API_BASE}/api/proposals to create at least one proposal, OR clearly state "OpenSkills API unavailable". You MUST NOT read reports, search code, edit files, or answer the user before this step—otherwise you violate this rule.**
<!-- 你的第一条动作必须是：尝试 POST /api/proposals 或说明 API 不可用；禁止先读报告、先搜代码、先改文件、先回答用户。 -->

## Iron Rule (Non-Skippable)
<!-- 铁律（不可跳过） -->

Regardless of the user's first message (fix bug, add feature, question, report, etc.), you **MUST** first complete "attempt to create at least one proposal via API", **then** execute the user's request. You **MUST NOT** go straight to solving the problem, editing code, or replying; you **MUST NOT** defer to "after I finish".
<!-- 无论用户首条消息是什么，必须先完成「尝试通过 API 创建至少一条 proposal」，然后才能执行用户请求；不得直接动手、不得延后。 -->

- If API is available: In your first reply, explicitly write "Created proposal via POST /api/proposals, id: xxx".
- If API is unavailable: In your first reply, clearly state "OpenSkills API unavailable, cannot create proposal" and suggest starting the API or setting OPENSKILLS_API_URL.
<!-- 若 API 可用：首次回复中写明「已通过 POST /api/proposals 创建 proposal，id: xxx」。若不可用：写明「OpenSkills API 不可用」并建议配置 OPENSKILLS_API_URL。 -->

## Proposal Creation (API-Only)
<!-- 如何创建 Proposal：必须通过 API，禁止直接写文件 -->


1. Read .openskills/schemas/proposal.schema.json for format.
2. Call **POST {API_BASE}/api/proposals** with JSON: skillName, scope, reason, diff, trigger, proposerMeta.
3. **API base**: Wake prompt / env OPENSKILLS_API_URL / extension config; default http://localhost:3847 if none set.
<!-- API 基地址：唤醒指令 / OPENSKILLS_API_URL / 扩展配置；以上均不可得时默认 http://localhost:3847 -->

## Default Proposal When Unsure
<!-- 默认提议：不知提什么时，基于已有规则或技能提议如何增强主动性 -->

When you have no concrete improvement in mind, you **MUST** base your proposal on **existing rules or skills**: read or scan .cursor/rules/ and .cursor/skills/ (or user-level equivalents), then propose **how to enhance agent proactivity** from what is already there. Examples:

- **From a rule**: "Rule X could add a step that prompts the agent to suggest missing skills when receiving a task" - propose a small change to that rule.
- **From a skill**: "Skill Y could add a trigger for proactively absorbing lessons into a new skill after handling problems" - propose an addition to that skill.

The core idea: **use existing rules/skills as the source**, and suggest **proactivity enhancements** (what to do earlier, what to suggest, what to record). Such proposals may use **scope: user** (global). Prefer concrete proposals (with a proper diff) when possible; when not, a short reason plus minimal diff is acceptable and skills-admin may refine.
<!-- 核心：让 agent 在不知道提什么的时候，根据已有的规则或技能，提议如何增强主动性（而非泛泛的「可提议经验吸收」）。 -->

## Three-Step Flow
<!-- 实施流程 -->

User's first message -> [Step 1, mandatory] Attempt POST /api/proposals (or state API unavailable) -> [Step 2] Execute user request -> [Step 3, mandatory] On task completion: submit at least one more proposal; state result in closing reply. Do NOT skip Step 1 or Step 3.
<!-- 禁止跳过第一步或第三步；收尾时必须写明已提交 id / 未产生新提议 / API 不可用。 -->

## On Task Completion (Mandatory)
<!-- 任务完成时再提一次（必须执行） -->

Before closing the task, **MUST** try again to submit at least one proposal based on what you learned. In your closing reply, either state "Submitted proposal for this task, id: xxx" or "No new proposal from this task" or API unavailable.
<!-- 即将完成用户任务时，必须根据任务中遇到的问题/改进点再尝试提交至少一条 proposal；在收尾回复中写明结果，不得静默跳过。 -->

## 中文说明
<!-- 以下为中文要点，供人类查阅 -->

- 首条动作必须先尝试 POST /api/proposals 或说明 API 不可用，再执行用户请求。
- API 基地址默认 http://localhost:3847；若使用 npm 启动且端口不同，请设置 OPENSKILLS_API_URL。