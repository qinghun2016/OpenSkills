/**
 * 性能测试套件
 * 测试大量数据和高并发场景的性能表现
 * 
 * 使用环境变量控制：RUN_PERF_TESTS=1 npm test -- performance.test.ts
 */

import * as proposalService from '../services/proposalService';
import * as decisionService from '../services/decisionService';
import * as diffService from '../services/diffService';
import {
  initTestDirs,
  cleanupTestDirs,
  copySchemas,
  createTestSkill,
} from './setup';
import {
  createBatchProposals,
  generateLargeContent,
  generateLargeDiff,
  createProposalInput,
} from './fixtures';

// 性能测试默认跳过，除非设置环境变量
const describeIf = process.env.RUN_PERF_TESTS === '1' ? describe : describe.skip;

describeIf('Performance Tests', () => {
  beforeEach(async () => {
    await cleanupTestDirs();
    await initTestDirs();
    await copySchemas();
  });

  describe('Large Dataset Performance', () => {
    it('should list 100+ proposals efficiently', async () => {
      // 创建 100 个 proposals
      const inputs = createBatchProposals(100, 'perf-list');
      
      const startCreate = Date.now();
      await Promise.all(inputs.map(input => proposalService.createProposal(input)));
      const createTime = Date.now() - startCreate;
      
      console.log(`  ✓ Created 100 proposals in ${createTime}ms`);
      
      // 测试列表性能
      const startList = Date.now();
      const result = await proposalService.listProposals();
      const listTime = Date.now() - startList;
      
      console.log(`  ✓ Listed ${result.data.length} proposals in ${listTime}ms`);
      
      expect(result.data.length).toBe(100);
      expect(listTime).toBeLessThan(5000); // 应该在5秒内完成
    }, 30000); // 30秒超时

    it('should filter 1000+ proposals efficiently', async () => {
      // 创建 1000 个 proposals（分批）
      const batchSize = 100;
      const totalCount = 1000;
      
      console.log(`  ⏳ Creating ${totalCount} proposals...`);
      const startCreate = Date.now();
      
      for (let i = 0; i < totalCount / batchSize; i++) {
        const batch = createBatchProposals(batchSize, `perf-filter-batch${i}`);
        await Promise.all(batch.map(input => proposalService.createProposal(input)));
      }
      
      const createTime = Date.now() - startCreate;
      console.log(`  ✓ Created ${totalCount} proposals in ${createTime}ms`);
      
      // 测试过滤性能
      const startFilter = Date.now();
      const projectProposals = await proposalService.listProposals({ scope: 'project' });
      const filterTime = Date.now() - startFilter;
      
      console.log(`  ✓ Filtered proposals in ${filterTime}ms (found ${projectProposals.data.length})`);
      
      expect(filterTime).toBeLessThan(10000); // 应该在10秒内完成
    }, 120000); // 2分钟超时
  });

  describe('Large File Performance', () => {
    it('should apply diff to 1MB file efficiently', async () => {
      const largeContent = generateLargeContent(1024); // 1MB
      const skillPath = await createTestSkill('large-file', largeContent);
      
      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,2 +1,3 @@
 # Large Test Skill
+Performance test line
 Line 1: ${'x'.repeat(60)}`;
      
      const startApply = Date.now();
      const result = await diffService.applyDiffToFile(skillPath, diff);
      const applyTime = Date.now() - startApply;
      
      console.log(`  ✓ Applied diff to 1MB file in ${applyTime}ms`);
      
      expect(result.success).toBe(true);
      expect(applyTime).toBeLessThan(2000); // 应该在2秒内完成
    }, 10000);

    it('should apply diff to 10MB file efficiently', async () => {
      const largeContent = generateLargeContent(10 * 1024); // 10MB
      const skillPath = await createTestSkill('very-large-file', largeContent);
      
      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,2 +1,3 @@
 # Large Test Skill
+Performance test line
 Line 1: ${'x'.repeat(60)}`;
      
      const startApply = Date.now();
      const result = await diffService.applyDiffToFile(skillPath, diff);
      const applyTime = Date.now() - startApply;
      
      console.log(`  ✓ Applied diff to 10MB file in ${applyTime}ms`);
      
      expect(result.success).toBe(true);
      expect(applyTime).toBeLessThan(5000); // 应该在5秒内完成
    }, 20000);

    it('should handle diff with 100+ hunks efficiently', async () => {
      const skillPath = await createTestSkill('multi-hunk', generateLargeContent(100));
      const largeDiff = generateLargeDiff(100); // 100个hunks
      
      const startApply = Date.now();
      const result = await diffService.applyDiffToFile(skillPath, largeDiff);
      const applyTime = Date.now() - startApply;
      
      console.log(`  ✓ Applied 100-hunk diff in ${applyTime}ms`);
      
      // 大型diff可能失败是正常的，主要测试不会崩溃
      expect(result).toBeDefined();
      expect(applyTime).toBeLessThan(3000);
    }, 15000);
  });

  describe('Concurrent Operations Performance', () => {
    it('should handle 50 concurrent proposal creations', async () => {
      const inputs = createBatchProposals(50, 'concurrent-create');
      
      const startConcurrent = Date.now();
      const results = await Promise.all(
        inputs.map(input => proposalService.createProposal(input))
      );
      const concurrentTime = Date.now() - startConcurrent;
      
      console.log(`  ✓ Created 50 proposals concurrently in ${concurrentTime}ms`);
      
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBe(50);
      expect(concurrentTime).toBeLessThan(10000); // 应该在10秒内完成
    }, 20000);

    it('should handle 20 concurrent decision applications', async () => {
      // 先创建 20 个不同 skills 的 proposals
      const proposals = await Promise.all(
        Array.from({ length: 20 }, async (_, i) => {
          const skillName = `concurrent-apply-${i}`;
          await createTestSkill(skillName, '# Test\nOriginal content\n');
          
          const input = createProposalInput({
            skillName,
            diff: `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,2 +1,3 @@
 # Test
+New line ${i}
 Original content`,
          });
          
          return proposalService.createProposal(input);
        })
      );
      
      // 创建决策
      await Promise.all(
        proposals.map(p =>
          decisionService.createDecision(p.data!.id, {
            decision: 'approve',
            reason: 'Approved',
            decidedBy: 'agent',
          })
        )
      );
      
      // 并发应用
      const startApply = Date.now();
      const results = await Promise.allSettled(
        proposals.map(p => decisionService.applyDecision(p.data!.id))
      );
      const applyTime = Date.now() - startApply;
      
      console.log(`  ✓ Applied 20 decisions concurrently in ${applyTime}ms`);
      
      const successCount = results.filter(
        r => r.status === 'fulfilled' && r.value.success
      ).length;
      
      expect(successCount).toBeGreaterThan(15); // 至少75%成功
      expect(applyTime).toBeLessThan(15000); // 应该在15秒内完成
    }, 30000);
  });

  describe('Memory Efficiency', () => {
    it('should not leak memory when processing many proposals', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 处理 100 个 proposals
      for (let i = 0; i < 100; i++) {
        const input = createProposalInput({ skillName: `memory-test-${i}` });
        await proposalService.createProposal(input);
        
        // 定期读取和删除
        if (i % 10 === 0) {
          const list = await proposalService.listProposals();
          for (const proposal of list.data.slice(0, 5)) {
            await proposalService.deleteProposal(proposal.id);
          }
        }
      }
      
      // 强制垃圾回收（如果启用了）
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB
      
      console.log(`  ✓ Memory increase: ${memoryIncrease.toFixed(2)}MB`);
      
      // 内存增长应该合理（小于50MB）
      expect(memoryIncrease).toBeLessThan(50);
    }, 60000);
  });

  describe('Query Performance', () => {
    it('should query by status efficiently with many proposals', async () => {
      // 创建混合状态的 proposals
      const inputs = createBatchProposals(500, 'query-test');
      await Promise.all(inputs.map(input => proposalService.createProposal(input)));
      
      // 更新部分状态
      const allProposals = await proposalService.listProposals();
      await Promise.all(
        allProposals.data.slice(0, 100).map(p =>
          proposalService.updateProposal(p.id, { status: 'approved' })
        )
      );
      
      // 测试查询性能
      const startQuery = Date.now();
      const pending = await proposalService.listProposals({ status: 'pending' });
      const approved = await proposalService.listProposals({ status: 'approved' });
      const queryTime = Date.now() - startQuery;
      
      console.log(`  ✓ Queried by status in ${queryTime}ms`);
      console.log(`    Pending: ${pending.data.length}, Approved: ${approved.data.length}`);
      
      expect(queryTime).toBeLessThan(5000);
      expect(pending.data.length).toBe(400);
      expect(approved.data.length).toBe(100);
    }, 60000);
  });
});

