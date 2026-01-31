/**
 * Home TreeView Provider
 * Single entry: open Web panel
 */

import * as vscode from 'vscode';

export class HomeTreeItem extends vscode.TreeItem {
  constructor(label: string, command: string, icon: string = 'globe') {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = { command, title: label };
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}

export class HomeProvider implements vscode.TreeDataProvider<HomeTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<HomeTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: HomeTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): HomeTreeItem[] {
    return [
      new HomeTreeItem('打开 Web 主页面', 'openskills.openPanel'),
      new HomeTreeItem('在浏览器中打开', 'openskills.openWebInBrowser', 'link-external')
    ];
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}
