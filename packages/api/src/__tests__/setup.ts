/**
 * Jest 测试环境设置
 * 在所有测试前执行
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.OPENSKILLS_WORKSPACE = path.join(__dirname, 'test-workspace');

// 测试目录
export const TEST_WORKSPACE = process.env.OPENSKILLS_WORKSPACE;
export const TEST_OPENSKILLS_DIR = path.join(TEST_WORKSPACE, '.openskills');
export const TEST_PROPOSALS_DIR = path.join(TEST_OPENSKILLS_DIR, 'proposals');
export const TEST_DECISIONS_DIR = path.join(TEST_OPENSKILLS_DIR, 'decisions');
export const TEST_HISTORY_DIR = path.join(TEST_OPENSKILLS_DIR, 'history');
export const TEST_SCHEMAS_DIR = path.join(TEST_OPENSKILLS_DIR, 'schemas');
export const TEST_SKILLS_DIR = path.join(TEST_WORKSPACE, '.cursor', 'skills');

/**
 * 初始化测试目录结构
 */
export async function initTestDirs(): Promise<void> {
  await fs.mkdir(TEST_PROPOSALS_DIR, { recursive: true });
  await fs.mkdir(TEST_DECISIONS_DIR, { recursive: true });
  await fs.mkdir(path.join(TEST_HISTORY_DIR, 'backups'), { recursive: true });
  await fs.mkdir(TEST_SCHEMAS_DIR, { recursive: true });
  await fs.mkdir(TEST_SKILLS_DIR, { recursive: true });
}

/**
 * 清理测试目录
 */
export async function cleanupTestDirs(): Promise<void> {
  try {
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

/**
 * 复制 schemas 到测试目录
 */
export async function copySchemas(): Promise<void> {
  const sourceDir = path.resolve(__dirname, '../../../../.openskills/schemas');
  
  try {
    const files = await fs.readdir(sourceDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(sourceDir, file), 'utf-8');
        await fs.writeFile(path.join(TEST_SCHEMAS_DIR, file), content);
      }
    }
  } catch {
    // 如果源目录不存在，创建空的 schemas
    const proposalSchema = {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "required": ["id", "skillName", "scope", "reason", "diff", "status"],
      "properties": {
        "id": { "type": "string" },
        "skillName": { "type": "string" },
        "scope": { "type": "string", "enum": ["user", "project"] },
        "reason": { "type": "string" },
        "diff": { "type": "string" },
        "trigger": { "type": "string" },
        "proposerMeta": { "type": "object" },
        "status": { "type": "string", "enum": ["pending", "approved", "rejected"] }
      }
    };
    
    const decisionSchema = {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "required": ["proposalId", "decision", "reason", "decidedBy", "decidedAt"],
      "properties": {
        "proposalId": { "type": "string" },
        "decision": { "type": "string", "enum": ["approve", "reject"] },
        "reason": { "type": "string" },
        "decidedBy": { "type": "string" },
        "decidedAt": { "type": "string" },
        "appliedAt": { "type": "string" }
      }
    };
    
    await fs.writeFile(
      path.join(TEST_SCHEMAS_DIR, 'proposal.schema.json'),
      JSON.stringify(proposalSchema, null, 2)
    );
    await fs.writeFile(
      path.join(TEST_SCHEMAS_DIR, 'decision.schema.json'),
      JSON.stringify(decisionSchema, null, 2)
    );
  }
}

/**
 * 创建测试 SKILL.md 文件
 */
export async function createTestSkill(
  skillName: string,
  content: string = '# Test Skill\n\nThis is a test skill.'
): Promise<string> {
  const skillDir = path.join(TEST_SKILLS_DIR, skillName);
  await fs.mkdir(skillDir, { recursive: true });
  const skillPath = path.join(skillDir, 'SKILL.md');
  await fs.writeFile(skillPath, content);
  return skillPath;
}

// 全局 beforeAll - 初始化测试环境
beforeAll(async () => {
  await initTestDirs();
  await copySchemas();
});

// 全局 afterAll - 清理测试环境
afterAll(async () => {
  await cleanupTestDirs();
});
