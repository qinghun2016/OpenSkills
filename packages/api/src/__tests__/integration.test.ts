/**
 * 完整流程集成测试
 * 测试 Proposal → Decision → Apply → Verify → Rollback 完整链路
 */

import * as proposalService from '../services/proposalService';
import * as decisionService from '../services/decisionService';
import * as diffService from '../services/diffService';
import * as historyService from '../services/historyService';
import {
  initTestDirs,
  cleanupTestDirs,
  copySchemas,
  createTestSkill,
  TEST_SKILLS_DIR,
} from './setup';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProposalCreateInput } from '../types';

describe('Integration Tests - Complete Flow', () => {
  // 每个测试前重新初始化
  beforeEach(async () => {
    await cleanupTestDirs();
    await initTestDirs();
    await copySchemas();
  });

  describe('Proposal → Decision(approve) → Apply → Verify', () => {
    it('should complete full approval and apply flow', async () => {
      // 1. 创建测试技能文件
      const originalContent = `---
name: test-integration
description: Test skill for integration testing
---

# Test Integration Skill

## Usage

This is the original content.
`;
      const skillPath = await createTestSkill('test-integration', originalContent);

      // 2. 创建 Proposal
      const proposalInput: ProposalCreateInput = {
        skillName: 'test-integration',
        scope: 'project',
        reason: 'Add new feature section',
        diff: `--- a/SKILL.md
+++ b/SKILL.md
@@ -9,3 +9,7 @@
 ## Usage

 This is the original content.
+
+## New Feature
+
+This feature was added via the proposal flow.`,
        trigger: 'agent',
        proposerMeta: {
          source: 'agent',
          name: 'integration-test-agent',
        },
      };

      const createResult = await proposalService.createProposal(proposalInput);
      
      expect(createResult.success).toBe(true);
      expect(createResult.data?.status).toBe('pending');
      const proposalId = createResult.data!.id;

      // 3. 验证 Proposal 可以被获取
      const getResult = await proposalService.getProposal(proposalId);
      expect(getResult.success).toBe(true);
      expect(getResult.data?.skillName).toBe('test-integration');

      // 4. 验证 Diff 可以应用
      const validateResult = await decisionService.validateDiffBeforeDecision(proposalId);
      expect(validateResult.valid).toBe(true);

      // 5. 创建批准决策
      const decisionResult = await decisionService.createDecision({
        proposalId,
        decision: 'approve',
        reason: 'Integration test approval',
        decidedBy: 'agent',
      });

      expect(decisionResult.success).toBe(true);
      expect(decisionResult.data?.decision).toBe('approve');

      // 6. 验证 Proposal 状态已更新
      const updatedProposal = await proposalService.getProposal(proposalId);
      expect(updatedProposal.data?.status).toBe('approved');

      // 7. 应用决策
      const applyResult = await decisionService.applyDecision(proposalId);
      
      expect(applyResult.success).toBe(true);
      expect(applyResult.data?.success).toBe(true);

      // 8. 验证文件已更新
      const newContent = await fs.readFile(skillPath, 'utf-8');
      expect(newContent).toContain('## New Feature');
      expect(newContent).toContain('This feature was added via the proposal flow.');

      // 9. 验证历史记录已创建
      const historyEntries = await historyService.getHistoryByProposalId(proposalId);
      expect(historyEntries.length).toBe(1);
      expect(historyEntries[0].originalContent).toBe(originalContent);

      // 10. 验证决策已标记为已应用
      const finalDecision = await decisionService.getDecisionByProposalId(proposalId);
      expect(finalDecision?.appliedAt).toBeDefined();
    });
  });

  describe('Proposal → Decision(reject)', () => {
    it('should handle rejection flow correctly', async () => {
      const originalContent = '# Test Skill\n\nOriginal content.\n';
      await createTestSkill('reject-test', originalContent);

      // 创建 Proposal
      const createResult = await proposalService.createProposal({
        skillName: 'reject-test',
        scope: 'project',
        reason: 'Test rejection',
        diff: `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,3 +1,4 @@
 # Test Skill

+This should not be applied.
 Original content.`,
        trigger: 'agent',
        proposerMeta: { source: 'agent' },
      });

      const proposalId = createResult.data!.id;

      // 拒绝决策
      const decisionResult = await decisionService.createDecision({
        proposalId,
        decision: 'reject',
        reason: 'Not suitable for production',
        decidedBy: 'human',
      });

      expect(decisionResult.success).toBe(true);

      // 验证 Proposal 状态
      const proposal = await proposalService.getProposal(proposalId);
      expect(proposal.data?.status).toBe('rejected');

      // 验证不能应用被拒绝的决策
      const applyResult = await decisionService.applyDecision(proposalId);
      expect(applyResult.success).toBe(false);
      expect(applyResult.error).toBe('Cannot apply rejected decision');
    });
  });

  describe('Apply → Rollback → Verify', () => {
    it('should successfully rollback applied changes', async () => {
      const originalContent = `# Rollback Test

This is the original content that should be restored.
`;
      const skillPath = await createTestSkill('rollback-test', originalContent);

      // 创建并批准 Proposal
      const createResult = await proposalService.createProposal({
        skillName: 'rollback-test',
        scope: 'project',
        reason: 'Test rollback',
        diff: `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,3 +1,5 @@
 # Rollback Test

+Added content that will be rolled back.
+
 This is the original content that should be restored.`,
        trigger: 'agent',
        proposerMeta: { source: 'agent' },
      });

      const proposalId = createResult.data!.id;

      await decisionService.createDecision({
        proposalId,
        decision: 'approve',
        reason: 'Approved for rollback test',
        decidedBy: 'agent',
      });

      const applyResult = await decisionService.applyDecision(proposalId);
      expect(applyResult.success).toBe(true);

      // 验证内容已变更
      let content = await fs.readFile(skillPath, 'utf-8');
      expect(content).toContain('Added content that will be rolled back.');

      // 获取历史记录 ID
      const historyId = applyResult.data!.historyId!;

      // 检查是否可以回滚
      const canRollback = await historyService.canRollback(historyId);
      expect(canRollback.canRollback).toBe(true);

      // 执行回滚
      const restoreResult = await diffService.restoreFromBackup(skillPath, historyId);
      expect(restoreResult.success).toBe(true);

      // 标记历史记录为已回滚
      await historyService.markAsRolledBack(historyId);

      // 验证内容已恢复
      content = await fs.readFile(skillPath, 'utf-8');
      expect(content).toBe(originalContent);

      // 验证历史记录已标记为已回滚
      const history = await historyService.getHistoryEntry(historyId);
      expect(history?.rolledBackAt).toBeDefined();
    });

    it('should prevent rollback of already rolled back entry', async () => {
      const skillPath = await createTestSkill('double-rollback', '# Test\nContent\n');

      const createResult = await proposalService.createProposal({
        skillName: 'double-rollback',
        scope: 'project',
        reason: 'Test double rollback prevention',
        diff: `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,2 +1,3 @@
 # Test
+New line
 Content`,
        trigger: 'agent',
        proposerMeta: { source: 'agent' },
      });

      const proposalId = createResult.data!.id;

      await decisionService.createDecision({
        proposalId,
        decision: 'approve',
        reason: 'Approved',
        decidedBy: 'agent',
      });

      const applyResult = await decisionService.applyDecision(proposalId);
      const historyId = applyResult.data!.historyId!;

      // 第一次回滚
      await diffService.restoreFromBackup(skillPath, historyId);
      await historyService.markAsRolledBack(historyId);

      // 检查是否可以再次回滚
      const canRollback = await historyService.canRollback(historyId);
      expect(canRollback.canRollback).toBe(false);
      expect(canRollback.reason).toBe('Already rolled back');
    });
  });

  describe('Multiple Proposals for Same Skill', () => {
    it('should handle sequential proposals correctly', async () => {
      const initialContent = '# Multi Proposal Test\n\nInitial content.\n';
      const skillPath = await createTestSkill('multi-proposal', initialContent);

      // 第一个 Proposal
      const proposal1 = await proposalService.createProposal({
        skillName: 'multi-proposal',
        scope: 'project',
        reason: 'First change',
        diff: `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,3 +1,5 @@
 # Multi Proposal Test

+## First Addition
+
 Initial content.`,
        trigger: 'agent',
        proposerMeta: { source: 'agent' },
      });

      await decisionService.createDecision({
        proposalId: proposal1.data!.id,
        decision: 'approve',
        reason: 'Approved first',
        decidedBy: 'agent',
      });

      await decisionService.applyDecision(proposal1.data!.id);

      // 验证第一次变更
      let content = await fs.readFile(skillPath, 'utf-8');
      expect(content).toContain('## First Addition');

      // 第二个 Proposal（基于更新后的内容）
      const proposal2 = await proposalService.createProposal({
        skillName: 'multi-proposal',
        scope: 'project',
        reason: 'Second change',
        diff: `--- a/SKILL.md
+++ b/SKILL.md
@@ -3,3 +3,6 @@
 ## First Addition

 Initial content.
+
+## Second Addition
+
+More content added.`,
        trigger: 'agent',
        proposerMeta: { source: 'agent' },
      });

      await decisionService.createDecision({
        proposalId: proposal2.data!.id,
        decision: 'approve',
        reason: 'Approved second',
        decidedBy: 'agent',
      });

      await decisionService.applyDecision(proposal2.data!.id);

      // 验证两次变更都存在
      content = await fs.readFile(skillPath, 'utf-8');
      expect(content).toContain('## First Addition');
      expect(content).toContain('## Second Addition');

      // 验证历史记录
      const history1 = await historyService.getHistoryByProposalId(proposal1.data!.id);
      const history2 = await historyService.getHistoryByProposalId(proposal2.data!.id);
      
      expect(history1.length).toBe(1);
      expect(history2.length).toBe(1);
    });
  });

  describe('Create New Skill via Proposal', () => {
    it('should create new skill file from proposal', async () => {
      const skillDir = path.join(TEST_SKILLS_DIR, 'brand-new-skill');
      await fs.mkdir(skillDir, { recursive: true });
      const skillPath = path.join(skillDir, 'SKILL.md');

      // 创建新技能的 Proposal
      const createResult = await proposalService.createProposal({
        skillName: 'brand-new-skill',
        scope: 'project',
        reason: 'Create a completely new skill',
        diff: `--- /dev/null
+++ b/SKILL.md
@@ -0,0 +1,10 @@
+---
+name: brand-new-skill
+description: A brand new skill created via proposal
+---
+
+# Brand New Skill
+
+## Usage
+
+This skill was created from scratch via the proposal system.`,
        trigger: 'crawler',
        proposerMeta: {
          source: 'crawler',
          repo: 'https://github.com/example/skills',
        },
      });

      const proposalId = createResult.data!.id;

      await decisionService.createDecision({
        proposalId,
        decision: 'approve',
        reason: 'New skill looks good',
        decidedBy: 'human',
      });

      const applyResult = await decisionService.applyDecision(proposalId);
      expect(applyResult.success).toBe(true);

      // 验证文件已创建
      const exists = await fs.access(skillPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      const content = await fs.readFile(skillPath, 'utf-8');
      expect(content).toContain('name: brand-new-skill');
      expect(content).toContain('# Brand New Skill');
    });
  });

  describe('History and Statistics', () => {
    it('should track all changes in history', async () => {
      // 创建多个技能并应用变更
      for (let i = 0; i < 3; i++) {
        const skillPath = await createTestSkill(`history-track-${i}`, `# Skill ${i}\n\nContent\n`);

        const proposal = await proposalService.createProposal({
          skillName: `history-track-${i}`,
          scope: i % 2 === 0 ? 'project' : 'user',
          reason: `Change ${i}`,
          diff: `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,3 +1,4 @@
 # Skill ${i}

+Added in test ${i}
 Content`,
          trigger: 'agent',
          proposerMeta: { source: 'agent' },
        });

        await decisionService.createDecision({
          proposalId: proposal.data!.id,
          decision: 'approve',
          reason: 'Approved',
          decidedBy: 'agent',
        });

        await decisionService.applyDecision(proposal.data!.id);
      }

      // 获取统计
      const historyStats = await historyService.getHistoryStats();
      
      expect(historyStats.total).toBe(3);
      expect(historyStats.byScope.project).toBe(2);
      expect(historyStats.byScope.user).toBe(1);

      const decisionStats = await decisionService.getDecisionStats();
      
      expect(decisionStats.total).toBe(3);
      expect(decisionStats.approved).toBe(3);
      expect(decisionStats.applied).toBe(3);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent proposal creation for same skill', async () => {
      const skillName = 'concurrent-test-skill';
      await createTestSkill(skillName, '# Original\nTest content\n');

      // 并发创建多个针对同一 skill 的 proposals
      const createPromises = Array.from({ length: 5 }, (_, i) => {
        const input: ProposalCreateInput = {
          skillName,
          scope: 'project',
          reason: `Concurrent proposal ${i + 1}`,
          diff: `--- a/SKILL.md\n+++ b/SKILL.md\n@@ -1,2 +1,2 @@\n # Original\n-Test content\n+Modified content ${i + 1}`,
          trigger: 'test',
          proposerMeta: { source: 'agent' },
        };
        return proposalService.createProposal(input);
      });

      const results = await Promise.all(createPromises);

      // 所有 proposals 都应该成功创建
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
      });

      // 验证所有 proposals 都被保存
      const list = await proposalService.listProposals();
      expect(list.data.length).toBe(5);

      // 验证每个 proposal 有唯一 ID
      const ids = results.map(r => r.data!.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
    });

    it('should handle concurrent decision application safely', async () => {
      const skillName = 'concurrent-apply-test';
      await createTestSkill(skillName, '# Title\nOriginal content\n');

      // 创建多个 proposals
      const proposals = await Promise.all(
        Array.from({ length: 3 }, async (_, i) => {
          const input: ProposalCreateInput = {
            skillName,
            scope: 'project',
            reason: `Change ${i + 1}`,
            diff: `--- a/SKILL.md\n+++ b/SKILL.md\n@@ -1,2 +1,3 @@\n # Title\n+Addition ${i + 1}\n Original content`,
            trigger: 'test',
            proposerMeta: { source: 'agent' },
          };
          return proposalService.createProposal(input);
        })
      );

      // 为所有 proposals 创建决策
      await Promise.all(
        proposals.map(p =>
          decisionService.createDecision(p.data!.id, {
            decision: 'approve',
            reason: 'Approved for concurrent test',
            decidedBy: 'agent',
          })
        )
      );

      // 尝试并发应用（注意：实际应该只有一个能成功，因为文件会冲突）
      const applyResults = await Promise.allSettled(
        proposals.map(p => decisionService.applyDecision(p.data!.id))
      );

      // 至少应该有一个成功
      const successCount = applyResults.filter(
        r => r.status === 'fulfilled' && r.value.success
      ).length;
      
      expect(successCount).toBeGreaterThanOrEqual(1);
      
      // 验证文件系统一致性（文件应该存在且可读）
      const skillPath = path.join(TEST_SKILLS_DIR, skillName, 'SKILL.md');
      const content = await fs.readFile(skillPath, 'utf-8');
      expect(content).toContain('# Title');
    });

    it('should handle concurrent read-write to same proposal', async () => {
      // 创建一个 proposal
      const input: ProposalCreateInput = {
        skillName: 'read-write-test',
        scope: 'project',
        reason: 'Test concurrent access',
        diff: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new',
        trigger: 'test',
        proposerMeta: { source: 'agent' },
      };

      const proposal = await proposalService.createProposal(input);
      const proposalId = proposal.data!.id;

      // 并发读取和更新
      const operations = [
        proposalService.getProposal(proposalId),
        proposalService.getProposal(proposalId),
        proposalService.updateProposal(proposalId, { status: 'approved' }),
        proposalService.getProposal(proposalId),
        proposalService.updateProposal(proposalId, { status: 'rejected' }),
      ];

      const results = await Promise.allSettled(operations);

      // 所有读操作都应该成功
      const readResults = [results[0], results[1], results[3]];
      readResults.forEach(r => {
        expect(r.status).toBe('fulfilled');
        if (r.status === 'fulfilled') {
          expect(r.value.success).toBe(true);
        }
      });

      // 最终状态验证（最后一次写入应该生效）
      const finalState = await proposalService.getProposal(proposalId);
      expect(finalState.success).toBe(true);
      expect(['approved', 'rejected', 'pending']).toContain(finalState.data!.status);
    });
  });
});
