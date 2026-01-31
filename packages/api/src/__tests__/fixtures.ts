/**
 * Test Fixtures and Helper Functions
 * 提供可复用的测试数据生成函数
 */

import { ProposalCreateInput, DecisionCreateInput } from '../types';

/**
 * 生成测试用的 Proposal 输入数据
 */
export function createProposalInput(overrides: Partial<ProposalCreateInput> = {}): ProposalCreateInput {
  return {
    skillName: 'test-skill',
    scope: 'project',
    reason: 'Test proposal for automated testing',
    diff: createDefaultDiff(),
    trigger: 'test',
    proposerMeta: { source: 'agent' },
    ...overrides,
  };
}

/**
 * 生成测试用的 Decision 输入数据
 */
export function createDecisionInput(overrides: Partial<Omit<DecisionCreateInput, 'decidedAt'>> = {}): DecisionCreateInput {
  return {
    decision: 'approve',
    reason: 'Approved for testing',
    decidedBy: 'agent',
    decidedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * 生成默认的 unified diff 字符串
 */
export function createDefaultDiff(): string {
  return `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,2 +1,3 @@
 # Test Skill
+New content
 Original content`;
}

/**
 * 生成简单的添加内容 diff
 */
export function createAdditionDiff(content: string): string {
  return `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,2 +1,3 @@
 # Test Skill
+${content}
 Original content`;
}

/**
 * 生成简单的删除内容 diff
 */
export function createDeletionDiff(): string {
  return `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,3 +1,2 @@
 # Test Skill
-Line to delete
 Original content`;
}

/**
 * 生成修改内容 diff
 */
export function createModificationDiff(oldContent: string, newContent: string): string {
  return `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,2 +1,2 @@
 # Test Skill
-${oldContent}
+${newContent}`;
}

/**
 * 生成多行变更的复杂 diff
 */
export function createComplexDiff(): string {
  return `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,5 +1,7 @@
 # Test Skill
 
+## New Section
+
 Original content
-Old line
+Modified line
 Final content`;
}

/**
 * 生成测试用的 Skill 内容模板
 */
export const SKILL_TEMPLATES = {
  minimal: '# Test Skill\nMinimal content\n',
  
  standard: `---
name: test-skill
description: A test skill for unit testing
---

# Test Skill

Test content for automated testing.

## Usage

Example usage here.
`,

  withMetadata: `---
name: test-skill
description: A test skill with metadata
version: 1.0.0
author: Test Suite
---

# Test Skill

Detailed test content.
`,

  multiSection: `# Test Skill

## Section 1

Content for section 1.

## Section 2

Content for section 2.

## Section 3

Content for section 3.
`,
};

/**
 * 生成批量测试数据
 */
export function createBatchProposals(count: number, baseSkillName: string = 'batch-skill'): ProposalCreateInput[] {
  return Array.from({ length: count }, (_, i) => ({
    skillName: `${baseSkillName}-${i + 1}`,
    scope: i % 2 === 0 ? 'project' : 'user' as const,
    reason: `Batch proposal ${i + 1}`,
    diff: createAdditionDiff(`Batch content ${i + 1}`),
    trigger: 'batch-test',
    proposerMeta: { source: 'agent' as const },
  }));
}

/**
 * 生成针对同一 skill 的多个 proposals
 */
export function createConflictingProposals(skillName: string, count: number): ProposalCreateInput[] {
  return Array.from({ length: count }, (_, i) => ({
    skillName,
    scope: 'project' as const,
    reason: `Conflicting change ${i + 1}`,
    diff: createModificationDiff('Original content', `Modified content ${i + 1}`),
    trigger: 'conflict-test',
    proposerMeta: { source: 'agent' as const },
  }));
}

/**
 * 测试用的错误输入数据
 */
export const INVALID_INPUTS = {
  emptyStrings: {
    skillName: '',
    scope: 'project' as const,
    reason: '',
    diff: '',
    trigger: 'test',
    proposerMeta: { source: 'agent' as const },
  },

  invalidScope: {
    skillName: 'test',
    scope: 'invalid' as any,
    reason: 'Test',
    diff: '--- a\n+++ b',
    trigger: 'test',
    proposerMeta: { source: 'agent' as const },
  },

  missingFields: {
    skillName: 'test',
    // scope missing
    reason: 'Test',
  } as any,
};

/**
 * 生成大文件内容（用于性能测试）
 */
export function generateLargeContent(sizeInKB: number): string {
  const lineSize = 80; // 每行约80字符
  const linesPerKB = Math.floor(1024 / lineSize);
  const totalLines = sizeInKB * linesPerKB;
  
  const lines: string[] = ['# Large Test Skill\n'];
  for (let i = 0; i < totalLines; i++) {
    lines.push(`Line ${i + 1}: ${'x'.repeat(lineSize - 20)}\n`);
  }
  
  return lines.join('');
}

/**
 * 生成大型 diff（用于性能测试）
 */
export function generateLargeDiff(changeCount: number): string {
  const hunks: string[] = ['--- a/SKILL.md', '+++ b/SKILL.md'];
  
  for (let i = 0; i < changeCount; i++) {
    hunks.push(`@@ -${i * 3 + 1},2 +${i * 3 + 1},3 @@`);
    hunks.push(` Context line ${i * 3 + 1}`);
    hunks.push(`+New line ${i + 1}`);
    hunks.push(` Context line ${i * 3 + 2}`);
  }
  
  return hunks.join('\n');
}
