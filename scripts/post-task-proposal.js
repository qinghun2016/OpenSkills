#!/usr/bin/env node
/**
 * Output one task-completion proposal as JSON to stdout (for piping to propose-stdin.js).
 * No .json file written; body built in memory only.
 */
const diff = [
  '--- a/.cursor/skills/skill-proposer-run/SKILL.md',
  '+++ b/.cursor/skills/skill-proposer-run/SKILL.md',
  '@@ -18,6 +18,7 @@',
  ' 2. **Act as skills-admin**: Fetch pending proposals, review per skills-admin flow, approve or reject via API and apply.',
  ' 2a. **Handoff**: When acting as skills-admin, first call GET /api/scheduler/handoff/snapshot; if data exists, resume from pending list.',
  '+3. **Apply failure**: If apply fails (e.g. patch does not match), re-run skill-proposer to generate a new proposal with diff from current file, or PATCH diff while proposal is still pending.',
  ' 3. **Output summary**: State pending count, processed count, and decisions (e.g. Approved X, Rejected Y).',
].join('\n');
const payload = {
  skillName: 'skill-proposer-run',
  scope: 'project',
  reason: 'Document apply-failure handling: when POST apply fails (patch does not match), re-run skill-proposer or PATCH diff while pending.',
  diff,
  trigger: 'agent',
  proposerMeta: { source: 'agent', name: 'skills-admin', reason: 'Task completion', createdAt: new Date().toISOString() },
};
console.log(JSON.stringify(payload));
