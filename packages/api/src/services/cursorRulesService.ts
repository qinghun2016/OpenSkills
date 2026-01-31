/**
 * Cursor Rules Service
 * 处理 Cursor 全局用户规则的导出和同步
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface CursorUserRule {
  content: string;
  description?: string;
}

/**
 * 导出 Cursor 全局用户规则到 .mdc 文件
 */
export class CursorRulesService {
  private userRulesDir: string;

  constructor() {
    // 用户级规则目录（跨平台支持）
    // 优先使用 USERPROFILE（Windows），其次使用 HOME（Linux/Mac）
    const homeDir = process.env.USERPROFILE || process.env.HOME || '';
    this.userRulesDir = path.join(homeDir, '.cursor', 'rules');
  }

  /**
   * 确保规则目录存在
   */
  private async ensureRulesDir(): Promise<void> {
    try {
      await fs.mkdir(this.userRulesDir, { recursive: true });
    } catch (error) {
      console.error('[CursorRulesService] Failed to create rules directory:', error);
      throw error;
    }
  }

  /**
   * 导出 Cursor 全局用户规则
   * @param rules 规则内容数组
   */
  async exportUserRules(rules: CursorUserRule[]): Promise<{
    success: boolean;
    exported: number;
    filePath?: string;
    error?: string;
  }> {
    try {
      await this.ensureRulesDir();

      if (rules.length === 0) {
        return {
          success: true,
          exported: 0,
        };
      }

      // 将所有规则合并为一个文件
      const ruleContent = this.formatRulesAsMdc(rules);
      const filePath = path.join(this.userRulesDir, 'cursor-user-rules.mdc');

      // 检查现有文件内容，避免不必要的写入
      let needsUpdate = true;
      try {
        const existingContent = await fs.readFile(filePath, 'utf-8');
        if (existingContent === ruleContent) {
          needsUpdate = false;
        }
      } catch {
        // 文件不存在，需要创建
      }

      if (needsUpdate) {
        await fs.writeFile(filePath, ruleContent, 'utf-8');
        console.log(`[CursorRulesService] Exported ${rules.length} user rules to ${filePath}`);
      } else {
        console.log(`[CursorRulesService] User rules already up to date`);
      }

      return {
        success: true,
        exported: rules.length,
        filePath,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[CursorRulesService] Failed to export user rules:', errorMsg);
      return {
        success: false,
        exported: 0,
        error: errorMsg,
      };
    }
  }

  /**
   * 格式化规则为 .mdc 文件格式
   */
  private formatRulesAsMdc(rules: CursorUserRule[]): string {
    const frontmatter = `---
description: Cursor 全局用户规则（自动同步）
alwaysApply: true
source: cursor-global-settings
lastSynced: ${new Date().toISOString()}
---

# Cursor 全局用户规则

这些规则是从 Cursor 的设置中自动同步的全局用户规则。

## 规则内容

`;

    const rulesContent = rules
      .map((rule, index) => {
        const ruleHeader = rule.description
          ? `### ${rule.description}\n\n`
          : `### 规则 ${index + 1}\n\n`;
        return ruleHeader + rule.content.trim() + '\n';
      })
      .join('\n---\n\n');

    return frontmatter + rulesContent;
  }

  /**
   * 获取导出的规则文件路径（用于 stat 等）
   */
  getExportedRulesFilePath(): string {
    return path.join(this.userRulesDir, 'cursor-user-rules.mdc');
  }

  /**
   * 读取已导出的规则文件
   */
  async readExportedRules(): Promise<CursorUserRule[] | null> {
    try {
      const filePath = path.join(this.userRulesDir, 'cursor-user-rules.mdc');
      const content = await fs.readFile(filePath, 'utf-8');
      
      // 简单解析：提取规则内容（跳过 frontmatter）
      const frontmatterEnd = content.indexOf('---\n\n#');
      if (frontmatterEnd === -1) {
        return null;
      }

      let rulesSection = content.substring(frontmatterEnd + 7); // 跳过 '---\n\n#'
      // 去掉「# Cursor 全局用户规则 … ## 规则内容」模板文案，避免被当成第一条规则
      const introEnd = rulesSection.indexOf('\n## 规则内容\n\n');
      if (introEnd !== -1) {
        rulesSection = rulesSection.substring(introEnd + '\n## 规则内容\n\n'.length);
      } else {
        // 兼容：若没有该标题，从第一个 ### 开始（首条规则）
        const firstH3 = rulesSection.indexOf('\n### ');
        if (firstH3 !== -1) {
          rulesSection = rulesSection.substring(firstH3 + 1);
        }
      }

      const rules: CursorUserRule[] = [];
      const ruleBlocks = rulesSection.split(/\n---\n\n/);
      for (const block of ruleBlocks) {
        const trimmed = block.trim();
        if (trimmed) {
          const descMatch = trimmed.match(/^### (.+?)\n\n/);
          const description = descMatch ? descMatch[1] : undefined;
          const ruleContent = descMatch ? trimmed.substring(descMatch[0].length) : trimmed;
          rules.push({
            content: ruleContent,
            description,
          });
        }
      }

      return rules;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // 文件不存在，返回空数组
        return [];
      }
      console.error('[CursorRulesService] Failed to read exported rules:', error);
      return null;
    }
  }
}
