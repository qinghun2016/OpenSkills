/**
 * 拒绝 Proposal 命令
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Proposal, Decision } from '../types';
import { getApiClient } from '../api/client';
import {
  getProposalsDir,
  getDecisionsDir,
  readJsonFile,
  writeJsonFile
} from '../utils/paths';
import { getOutputChannel } from '../outputChannel';

/**
 * 注册拒绝命令
 */
export function registerRejectCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('openskills.reject', async (item?: { proposal?: Proposal }) => {
    let proposal = item?.proposal;

    // 如果没有传入 proposal，让用户选择
    if (!proposal) {
      proposal = await selectPendingProposal();
      if (!proposal) {
        return;
      }
    }

    // 必须输入拒绝原因
    const reason = await vscode.window.showInputBox({
      prompt: '拒绝原因（必填）',
      placeHolder: '请输入拒绝原因...',
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return '拒绝原因不能为空';
        }
        return null;
      }
    });

    if (!reason) {
      return; // 用户取消
    }

    try {
      const client = getApiClient();
      
      if (client.isAvailable()) {
        // 使用 API
        const response = await client.rejectProposal(proposal.id, reason);
        if (response.success) {
          vscode.window.showInformationMessage(`已拒绝: ${proposal.skillName}`);
        } else {
          throw new Error(response.error || 'API 请求失败');
        }
      } else {
        // 降级模式：直接写入文件
        await rejectProposalLocally(proposal, reason);
        vscode.window.showInformationMessage(`已拒绝: ${proposal.skillName} (离线模式)`);
      }

      // 刷新视图
      vscode.commands.executeCommand('openskills.refresh');

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      const outputChannel = getOutputChannel();
      outputChannel.appendLine(`[拒绝] ❌ 失败: ${message}`);
      if (stack) {
        outputChannel.appendLine(`[拒绝] 堆栈跟踪:`);
        outputChannel.appendLine(stack);
      }
      outputChannel.appendLine(`[拒绝] Proposal ID: ${proposal.id}`);
      outputChannel.appendLine(`[拒绝] Skill 名称: ${proposal.skillName}`);
      outputChannel.appendLine('[拒绝] 建议：');
      outputChannel.appendLine('  1. 检查 API 服务是否正常运行');
      outputChannel.appendLine('  2. 检查网络连接');
      outputChannel.appendLine('  3. 检查文件系统权限（离线模式）');
      outputChannel.appendLine('  4. 查看输出面板获取更多详情');
      
      const action = await vscode.window.showErrorMessage(
        `拒绝失败: ${message}`,
        '查看详情',
        '重试'
      );
      
      if (action === '查看详情') {
        outputChannel.show();
      } else if (action === '重试') {
        vscode.commands.executeCommand('openskills.reject', { proposal });
      }
    }
  });
}

/**
 * 选择待处理的 Proposal
 */
async function selectPendingProposal(): Promise<Proposal | undefined> {
  try {
    const proposalsDir = getProposalsDir();
    if (!proposalsDir) {
      const outputChannel = getOutputChannel();
      outputChannel.appendLine('[拒绝] ❌ 未找到 proposals 目录');
      outputChannel.appendLine('[拒绝] 建议：');
      outputChannel.appendLine('  1. 确保工作区已正确打开');
      outputChannel.appendLine('  2. 运行 "OpenSkills: 初始化" 命令');
      outputChannel.appendLine('  3. 检查 .openskills/proposals 目录是否存在');
      outputChannel.show();
      
      vscode.window.showErrorMessage(
        '未找到 proposals 目录。请先初始化 OpenSkills 或检查工作区设置。',
        '查看详情',
        '运行初始化'
      ).then(action => {
        if (action === '查看详情') {
          outputChannel.show();
        } else if (action === '运行初始化') {
          vscode.commands.executeCommand('openskills.init');
        }
      });
      return undefined;
    }

    // 加载所有 pending proposals
    const fs = await import('fs');
    let files: string[] = [];
    try {
      files = fs.readdirSync(proposalsDir).filter(f => f.endsWith('.json'));
    } catch (readError) {
      const errorMsg = readError instanceof Error ? readError.message : String(readError);
      const outputChannel = getOutputChannel();
      outputChannel.appendLine(`[拒绝] ❌ 读取 proposals 目录失败: ${errorMsg}`);
      outputChannel.appendLine(`[拒绝] 目录路径: ${proposalsDir}`);
      outputChannel.show();
      
      vscode.window.showErrorMessage(
        `读取 proposals 目录失败: ${errorMsg}`,
        '查看详情'
      ).then(action => {
        if (action === '查看详情') {
          outputChannel.show();
        }
      });
      return undefined;
    }
    
    const proposals: Proposal[] = [];

    for (const file of files) {
      try {
        const filePath = path.join(proposalsDir, file);
        const proposal = readJsonFile<Proposal>(filePath);
        if (proposal && proposal.status === 'pending') {
          proposals.push(proposal);
        }
      } catch (fileError) {
        // 跳过损坏的文件，继续处理其他文件
        const outputChannel = getOutputChannel();
        outputChannel.appendLine(`[拒绝] ⚠️ 跳过损坏的文件: ${file}`);
        outputChannel.appendLine(`[拒绝] 错误: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
      }
    }

    if (proposals.length === 0) {
      vscode.window.showInformationMessage('没有待处理的 proposals');
      return undefined;
    }

    // 显示选择列表
    const items = proposals.map(p => ({
      label: p.skillName,
      description: `[${p.scope.toUpperCase()}] ${p.id}`,
      detail: p.reason,
      proposal: p
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: '选择要拒绝的 Proposal'
    });

    return selected?.proposal;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const outputChannel = getOutputChannel();
    outputChannel.appendLine(`[拒绝] ❌ 选择 Proposal 失败: ${errorMsg}`);
    if (error instanceof Error && error.stack) {
      outputChannel.appendLine(`[拒绝] 堆栈跟踪:`);
      outputChannel.appendLine(error.stack);
    }
    outputChannel.show();
    
    vscode.window.showErrorMessage(
      `选择 Proposal 失败: ${errorMsg}`,
      '查看详情'
    ).then(action => {
      if (action === '查看详情') {
        outputChannel.show();
      }
    });
    return undefined;
  }
}

/**
 * 本地拒绝 Proposal（降级模式）
 */
async function rejectProposalLocally(proposal: Proposal, reason: string): Promise<void> {
  const proposalsDir = getProposalsDir();
  const decisionsDir = getDecisionsDir();

  if (!proposalsDir || !decisionsDir) {
    throw new Error(`目录不存在。Proposals: ${proposalsDir || '未找到'}, Decisions: ${decisionsDir || '未找到'}`);
  }

  try {
    // 更新 proposal 状态
    const proposalPath = path.join(proposalsDir, `${proposal.id}.json`);
    proposal.status = 'rejected';
    writeJsonFile(proposalPath, proposal);

    // 创建决策记录
    const decision: Decision = {
      proposalId: proposal.id,
      decision: 'reject',
      reason,
      adminAgent: 'extension-user',
      timestamp: new Date().toISOString(),
      scope: proposal.scope
    };

    const decisionPath = path.join(decisionsDir, `${proposal.id}.json`);
    writeJsonFile(decisionPath, decision);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`本地拒绝失败: ${msg}。请检查文件系统权限。`);
  }
}
