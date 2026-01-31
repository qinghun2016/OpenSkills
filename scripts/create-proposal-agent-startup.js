// 需先启动 OpenSkills API（npm run dev:api 或插件内嵌）再运行此脚本
const fs = require('fs');
const path = require('path');

const API_BASE = process.env.OPENSKILLS_API_URL || 'http://localhost:3847';
const diffPath = path.join(__dirname, '..', 'tmp-agent-startup.diff');
const diff = fs.readFileSync(diffPath, 'utf8');

const body = JSON.stringify({
  skillName: 'agent-startup',
  scope: 'project',
  reason: '新建立的 Agent 不遵守「向 OpenSkills 提交一条建议」：规则措辞「建议执行」被理解为可选；新 Agent 无 API 基地址；执行时机不明；API 不可用时静默跳过。本 diff 将「建议执行」改为「必须」、明确首次回复中完成、补充默认 API 基地址 http://localhost:3847、要求无法创建时必须在回复中说明原因。',
  diff: diff,
  trigger: 'agent',
  proposerMeta: { source: 'agent', name: 'agent-startup-rule-fix', createdAt: new Date().toISOString() },
});

const url = new URL('/api/proposals', API_BASE);
const opts = {
  hostname: url.hostname,
  port: url.port || (url.protocol === 'https:' ? 443 : 80),
  path: url.pathname,
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body, 'utf8') },
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
req.write(body);
req.end();
