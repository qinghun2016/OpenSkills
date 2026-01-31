/**
 * Proposal Generator - 生成符合 proposal.schema.json 的提案
 * 对比外部仓库 Skills 与现有 Skills，生成改进建议
 * 
 * Decision History Feature:
 * - Tracks previously reviewed proposals to avoid re-proposing rejected content
 * - Stores history in .openskills/crawled/decision-history/reviewed-skills.json
 * - Compares content hash to detect duplicate proposals
 */

import { v4 as uuidv4 } from 'uuid';
import { createTwoFilesPatch } from 'diff';
import * as fs from 'fs';
import * as path from 'path';
import { ParsedSkill, RepoSkills } from './skillsParser';
import { Proposal, ProposalScope } from '../types';

export interface ExistingSkill {
  name: string;
  path: string;
  content: string;
  scope: ProposalScope;
}

export interface GeneratedProposal extends Proposal {
  sourceRepo: string;
  sourceSkillPath: string;
}

export interface ProposalGeneratorOptions {
  defaultScope: ProposalScope;
  minContentLength: number;
  skipExisting: boolean;
  workspaceRoot?: string;  // For loading decision history
}

export interface DecisionHistoryEntry {
  decision: 'approve' | 'reject';
  reason: string;
  contentHash: string;
  reviewedAt: string;
  proposalId?: string;
}

export interface DecisionHistory {
  skills: Record<string, DecisionHistoryEntry>;
  lastUpdated: string | null;
}

const DEFAULT_OPTIONS: ProposalGeneratorOptions = {
  defaultScope: 'project',
  minContentLength: 50,
  skipExisting: false,
};

// Decision history file path
const HISTORY_DIR = 'crawled/decision-history';
const HISTORY_FILE = 'reviewed-skills.json';

/** Path prefix in diff so skills-admin / checkDiffTargetPaths accept (must contain .cursor/skills/) */
const DIFF_SKILL_PATH_PREFIX = '.cursor/skills';

/**
 * Generate unified diff. Paths MUST be under .cursor/skills/{skillName}/SKILL.md
 * so diffSafety.checkDiffTargetPaths accepts and skills-admin does not reject.
 */
function generateDiff(
  skillName: string,
  existingContent: string | null,
  newContent: string
): string {
  const oldContent = existingContent || '';
  const oldFileName = existingContent ? `a/${DIFF_SKILL_PATH_PREFIX}/${skillName}/SKILL.md` : '/dev/null';
  const newFileName = `b/${DIFF_SKILL_PATH_PREFIX}/${skillName}/SKILL.md`;

  return createTwoFilesPatch(
    oldFileName,
    newFileName,
    oldContent,
    newContent,
    'existing',
    'proposed'
  );
}

/**
 * Generate a content hash for comparing skill content
 * Uses normalized first 200 chars for quick comparison
 */