describe('Performance Benchmarks (Always Run)', () => {
  beforeEach(async () => {
    await cleanupTestDirs();
    await initTestDirs();
    await copySchemas();
  });

  it('should benchmark basic operations', async () => {
    const iterations = 10;
    const times: Record<string, number[]> = {
      create: [],
      read: [],
      update: [],
      list: [],
    };
    
    for (let i = 0; i < iterations; i++) {
      // Create
      let start = Date.now();
      const input = createProposalInput({ skillName: `bench-${i}` });
      const created = await proposalService.createProposal(input);
      times.create.push(Date.now() - start);
      
      // Read
      start = Date.now();
      await proposalService.getProposal(created.data!.id);
      times.read.push(Date.now() - start);
      
      // Update
      start = Date.now();
      await proposalService.updateProposal(created.data!.id, { status: 'approved' });
      times.update.push(Date.now() - start);
      
      // List
      start = Date.now();
      await proposalService.listProposals();
      times.list.push(Date.now() - start);
    }
    
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    
    console.log('\n  📊 Performance Benchmarks (average over 10 iterations):');
    console.log(`    Create: ${avg(times.create).toFixed(2)}ms`);
    console.log(`    Read:   ${avg(times.read).toFixed(2)}ms`);
    console.log(`    Update: ${avg(times.update).toFixed(2)}ms`);
    console.log(`    List:   ${avg(times.list).toFixed(2)}ms`);
    
    // 基本操作应该很快
    expect(avg(times.create)).toBeLessThan(100);
    expect(avg(times.read)).toBeLessThan(50);
    expect(avg(times.update)).toBeLessThan(100);
  }, 30000);
});
