import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { merge } from 'lodash';
import {
  Preferences,
  PreferencesHistoryEntry,
  MergedResult,
  DEFAULT_PREFERENCES
} from '../types';

/**
 * Preferences 服务
 * 管理用户级和项目级偏好设置的读写与历史管理
 */
export class PreferencesService {
  private projectRoot: string;
  private userPrefsPath: string;
  private projectPrefsPath: string;
  private historyDir: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.userPrefsPath = path.join(homedir(), '.cursor', 'openskills', 'preferences.json');
    this.projectPrefsPath = path.join(projectRoot, '.openskills', 'preferences.json');
    this.historyDir = path.join(projectRoot, '.openskills', 'preferences-history');
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  /**
   * 安全读取 JSON 文件
   */
  private async readJsonSafe<T>(filePath: string): Promise<T | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  /**
   * 写入 JSON 文件
   */
  private async writeJson<T>(filePath: string, data: T): Promise<void> {
    await this.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * 获取用户级偏好
   */
  async getUserPreferences(): Promise<Partial<Preferences> | null> {
    return this.readJsonSafe<Partial<Preferences>>(this.userPrefsPath);
  }

  /**
   * 获取项目级偏好
   */
  async getProjectPreferences(): Promise<Partial<Preferences> | null> {
    return this.readJsonSafe<Partial<Preferences>>(this.projectPrefsPath);
  }

  /**
   * 获取合并后的偏好（用户级 + 项目级，项目级优先）
   */
  async getMergedPreferences(): Promise<MergedResult<Preferences>> {
    const userPrefs = await this.getUserPreferences();
    const projectPrefs = await this.getProjectPreferences();

    // 深度合并：默认值 < 用户级 < 项目级
    const merged = merge(
      {},
      DEFAULT_PREFERENCES,
      userPrefs || {},
      projectPrefs || {}
    ) as Preferences;

    return {
      merged,
      sources: {
        user: userPrefs,
        project: projectPrefs
      }
    };
  }

  /**
   * 计算两个对象的差异
   */
  private computeDiff(
    before: Partial<Preferences>,
    after: Partial<Preferences>
  ): Record<string, { from: unknown; to: unknown }> {
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
      const beforeVal = (before as Record<string, unknown>)[key];
      const afterVal = (after as Record<string, unknown>)[key];
      
      if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
        diff[key] = { from: beforeVal, to: afterVal };
      }
    }

    return diff;
  }

  /**
   * 更新项目级偏好并记录历史
   */
  async updatePreferences(updates: Partial<Preferences>): Promise<PreferencesHistoryEntry> {
    // 获取当前项目级偏好
    const currentPrefs = (await this.getProjectPreferences()) || {};
    
    // 合并更新
    const newPrefs = merge({}, currentPrefs, updates);

    // 计算差异
    const diff = this.computeDiff(currentPrefs, newPrefs);

    // 创建历史记录
    const historyEntry: PreferencesHistoryEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      before: currentPrefs,
      after: newPrefs,
      diff
    };

    // 保存历史记录
    await this.saveHistoryEntry(historyEntry);

    // 保存新偏好
    await this.writeJson(this.projectPrefsPath, newPrefs);

    return historyEntry;
  }

  /**
   * 保存历史记录
   */
  private async saveHistoryEntry(entry: PreferencesHistoryEntry): Promise<void> {
    await this.ensureDir(this.historyDir);
    const historyPath = path.join(this.historyDir, `${entry.id}.json`);
    await this.writeJson(historyPath, entry);
  }

  /**
   * 获取偏好变更历史列表
   */
  async getHistory(): Promise<PreferencesHistoryEntry[]> {
    try {
      await this.ensureDir(this.historyDir);
      const files = await fs.readdir(this.historyDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const entries: PreferencesHistoryEntry[] = [];
      for (const file of jsonFiles) {
        const entry = await this.readJsonSafe<PreferencesHistoryEntry>(
          path.join(this.historyDir, file)
        );
        if (entry) {
          entries.push(entry);
        }
      }

      // 按时间倒序排列
      return entries.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch {
      return [];
    }
  }

  /**
   * 获取指定历史记录
   */
  async getHistoryEntry(historyId: string): Promise<PreferencesHistoryEntry | null> {
    const historyPath = path.join(this.historyDir, `${historyId}.json`);
    return this.readJsonSafe<PreferencesHistoryEntry>(historyPath);
  }

  /**
   * 回滚到指定历史版本
   */
  async rollback(historyId: string): Promise<PreferencesHistoryEntry> {
    const targetEntry = await this.getHistoryEntry(historyId);
    if (!targetEntry) {
      throw new Error(`History entry not found: ${historyId}`);
    }

    // 获取当前偏好
    const currentPrefs = (await this.getProjectPreferences()) || {};

    // 创建回滚记录（将 before 作为目标状态）
    const rollbackEntry: PreferencesHistoryEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      before: currentPrefs,
      after: targetEntry.before,
      diff: this.computeDiff(currentPrefs, targetEntry.before)
    };

    // 保存回滚历史
    await this.saveHistoryEntry(rollbackEntry);

    // 应用回滚
    await this.writeJson(this.projectPrefsPath, targetEntry.before);

    return rollbackEntry;
  }
}
