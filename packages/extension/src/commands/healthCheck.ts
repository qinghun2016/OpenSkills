/**
 * 健康检查命令
 * 专注于检查 skills-admin agent 状态和 Cursor 识别情况
 * 
 * 与诊断命令的区别：
 * - Health Check: 专注于 skills-admin Agent 的详细状态（文件、内容、是否需要重新加载等）
 * - Diagnose: 全面检查所有组件（工作区、配置、skills-admin、Agent CLI、API、Proposals、唤醒机制等）
 * 
 * 重要说明：
 * - Cursor 中 Agent 与 Skill 不同：Agent 列表来自 .cursor/agents/ 下的 .md，Skill 来自 .cursor/skills/ 下的 SKILL.md
 * - skills-admin 扩展会同时创建 .cursor/agents/skills-admin.md 与 .cursor/skills/skills-admin/SKILL.md
 * - 创建或修改后需重新加载窗口才能被 Cursor 识别
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
  getWorkspaceRoot,
  getFirstWorkspaceFolder,
  getProjectSkillsDir,
  getUserSkillsDir,
  getSkillsAdminPath
} from '../utils/paths';
import { createSkillsAdminSkill } from './init';
import { getLastActivationTimeMs } from '../extension';
import { getOutputChannel } from '../outputChannel';

interface HealthCheckResult {
  workspaceRoot: string | undefined;
  skillsAdminFileExists: boolean;  // 文件是否存在
  skillsAdminAgentAvailable: boolean;  // Agent 是否可用（文件存在 + 已重新加载）
  skillsAdminPath: string | undefined;
  skillsAdminVerified: boolean;
  skillsAdminContent: string | undefined;
  needsReload: boolean;  // 文件存在但需要重新加载才能被 Cursor 识别
  recommendations: string[];
}

/**
 * 执行健康检查（导出供其他模块使用）
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const workspaceRoot = getWorkspaceRoot();
  const cursorRoot = getFirstWorkspaceFolder();
  const recommendations: string[] = [];
  
  if (!workspaceRoot) {
    recommendations.push('请先打开包含 .openskills 的项目文件夹');
    return {
      workspaceRoot: undefined,
      skillsAdminFileExists: false,
      skillsAdminAgentAvailable: false,
      skillsAdminPath: undefined,
      skillsAdminVerified: false,
      skillsAdminContent: undefined,
      needsReload: false,
      recommendations
    };
  }

  // 检查「当前打开的」工作区文件夹下的 skills-admin（Cursor 只扫描该路径）
  const projectSkillsAdminPath = cursorRoot
    ? path.join(cursorRoot, '.cursor', 'skills', 'skills-admin', 'SKILL.md')
    : path.join(workspaceRoot, '.cursor', 'skills', 'skills-admin', 'SKILL.md');
  
  let skillsAdminFileExists = false;
  let skillsAdminAgentAvailable = false;  // Agent 可用 = 文件存在 + 不需要重新加载
  let skillsAdminVerified = false;
  let skillsAdminContent: string | undefined = undefined;
  let needsReload = false;

  // 检查项目级 skills-admin 文件（只检查项目级，不检查用户级）
  if (fs.existsSync(projectSkillsAdminPath)) {
    skillsAdminFileExists = true;
    try {
      skillsAdminContent = fs.readFileSync(projectSkillsAdminPath, 'utf-8');
      
      // 验证内容
      skillsAdminVerified = skillsAdminContent.length > 0 &&
                          skillsAdminContent.includes('skills-admin') &&
                          skillsAdminContent.includes('审查建议');
      
      if (!skillsAdminVerified) {
        recommendations.push('skills-admin 文件存在但内容不完整，建议重新创建');
      }
      
      // Cursor 在窗口启动时扫描 .cursor/skills/，之后不会自动重新扫描。
      const stats = fs.statSync(projectSkillsAdminPath);
      const activationTime = getLastActivationTimeMs();
      const nowMs = Date.now();
      const graceMs = 5000;
      const fileExistedBeforeSession = stats.mtimeMs < activationTime - graceMs;
      const fileModifiedWithin30s = stats.mtimeMs > nowMs - 30 * 1000;

      if (fileExistedBeforeSession) {
        needsReload = false;
      } else if (fileModifiedWithin30s) {
        // 文件在最近 30 秒内新建或修改 → 很可能 Cursor 尚未扫描到，建议重新加载
        needsReload = true;
        recommendations.push('⚠️ skills-admin 文件刚被创建或修改，Cursor 可能尚未加载。请重新加载窗口（Ctrl+Shift+P → Developer: Reload Window）后即可在 Cursor 中看到 Agent。');
      } else {
        // 文件存在且不是“刚改的” → 视为可能已加载，不强制提示重新加载
        needsReload = false;
        recommendations.push('💡 若在 Cursor 中未看到 skills-admin Agent，可尝试重新加载窗口。');
      }
    } catch (error) {
      recommendations.push(`无法读取 skills-admin 文件: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    // 检查用户级（仅用于提示）
    const userSkillsAdminPath = path.join(getUserSkillsDir(), 'skills-admin', 'SKILL.md');
    if (fs.existsSync(userSkillsAdminPath)) {
      recommendations.push('⚠️ 项目级 skills-admin Agent 不存在，但用户级文件存在。建议创建项目级 skills-admin（Cursor 优先识别项目级）');
    } else {
      recommendations.push('❌ skills-admin Agent 不存在。需要创建 SKILL.md 文件并重新加载窗口才能使用。');
      recommendations.push('💡 运行 "OpenSkills: 初始化" 或 "OpenSkills: 健康检查" 创建');
    }
  }

  return {
    workspaceRoot,
    skillsAdminFileExists,
    skillsAdminAgentAvailable: skillsAdminFileExists && !needsReload && skillsAdminVerified,
    skillsAdminPath: skillsAdminFileExists ? projectSkillsAdminPath : undefined,
    skillsAdminVerified,
    skillsAdminContent,
    needsReload,
    recommendations
  };
}

/**
 * 注册健康检查命令
 */
