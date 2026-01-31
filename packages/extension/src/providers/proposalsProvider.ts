/**
 * Proposals TreeView Provider
 * 显示待审查的 proposals
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Proposal, ProposalStatus, ProposalScope } from '../types';
import { getApiClient } from '../api/client';
import {
  getProposalsDir,
  listJsonFiles,
  readJsonFile,
  isOpenSkillsInitialized
} from '../utils/paths';
import { getOutputChannel } from '../outputChannel';

/**
 * Proposal TreeItem
 */
export class ProposalTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly proposal?: Proposal,
    public readonly isGroup?: boolean,
    public readonly groupStatus?: ProposalStatus
  ) {
    super(label, collapsibleState);

    if (proposal) {
      this.tooltip = `${proposal.skillName}\n${proposal.reason}`;
      this.description = this.formatDescription(proposal);
      this.contextValue = proposal.status === 'pending' ? 'pendingProposal' : 'proposal';
      this.iconPath = this.getIcon(proposal.status);
      
      // 点击显示详情
      this.command = {
        command: 'openskills.showProposalDetail',
        title: 'Show Proposal Detail',
        arguments: [proposal]
      };
    } else if (isGroup) {
      this.contextValue = 'proposalGroup';
      this.iconPath = new vscode.ThemeIcon('folder');
    }
  }

  private formatDescription(proposal: Proposal): string {
    const scopeBadge = proposal.scope === 'user' ? '[USER]' : '[PROJECT]';
    const statusBadge = this.getStatusBadge(proposal.status);
    return `${scopeBadge} ${statusBadge}`;
  }

  private getStatusBadge(status: ProposalStatus): string {
    switch (status) {
      case 'pending': return '⏳';
      case 'approved': return '✅';
      case 'rejected': return '❌';
      case 'applied': return '🚀';
      default: return '';
    }
  }

  private getIcon(status: ProposalStatus): vscode.ThemeIcon {
    switch (status) {
      case 'pending': return new vscode.ThemeIcon('clock');
      case 'approved': return new vscode.ThemeIcon('check');
      case 'rejected': return new vscode.ThemeIcon('x');
      case 'applied': return new vscode.ThemeIcon('rocket');
      default: return new vscode.ThemeIcon('file');
    }
  }
}

/**
 * Proposals TreeDataProvider
 */
export class ProposalsProvider implements vscode.TreeDataProvider<ProposalTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ProposalTreeItem | undefined | null | void> = 
    new vscode.EventEmitter<ProposalTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ProposalTreeItem | undefined | null | void> = 
    this._onDidChangeTreeData.event;

  private proposals: Proposal[] = [];
  private useApi: boolean = false;

  constructor() {
    this.refresh();
  }

  /**
   * 设置是否使用 API
   */
  setUseApi(useApi: boolean): void {
    this.useApi = useApi;
  }

  /**
   * 刷新数据
   */
  async refresh(): Promise<void> {
    await this.loadProposals();
    this._onDidChangeTreeData.fire();
  }

  /**
   * 加载 proposals
   */
  private async loadProposals(): Promise<void> {
    if (this.useApi) {
      await this.loadFromApi();
    } else {
      this.loadFromFiles();
    }
  }

  /**
   * 从 API 加载
   */
  private async loadFromApi(): Promise<void> {
    try {
      const client = getApiClient();
      const response = await client.getProposals();
      if (response.success) {
        this.proposals = response.data as Proposal[];
      } else {
        // API 返回失败，降级到文件读取
        const outputChannel = getOutputChannel();
        outputChannel.appendLine(`[Proposals Provider] ⚠️ API 请求失败: ${response.error || '未知错误'}`);
        outputChannel.appendLine('[Proposals Provider] 降级到文件系统模式');
        this.loadFromFiles();
      }
    } catch (error) {
      // 异常情况，降级到文件读取
      const errorMsg = error instanceof Error ? error.message : String(error);
      const outputChannel = getOutputChannel();
      outputChannel.appendLine(`[Proposals Provider] ❌ API 加载异常: ${errorMsg}`);
      outputChannel.appendLine('[Proposals Provider] 降级到文件系统模式');
      this.loadFromFiles();
    }
  }

  /**
   * 从文件加载
   */
  private loadFromFiles(): void {
    try {
      const proposalsDir = getProposalsDir();
      if (!proposalsDir) {
        this.proposals = [];
        return;
      }

      const files = listJsonFiles(proposalsDir);
      const loadedProposals: Proposal[] = [];
      const errors: string[] = [];

      for (const file of files) {
        try {
          const proposal = readJsonFile<Proposal>(file);
          if (proposal) {
            loadedProposals.push(proposal);
          }
        } catch (fileError) {
          const errorMsg = fileError instanceof Error ? fileError.message : String(fileError);
          errors.push(`${file}: ${errorMsg}`);
        }
      }

      this.proposals = loadedProposals;

      // 如果有错误，记录到输出通道（但不中断流程）
      if (errors.length > 0) {
        const outputChannel = getOutputChannel();
        outputChannel.appendLine(`[Proposals Provider] ⚠️ 加载 ${errors.length} 个文件时出错:`);
        errors.forEach(err => outputChannel.appendLine(`  - ${err}`));
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const outputChannel = getOutputChannel();
      outputChannel.appendLine(`[Proposals Provider] ❌ 文件加载失败: ${errorMsg}`);
      this.proposals = [];
    }
  }

  /**
   * 获取树形结构根节点
   */
  getTreeItem(element: ProposalTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * 获取子节点
   */
  getChildren(element?: ProposalTreeItem): Thenable<ProposalTreeItem[]> {
    if (!isOpenSkillsInitialized()) {
      return Promise.resolve([]);
    }

    if (!element) {
      // 根节点：按状态分组
      const pending = this.proposals.filter(p => p.status === 'pending');
      const approved = this.proposals.filter(p => p.status === 'approved');
      const rejected = this.proposals.filter(p => p.status === 'rejected');

      const items: ProposalTreeItem[] = [];

      if (pending.length > 0) {
        items.push(new ProposalTreeItem(
          `Pending (${pending.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
          undefined,
          true,
          'pending'
        ));
      }

      if (approved.length > 0) {
        items.push(new ProposalTreeItem(
          `Approved (${approved.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          undefined,
          true,
          'approved'
        ));
      }

      if (rejected.length > 0) {
        items.push(new ProposalTreeItem(
          `Rejected (${rejected.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          undefined,
          true,
          'rejected'
        ));
      }

      if (items.length === 0) {
        items.push(new ProposalTreeItem(
          'No proposals',
          vscode.TreeItemCollapsibleState.None
        ));
      }

      return Promise.resolve(items);
    }

    // 子节点：显示具体 proposals
    if (element.isGroup && element.groupStatus) {
      const filtered = this.proposals.filter(p => p.status === element.groupStatus);
      return Promise.resolve(
        filtered.map(proposal => new ProposalTreeItem(
          proposal.skillName,
          vscode.TreeItemCollapsibleState.None,
          proposal
        ))
      );
    }

    return Promise.resolve([]);
  }

  /**
   * 获取 pending proposals 数量
   */
  getPendingCount(): number {
    return this.proposals.filter(p => p.status === 'pending').length;
  }

  /**
   * 获取指定 ID 的 proposal
   */
  getProposal(id: string): Proposal | undefined {
    return this.proposals.find(p => p.id === id);
  }

  /**
   * 获取所有 proposals
   */
  getAllProposals(): Proposal[] {
    return [...this.proposals];
  }
}
