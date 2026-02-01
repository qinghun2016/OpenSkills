#!/usr/bin/env node
/**
 * Register an OpenSkills agent on Moltbook (no curl/bash needed; works on Windows).
 * Usage: node scripts/register-moltbook.js
 *
 * Prints api_key and claim_url; optionally writes MOLTBOOK_API_KEY to project .env
 * so you don't lose it. Open claim_url in browser and complete the tweet to claim.
 */

const path = require('path');
const fs = require('fs');

const BASE = 'https://www.moltbook.com/api/v1';
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');

function writeKeyToEnv(apiKey) {
  let content = '';
  if (fs.existsSync(ENV_PATH)) {
    content = fs.readFileSync(ENV_PATH, 'utf8');
    if (content.includes('MOLTBOOK_API_KEY=')) {
      content = content.replace(/MOLTBOOK_API_KEY=.*/m, 'MOLTBOOK_API_KEY=' + apiKey);
      fs.writeFileSync(ENV_PATH, content, 'utf8');
      return true;
    }
  }
  const line = '\n# Moltbook (see docs/guides/MOLTBOOK.md)\nMOLTBOOK_API_KEY=' + apiKey + '\n';
  fs.appendFileSync(ENV_PATH, content.endsWith('\n') ? line : '\n' + line, 'utf8');
  return true;
}

// Use env for unique name (e.g. OpenSkills_YourHandle); default avoids "already taken"
const AGENT_NAME = process.env.MOLTBOOK_AGENT_NAME || 'OpenSkillsMolty';
const BODY = {
  name: AGENT_NAME,
  description: 'Agent for OpenSkills: AI Skills self-evolution — propose, review, apply. We want feedback from other agents!',
};

async function main() {
  const url = `${BASE}/agents/register`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(BODY),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Moltbook register failed:', res.status, data);
    process.exit(1);
  }

  const agent = data.agent || data;
  const apiKey = agent.api_key;
  const claimUrl = agent.claim_url;
  const code = agent.verification_code;

  if (!apiKey || !claimUrl) {
    console.error('Unexpected response:', data);
    process.exit(1);
  }

  writeKeyToEnv(apiKey);
  console.log('');
  console.log('=== Moltbook 注册成功 ===');
  console.log('');
  console.log('1. API Key（已写入 .env，下面也再打印一遍，请核对）：');
  console.log('   MOLTBOOK_API_KEY=' + apiKey);
  console.log('');
  console.log('2. 认领 Agent（人类在浏览器完成）：');
  console.log('   打开此链接并按页面说明发推文：');
  console.log('   ' + claimUrl);
  if (code) console.log('   验证码: ' + code);
  console.log('');
  console.log('认领完成后运行: node scripts/post-moltbook.js 发帖');
  console.log('');
}

main();
