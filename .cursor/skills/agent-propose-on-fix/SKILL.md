---
name: agent-propose-on-fix
description: After fixing user-reported bug/code/UX issues, agent MUST summarize and submit at least one proposal via OpenSkills API (Agent 修复后须总结经验并提交 proposal)
triggers:
  - "agent-propose-on-fix"
  - "修复后提议"
alwaysApply: true
---

# Agent Propose After Fix
<!-- Agent 修复后自发提议规则 -->

## When this applies
<!-- 适用场景 -->

When the agent **finishes** any of the following, it MUST summarize and submit at least one proposal via API:

- **User-reported bug fix**: e.g. "crawler cannot add topic", "JSON parse error"
- **Encoding/API issues**: request body encoding, JSON parse crash, Content-Type charset
- **UX fix**: e.g. Enter-only behavior, missing button, uncontrolled input

## Steps
<!-- 必须执行的步骤 -->

1. **Summarize cause and fix**
   - Record: symptom, root cause, changes (files and points)
   - Decide if it can be documented or codified as a rule

2. **Create at least one proposal**
   - Submit via `POST {API_BASE}/api/proposals` (do not write under `.openskills/proposals/`)
   - Content: **experience** (write fix要点 into docs or rules; diff = change to target file) and/or **process** (propose new/updated rule so other agents also propose in similar cases, e.g. this rule)

3. **State in the reply**
   - The submitted proposal id
   - If API unavailable, say why and give a proposal draft (do not write files)

## Relation to other rules
<!-- 与现有规则的关系 -->

- `agent-auto-propose-on-suggestion`: create proposal when "suggesting improvement"
- This rule: **after fixing user-reported issues** also summarize and propose, for knowledge and process
