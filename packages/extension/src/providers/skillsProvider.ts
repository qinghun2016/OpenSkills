/**
 * Skills TreeView Provider
 * 显示用户级和项目级 Skills
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Skill, ProposalScope } from '../types';
import {
  getUserSkillsDir,
  getProjectSkillsDir,
  listDirectories,
  readFile,
  isOpenSkillsInitialized
} from '../utils/paths';

/**
 * Skill TreeItem
 */
export class SkillTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly skill?: Skill,
    public readonly isGroup?: boolean
  ) {
    super(label, collapsibleState);

    if (skill) {
      this.tooltip = skill.description || skill.name;
      this.description = skill.scope === 'user' ? '[USER]' : '[PROJECT]';
      this.contextValue = 'skill';
      this.iconPath = new vscode.ThemeIcon('file-code');
      
      // 点击打开 SKILL.md
      this.command = {
        command: 'vscode.open',
        title: 'Open Skill',
        arguments: [vscode.Uri.file(skill.path)]
      };
    } else if (isGroup) {
      this.contextValue = 'skillGroup';
      this.iconPath = new vscode.ThemeIcon('folder');
    }
  }
}

/**
 * Skills TreeDataProvider
 */
export class SkillsProvider implements vscode.TreeDataProvider<SkillTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<SkillTreeItem | undefined | null | void> = 
    new vscode.EventEmitter<SkillTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SkillTreeItem | undefined | null | void> = 
    this._onDidChangeTreeData.event;

  private userSkills: Skill[] = [];
  private projectSkills: Skill[] = [];

  constructor() {
    this.refresh();
  }

  /**
   * 刷新数据
   */
  refresh(): void {
    this.loadSkills();
    this._onDidChangeTreeData.fire();
  }

  /**
   * 加载所有 Skills
   */
  private loadSkills(): void {
    this.userSkills = this.loadSkillsFromDir(getUserSkillsDir(), 'user');
    
    const projectDir = getProjectSkillsDir();
    this.projectSkills = projectDir ? this.loadSkillsFromDir(projectDir, 'project') : [];
  }

  /**
   * 从目录加载 Skills
   */
  private loadSkillsFromDir(dirPath: string, scope: ProposalScope): Skill[] {
    const skills: Skill[] = [];
    const dirs = listDirectories(dirPath);

    for (const dir of dirs) {
      const skillMdPath = path.join(dir, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        const skill = this.parseSkillMd(skillMdPath, scope);
        if (skill) {
          skills.push(skill);
        }
      }
    }

    return skills;
  }

  /**
   * 解析 SKILL.md 文件
   */
  private parseSkillMd(filePath: string, scope: ProposalScope): Skill | null {
    const content = readFile(filePath);
    if (!content) {
      return null;
    }

    const name = path.basename(path.dirname(filePath));
    let description = '';

    // 解析 YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const descMatch = frontmatter.match(/description:\s*(.+)/);
      if (descMatch) {
        description = descMatch[1].trim();
      }
    }

    return {
      name,
      description,
      path: filePath,
      scope
    };
  }

  /**
   * 获取树形结构根节点
   */
  getTreeItem(element: SkillTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * 获取子节点
   */
  getChildren(element?: SkillTreeItem): Thenable<SkillTreeItem[]> {
    // 检查是否已初始化
    if (!isOpenSkillsInitialized()) {
      return Promise.resolve([]);
    }

    if (!element) {
      // 根节点：显示分组
      const items: SkillTreeItem[] = [];
      
      if (this.userSkills.length > 0) {
        items.push(new SkillTreeItem(
          `User Skills (${this.userSkills.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
          undefined,
          true
        ));
      }
      
      if (this.projectSkills.length > 0) {
        items.push(new SkillTreeItem(
          `Project Skills (${this.projectSkills.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
          undefined,
          true
        ));
      }

      if (items.length === 0) {
        items.push(new SkillTreeItem(
          'No skills found',
          vscode.TreeItemCollapsibleState.None
        ));
      }
      
      return Promise.resolve(items);
    }

    // 子节点：显示具体 Skills
    if (element.label?.toString().startsWith('User Skills')) {
      return Promise.resolve(
        this.userSkills.map(skill => new SkillTreeItem(
          skill.name,
          vscode.TreeItemCollapsibleState.None,
          skill
        ))
      );
    }

    if (element.label?.toString().startsWith('Project Skills')) {
      return Promise.resolve(
        this.projectSkills.map(skill => new SkillTreeItem(
          skill.name,
          vscode.TreeItemCollapsibleState.None,
          skill
        ))
      );
    }

    return Promise.resolve([]);
  }

  /**
   * 获取 Skills 统计
   */
  getStats(): { user: number; project: number; total: number } {
    return {
      user: this.userSkills.length,
      project: this.projectSkills.length,
      total: this.userSkills.length + this.projectSkills.length
    };
  }
}
