#!/usr/bin/env node
/**
 * Post skill-proposer proposals (body built in memory, no .json file).
 * Run when OpenSkills API is available: node scripts/skill-proposer-post.js
 * API base: OPENSKILLS_API_URL or http://localhost:3847
 */
const API_BASE = process.env.OPENSKILLS_API_URL || 'http://localhost:3847';

const proposals = [
  {
    skillName: 'handoff-file-context',
    scope: 'project',
    reason: 'Fix garbled Chinese comment in Overview: "姒傝堪" should be "概述" (Overview) for correct display and i18n.',
    diff: [
      '--- a/.cursor/skills/handoff-file-context/SKILL.md',
      '+++ b/.cursor/skills/handoff-file-context/SKILL.md',
      '@@ -9,2 +9,2 @@',
      ' ## Overview',
      '-<!-- 姒傝堪 -->',
      '+<!-- 概述 -->',
    ].join('\n'),
    trigger: 'agent',
    proposerMeta: { source: 'agent', name: 'skill-proposer', reason: 'Fix garbled comment', createdAt: new Date().toISOString() },
  },
  {
    skillName: 'open-skills-bootstrap',
    scope: 'project',
    reason: 'Convert Mechanism overview to English body + Chinese comment per english-main-chinese-comments rule; flow diagram and first paragraph only.',
    diff: [
      '--- a/.cursor/skills/open-skills-bootstrap/SKILL.md',
      '+++ b/.cursor/skills/open-skills-bootstrap/SKILL.md',
      '@@ -13,10 +13,7 @@',
      ' ## Mechanism overview',
      ' <!-- 机制概述 -->',
      ' ',
      '-```',
      '-提议 → 管理员审查 → 人类终审（可选） → 应用',
      '-```',
      '-',
      '-任何改进（新增/修改/删除 Skill、规则、配置）均通过此流程完成。',
      '+Flow: **Propose → Admin review → Human final review (optional) → Apply.** All improvements (add/change/delete Skill, rules, config) MUST go through this flow.',
      '+<!-- 提议 → 管理员审查 → 人类终审（可选） → 应用；任何改进均通过此流程完成。 -->',
      '+',
      ' **⚠️ 强制要求：所有改进建议必须通过此流程，且必须通过 API 操作！**',
    ].join('\n'),
    trigger: 'agent',
    proposerMeta: { source: 'agent', name: 'skill-proposer', reason: 'English body + Chinese comment', createdAt: new Date().toISOString() },
  },
];

function postOne(proposal) {
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
  return new Promise((resolve, reject) => {
    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', (ch) => (data += ch));
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.success && j.data && j.data.id) {
            console.log('Created proposal id:', j.data.id, 'skillName:', proposal.skillName);
            resolve(j.data.id);
          } else {
            console.error('Error for', proposal.skillName, ':', j.error || data);
            resolve(null);
          }
        } catch (e) {
          console.error('Parse error for', proposal.skillName, ':', data);
          resolve(null);
        }
      });
    });
    req.on('error', (e) => {
      console.error('Request error:', e.message);
      reject(e);
    });
    req.write(body, 'utf8');
    req.end();
  });
}

async function main() {
  for (const p of proposals) {
    await postOne(p);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
