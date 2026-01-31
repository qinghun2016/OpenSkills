/**
 * Skills Parser - 解析仓库中的 SKILL.md 文件
 * 支持 YAML frontmatter 解析
 */

import { GitHubClient, FileContent } from './githubClient';

export interface ParsedSkill {
  name: string;
  description?: string;
  path: string;
  content: string;
  frontmatter: SkillFrontmatter;
  rawContent: string;
}

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  tags?: string[];
  priority?: number;
  [key: string]: any;
}

export interface RepoSkills {
  owner: string;
  repo: string;
  fullName: string;
  stars: number;
  skills: ParsedSkill[];
  crawledAt: string;
}

// SKILL.md 文件的可能位置
const SKILL_LOCATIONS = [
  'SKILL.md',
  '.cursor/skills/',
  '.claude/skills/',
  'skills/',
];

/**
 * 解析 YAML frontmatter
 * 格式: ---\nkey: value\n---\ncontent
 */
function parseFrontmatter(content: string): {
  frontmatter: SkillFrontmatter;
  content: string;
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: {},
      content: content.trim(),
    };
  }

  const yamlContent = match[1];
  const bodyContent = match[2];

  // 简单的 YAML 解析 (不依赖外部库)
  const frontmatter: SkillFrontmatter = {};
  const lines = yamlContent.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value: any = line.slice(colonIndex + 1).trim();

    // 处理数组格式 [item1, item2]
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((s: string) => s.trim().replace(/^["']|["']$/g, ''));
    }
    // 处理数字
    else if (/^\d+$/.test(value)) {
      value = parseInt(value, 10);
    }
    // 移除引号
    else {
      value = value.replace(/^["']|["']$/g, '');
    }

    frontmatter[key] = value;
  }

  return {
    frontmatter,
    content: bodyContent.trim(),
  };
}

/**
 * 从单个文件解析 Skill
 */
function parseSkillFile(path: string, rawContent: string): ParsedSkill {
  const { frontmatter, content } = parseFrontmatter(rawContent);

  // 从路径或 frontmatter 提取名称
  const pathParts = path.split('/');
  const fileName = pathParts[pathParts.length - 1];
  const dirName = pathParts[pathParts.length - 2];
  
  // 优先使用 frontmatter 中的 name，否则使用目录名或文件名
  const name = frontmatter.name || 
    (fileName === 'SKILL.md' ? dirName : fileName.replace('.md', ''));

  return {
    name,
    description: frontmatter.description,
    path,
    content,
    frontmatter,
    rawContent,
  };
}

export class SkillsParser {
  private client: GitHubClient;

  constructor(client: GitHubClient) {
    this.client = client;
  }

  /**
   * 扫描并解析仓库中的所有 Skills
   * @param owner 仓库所有者
   * @param repo 仓库名
   */
  async parseSkillsFromRepo(owner: string, repo: string): Promise<ParsedSkill[]> {
    const skills: ParsedSkill[] = [];

    // 1. 检查根目录的 SKILL.md
    const rootSkill = await this.client.getRepoContent(owner, repo, 'SKILL.md');
    if (rootSkill) {
      skills.push(parseSkillFile(rootSkill.path, rootSkill.content));
    }

    // 2. 检查 .cursor/skills/ 目录
    const cursorSkills = await this.scanSkillsDirectory(owner, repo, '.cursor/skills');
    skills.push(...cursorSkills);

    // 3. 检查 .claude/skills/ 目录 (部分项目使用)
    const claudeSkills = await this.scanSkillsDirectory(owner, repo, '.claude/skills');
    skills.push(...claudeSkills);

    // 4. 检查 skills/ 目录
    const generalSkills = await this.scanSkillsDirectory(owner, repo, 'skills');
    skills.push(...generalSkills);

    return skills;
  }

  /**
   * 扫描指定目录下的 Skills
   */
  private async scanSkillsDirectory(
    owner: string,
    repo: string,
    dirPath: string
  ): Promise<ParsedSkill[]> {
    const skills: ParsedSkill[] = [];

    try {
      const entries = await this.client.getDirectoryContents(owner, repo, dirPath);
      
      for (const entry of entries) {
        // 检查是否是目录 (通过尝试获取其中的 SKILL.md)
        const skillPath = `${entry}/SKILL.md`;
        const skillContent = await this.client.getRepoContent(owner, repo, skillPath);
        
        if (skillContent) {
          skills.push(parseSkillFile(skillContent.path, skillContent.content));
        } else {
          // 可能是直接的 .md 文件
          if (entry.endsWith('.md')) {
            const content = await this.client.getRepoContent(owner, repo, entry);
            if (content) {
              skills.push(parseSkillFile(content.path, content.content));
            }
          }
        }
      }
    } catch (error) {
      // 目录不存在，跳过
    }

    return skills;
  }

  /**
   * 获取完整的仓库 Skills 信息
   */
  async getRepoSkills(
    owner: string,
    repo: string,
    stars: number = 0
  ): Promise<RepoSkills> {
    const skills = await this.parseSkillsFromRepo(owner, repo);

    return {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      stars,
      skills,
      crawledAt: new Date().toISOString(),
    };
  }
}

// 工厂函数
export function createSkillsParser(client: GitHubClient): SkillsParser {
  return new SkillsParser(client);
}
