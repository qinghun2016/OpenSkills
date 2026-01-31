#!/usr/bin/env node
/**
 * One-off: POST one proposal to fix skill-proposer SKILL.md garbled line (no .json file for body).
 * Usage: node scripts/post-skill-proposer-fix.js
 */
const fs = require('fs');
const path = require('path');
const API_BASE = process.env.OPENSKILLS_API_URL || 'http://localhost:3847';

const skillPath = path.join(__dirname, '..', '.cursor', 'skills', 'skill-proposer', 'SKILL.md');
const lines = fs.readFileSync(skillPath, 'utf8').split(/\r?\n/);
const oldLine = lines[166]; // 0-based: line 167 in file (garbled line)

const newLines = [
  '- **Crawler submissions**: diff target path MUST be `.cursor/skills/{skillName}/SKILL.md` (or user-level equivalent); do not use `/xxx/SKILL.md` or skills-admin will reject.',
  '<!-- Crawler 提交：diff 中目标路径必须为 .cursor/skills/{skillName}/SKILL.md（或 user 级对应路径），否则 skills-admin 会拒绝。 -->',
  '- Detect name-similar and function-duplicate skills.',
  '<!-- 发现名称相似且功能重复的 skills -->',
];

const diff = [
  '--- a/.cursor/skills/skill-proposer/SKILL.md',
  '+++ b/.cursor/skills/skill-proposer/SKILL.md',
  '@@ -167,1 +167,4 @@',
  '-' + oldLine,
  '+' + newLines.join('\n+'),
].join('\n');

const proposal = {
  skillName: 'skill-proposer',
  scope: 'project',
  reason: 'Fix garbled Chinese in Security check section: restore Crawler submission path requirement and duplicate-skills bullet (English body + Chinese comments per rule).',
  diff,
  trigger: 'agent',
  proposerMeta: { source: 'agent', name: 'skill-proposer', reason: 'Analyzed SKILL.md, found corrupted line 168', createdAt: new Date().toISOString() },
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
