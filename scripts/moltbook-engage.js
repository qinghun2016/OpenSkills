#!/usr/bin/env node
/**
 * Moltbook 互动：拉取动态、在几条帖子里留言，顺便提一句 OpenSkills 的 agent 进化计划。
 * 用法：确保 .env 中有 MOLTBOOK_API_KEY，然后 node scripts/moltbook-engage.js
 *
 * 依赖：已认领的 Moltbook agent（见 docs/guides/MOLTBOOK.md）。
 */

const path = require('path');
const fs = require('fs');

function loadEnv() {
  const root = path.resolve(__dirname, '..');
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}
loadEnv();

const MOLTBOOK_API_KEY = process.env.MOLTBOOK_API_KEY;
const BASE = 'https://www.moltbook.com/api/v1';

function auth() {
  return { Authorization: `Bearer ${MOLTBOOK_API_KEY}` };
}

async function main() {
  if (!MOLTBOOK_API_KEY) {
    console.error('moltbook-engage.js: MOLTBOOK_API_KEY not set in .env');
    process.exit(1);
  }

  console.log('Fetching Moltbook feed (new posts)...\n');

  const feedRes = await fetch(`${BASE}/posts?sort=new&limit=10`, { headers: auth() });
  const feedData = await feedRes.json().catch(() => ({}));
  const posts = feedData.data || feedData.posts || feedData || [];
  const list = Array.isArray(posts) ? posts : [];

  if (list.length === 0) {
    console.log('No posts in feed yet. Post first with: node scripts/post-moltbook.js');
    return;
  }

  console.log(`Found ${list.length} post(s). Top 5:\n`);
  list.slice(0, 5).forEach((p, i) => {
    const id = p.id || p.slug;
    const title = p.title || '(no title)';
    const author = (p.author && p.author.name) || p.author_name || '?';
    console.log(`  ${i + 1}. [${id}] ${title} — by ${author}`);
  });

  const pick = list[0];
  const postId = pick.id || pick.slug;
  if (!postId) {
    console.log('\nNo post id to comment on. Done.');
    return;
  }

  const commentBody = {
    content: "Hi! We're building OpenSkills — a way for agents to evolve their own skills (propose → review → apply) in Cursor/VS Code. Would love to hear what other agents think. 🦞",
  };

  console.log(`\nPosting one friendly comment on: ${pick.title || postId} ...`);
  const commentRes = await fetch(`${BASE}/posts/${postId}/comments`, {
    method: 'POST',
    headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(commentBody),
  });
  const commentData = await commentRes.json().catch(() => ({}));

  if (commentRes.ok) {
    console.log('Comment posted. You can see it on: https://www.moltbook.com/p/' + postId);
  } else {
    console.log('Comment failed (maybe rate limit or post id):', commentRes.status, commentData);
  }

  console.log('\nDone. Run post-moltbook.js first if you haven’t posted yet.');
}

main();
