/**
 * 全局唯一的 OpenSkills 输出通道
 * 全扩展仅此一处创建通道，避免出现多个「OpenSkills」输出。
 * 使用 globalThis 存储，确保即使模块被加载多次也只会有一个通道实例。
 */

import * as vscode from 'vscode';

const GLOBAL_KEY = '__openskills_output_channel';

function getStoredChannel(): vscode.OutputChannel | undefined {
  return (globalThis as unknown as Record<string, vscode.OutputChannel | undefined>)[GLOBAL_KEY];
}

function setStoredChannel(ch: vscode.OutputChannel): void {
  (globalThis as unknown as Record<string, vscode.OutputChannel>)[GLOBAL_KEY] = ch;
}

export function getOutputChannel(): vscode.OutputChannel {
  let channel = getStoredChannel();
  if (!channel) {
    channel = vscode.window.createOutputChannel('OpenSkills');
    setStoredChannel(channel);
  }
  return channel;
}

const ADMIN_CHANNEL_KEY = '__openskills_admin_output_channel';

function getStoredAdminChannel(): vscode.OutputChannel | undefined {
  return (globalThis as unknown as Record<string, vscode.OutputChannel | undefined>)[ADMIN_CHANNEL_KEY];
}

function setStoredAdminChannel(ch: vscode.OutputChannel): void {
  (globalThis as unknown as Record<string, vscode.OutputChannel>)[ADMIN_CHANNEL_KEY] = ch;
}

/** 全局唯一的 OpenSkillsAdmin 输出通道，用于 skills-admin 后台执行输出，全扩展仅建一个 */
export function getOpenSkillsAdminChannel(): vscode.OutputChannel {
  let channel = getStoredAdminChannel();
  if (!channel) {
    channel = vscode.window.createOutputChannel('OpenSkillsAdmin');
    setStoredAdminChannel(channel);
  }
  return channel;
}
