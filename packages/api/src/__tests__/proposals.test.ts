/**
 * Proposals CRUD 测试
 */

import * as proposalService from '../services/proposalService';
import {
  TEST_PROPOSALS_DIR,
  initTestDirs,
  cleanupTestDirs,
  copySchemas,
} from './setup';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProposalCreateInput, Proposal } from '../types';
import { createProposalInput, INVALID_INPUTS } from './fixtures';

describe('Proposal Service', () => {
  // 每个测试前重新初始化
  beforeEach(async () => {
    await cleanupTestDirs();
    await initTestDirs();
    await copySchemas();
  });

  describe('createProposal', () => {
    it('should create a new proposal with valid input', async () => {
      const input: ProposalCreateInput = {
        skillName: 'test-skill',
        scope: 'project',
        reason: 'Add new functionality',
        diff: `--- a/SKILL.md
+++ b/SKILL.md
@@ -1 +1,2 @@
 # Test Skill
+New content added`,
        trigger: 'agent',
        proposerMeta: {
          source: 'agent',
          name: 'test-agent',
        },
      };

      const result = await proposalService.createProposal(input);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBeDefined();
      expect(result.data?.skillName).toBe('test-skill');
      expect(result.data?.scope).toBe('project');
      expect(result.data?.status).toBe('pending');
      expect(result.data?.proposerMeta.createdAt).toBeDefined();
    });

    it('should fail with missing required fields', async () => {
      const input = INVALID_INPUTS.emptyStrings;

      const result = await proposalService.createProposal(input);
      
      // Schema 定义 skillName.minLength: 1，空字符串应该验证失败
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should create proposal file on disk', async () => {
      const input = createProposalInput({
        skillName: 'disk-test-skill',
        scope: 'user',
        reason: 'Test disk persistence',
        trigger: 'human',
        proposerMeta: { source: 'human' },
      });

      const result = await proposalService.createProposal(input);
      expect(result.success).toBe(true);

      const filePath = path.join(TEST_PROPOSALS_DIR, `${result.data?.id}.json`);
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });
  });

  describe('getProposal', () => {
    it('should return proposal by ID', async () => {
      // 先创建一个 proposal
      const input: ProposalCreateInput = {
        skillName: 'get-test',
        scope: 'project',
        reason: 'Test get',
        diff: '--- a\n+++ b',
        trigger: 'agent',
        proposerMeta: { source: 'agent' },
      };

      const createResult = await proposalService.createProposal(input);
      expect(createResult.success).toBe(true);
      const id = createResult.data!.id;

      // 获取 proposal
      const getResult = await proposalService.getProposal(id);

      expect(getResult.success).toBe(true);
      expect(getResult.data?.id).toBe(id);
      expect(getResult.data?.skillName).toBe('get-test');
    });

    it('should return error for non-existent ID', async () => {
      const result = await proposalService.getProposal('non-existent-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Proposal not found');
    });
  });

  describe('listProposals', () => {
    beforeEach(async () => {
      // 创建多个测试 proposals
      const proposals = [
        { skillName: 'skill-1', scope: 'project' as const, status: 'pending' },
        { skillName: 'skill-2', scope: 'user' as const, status: 'pending' },
        { skillName: 'skill-3', scope: 'project' as const, status: 'pending' },
      ];

      for (const p of proposals) {
        await proposalService.createProposal({
          skillName: p.skillName,
          scope: p.scope,
          reason: 'Test',
          diff: '--- a\n+++ b',
          trigger: 'agent',
          proposerMeta: { source: 'agent' },
        });
      }
    });

    it('should list all proposals', async () => {
      const result = await proposalService.listProposals();

      expect(result.success).toBe(true);
      expect(result.total).toBe(3);
      expect(result.data.length).toBe(3);
    });

    it('should filter by scope', async () => {
      const result = await proposalService.listProposals({ scope: 'project' });

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);
      expect(result.data.every(p => (p as Proposal).scope === 'project')).toBe(true);
    });

    it('should filter by status', async () => {
      const result = await proposalService.listProposals({ status: 'pending' });

      expect(result.success).toBe(true);
      expect(result.total).toBe(3);
    });

    it('should limit results', async () => {
      const result = await proposalService.listProposals({ limit: 2 });

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(2);
      expect(result.total).toBe(3);
    });

    it('should return summaries when requested', async () => {
      const result = await proposalService.listProposals({ summary: true });

      expect(result.success).toBe(true);
      expect(result.data.length).toBe(3);
      // Summary 不应包含 diff 字段
      expect((result.data[0] as any).diff).toBeUndefined();
    });
  });

  describe('updateProposal', () => {
    it('should update proposal status', async () => {
      // 创建 proposal
      const createResult = await proposalService.createProposal({
        skillName: 'update-test',
        scope: 'project',
        reason: 'Test update',
        diff: '--- a\n+++ b',
        trigger: 'agent',
        proposerMeta: { source: 'agent' },
      });

      const id = createResult.data!.id;

      // 更新状态
      const updateResult = await proposalService.updateProposal(id, {
        status: 'approved',
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data?.status).toBe('approved');

      // 验证持久化
      const getResult = await proposalService.getProposal(id);
      expect(getResult.data?.status).toBe('approved');
    });

    it('should fail for non-existent proposal', async () => {
      const result = await proposalService.updateProposal('non-existent', {
        status: 'approved',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Proposal not found');
    });
  });

  describe('deleteProposal', () => {
    it('should delete an existing proposal', async () => {
      // 创建 proposal
      const createResult = await proposalService.createProposal({
        skillName: 'delete-test',
        scope: 'project',
        reason: 'Test delete',
        diff: '--- a\n+++ b',
        trigger: 'agent',
        proposerMeta: { source: 'agent' },
      });

      const id = createResult.data!.id;

      // 删除
      const deleteResult = await proposalService.deleteProposal(id);
      expect(deleteResult.success).toBe(true);

      // 验证删除
      const getResult = await proposalService.getProposal(id);
      expect(getResult.success).toBe(false);
    });

    it('should fail for non-existent proposal', async () => {
      const result = await proposalService.deleteProposal('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Proposal not found');
    });
  });

  describe('getPendingCount', () => {
    it('should return count of pending proposals', async () => {
      // 创建几个 proposals
      for (let i = 0; i < 3; i++) {
        await proposalService.createProposal({
          skillName: `pending-${i}`,
          scope: 'project',
          reason: 'Test',
          diff: '--- a\n+++ b',
          trigger: 'agent',
          proposerMeta: { source: 'agent' },
        });
      }

      const count = await proposalService.getPendingCount();
      expect(count).toBe(3);
    });
  });
});
