#!/usr/bin/env node
/**
 * Create an OpenSkills proposal by reading the request body from stdin (no file write).
 * Usage: node -e "console.log(JSON.stringify({skillName:'x',scope:'project',reason:'...',diff:'...',trigger:'agent',proposerMeta:{source:'agent',name:'...',createdAt:new Date().toISOString()}}))" | node scripts/propose-stdin.js
 * Or (PowerShell): $body = '{"skillName":"..."}'; $body | node scripts/propose-stdin.js
 *
 * Requires: OpenSkills API running (npm run dev:api or plugin). API base from OPENSKILLS_API_URL or http://localhost:3847.
 */

const API_BASE = process.env.OPENSKILLS_API_URL || 'http://localhost:3847';

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(chunks.join('')));
    process.stdin.on('error', reject);
  });
}

async function main() {
  const raw = await readStdin();
  const body = raw.trim();
  if (!body) {
    console.error('propose-stdin.js: no JSON on stdin. Pipe proposal JSON to this script.');
    process.exit(1);
  }
  let payload;
  try {
    payload = JSON.parse(body);
  } catch (e) {
    console.error('propose-stdin.js: invalid JSON on stdin:', e.message);
    process.exit(1);
  }
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
}

main();
