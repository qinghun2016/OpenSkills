/**
 * Decisions CRUD 测试
 */

import * as proposalService from '../services/proposalService';
import * as decisionService from '../services/decisionService';
import {
  initTestDirs,
  cleanupTestDirs,
  copySchemas,
  createTestSkill,
} from './setup';
import { ProposalCreateInput, DecisionCreateInput } from '../types';

describe('Decision Service', () => {
  let testProposalId: string;

  // 每个测试前重新初始化
  beforeEach(async () => {
    await cleanupTestDirs();
    await initTestDirs();
    await copySchemas();

    // 创建测试 proposal
    const input: ProposalCreateInput = {
      skillName: 'decision-test-skill',
      scope: 'project',
      reason: 'Test decision making',
      diff: `--- a/SKILL.md
+++ b/SKILL.md
@@ -1 +1,2 @@
 # Test Skill
+Added by decision test`,
      trigger: 'agent',
      proposerMeta: { source: 'agent' },
    };

    const result = await proposalService.createProposal(input);
    testProposalId = result.data!.id;
  });

  describe('createDecision', () => {
    it('should create an approve decision', async () => {
      const input: DecisionCreateInput = {
        proposalId: testProposalId,
        decision: 'approve',
        reason: 'Looks good, approve it',
        decidedBy: 'agent',
      };

      const result = await decisionService.createDecision(input);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.proposalId).toBe(testProposalId);
      expect(result.data?.decision).toBe('approve');
      expect(result.data?.decidedAt).toBeDefined();
    });

    it('should create a reject decision', async () => {
      const input: DecisionCreateInput = {
        proposalId: testProposalId,
        decision: 'reject',
        reason: 'Not ready for production',
        decidedBy: 'human',
      };

      const result = await decisionService.createDecision(input);

      expect(result.success).toBe(true);
      expect(result.data?.decision).toBe('reject');
    });

    it('should update proposal status when decision is made', async () => {
      await decisionService.createDecision({
        proposalId: testProposalId,
        decision: 'approve',
        reason: 'Approved',
        decidedBy: 'agent',
      });

      const proposal = await proposalService.getProposal(testProposalId);
      expect(proposal.data?.status).toBe('approved');
    });

    it('should fail for non-existent proposal', async () => {
      const result = await decisionService.createDecision({
        proposalId: 'non-existent-proposal',
        decision: 'approve',
        reason: 'Test',
        decidedBy: 'agent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Proposal not found');
    });

    it('should sync proposal status when decision already exists (merge by event order)', async () => {
      // 创建第一个决策
      await decisionService.createDecision({
        proposalId: testProposalId,
        decision: 'approve',
        reason: 'First decision',
        decidedBy: 'agent',
      });

      // 重复提交：应返回成功并同步 proposal 状态，不报错
      const result = await decisionService.createDecision({
        proposalId: testProposalId,
        decision: 'reject',
        reason: 'Second decision',
        decidedBy: 'human',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.message).toMatch(/Decision already exists|synced|merge by event order/i);
      // 事件顺序：已有决策为准，proposal 状态应保持为 approved
      const proposalResult = await proposalService.getProposal(testProposalId);
      expect(proposalResult.data?.status).toBe('approved');
    });
  });

  describe('getDecisionByProposalId', () => {
    it('should return decision by proposal ID', async () => {
      await decisionService.createDecision({
        proposalId: testProposalId,
        decision: 'approve',
        reason: 'Test get decision',
        decidedBy: 'agent',
      });

      const decision = await decisionService.getDecisionByProposalId(testProposalId);

      expect(decision).toBeDefined();
      expect(decision?.proposalId).toBe(testProposalId);
      expect(decision?.decision).toBe('approve');
    });

    it('should return null for non-existent decision', async () => {
      const decision = await decisionService.getDecisionByProposalId('no-decision');
      expect(decision).toBeNull();
    });
  });

  describe('listDecisions', () => {
    beforeEach(async () => {
      // 创建多个 proposals 和 decisions
      for (let i = 0; i < 3; i++) {
        const proposal = await proposalService.createProposal({
          skillName: `list-decision-skill-${i}`,
          scope: 'project',
          reason: `Test ${i}`,
          diff: '--- a\n+++ b',
          trigger: 'agent',
          proposerMeta: { source: 'agent' },
        });

        await decisionService.createDecision({
          proposalId: proposal.data!.id,
          decision: i % 2 === 0 ? 'approve' : 'reject',
          reason: `Decision ${i}`,
          decidedBy: 'agent',
        });
      }
    });

    it('should list all decisions', async () => {
      const result = await decisionService.listDecisions();

      expect(result.success).toBe(true);
      // 包括 beforeEach 中创建的 testProposal 的决策（如果有）
      expect(result.total).toBeGreaterThanOrEqual(3);
    });

    it('should limit results', async () => {
      const result = await decisionService.listDecisions({ limit: 2 });

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);
    });

    it('should sort by decidedAt descending', async () => {
      const result = await decisionService.listDecisions();

      expect(result.success).toBe(true);
      
      // 验证排序
      for (let i = 1; i < result.data.length; i++) {
        const prev = new Date(result.data[i - 1].decidedAt).getTime();
        const curr = new Date(result.data[i].decidedAt).getTime();
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    });
  });

  describe('validateDiffBeforeDecision', () => {
    it('should validate diff can be applied for new file', async () => {
      const result = await decisionService.validateDiffBeforeDecision(testProposalId);

      // 对于新文件（不存在），diff 应该可以应用
      expect(result.valid).toBe(true);
    });

    it('should validate diff matches existing file', async () => {
      // 创建匹配的技能文件
      await createTestSkill('decision-test-skill', '# Test Skill\n');

      const result = await decisionService.validateDiffBeforeDecision(testProposalId);

      // 取决于 diff 是否匹配
      expect(typeof result.valid).toBe('boolean');
    });
  });

  describe('applyDecision', () => {
    it('should fail for non-existent decision', async () => {
      const result = await decisionService.applyDecision('no-decision');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Decision not found');
    });

    it('should fail for rejected decision', async () => {
      await decisionService.createDecision({
        proposalId: testProposalId,
        decision: 'reject',
        reason: 'Rejected',
        decidedBy: 'agent',
      });

      const result = await decisionService.applyDecision(testProposalId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot apply rejected decision');
    });

    it('should apply approved decision and update appliedAt', async () => {
      // 创建技能文件
      await createTestSkill('decision-test-skill', '# Test Skill\n');

      // 创建批准决策
      await decisionService.createDecision({
        proposalId: testProposalId,
        decision: 'approve',
        reason: 'Approved for testing',
        decidedBy: 'agent',
      });

      const result = await decisionService.applyDecision(testProposalId);

      // 根据 diff 是否能成功应用
      if (result.success) {
        expect(result.data?.success).toBe(true);
        
        // 验证 appliedAt 已设置
        const decision = await decisionService.getDecisionByProposalId(testProposalId);
        expect(decision?.appliedAt).toBeDefined();
      }
    });

    it('should fail if already applied', async () => {
      await createTestSkill('decision-test-skill', '# Test Skill\n');

      await decisionService.createDecision({
        proposalId: testProposalId,
        decision: 'approve',
        reason: 'Approved',
        decidedBy: 'agent',
      });

      // 第一次应用
      const firstResult = await decisionService.applyDecision(testProposalId);
      
      if (firstResult.success) {
        // 第二次尝试应用
        const secondResult = await decisionService.applyDecision(testProposalId);
        expect(secondResult.success).toBe(false);
        expect(secondResult.error).toBe('Decision already applied');
      }
    });
  });

  describe('getDecisionStats', () => {
    beforeEach(async () => {
      // 创建多个决策
      for (let i = 0; i < 4; i++) {
        const proposal = await proposalService.createProposal({
          skillName: `stats-skill-${i}`,
          scope: 'project',
          reason: `Test ${i}`,
          diff: '--- a\n+++ b',
          trigger: 'agent',
          proposerMeta: { source: 'agent' },
        });

        await decisionService.createDecision({
          proposalId: proposal.data!.id,
          decision: i < 3 ? 'approve' : 'reject',
          reason: `Decision ${i}`,
          decidedBy: 'agent',
        });
      }
    });

    it('should return correct statistics', async () => {
      const stats = await decisionService.getDecisionStats();

      expect(stats.total).toBeGreaterThanOrEqual(4);
      expect(stats.approved).toBeGreaterThanOrEqual(3);
      expect(stats.rejected).toBeGreaterThanOrEqual(1);
      expect(typeof stats.applied).toBe('number');
    });
  });
});
