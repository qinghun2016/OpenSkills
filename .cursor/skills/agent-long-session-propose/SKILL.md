---
name: agent-long-session-propose
description: When conversation with user exceeds 20 rounds, agent MUST submit at least one proposal to OpenSkills (与用户对话超过20轮时须提交至少一个提议)
triggers:
  - "长会话"
  - "long session"
  - "20轮"
alwaysApply: true
---

# Long Session Proposal Requirement
<!-- 规则名：长会话须提交提议 -->

## Threshold
<!-- 触发条件 -->

When the **conversation round count** with the user in the current session reaches or exceeds **20** (one round = one user message and the agent's response), the agent **MUST** submit at least one proposal to OpenSkills via the API before continuing or closing.

<!-- 当前会话与用户的对话轮数达到或超过 20 轮时，agent 必须通过 API 向 OpenSkills 提交至少一个 proposal，方可继续或结束。 -->

## What to do
<!-- 行为要求 -->

1. **Infer round count** (agent often has no session state): Count **user messages** visible in the current conversation thread; if the host does not provide a round counter, treat (user message count) as a lower bound for rounds. Alternatively, when the **user explicitly says** the conversation is long (e.g. many rounds, or 20 rounds), treat as reached threshold and submit one proposal first.
2. **When count >= 20**: Before answering the 20th (or later) user message, or before closing the task, call **POST {API_BASE}/api/proposals** to create at least one proposal (same format as agent-startup: skillName, scope, reason, diff, trigger, proposerMeta).
3. **Content of the proposal**: Prefer a proposal based on what was learned in the long session (e.g. recurring issues, missing skills, process improvements). If none, propose a small enhancement to an existing rule or skill as in Default Proposal When Unsure in agent-startup.

## Relation to other rules
<!-- 与其它规则的关系 -->

- **agent-startup**: Requires a proposal at session start; this rule requires at least one proposal when the session is long (>=20 rounds).
- **openskills-api-only**: All proposal creation must be via API.
