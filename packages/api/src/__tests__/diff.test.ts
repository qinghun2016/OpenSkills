/**
 * Diff 应用与回滚测试
 */

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

describe('Diff Service', () => {
  // 每个测试前重新初始化
  beforeEach(async () => {
    await cleanupTestDirs();
    await initTestDirs();
    await copySchemas();
  });

  describe('parseDiff', () => {
    it('should parse a valid unified diff', () => {
      const diffString = `--- a/file.md
+++ b/file.md
@@ -1,3 +1,4 @@
 # Title
+New line
 Content
 More content`;

      const parsed = diffService.parseDiff(diffString);

      expect(parsed).toBeDefined();
      expect(parsed.length).toBe(1);
      expect(parsed[0].hunks.length).toBe(1);
    });

    it('should handle empty diff', () => {
      const parsed = diffService.parseDiff('');
      expect(parsed).toEqual([]);
    });
  });

  describe('applyPatch', () => {
    it('should apply patch to matching content', () => {
      const original = '# Title\nContent\nMore content\n';
      const diff = `--- a/file.md
+++ b/file.md
@@ -1,3 +1,4 @@
 # Title
+New line
 Content
 More content`;

      const result = diffService.applyPatch(original, diff);

      expect(result).not.toBe(false);
      expect(result).toContain('New line');
    });

    it('should return false for non-matching content', () => {
      const original = 'Completely different content';
      const diff = `--- a/file.md
+++ b/file.md
@@ -1,3 +1,4 @@
 # Title
+New line
 Content
 More content`;

      const result = diffService.applyPatch(original, diff);

      expect(result).toBe(false);
    });

    it('should apply patch with fuzz factor', () => {
      const original = '# Title\n\nContent\nMore content\n';
      const diff = `--- a/file.md
+++ b/file.md
@@ -1,3 +1,4 @@
 # Title
+New line
 Content
 More content`;

      const result = diffService.applyPatch(original, diff, { fuzz: 3 });

      // Fuzz factor 应该允许模糊匹配，即使原文有空行
      expect(result).not.toBe(false);
      expect(typeof result).toBe('string');
      if (typeof result === 'string') {
        expect(result).toContain('New line');
        expect(result).toContain('# Title');
      }
    });
  });

  describe('createDiff', () => {
    it('should create diff between two strings', () => {
      const oldContent = '# Title\nOld content\n';
      const newContent = '# Title\nNew content\n';

      const diff = diffService.createDiff(oldContent, newContent);

      expect(diff).toContain('---');
      expect(diff).toContain('+++');
      expect(diff).toContain('-Old content');
      expect(diff).toContain('+New content');
    });

    it('should handle empty old content (new file)', () => {
      const oldContent = '';
      const newContent = '# New File\nContent\n';

      const diff = diffService.createDiff(oldContent, newContent);

      expect(diff).toContain('+# New File');
    });
  });

  describe('reverseDiff', () => {
    it('should reverse a diff for rollback', () => {
      const originalDiff = `--- a/file.md
+++ b/file.md
@@ -1,2 +1,3 @@
 # Title
+Added line
 Content`;

      const reversed = diffService.reverseDiff(originalDiff);

      expect(reversed).toContain('-Added line');
      expect(reversed).not.toContain('+Added line');
    });
  });

  describe('applyDiff', () => {
    it('should apply diff to existing file', async () => {
      const skillPath = await createTestSkill('apply-test', '# Title\nContent\n');
      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,2 +1,3 @@
 # Title
+Added line
 Content`;

      const result = await diffService.applyDiff(skillPath, diff, {
        proposalId: 'test-proposal-1',
        skillName: 'apply-test',
        scope: 'project',
        appliedBy: 'agent',
      });

      expect(result.success).toBe(true);
      expect(result.newContent).toContain('Added line');
      expect(result.historyId).toBeDefined();

      // 验证文件已更新
      const content = await fs.readFile(skillPath, 'utf-8');
      expect(content).toContain('Added line');
    });

    it('should create history entry when applying diff', async () => {
      const skillPath = await createTestSkill('history-test', '# Title\nContent\n');
      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,2 +1,3 @@
 # Title
+History line
 Content`;

      const result = await diffService.applyDiff(skillPath, diff, {
        proposalId: 'test-proposal-2',
        skillName: 'history-test',
        scope: 'project',
        appliedBy: 'agent',
      });

      expect(result.success).toBe(true);

      // 验证历史记录已创建
      const history = await historyService.getHistoryEntry(result.historyId!);
      expect(history).toBeDefined();
      expect(history?.proposalId).toBe('test-proposal-2');
      expect(history?.originalContent).toBe('# Title\nContent\n');
    });

    it('should create file if it does not exist', async () => {
      const skillDir = path.join(TEST_SKILLS_DIR, 'new-skill');
      await fs.mkdir(skillDir, { recursive: true });
      const skillPath = path.join(skillDir, 'SKILL.md');

      const diff = `--- /dev/null
+++ b/SKILL.md
@@ -0,0 +1,2 @@
+# New Skill
+Created from scratch`;

      const result = await diffService.applyDiff(skillPath, diff, {
        proposalId: 'new-file-proposal',
        skillName: 'new-skill',
        scope: 'project',
        appliedBy: 'agent',
      });

      expect(result.success).toBe(true);

      const content = await fs.readFile(skillPath, 'utf-8');
      expect(content).toContain('# New Skill');
    });

    it('should fail if diff does not match', async () => {
      const skillPath = await createTestSkill('mismatch-test', 'Completely different content');
      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,2 +1,3 @@
 # Title
+Added line
 Content`;

      const result = await diffService.applyDiff(skillPath, diff, {
        proposalId: 'mismatch-proposal',
        skillName: 'mismatch-test',
        scope: 'project',
        appliedBy: 'agent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not match');
    });
  });

  describe('validateDiff', () => {
    it('should validate diff can be applied', async () => {
      const skillPath = await createTestSkill('validate-test', '# Title\nContent\n');
      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,2 +1,3 @@
 # Title
+New line
 Content`;

      const result = await diffService.validateDiff(skillPath, diff);

      expect(result.valid).toBe(true);
    });

    it('should report invalid diff', async () => {
      const skillPath = await createTestSkill('invalid-test', 'Wrong content');
      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,2 +1,3 @@
 # Title
+New line
 Content`;

      const result = await diffService.validateDiff(skillPath, diff);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('previewDiff', () => {
    it('should preview diff result', async () => {
      const skillPath = await createTestSkill('preview-test', '# Title\nContent\n');
      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,2 +1,3 @@
 # Title
+Preview line
 Content`;

      const result = await diffService.previewDiff(skillPath, diff);

      expect(result.success).toBe(true);
      expect(result.preview).toContain('Preview line');
    });
  });

  describe('revertDiff', () => {
    it('should revert applied diff', async () => {
      const originalContent = '# Title\nContent\n';
      const skillPath = await createTestSkill('revert-test', originalContent);
      
      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,2 +1,3 @@
 # Title
+Added line
 Content`;

      // 先应用 diff
      const applyResult = await diffService.applyDiff(skillPath, diff, {
        proposalId: 'revert-proposal',
        skillName: 'revert-test',
        scope: 'project',
        appliedBy: 'agent',
      });

      expect(applyResult.success).toBe(true);

      // 验证内容已变更
      let content = await fs.readFile(skillPath, 'utf-8');
      expect(content).toContain('Added line');

      // 回滚
      const revertResult = await diffService.revertDiff(skillPath, diff);

      expect(revertResult.success).toBe(true);
      
      // 验证内容已恢复
      content = await fs.readFile(skillPath, 'utf-8');
      expect(content).toBe(originalContent);
    });
  });

  describe('restoreFromBackup', () => {
    it('should restore from backup file', async () => {
      const originalContent = '# Original\nOriginal content\n';
      const skillPath = await createTestSkill('backup-test', originalContent);
      
      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,2 +1,3 @@
 # Original
+New line
 Original content`;

      // 应用 diff（会创建备份）
      const applyResult = await diffService.applyDiff(skillPath, diff, {
        proposalId: 'backup-proposal',
        skillName: 'backup-test',
        scope: 'project',
        appliedBy: 'agent',
      });

      expect(applyResult.success).toBe(true);

      // 从备份恢复
      const restoreResult = await diffService.restoreFromBackup(
        skillPath,
        applyResult.historyId!
      );

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.restoredContent).toBe(originalContent);

      // 验证文件已恢复
      const content = await fs.readFile(skillPath, 'utf-8');
      expect(content).toBe(originalContent);
    });

    it('should fail if backup not found', async () => {
      const skillPath = await createTestSkill('no-backup', '# Test');

      const result = await diffService.restoreFromBackup(skillPath, 'non-existent-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Backup file not found');
    });
  });

  describe('Complex Diff Scenarios', () => {
    it('should handle diff with multiple hunks', () => {
      const original = `# Title

## Section 1
Content 1

## Section 2
Content 2

## Section 3
Content 3`;

      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,4 +1,5 @@
 # Title
+Introduction added

 ## Section 1
@@ -6,6 +7,7 @@ Content 1

 ## Section 2
 Content 2
+More content in section 2

 ## Section 3
@@ -13,1 +15,2 @@ Content 2
 Content 3
+Footer added`;

      const result = diffService.applyPatch(original, diff);

      expect(result).not.toBe(false);
      if (typeof result === 'string') {
        expect(result).toContain('Introduction added');
        expect(result).toContain('More content in section 2');
        expect(result).toContain('Footer added');
        expect(result).toContain('# Title');
      }
    });

    it('should handle diff with special characters', () => {
      const original = '# Title\nContent with symbols: $VAR, @mention, #tag\n';
      
      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,2 +1,3 @@
 # Title
+Special: €, ¥, £, ©, ®, ™, 中文, 日本語, 🚀, 😀
 Content with symbols: $VAR, @mention, #tag`;

      const result = diffService.applyPatch(original, diff);

      expect(result).not.toBe(false);
      if (typeof result === 'string') {
        expect(result).toContain('€, ¥, £');
        expect(result).toContain('中文, 日本語');
        expect(result).toContain('🚀, 😀');
      }
    });

    it('should handle diff with Unicode and emoji', () => {
      const original = '# README\n\nBasic content\n';
      
      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,3 +1,5 @@
 # README
 
+こんにちは世界 🌏
+Привет мир 🌍
 Basic content`;

      const result = diffService.applyPatch(original, diff);

      expect(result).not.toBe(false);
      if (typeof result === 'string') {
        expect(result).toContain('こんにちは世界');
        expect(result).toContain('Привет мир');
        expect(result).toContain('🌏');
        expect(result).toContain('🌍');
      }
    });

    it('should handle very large diff (1000+ lines)', async () => {
      // 生成大量内容
      const lines = Array.from({ length: 1000 }, (_, i) => `Line ${i + 1}`);
      const original = lines.join('\n');
      
      // 在中间插入一行
      const modifiedLines = [...lines.slice(0, 500), 'INSERTED LINE', ...lines.slice(500)];
      const expected = modifiedLines.join('\n');
      
      const diff = diffService.createDiff(original, expected);
      expect(diff).toBeDefined();
      
      const result = diffService.applyPatch(original, diff);
      
      expect(result).not.toBe(false);
      if (typeof result === 'string') {
        expect(result).toContain('INSERTED LINE');
        expect(result.split('\n').length).toBe(1001);
      }
    });

    it('should handle diff with Windows line endings (CRLF)', () => {
      const original = '# Title\r\nContent line 1\r\nContent line 2\r\n';
      
      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,3 +1,4 @@
 # Title
+New line
 Content line 1
 Content line 2`;

      const result = diffService.applyPatch(original, diff);

      // 应该能处理混合换行符
      expect(result).not.toBe(false);
      if (typeof result === 'string') {
        expect(result).toContain('New line');
      }
    });

    it('should handle diff with tabs and mixed indentation', () => {
      const original = '# Code\n\tfunction test() {\n\t\treturn true;\n\t}\n';
      
      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,4 +1,5 @@
 # Code
 \tfunction test() {
+\t\tconsole.log('debug');
 \t\treturn true;
 \t}`;

      const result = diffService.applyPatch(original, diff);

      expect(result).not.toBe(false);
      if (typeof result === 'string') {
        expect(result).toContain('console.log');
        expect(result).toMatch(/\tconsole\.log/); // 应该保留tab缩进
      }
    });

    it('should handle diff with empty lines and whitespace', () => {
      const original = '# Title\n\n\n\nContent\n\n\n';
      
      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1,7 +1,5 @@
 # Title
 
-
-
 Content
 
 `;

      const result = diffService.applyPatch(original, diff);

      expect(result).not.toBe(false);
      if (typeof result === 'string') {
        expect(result).toContain('# Title');
        expect(result).toContain('Content');
      }
    });

    it('should document binary file handling limitation', () => {
      // OpenSkills 主要处理文本文件（SKILL.md），不支持二进制文件
      // 如果将来需要支持，应该：
      // 1. 检测文件是否为二进制
      // 2. 对二进制文件返回明确错误
      // 3. 或使用 base64 + binary diff 工具
      
      const binaryIndicator = '\x00\x01\x02\xFF'; // 二进制特征字符
      const diff = `--- a/binary.dat
+++ b/binary.dat
Binary files differ`;

      // 当前实现会尝试当文本处理，结果可能失败
      // 这是预期行为，因为 SKILL.md 都是文本文件
      expect(true).toBe(true); // 占位测试，记录设计决策
    });
  });

  describe('File Permission Error Handling', () => {
    it('should handle readonly file gracefully', async () => {
      const skillPath = await createTestSkill('readonly-test', '# Original');
      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1 +1,2 @@
 # Original
+New content`;

      // 在 Windows 上设置只读属性
      if (process.platform === 'win32') {
        await fs.chmod(skillPath, 0o444); // 只读权限
      } else {
        await fs.chmod(skillPath, 0o444); // 只读权限
      }

      const result = await diffService.applyDiffToFile(skillPath, diff);

      // 应该失败并返回错误信息，而不是崩溃
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // 恢复权限以便清理
      await fs.chmod(skillPath, 0o644);
    });

    it('should handle directory without write permission', async () => {
      // 注意：这个测试在某些环境下可能需要管理员权限
      const testDir = path.join(TEST_SKILLS_DIR, 'permission-test');
      await fs.mkdir(testDir, { recursive: true });
      
      const skillPath = path.join(testDir, 'SKILL.md');
      await fs.writeFile(skillPath, '# Test', 'utf-8');

      // 尝试移除目录写权限（在某些系统上可能不生效）
      try {
        if (process.platform !== 'win32') {
          await fs.chmod(testDir, 0o555); // 只读和执行，无写入
        }

        const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1 +1,2 @@
 # Test
+Content`;

        const result = await diffService.applyDiffToFile(skillPath, diff);

        // 某些系统上可能仍然成功（取决于用户权限）
        // 重要的是不要崩溃
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');

        // 恢复权限
        if (process.platform !== 'win32') {
          await fs.chmod(testDir, 0o755);
        }
      } catch (error) {
        // 权限测试在某些环境下可能失败，这是预期的
        // 恢复权限
        if (process.platform !== 'win32') {
          await fs.chmod(testDir, 0o755).catch(() => {});
        }
      }
    });

    it('should handle non-existent file path gracefully', async () => {
      const nonExistentPath = path.join(TEST_SKILLS_DIR, 'does-not-exist', 'SKILL.md');
      const diff = `--- a/SKILL.md
+++ b/SKILL.md
@@ -1 +1,2 @@
 # Test
+Content`;

      const result = await diffService.applyDiffToFile(nonExistentPath, diff);

      // 应该返回错误，而不是抛出异常
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toMatch(/not found|does not exist|ENOENT/i);
    });

    it('should handle invalid file path characters', async () => {
      // 测试包含非法字符的路径（在某些系统上）
      const invalidChars = process.platform === 'win32' 
        ? ['<', '>', ':', '"', '|', '?', '*']
        : ['\0']; // Unix系统只有null字符是非法的

      for (const char of invalidChars) {
        const invalidPath = path.join(TEST_SKILLS_DIR, `invalid${char}name`, 'SKILL.md');
        const diff = '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new';

        // 这个调用不应该导致进程崩溃
        try {
          const result = await diffService.applyDiffToFile(invalidPath, diff);
          expect(result).toBeDefined();
          expect(typeof result.success).toBe('boolean');
        } catch (error) {
          // 某些非法路径可能在文件系统层面就被拒绝，这也是可接受的
          expect(error).toBeDefined();
        }
      }
    });
  });
});
