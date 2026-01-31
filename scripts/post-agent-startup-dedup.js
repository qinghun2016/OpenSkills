#!/usr/bin/env node
/**
 * POST one proposal to remove duplicate/garbled description in agent-startup SKILL.md (no .json file for body).
 * Usage: node scripts/post-agent-startup-dedup.js
 */
const fs = require('fs');
const path = require('path');
const API_BASE = process.env.OPENSKILLS_API_URL || 'http://localhost:3847';

const skillPath = path.join(__dirname, '..', '.cursor', 'skills', 'agent-startup', 'SKILL.md');
const lines = fs.readFileSync(skillPath, 'utf8').split(/\r?\n/);
const toRemove = lines[3]; // 0-based: line 4 (garbled duplicate description)

const diff = [
  '--- a/.cursor/skills/agent-startup/SKILL.md',
  '+++ b/.cursor/skills/agent-startup/SKILL.md',
  '@@ -1,11 +1,10 @@',
  '---',
  '<!-- When wake suggests skill-proposer then skills-admin, run proposer first. -->',
  '<!-- API base: default http://localhost:3847 if not set. -->',
  '-' + toRemove,
  'description: Agent startup MUST submit at least one proposal via OpenSkills API; FIRST ACTION must be POST /api/proposals (Agent 启动时必须先提交提议)',
  'triggers:',
  '  - "agent-startup"',
  '  - "启动提议"',
  '  - "先提议"',
  'alwaysApply: true',
  '---',
].join('\n');

const proposal = {
  skillName: 'agent-startup',
  scope: 'project',
  reason: 'Remove duplicate and garbled description line in frontmatter; keep single English description with Chinese comment per english-main-chinese-comments rule.',
  diff,
  trigger: 'agent',
  proposerMeta: { source: 'agent', name: 'skill-proposer', reason: 'Analyzed SKILL.md', createdAt: new Date().toISOString() },
};

const body = JSON.stringify(proposal);
const url = new URL('/api/proposals', API_BASE);
const mod = url.protocol === 'https:' ? require('https') : require('http');
const opts = {
  hostname: url.hostname,
  port: url.port || (url.protocol === 'https:' ? 443 : 80),
  path: url.pathname,
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body, 'utf8') },
};
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