export function registerHealthCheckCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('openskills.healthCheck', async () => {
    // 复用全局输出通道
    const outputChannel = getOutputChannel();
    outputChannel.show();
    outputChannel.appendLine('=== OpenSkills 健康检查 ===\n');

    // 执行检查
    outputChannel.appendLine('正在检查 skills-admin 状态...');
    const result = await performHealthCheck();

    // 显示结果
    outputChannel.appendLine(`\n工作区: ${result.workspaceRoot || '未检测到'}`);
    outputChannel.appendLine(`\n=== Skills-Admin Agent 状态 ===`);
    outputChannel.appendLine(`文件存在: ${result.skillsAdminFileExists ? '✅ 是' : '❌ 否'}`);
    outputChannel.appendLine(`Agent 可用: ${result.skillsAdminAgentAvailable ? '✅ 是（文件存在且已加载）' : '❌ 否'}`);
    
    if (!result.skillsAdminAgentAvailable && result.skillsAdminFileExists) {
      outputChannel.appendLine(`\n⚠️ 重要：文件存在但 Agent 不可用！`);
      if (result.needsReload) {
        outputChannel.appendLine(`原因：文件最近被创建/修改，Cursor 尚未加载`);
        outputChannel.appendLine(`解决：重新加载窗口（Ctrl+Shift+P → Developer: Reload Window）`);
      } else if (!result.skillsAdminVerified) {
        outputChannel.appendLine(`原因：文件内容不完整或损坏`);
        outputChannel.appendLine(`解决：重新创建 skills-admin 文件`);
      }
    }
    
    if (result.skillsAdminPath) {
      outputChannel.appendLine(`\n文件路径: ${result.skillsAdminPath}`);
      outputChannel.appendLine(`文件验证: ${result.skillsAdminVerified ? '✅ 通过' : '❌ 失败'}`);
      
      if (result.skillsAdminContent) {
        const lineCount = result.skillsAdminContent.split('\n').length;
        outputChannel.appendLine(`文件大小: ${result.skillsAdminContent.length} 字符，${lineCount} 行`);
      }
    }

    if (result.needsReload) {
      outputChannel.appendLine(`\n⚠️ 必须重新加载窗口: 是`);
      outputChannel.appendLine(`说明：Cursor 在启动时扫描 skills，之后不会自动重新扫描。`);
      outputChannel.appendLine(`创建或修改文件后，必须重新加载窗口才能被 Cursor 识别为可用 Agent。`);
    }

    // 显示建议
    if (result.recommendations.length > 0) {
      outputChannel.appendLine(`\n建议:`);
      result.recommendations.forEach((rec, index) => {
        outputChannel.appendLine(`  ${index + 1}. ${rec}`);
      });
    } else {
      outputChannel.appendLine(`\n✅ 所有检查通过，skills-admin Agent 可用`);
    }

    // 如果 skills-admin 文件不存在，提供创建选项
    if (!result.skillsAdminFileExists && result.workspaceRoot) {
      outputChannel.appendLine(`\n是否现在创建 skills-admin Agent？`);
      const createAction = await vscode.window.showInformationMessage(
        'skills-admin Agent 不存在（文件不存在），是否现在创建？',
        '创建',
        '取消'
      );

      if (createAction === '创建') {
        outputChannel.appendLine(`\n正在创建 skills-admin...`);
        const createResult = await createSkillsAdminSkill(result.workspaceRoot, outputChannel);
        
        if (createResult.created) {
          const method = createResult.usedAgentCli ? 'Agent CLI' : '直接创建';
          outputChannel.appendLine(`✅ 已创建 (${method}): ${createResult.filePath}`);
          if (createResult.verified) {
            outputChannel.appendLine(`✅ 文件验证通过`);
            
            const reloadAction = await vscode.window.showInformationMessage(
              'skills-admin 文件已创建。⚠️ 重要：必须重新加载窗口才能被 Cursor 识别为可用 Agent。是否立即重新加载？',
              '立即重新加载',
              '稍后'
            );
            
            if (reloadAction === '立即重新加载') {
              await vscode.commands.executeCommand('workbench.action.reloadWindow');
            } else {
              outputChannel.appendLine(`\n⚠️ 重要提示：`);
              outputChannel.appendLine(`文件已创建，但 Cursor Agent 尚未加载！`);
              outputChannel.appendLine(`必须重新加载窗口（Ctrl+Shift+P → Developer: Reload Window）才能使用 skills-admin Agent。`);
            }
          } else {
            outputChannel.appendLine(`⚠️ 文件验证失败: ${createResult.error || '未知错误'}`);
          }
        } else {
          outputChannel.appendLine(`ℹ️ skills-admin 文件已存在: ${createResult.filePath}`);
          if (result.needsReload) {
            outputChannel.appendLine(`⚠️ 但需要重新加载窗口才能被 Cursor 识别为可用 Agent`);
          }
        }
      }
    } else if (result.needsReload) {
      // 如果文件很新，提示重新加载
      const reloadAction = await vscode.window.showInformationMessage(
        '⚠️ skills-admin 文件最近被创建/修改，Cursor Agent 尚未加载。必须重新加载窗口才能被 Cursor 识别为可用 Agent。是否立即重新加载？',
        '立即重新加载',
        '稍后'
      );
      
      if (reloadAction === '立即重新加载') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      } else {
        outputChannel.appendLine(`\n⚠️ 重要：文件存在但 Agent 不可用，必须重新加载窗口！`);
      }
    } else if (result.skillsAdminFileExists && !result.skillsAdminAgentAvailable) {
      // 文件存在但 Agent 不可用（可能是其他原因）
      outputChannel.appendLine(`\n⚠️ 注意：文件存在但 Agent 可能不可用。`);
      outputChannel.appendLine(`如果 Agent 无法使用，请尝试重新加载窗口。`);
    }

    outputChannel.appendLine(`\n=== 健康检查完成 ===`);
  });
}
