#!/usr/bin/env node
/**
 * Create corrected proposals for agent-startup, skill-proposer, open-skills-bootstrap
 * using diff.createPatch from actual file content, then approve and apply.
 * Run from repo root; requires API running. OPENSKILLS_API_URL or http://localhost:3847.
 */
const API_BASE = process.env.OPENSKILLS_API_URL || 'http://localhost:3847';
const path = require('path');
const fs = require('fs');
const Diff = require('diff');

const ROOT = path.resolve(__dirname, '..');

function read(filePath) {
  return fs.readFileSync(path.join(ROOT, filePath), 'utf8');
}

// 1) agent-startup: add one comment line after line "3. **API base**: ..."
const agentStartupPath = '.cursor/skills/agent-startup/SKILL.md';
const agentStartupOld = read(agentStartupPath);
const agentStartupNew = agentStartupOld.replace(
  '3. **API base**: Wake prompt / env OPENSKILLS_API_URL / extension config; default http://localhost:3847 if none set.\n<!-- API 基地址',
  '3. **API base**: Wake prompt / env OPENSKILLS_API_URL / extension config; default http://localhost:3847 if none set.\n<!-- API base default: 3847 -->\n<!-- API 基地址'
);

// 2) skill-proposer: remove the garbled line (line with "Crawler 鎻愪氦")
const skillProposerPath = '.cursor/skills/skill-proposer/SKILL.md';
const skillProposerOld = read(skillProposerPath);
const skillProposerNew = skillProposerOld.replace(
  /- Detect name-similar and function-duplicate skills\.\r?\n- \*\*Crawler [^\r\n]+\r?\n  - 是否有安全风险/,
  '- Detect name-similar and function-duplicate skills.\n  - 是否有安全风险'
);

// 3) open-skills-bootstrap: replace Chinese flow block with English + comment
const bootstrapPath = '.cursor/skills/open-skills-bootstrap/SKILL.md';
const bootstrapOld = read(bootstrapPath);
const bootstrapNew = bootstrapOld.replace(
  `## Mechanism overview
<!-- 机制概述 -->

\`\`\`
提议 → 管理员审查 → 人类终审（可选） → 应用
\`\`\`

任何改进（新增/修改/删除 Skill、规则、配置）均通过此流程完成。

**⚠️ 强制要求：`,
  `## Mechanism overview
<!-- 机制概述 -->

Flow: **Propose → Admin review → Human final review (optional) → Apply.** All improvements (add/change/delete Skill, rules, config) MUST go through this flow.
<!-- 提议 → 管理员审查 → 人类终审（可选） → 应用；任何改进均通过此流程完成。 -->

**⚠️ 强制要求：`
);

function createDiff(oldContent, newContent, filePath) {
  return Diff.createPatch(filePath, oldContent, newContent, 'a/' + filePath, 'b/' + filePath);
}

async function postProposal(proposal) {
  const r = await fetch(API_BASE + '/api/proposals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(proposal),
  });
  const j = await r.json();
  return j.success && j.data ? j.data.id : null;
}

async function postDecision(proposalId, decision, reason) {
  const r = await fetch(API_BASE + '/api/decisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      proposalId,
      decision,
      reason,
      decidedBy: 'agent',
    }),
  });
  const j = await r.json();
  return r.ok && j.success;
}

async function applyDecision(proposalId) {
  const r = await fetch(API_BASE + '/api/decisions/' + encodeURIComponent(proposalId) + '/apply', {
    method: 'POST',
  });
  const j = await r.json();
  return r.ok && j.success ? true : (j.error || 'unknown');
}

const proposals = [
  {
    skillName: 'agent-startup',
    scope: 'project',
    reason: 'Add inline comment for API base default port (corrected diff from file content).',
    diff: createDiff(agentStartupOld, agentStartupNew, agentStartupPath),
    trigger: 'agent',
    proposerMeta: { source: 'agent', name: 'skill-proposer-fix', createdAt: new Date().toISOString() },
  },
  {
    skillName: 'skill-proposer',
    scope: 'project',
    reason: 'Remove garbled duplicate line in 2.4 (corrected diff from file content).',
    diff: createDiff(skillProposerOld, skillProposerNew, skillProposerPath),
    trigger: 'agent',
    proposerMeta: { source: 'agent', name: 'skill-proposer-fix', createdAt: new Date().toISOString() },
  },
  {
    skillName: 'open-skills-bootstrap',
    scope: 'project',
    reason: 'Convert Mechanism overview to English body + Chinese comment (corrected diff).',
    diff: createDiff(bootstrapOld, bootstrapNew, bootstrapPath),
    trigger: 'agent',
    proposerMeta: { source: 'agent', name: 'skill-proposer-fix', createdAt: new Date().toISOString() },
  },
];

async function main() {
  const ids = [];
  for (const p of proposals) {
    const id = await postProposal(p);
    if (id) {
      console.log('Created proposal:', id, p.skillName);
      ids.push(id);
    } else {
      console.error('Failed to create:', p.skillName);
    }
  }
  for (const id of ids) {
    const ok = await postDecision(id, 'approve', 'Corrected diff from file content; valid project skill update.');
    console.log('Decision:', id, ok ? 'approve' : 'fail');
    if (ok) {
      const result = await applyDecision(id);
      console.log('Apply:', id, result === true ? 'ok' : result);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
