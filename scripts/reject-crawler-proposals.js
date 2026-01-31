#!/usr/bin/env node
/**
 * Reject pending crawler proposals whose diff path is not under .cursor/skills/.
 * Body built in memory; no .json file. API base: OPENSKILLS_API_URL or http://localhost:3847
 */
const API_BASE = process.env.OPENSKILLS_API_URL || 'http://localhost:3847';

const proposalIds = [
  '308c2f6c-8d6f-4168-b370-358a1e8b919c', // anything-to-notebooklm
  'a2bb7056-b616-4e0f-b850-4e2a927c1067', // et-test-write
  '18ec9395-1edd-4ddf-8670-2e7a153301e8', // et-build
  '7af14d96-c65e-41c4-bf0b-8c5d9e515ff8', // et-test-run
  '41d93be4-5c22-49cb-8400-50236159ca94', // et-arch
];

const reason =
  'Reject: diff target path is not under .cursor/skills/. Crawler proposals use paths like b/xxx/SKILL.md; valid path must be .cursor/skills/{skillName}/SKILL.md. Apply would create files in wrong location or fail.';

function postDecision(proposalId) {
  const body = JSON.stringify({
    proposalId,
    decision: 'reject',
    reason,
    decidedBy: 'agent',
  });
  const url = new URL('/api/decisions', API_BASE);
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
          if (j.success) {
            console.log('Rejected proposal:', proposalId);
            resolve(j);
          } else {
            console.error('Error for', proposalId, ':', j.error || data);
            resolve(null);
          }
        } catch (e) {
          console.error('Parse error for', proposalId, ':', data);
          resolve(null);
        }
      });
    });
    req.on('error', reject);
    req.write(body, 'utf8');
    req.end();
  });
}

async function main() {
  for (const id of proposalIds) {
    await postDecision(id);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
