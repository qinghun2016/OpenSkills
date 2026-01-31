/**
 * 提交两条 OpenSkills proposal（经验总结 + Agent 修复后自发提议规则）
 * 使用 Node 原生 fetch 并确保 UTF-8，避免 PowerShell/curl 编码问题
 */
const API_BASE = process.env.OPENSKILLS_API_URL || 'http://localhost:3847';

const ruleContent = `---
description: Agent 在修复用户反馈的 bug/编码/UX 问题后必须总结经验并提交 proposal
alwaysApply: true
---

# Agent 修复后自发提议规则

## 适用场景

当 Agent **完成**以下类型的工作后，必须总结经验并通过 API 向 OpenSkills 提交至少一条 proposal：

- **用户反馈的 bug 修复**：如「爬虫不能新增 topic」「JSON 解析报错」等
- **编码/API 类问题**：请求体编码乱码、JSON 解析崩溃、Content-Type charset 等
- **UX 改进**：仅靠 Enter 操作、缺少按钮、未受控输入等导致「不能/不好用」的修复

## 必须执行的步骤

1. **总结原因与修复**
   - 记录问题现象、根因、修改点（含文件与要点）
   - 判断是否可沉淀为文档或规则

2. **创建至少一条 proposal**
   - 通过 \`POST {API_BASE}/api/proposals\` 提交（禁止直接写 .openskills/proposals/）
   - 内容二选一或兼有：
     - **经验沉淀**：将本次修复要点写入 docs 或规则（diff 为对目标文件的修改）
     - **流程改进**：提议新增/修改规则，使其他 Agent 在类似情景下也自发提议（如本规则）

3. **在回复中说明**
   - 已提交的 proposal id
   - 若 API 不可用，说明原因并给出 proposal 草案（不直接写文件）

## 与现有规则的关系

- \`agent-auto-propose-on-suggestion\`：主动「提改进」时创建 proposal
- 本规则：**修复用户反馈问题后**也要总结经验并提议，便于知识沉淀与流程固化
`;
const lines = ruleContent.split('\n');
const ruleDiff = '--- /dev/null\n+++ .cursor/rules/agent-propose-on-fix.mdc\n@@ -0,0 +1,' + lines.length + ' @@\n' + lines.map((l) => '+' + l).join('\n');

const experienceReason = [
  '本次会话经验：',
  '1) 爬虫不能新增 topic：配置页仅支持 Enter 添加且输入未受控，改为受控输入并增加「添加」按钮；',
  '2) API JSON 解析崩溃：请求体中文乱码导致 Expected comma/Unterminated string，API 增加对 entity.parse.failed 的 400 处理并提示 UTF-8，前端 Content-Type 增加 charset=utf-8。',
  '提议将上述经验沉淀到项目文档或规则，便于后续与其它 Agent 复用。'
].join(' ');

const ruleReason = [
  '当 Agent 解决用户反馈的 bug、编码/API 错误或 UX 问题后，应自发总结经验并向 OpenSkills 提交 proposal，',
  '以便知识沉淀与流程改进。本规则规定修复后必须提交至少一条 proposal（经验文档或流程规则），',
  '使其他 Agent 在类似情景下也能自发提议。'
].join(' ');

async function postProposal(body) {
  const res = await fetch(`${API_BASE}/api/proposals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function main() {
  const now = new Date().toISOString();
  const proposerMeta = { source: 'agent', createdAt: now };

  // Proposal 1: 经验总结（文档类，diff 为建议在 docs 下新增经验记录）
  const experienceDiff = '--- /dev/null\n+++ docs/incidents-and-fixes.md\n@@ -0,0 +1,8 @@\n+# 故障与修复记录\n+\n+## 爬虫不能新增 topic\n+- **现象**：配置页「搜索 Topics」无法新增。\n+- **原因**：仅支持 Enter 添加且输入未受控，无「添加」按钮。\n+- **修复**：受控输入 + 增加「添加」按钮（Config.tsx）。\n+\n+## API JSON 解析崩溃\n+- **现象**：Expected comma / Unterminated string，请求体中文乱码。\n+- **原因**：请求未以 UTF-8 声明或发送，导致 body 解析错误。\n+- **修复**：API 捕获 entity.parse.failed 返回 400 并提示 UTF-8；前端 Content-Type 增加 charset=utf-8。\n';
  const proposal1 = {
    skillName: 'openskills-docs',
    scope: 'project',
    reason: experienceReason,
    diff: experienceDiff,
    trigger: 'agent',
    proposerMeta,
  };

  // Proposal 2: 新增规则 agent-propose-on-fix.mdc
  const proposal2 = {
    skillName: 'agent-propose-on-fix',
    scope: 'project',
    reason: ruleReason,
    diff: ruleDiff,
    trigger: 'agent',
    proposerMeta,
  };

  try {
    const r1 = await postProposal(proposal1);
    console.log('Proposal 1 (experience summary) id:', r1.id ?? r1.data?.id);
    const r2 = await postProposal(proposal2);
    console.log('Proposal 2 (agent-propose-on-fix rule) id:', r2.id ?? r2.data?.id);
  } catch (e) {
    console.error('POST failed:', e.message);
    process.exit(1);
  }
}

main();
