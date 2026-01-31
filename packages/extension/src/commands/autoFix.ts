/**
 * 自动修复命令
 * 自动检测常见问题并提供一键修复选项
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  getWorkspaceRoot,
  getOpenSkillsDir,
  getConfigPath,
  getProposalsDir
} from '../utils/paths';
import { createSkillsAdminSkill } from './init';
import { initializeOpenSkillsStructure } from './init';
import { performHealthCheck } from './healthCheck';
import { diagnoseWake } from './triggerWake';
import { getOutputChannel } from '../outputChannel';

interface AutoFixResult {
  fixed: boolean;
  issues: string[];
  fixes: string[];
  errors: string[];
}

/**
 * 执行自动修复
 */
async function performAutoFix(): Promise<AutoFixResult> {
  const workspaceRoot = getWorkspaceRoot();
  const issues: string[] = [];
  const fixes: string[] = [];
  const errors: string[] = [];

  if (!workspaceRoot) {
    issues.push('未检测到工作区');
    return { fixed: false, issues, fixes, errors };
  }

  // 1. 检查并修复 .openskills 目录
  const openSkillsDir = getOpenSkillsDir();
  if (!openSkillsDir || !fs.existsSync(openSkillsDir)) {
    issues.push('.openskills 目录不存在');
    try {
      await initializeOpenSkillsStructure(workspaceRoot);
      fixes.push('已创建 .openskills 目录结构');
    } catch (error) {
      errors.push(`创建 .openskills 目录失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 2. 检查并修复配置文件
  const configPath = getConfigPath();
  if (!configPath || !fs.existsSync(configPath)) {
    issues.push('配置文件不存在');
    try {
      await initializeOpenSkillsStructure(workspaceRoot);
      fixes.push('已创建配置文件');
    } catch (error) {
      errors.push(`创建配置文件失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    // 验证配置文件是否有效
    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      JSON.parse(configContent);
    } catch (error) {
      issues.push('配置文件损坏');
      // 不自动修复损坏的配置文件，需要用户确认
      errors.push('配置文件损坏，需要手动修复或重新初始化');
    }
  }

  // 3. 检查并修复 skills-admin
  const healthCheck = await performHealthCheck();
  const outputChannel = getOutputChannel();
  if (!healthCheck.skillsAdminFileExists) {
    issues.push('skills-admin 文件不存在');
    try {
      const result = await createSkillsAdminSkill(workspaceRoot, outputChannel);
      if (result.created) {
        fixes.push('已创建 skills-admin 文件');
        if (!result.verified) {
          issues.push('skills-admin 文件验证失败');
        }
      }
    } catch (error) {
      errors.push(`创建 skills-admin 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (!healthCheck.skillsAdminVerified) {
    issues.push('skills-admin 文件内容不完整或损坏');
    try {
      // 尝试重新创建
      const result = await createSkillsAdminSkill(workspaceRoot, outputChannel);
      if (result.created && result.verified) {
        fixes.push('已重新创建并验证 skills-admin 文件');
      }
    } catch (error) {
      errors.push(`修复 skills-admin 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 4. 检查并清理损坏的 pending.json
  const wakePendingPath = path.join(openSkillsDir || workspaceRoot, '.openskills', 'wake', 'pending.json');
  if (fs.existsSync(wakePendingPath)) {
    try {
      const wakeContent = fs.readFileSync(wakePendingPath, 'utf-8');
      JSON.parse(wakeContent);
    } catch (error) {
      issues.push('wake/pending.json 文件损坏');
      // 询问用户是否清理
      const action = await vscode.window.showWarningMessage(
        'wake/pending.json 文件损坏，是否清理？',
        '清理',
        '取消'
      );
      if (action === '清理') {
        try {
          fs.unlinkSync(wakePendingPath);
          fixes.push('已清理损坏的 wake/pending.json 文件');
        } catch (deleteError) {
          errors.push(`清理文件失败: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`);
        }
      }
    }
  }

  // 5. 检查 proposals 目录
  const proposalsDir = getProposalsDir();
  if (!proposalsDir || !fs.existsSync(proposalsDir)) {
    issues.push('proposals 目录不存在');
    try {
      if (openSkillsDir) {
        const proposalsPath = path.join(openSkillsDir, 'proposals');
        fs.mkdirSync(proposalsPath, { recursive: true });
        fixes.push('已创建 proposals 目录');
      }
    } catch (error) {
      errors.push(`创建 proposals 目录失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const fixed = fixes.length > 0 && errors.length === 0;

  return { fixed, issues, fixes, errors };
}

/**
 * 注册自动修复命令
 */
export function registerAutoFixCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('openskills.autoFix', async () => {
    const outputChannel = getOutputChannel();
    outputChannel.show();
    outputChannel.appendLine('=== OpenSkills 自动修复 ===\n');

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: '正在自动修复...',
        cancellable: false
      },
      async progress => {
        progress.report({ message: '检测问题...' });
        const result = await performAutoFix();

        // 显示结果
        outputChannel.appendLine('## 修复结果\n');

        if (result.fixes.length > 0) {
          outputChannel.appendLine('✅ 已修复的问题:');
          result.fixes.forEach((fix, index) => {
            outputChannel.appendLine(`  ${index + 1}. ${fix}`);
          });
          outputChannel.appendLine('');
        }

        if (result.issues.length > 0) {
          outputChannel.appendLine('⚠️ 发现的问题:');
          result.issues.forEach((issue, index) => {
            outputChannel.appendLine(`  ${index + 1}. ${issue}`);
          });
          outputChannel.appendLine('');
        }

        if (result.errors.length > 0) {
          outputChannel.appendLine('❌ 修复失败:');
          result.errors.forEach((error, index) => {
            outputChannel.appendLine(`  ${index + 1}. ${error}`);
          });
          outputChannel.appendLine('');
        }

        if (result.fixed) {
          outputChannel.appendLine('✅ 自动修复完成！');
          
          // 检查是否需要重新加载窗口
          const healthCheck = await performHealthCheck();
          if (healthCheck.needsReload) {
            const reloadAction = await vscode.window.showInformationMessage(
              '已修复问题。⚠️ 重要：需要重新加载窗口才能使某些修复生效（如 skills-admin）。是否立即重新加载？',
              '立即重新加载',
              '稍后'
            );
            
            if (reloadAction === '立即重新加载') {
              await vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
          } else {
            vscode.window.showInformationMessage('✅ 自动修复完成！');
          }
        } else if (result.errors.length > 0) {
          outputChannel.appendLine('⚠️ 部分修复失败，请查看详情并手动修复');
          vscode.window.showWarningMessage('自动修复完成，但部分问题需要手动修复。请查看输出面板获取详情。');
        } else if (result.issues.length > 0) {
          outputChannel.appendLine('ℹ️ 发现了一些问题，但无法自动修复。请查看建议并手动处理。');
          vscode.window.showInformationMessage('检测到一些问题，但无法自动修复。请查看输出面板获取详情。');
        } else {
          outputChannel.appendLine('✅ 未发现问题，系统状态正常');
          vscode.window.showInformationMessage('✅ 系统状态正常，无需修复');
        }

        outputChannel.appendLine('\n=== 自动修复完成 ===');
      }
    );
  });
}
