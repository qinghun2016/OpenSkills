/**
 * OpenSkills 端到端验证脚本
 * 验证完整的 Proposal → Decision → Apply → Rollback 流程
 *
 * 使用方法：
 *   npx ts-node scripts/verify-flow.ts
 *
 * 需要先启动 API 服务：
 *   npm run dev:api
 */

import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs/promises';
import * as path from 'path';

// 配置
const API_BASE =
  process.env.API_BASE ||
  (process.env.OPENSKILLS_API_URL
    ? `${process.env.OPENSKILLS_API_URL.replace(/\/$/, '')}/api`
    : 'http://localhost:3847/api');
const WORKSPACE = process.env.WORKSPACE || process.cwd();

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color = colors.reset): void {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message: string): void {
  log(`✓ ${message}`, colors.green);
}

function error(message: string): void {
  log(`✗ ${message}`, colors.red);
}

function info(message: string): void {
  log(`ℹ ${message}`, colors.blue);
}

function step(message: string): void {
  log(`\n▶ ${message}`, colors.cyan);
}

// HTTP 请求工具
async function request<T>(
  method: string,
  endpoint: string,
  body?: object
): Promise<{ success: boolean; data?: T; error?: string; status?: number }> {
  return new Promise((resolve) => {
    const url = new URL(endpoint, API_BASE);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = httpModule.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ success: json.success !== false, data: json, status: res.statusCode });
        } catch {
          resolve({ success: false, error: 'Invalid JSON response', status: res.statusCode });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// 验证步骤
interface VerifyResult {
  step: string;
  success: boolean;
  details?: string;
}

const results: VerifyResult[] = [];

function recordResult(step: string, isSuccess: boolean, details?: string): void {
  results.push({ step, success: isSuccess, details });
  if (isSuccess) {
    success(step);
    if (details) info(`  ${details}`);
  } else {
    error(step);
    if (details) error(`  ${details}`);
  }
}

// 主验证流程
async function verifyFlow(): Promise<void> {
  log('\n╔════════════════════════════════════════════════════╗', colors.cyan);
  log('║      OpenSkills 端到端验证脚本                      ║', colors.cyan);
  log('╚════════════════════════════════════════════════════╝', colors.cyan);

  let proposalId: string | null = null;
  let historyId: string | null = null;
  const testSkillName = `verify-test-${Date.now()}`;
  const skillDir = path.join(WORKSPACE, '.cursor', 'skills', testSkillName);
  const skillPath = path.join(skillDir, 'SKILL.md');

  try {
    // 步骤 1: 检查 API 健康状态
    step('Step 1: 检查 API 服务状态');
    const healthResult = await request('GET', '/health');
    recordResult(
      'API 健康检查',
      healthResult.success,
      healthResult.success ? `版本: ${(healthResult.data as any)?.version}` : healthResult.error
    );

    if (!healthResult.success) {
      error('API 服务未启动，请先运行: npm run dev:api');
      return;
    }

    // 步骤 2: 创建测试技能文件
    step('Step 2: 创建测试技能文件');
    const originalContent = `---
name: ${testSkillName}
description: E2E verification test skill
---

# ${testSkillName}

## Overview

This skill is created for end-to-end verification testing.

## Usage

Original content before any modifications.
`;

    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(skillPath, originalContent);
    recordResult('创建测试技能文件', true, skillPath);

    // 步骤 3: 创建 Proposal
    step('Step 3: 创建测试 Proposal');
    const proposalBody = {
      skillName: testSkillName,
      scope: 'project',
      reason: 'E2E verification test - adding new section',
      diff: `--- a/SKILL.md
+++ b/SKILL.md
@@ -10,3 +10,7 @@
 ## Usage

 Original content before any modifications.
+
+## New Section
+
+This section was added by the E2E verification script.`,
      trigger: 'agent',
      proposerMeta: {
        source: 'agent',
        name: 'verify-flow-script',
      },
    };

    const createResult = await request<any>('POST', '/proposals', proposalBody);
    if (createResult.success && createResult.data?.data?.id) {
      proposalId = createResult.data.data.id;
      recordResult('创建 Proposal', true, `ID: ${proposalId}`);
    } else {
      recordResult('创建 Proposal', false, createResult.error || '未返回 ID');
      return;
    }

    // 步骤 4: 获取并验证 Proposal
    step('Step 4: 获取并验证 Proposal');
    const getResult = await request<any>('GET', `/proposals/${proposalId}`);
    if (getResult.success && getResult.data?.data?.status === 'pending') {
      recordResult('获取 Proposal', true, `状态: ${getResult.data.data.status}`);
    } else {
      recordResult('获取 Proposal', false, 'Proposal 状态不正确');
    }

    // 步骤 5: 创建批准决策
    step('Step 5: 创建批准决策');
    const decisionBody = {
      proposalId,
      decision: 'approve',
      reason: 'E2E verification - approved by script',
      decidedBy: 'agent',
    };

    const decisionResult = await request<any>('POST', '/decisions', decisionBody);
    if (decisionResult.success && decisionResult.data?.data?.decision === 'approve') {
      recordResult('创建批准决策', true);
    } else {
      recordResult('创建批准决策', false, decisionResult.error);
      return;
    }

    // 步骤 6: 验证 Proposal 状态已更新
    step('Step 6: 验证 Proposal 状态更新');
    const statusResult = await request<any>('GET', `/proposals/${proposalId}`);
    if (statusResult.success && statusResult.data?.data?.status === 'approved') {
      recordResult('Proposal 状态更新为 approved', true);
    } else {
      recordResult('Proposal 状态更新', false, `当前状态: ${statusResult.data?.data?.status}`);
    }

    // 步骤 7: 应用决策
    step('Step 7: 应用决策（写入 SKILL.md）');
    const applyResult = await request<any>('POST', `/decisions/${proposalId}/apply`);
    if (applyResult.success && applyResult.data?.data?.success) {
      historyId = applyResult.data.data.historyId;
      recordResult('应用决策', true, `History ID: ${historyId}`);
    } else {
      recordResult('应用决策', false, applyResult.data?.error || applyResult.error);
      return;
    }

    // 步骤 8: 验证文件已更新
    step('Step 8: 验证 SKILL.md 已更新');
    const updatedContent = await fs.readFile(skillPath, 'utf-8');
    if (updatedContent.includes('## New Section') && updatedContent.includes('E2E verification script')) {
      recordResult('SKILL.md 内容更新', true);
    } else {
      recordResult('SKILL.md 内容更新', false, '未找到新增内容');
    }

    // 步骤 9: 获取历史记录
    step('Step 9: 获取历史记录');
    const historyResult = await request<any>('GET', `/history/${historyId}`);
    if (historyResult.success && historyResult.data?.data?.proposalId === proposalId) {
      recordResult('获取历史记录', true, `原始内容长度: ${historyResult.data.data.originalContent?.length || 0}`);
    } else {
      recordResult('获取历史记录', false, historyResult.error);
    }

    // 步骤 10: 检查是否可以回滚
    step('Step 10: 检查是否可以回滚');
    const canRollbackResult = await request<any>('GET', `/history/${historyId}/can-rollback`);
    if (canRollbackResult.success && canRollbackResult.data?.data?.canRollback) {
      recordResult('回滚检查', true, '可以回滚');
    } else {
      recordResult('回滚检查', false, canRollbackResult.data?.data?.reason);
    }

    // 步骤 11: 执行回滚
    step('Step 11: 执行回滚');
    const rollbackResult = await request<any>('POST', `/history/${historyId}/rollback`);
    if (rollbackResult.success && rollbackResult.data?.success) {
      recordResult('执行回滚', true);
    } else {
      recordResult('执行回滚', false, rollbackResult.error);
    }

    // 步骤 12: 验证文件已恢复
    step('Step 12: 验证文件已恢复');
    const restoredContent = await fs.readFile(skillPath, 'utf-8');
    if (restoredContent === originalContent) {
      recordResult('文件恢复', true, '内容与原始一致');
    } else if (!restoredContent.includes('## New Section')) {
      recordResult('文件恢复', true, '新增内容已移除');
    } else {
      recordResult('文件恢复', false, '文件内容未正确恢复');
    }

  } catch (err) {
    error(`验证过程中发生错误: ${(err as Error).message}`);
  } finally {
    // 清理测试数据
    step('清理测试数据');

    // 删除测试技能文件
    try {
      await fs.rm(skillDir, { recursive: true, force: true });
      info('已删除测试技能目录');
    } catch {
      info('无法删除测试技能目录（可能已不存在）');
    }

    // 删除测试 Proposal
    if (proposalId) {
      try {
        await request('DELETE', `/proposals/${proposalId}`);
        info('已删除测试 Proposal');
      } catch {
        info('无法删除测试 Proposal');
      }
    }
  }

  // 输出总结
  log('\n╔════════════════════════════════════════════════════╗', colors.cyan);
  log('║                    验证结果总结                     ║', colors.cyan);
  log('╚════════════════════════════════════════════════════╝', colors.cyan);

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  log(`\n通过: ${passed}`, colors.green);
  log(`失败: ${failed}`, failed > 0 ? colors.red : colors.green);
  log(`总计: ${results.length}\n`);

  if (failed > 0) {
    log('失败的步骤:', colors.red);
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        log(`  - ${r.step}: ${r.details || '未知错误'}`, colors.red);
      });
    process.exit(1);
  } else {
    log('所有验证步骤均通过！', colors.green);
    process.exit(0);
  }
}

// 运行验证
verifyFlow().catch((err) => {
  error(`脚本执行失败: ${err.message}`);
  process.exit(1);
});
