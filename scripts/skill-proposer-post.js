#!/usr/bin/env node
/**
 * Post skill-proposer proposals (body built in memory, no .json file).
 * Run when OpenSkills API is available: node scripts/skill-proposer-post.js
 * API base: OPENSKILLS_API_URL or http://localhost:3847
 */
const API_BASE = process.env.OPENSKILLS_API_URL || 'http://localhost:3847';

const proposals = [
  {
    skillName: 'skill-proposer',
    scope: 'project',
    reason: 'Remove duplicate Crawler/Detect bullets and fix garbled Chinese line in §2.4; keep single Crawler submissions + name-similar bullets for skills-admin compliance.',
    diff: [
      '--- a/.cursor/skills/skill-proposer/SKILL.md',
      '+++ b/.cursor/skills/skill-proposer/SKILL.md',
      '@@ -166,12 +166,8 @@',
      ' - **Crawler submissions**: diff target path MUST be `.cursor/skills/{skillName}/SKILL.md` (or user-level equivalent); do not use `/xxx/SKILL.md` or skills-admin will reject.',
      ' <!-- Crawler 提交：diff 中目标路径必须为 .cursor/skills/{skillName}/SKILL.md（或 user 级对应路径），否则 skills-admin 会拒绝。 -->',
      ' - Detect name-similar and function-duplicate skills.',
      ' <!-- 发现名称相似且功能重复的 skills -->',
      '-<!-- Crawler 提交：diff 中目标路径必须为 .cursor/skills/{skillName}/SKILL.md（或 user 级对应路径），否则 skills-admin 会拒绝。 -->',
      '- - Detect name-similar and function-duplicate skills.',
      '- <!-- 发现名称相似且功能重复的 skills -->',
      '- - **Crawler 鎻愪氦**锛歞iff 涓洰鏍囪矾寰勫繀椤讳负 .cursor/skills/{skillName}/SKILL.md锛堟垨 user 绾у搴旇矾寰勶級锛岀姝娇鐢?/xxx/SKILL.md 绛夐潪鏍囧噯璺緞锛屽惁鍒?skills-admin 浼氭嫆缁濄€俓n - 鍙戠幇鍚嶇О鐩镐技涓斿姛鑳介噸鍙犵殑 skills',
      '  - 是否有安全风险',
      '  - 是否有敏感信息泄露风险',
    ].join('\n'),
    trigger: 'agent',
    proposerMeta: { source: 'agent', name: 'skill-proposer', reason: 'Dedup and fix garbled line', createdAt: new Date().toISOString() },
  },
  {
    skillName: 'agent-startup',
    scope: 'project',
    reason: 'Fix frontmatter: add --- and name, remove duplicate and garbled description line per english-main-chinese-comments.',
    diff: [
      '--- a/.cursor/skills/agent-startup/SKILL.md',
      '+++ b/.cursor/skills/agent-startup/SKILL.md',
      '@@ -1,10 +1,8 @@',
      '-<!-- When wake suggests skill-proposer then skills-admin, run proposer first. -->',
      '-<!-- API base: default http://localhost:3847 if not set. -->',
      '-description: Agent startup MUST submit at least one proposal via OpenSkills API; FIRST ACTION must be POST /api/proposals鈥攏ever run user task before that (Agent 鍚姩鏃跺繀椤诲厛鎻愪氦鎻愯)',
      '-description: Agent startup MUST submit at least one proposal via OpenSkills API; FIRST ACTION must be POST /api/proposals (Agent 启动时必须先提交提议)',
      '+---',
      '+name: agent-startup',
      '+description: Agent startup MUST submit at least one proposal via OpenSkills API; FIRST ACTION must be POST /api/proposals (Agent 启动时必须先提交提议)',
      ' triggers:',
      '   - "agent-startup"',
      '   - "启动提议"',
    ].join('\n'),
    trigger: 'agent',
    proposerMeta: { source: 'agent', name: 'skill-proposer', reason: 'Fix frontmatter and garbled description', createdAt: new Date().toISOString() },
  },
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
