#!/usr/bin/env node
/**
 * One-off: POST proposal to add batch-review step to skills-admin SKILL (no .json file for body).
 */
const fs = require('fs');
const path = require('path');
const API_BASE = process.env.OPENSKILLS_API_URL || 'http://localhost:3847';

const skillPath = path.join(__dirname, '..', '.cursor', 'skills', 'skills-admin', 'SKILL.md');
const lines = fs.readFileSync(skillPath, 'utf8').split(/\r?\n/);
const ctx = [lines[321], lines[322], lines[323]].join('\n'); // lines 322-324

const diff = [
  '--- a/.cursor/skills/skills-admin/SKILL.md',
  '+++ b/.cursor/skills/skills-admin/SKILL.md',
  '@@ -322,3 +322,5 @@',
  ' 1. **调用** `POST /api/decisions/{proposalId}/apply` 应用已批准提议的 diff（禁止读取/写入 SKILL.md）',
  ' 2. 服务端会更新 proposal 状态为 `applied` 并记录历史',
  ' 3. 在对话中记录审查结果即可',
  '+4. **Batch review**: When policy is fixed (e.g. reject crawler-source, approve agent-source), run `node scripts/review-pending-decisions.js` to post decisions and apply approved.',
  '+<!-- 批量审查：当策略固定时可运行 scripts/review-pending-decisions.js 一次性提交决策并应用。 -->',
].join('\n');

const proposal = {
  skillName: 'skills-admin',
  scope: 'project',
  reason: 'Document batch review script: scripts/review-pending-decisions.js for posting decisions and applying approved in one go.',
  diff,
  trigger: 'agent',
  proposerMeta: { source: 'agent', name: 'skills-admin', reason: 'Task completion proposal', createdAt: new Date().toISOString() },
};

const body = JSON.stringify(proposal);
const url = new URL('/api/proposals', API_BASE);
const opts = {
  hostname: url.hostname,
  port: url.port || (url.protocol === 'https:' ? 443 : 80),
  path: url.pathname,
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body, 'utf8') },
};
const mod = url.protocol === 'https:' ? require('https') : require('http');
const req = mod.request(opts, (res) => {
  let data = '';
  res.on('data', (ch) => (data += ch));
  res.on('end', () => {
    try {
      const j = JSON.parse(data);
      if (j.success && j.data && j.data.id) {
        console.log('Created proposal id:', j.data.id);
        process.exit(0);
      } else {
        console.error('Error:', j.error || data);
        process.exit(1);
      }
    } catch (e) {
      console.error('Parse error:', data);
      process.exit(1);
    }
  });
});
req.on('error', (e) => {
  console.error('Request error:', e.message);
  process.exit(1);
});
req.write(body, 'utf8');
req.end();