function hashContent(content: string): string {
  const normalized = (content || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  return normalized;
}

/**
 * Load decision history from file
 */
function loadDecisionHistory(workspaceRoot?: string): DecisionHistory {
  if (!workspaceRoot) {
    return { skills: {}, lastUpdated: null };
  }
  
  const historyPath = path.join(workspaceRoot, '.openskills', HISTORY_DIR, HISTORY_FILE);
  
  try {
    if (fs.existsSync(historyPath)) {
      return JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    }
  } catch (e) {
    // Ignore errors, return empty history
  }
  
  return { skills: {}, lastUpdated: null };
}

/**
 * Check if a skill was previously rejected with same content
 */
function wasPreviouslyRejected(
  skillName: string,
  sourceRepo: string,
  contentHash: string,
  history: DecisionHistory
): { rejected: boolean; reason?: string } {
  const skillKey = `${skillName}|Crawled from ${sourceRepo}`;
  const entry = history.skills[skillKey];
  
  if (entry && entry.decision === 'reject' && entry.contentHash === contentHash) {
    return { rejected: true, reason: entry.reason };
  }
  
  return { rejected: false };
}

/**
 * 计算内容相似度 (简单实现)
 * 返回 0-1 之间的值，1 表示完全相同
 */
function calculateSimilarity(content1: string, content2: string): number {
  if (content1 === content2) return 1;
  if (!content1 || !content2) return 0;

  const words1 = new Set(content1.toLowerCase().split(/\s+/));
  const words2 = new Set(content2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * 判断是否应该生成提案
 */
function shouldGenerateProposal(
  repoSkill: ParsedSkill,
  existingSkill: ExistingSkill | null,
  options: ProposalGeneratorOptions
): { should: boolean; reason: string } {
  // 内容太短，跳过
  if (repoSkill.content.length < options.minContentLength) {
    return { should: false, reason: 'Content too short' };
  }

  // 新技能
  if (!existingSkill) {
    return { should: true, reason: 'New skill from external repository' };
  }

  // 跳过已存在的技能
  if (options.skipExisting) {
    return { should: false, reason: 'Skill already exists' };
  }

  // 计算相似度
  const similarity = calculateSimilarity(repoSkill.content, existingSkill.content);
  
  // 相似度过高，跳过
  if (similarity > 0.9) {
    return { should: false, reason: 'Content too similar' };
  }

  // 外部内容更丰富
  if (repoSkill.content.length > existingSkill.content.length * 1.2) {
    return { should: true, reason: 'External version has more content' };
  }

  return { should: true, reason: 'Content differs significantly' };
}

export class ProposalGenerator {
  private options: ProposalGeneratorOptions;
  private decisionHistory: DecisionHistory;
  private skippedDueToHistory: string[] = [];

  constructor(options: Partial<ProposalGeneratorOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.decisionHistory = loadDecisionHistory(options.workspaceRoot);
  }

  /**
   * Get list of skills skipped due to decision history (for logging)
   */
  getSkippedDueToHistory(): string[] {
    return this.skippedDueToHistory;
  }

  /**
   * 从仓库 Skills 生成提案列表
   * @param repoSkills 外部仓库的 Skills
   * @param existingSkills 现有 Skills 列表
   * 
   * Now checks decision history to avoid re-proposing previously rejected skills
   */
  generateProposals(
    repoSkills: RepoSkills,
    existingSkills: ExistingSkill[]
  ): GeneratedProposal[] {
    const proposals: GeneratedProposal[] = [];
    const existingMap = new Map(existingSkills.map(s => [s.name.toLowerCase(), s]));
    this.skippedDueToHistory = [];

    for (const skill of repoSkills.skills) {
      const existingSkill = existingMap.get(skill.name.toLowerCase()) || null;
      
      // Check decision history first
      const contentHash = hashContent(skill.rawContent);
      const historyCheck = wasPreviouslyRejected(
        skill.name,
        `${repoSkills.fullName} (${repoSkills.stars} stars)`,
        contentHash,
        this.decisionHistory
      );
      
      if (historyCheck.rejected) {
        this.skippedDueToHistory.push(`${skill.name}: ${historyCheck.reason}`);
        continue;
      }
      
      const { should, reason } = shouldGenerateProposal(
        skill,
        existingSkill,
        this.options
      );

      if (!should) {
        continue;
      }

      const proposal = this.createProposal(skill, existingSkill, repoSkills, reason);
      proposals.push(proposal);
    }

    return proposals;
  }

  /**
   * 创建单个提案
   */
  private createProposal(
    skill: ParsedSkill,
    existingSkill: ExistingSkill | null,
    repoSkills: RepoSkills,
    reason: string
  ): GeneratedProposal {
    const now = new Date().toISOString();
    const isNewSkill = !existingSkill;

    // 生成 diff
    const diff = generateDiff(
      skill.name,
      existingSkill?.content || null,
      skill.rawContent
    );

    // 构建提案理由
    const proposalReason = this.buildReason(skill, repoSkills, reason, isNewSkill);

    return {
      id: uuidv4(),
      skillName: skill.name,
      scope: this.options.defaultScope,
      reason: proposalReason,
      diff,
      trigger: 'crawler',
      proposerMeta: {
        source: 'crawler',
        name: repoSkills.fullName,
        reason: `Crawled from ${repoSkills.fullName} (${repoSkills.stars} stars)`,
        createdAt: now,
      },
      status: 'pending',
      sourceRepo: repoSkills.fullName,
      sourceSkillPath: skill.path,
    };
  }

  /**
   * 构建提案理由
   */
  private buildReason(
    skill: ParsedSkill,
    repoSkills: RepoSkills,
    reason: string,
    isNew: boolean
  ): string {
    const action = isNew ? 'Add new skill' : 'Update skill';
    const description = skill.description || skill.frontmatter.description || '';
    
    let reasonText = `${action} "${skill.name}" from ${repoSkills.fullName}`;
    
    if (description) {
      reasonText += `: ${description}`;
    }
    
    reasonText += `. Source: ${reason}. Repository has ${repoSkills.stars} stars.`;
    
    // 限制长度
    if (reasonText.length > 500) {
      reasonText = reasonText.slice(0, 497) + '...';
    }
    
    return reasonText;
  }

  /**
   * 将提案转换为可写入文件的格式 (不包含额外字段)
   */
  toProposalFile(proposal: GeneratedProposal): Proposal {
    return {
      id: proposal.id,
      skillName: proposal.skillName,
      scope: proposal.scope,
      reason: proposal.reason,
      diff: proposal.diff,
      trigger: proposal.trigger,
      proposerMeta: proposal.proposerMeta,
      status: proposal.status,
    };
  }
}

// 工厂函数
export function createProposalGenerator(
  options?: Partial<ProposalGeneratorOptions>
): ProposalGenerator {
  return new ProposalGenerator(options);
}
