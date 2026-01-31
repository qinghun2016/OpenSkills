#!/usr/bin/env node
/**
 * Post one proposal with body built in memory (no .json file).
 * Usage: node scripts/post-one-proposal.js
 * API base: OPENSKILLS_API_URL or http://localhost:3847
 */
const API_BASE = process.env.OPENSKILLS_API_URL || 'http://localhost:3847';

const proposal = {
  skillName: 'agent-startup',
  scope: 'project',
  reason: 'Enhance agent-startup: when agent has no concrete improvement in mind, suggest adding a step to prompt missing skills from existing rules (Default Proposal When Unsure).',
  diff: [
    '--- a/.cursor/skills/agent-startup/SKILL.md',
    '+++ b/.cursor/skills/agent-startup/SKILL.md',
    '@@ -4,5 +4,5 @@',
    ' name: agent-startup',
    '-description: Agent startup MUST submit at least one proposal via OpenSkills API; FIRST ACTION must be POST /api/proposals (Agent 启动时必须先提交提议)',
    '+description: Agent startup MUST submit at least one proposal via OpenSkills API; FIRST ACTION must be POST /api/proposals; when unsure suggest missing skills from existing rules (Agent 启动时必须先提交提议；无明确改进时可建议缺失技能)',
    ' triggers:',
    '   - "agent-startup"',
    '   - "启动提议"',
  ].join('\n'),
  trigger: 'agent',
  proposerMeta: {
    source: 'agent',
    name: 'agent-startup',
    reason: 'Startup proposal',
    createdAt: new Date().toISOString(),
  },
};

const body = JSON.stringify(proposal);
const url = new URL('/api/proposals', API_BASE);
const opts = {
  hostname: url.hostname,
  port: url.port || (url.protocol === 'https:' ? 443 : 80),
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body, 'utf8'),
  },
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
