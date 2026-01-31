---
name: skill-proposer-run
description: Run skill-proposer then skills-admin in sequence (一键执行 skill-proposer 分析并 skills-admin 审查)
triggers:
  - "skill-proposer-run"
  - "执行 skill-proposer"
  - "分析并审查"
---
# Skill-Proposer-Run

## Execution flow
<!-- 执行流程 -->

This skill chains **skill-proposer** and **skills-admin**. Run in this order:

1. **Run skill-proposer**: Scan user- and project-level `.cursor/skills/`, analyze each skill, generate proposals via `POST {API_BASE}/api/proposals`.
2. **Act as skills-admin**: Fetch pending proposals, review per skills-admin flow, approve or reject via API and apply.
2a. **Handoff**: When acting as skills-admin, first call GET /api/scheduler/handoff/snapshot; if data exists, resume from pending list.
3. **Output summary**: State pending count, processed count, and decisions (e.g. Approved X, Rejected Y).

When the user triggers "执行 skill-proposer", "分析并审查", or "skill-proposer-run", the agent should run the above two steps in sequence.
Do not skip either step.
<!-- 用户触发「执行 skill-proposer」「分析并审查」或「skill-proposer-run」时，Agent 应依次执行上述两步。 -->
