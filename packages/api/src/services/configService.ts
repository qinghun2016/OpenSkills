import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { merge, mergeWith } from 'lodash';
import {
  Config,
  ConfigSchema,
  MergedResult,
  DEFAULT_CONFIG
} from '../types';

/**
 * Config 服务
 * 管理用户级和项目级配置的读写
 */
export class ConfigService {
  private projectRoot: string;
  private userConfigPath: string;
  private projectConfigPath: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.userConfigPath = path.join(homedir(), '.cursor', 'openskills', 'config.json');
    this.projectConfigPath = path.join(projectRoot, '.openskills', 'config.json');
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
   * 获取用户级配置
   */
  async getUserConfig(): Promise<Partial<Config> | null> {
    return this.readJsonSafe<Partial<Config>>(this.userConfigPath);
  }

  /**
   * 获取项目级配置
   */
  async getProjectConfig(): Promise<Partial<Config> | null> {
    return this.readJsonSafe<Partial<Config>>(this.projectConfigPath);
  }

  /**
   * 获取合并后的配置（用户级 + 项目级，项目级优先）
   * 使用 mergeWith 让数组字段（如 crawl.topics）以“最右侧”为准整体替换，避免 merge 按索引合并
   * 导致项目级已删除的 topic 被用户级更长数组“补回”，保存后 refetch 又看到已删项。
   */
  async getMergedConfig(): Promise<MergedResult<Config>> {
    const userConfig = await this.getUserConfig();
    const projectConfig = await this.getProjectConfig();

    const mergeArraysReplaced = (objVal: unknown, srcVal: unknown) =>
      Array.isArray(srcVal) ? srcVal : undefined;

    const merged = mergeWith(
      {},
      DEFAULT_CONFIG,
      userConfig || {},
      projectConfig || {},
      mergeArraysReplaced
    ) as Config;

    return {
      merged,
      sources: {
        user: userConfig,
        project: projectConfig
      }
    };
  }

  /**
   * 更新项目级配置
   * 使用 mergeWith 确保 updates 中的数组（如 crawl.topics）整体替换而非按索引合并，
   * 避免删除 topic 后保存时旧数组多出的元素被 lodash merge 保留导致“删不掉、出现重复”。
   */
  async updateConfig(updates: Partial<Config>): Promise<Config> {
    // 获取当前项目级配置
    const currentConfig = (await this.getProjectConfig()) || {};
    
    // 合并更新：数组字段用 updates 中的值整体替换
    const newConfig = mergeWith({}, currentConfig, updates, (objValue, srcValue) => {
      if (Array.isArray(srcValue)) return srcValue;
    });

    // 显式用 updates.crawl.topics 覆盖，确保删除 topic 后保存时不会被 merge 行为“补回”
    if (updates.crawl && Array.isArray(updates.crawl.topics) && newConfig.crawl) {
      newConfig.crawl.topics = updates.crawl.topics;
    }

    // 保存新配置
    await this.writeJson(this.projectConfigPath, newConfig);

    return newConfig as Config;
  }

  /**
   * 获取配置结构说明（schema）
   */
  getConfigSchema(): ConfigSchema {
    return {
      properties: {
        adminMode: {
          type: 'string',
          description: '管理员模式：human_only（仅人类）、agent_only（仅 Agent）、agent_then_human（Agent 初审 + 人类终审）',
          enum: ['human_only', 'agent_only', 'agent_then_human'],
          default: 'agent_then_human'
        },
        skillsAdminSkillRef: {
          type: 'string',
          description: '管理员 Skill 的引用名称',
          default: 'skills-admin'
        },
        proposalValidity: {
          type: 'object',
          description: '提案有效性配置',
          properties: {
            retentionDays: {
              type: 'number',
              description: '提案保留天数',
              default: 90
            }
          }
        },
        crawl: {
          type: 'object',
          description: '爬虫配置',
          properties: {
            enabled: {
              type: 'boolean',
              description: '是否启用爬虫',
              default: false
            },
            schedule: {
              type: 'string',
              description: 'Cron 表达式定义的爬取时间',
              default: '0 2 * * *'
            },
            minStars: {
              type: 'number',
              description: '最低 star 数要求',
              default: 100
            },
            topics: {
              type: 'array',
              description: '爬取的 GitHub topic 列表'
            },
            githubToken: {
              type: 'string',
              description: 'GitHub API Token（敏感信息，建议使用环境变量）'
            }
          }
        },
        wake: {
          type: 'object',
          description: '唤醒任务配置',
          properties: {
            enabled: {
              type: 'boolean',
              description: '是否启用唤醒任务',
              default: true
            },
            schedule: {
              type: 'string',
              description: 'Cron 表达式定义的唤醒时间',
              default: '0 */4 * * *'
            },
            reminderPrompt: {
              type: 'string',
              description: '唤醒时的提示语',
              default: '检查 pending proposals 并继续审查'
            }
          }
        },
        handoff: {
          type: 'object',
          description: '上下文交接配置',
          properties: {
            maxContextTokens: {
              type: 'number',
              description: '最大上下文 token 数',
              default: 50000
            },
            compressWhenAbove: {
              type: 'number',
              description: '超过此 token 数时触发压缩',
              default: 40000
            }
          }
        },
        merge: {
          type: 'object',
          description: '文件合并配置',
          properties: {
            enabled: {
              type: 'boolean',
              description: '是否启用文件合并',
              default: true
            },
            schedule: {
              type: 'string',
              description: 'Cron 表达式定义的合并时间',
              default: '0 3 * * *'
            },
            threshold: {
              type: 'object',
              description: '合并阈值配置',
              properties: {
                fileCount: {
                  type: 'number',
                  description: '触发合并的文件数量阈值',
                  default: 100
                },
                retentionDays: {
                  type: 'number',
                  description: '文件保留天数',
                  default: 30
                }
              }
            },
            strategy: {
              type: 'object',
              description: '合并策略配置',
              properties: {
                byDate: {
                  type: 'boolean',
                  description: '是否按日期合并',
                  default: true
                },
                byStatus: {
                  type: 'boolean',
                  description: '是否按状态合并',
                  default: true
                },
                archiveOld: {
                  type: 'boolean',
                  description: '是否归档旧文件',
                  default: true
                }
              }
            },
            lockTimeout: {
              type: 'number',
              description: '锁超时时间（秒）',
              default: 1800
            }
          }
        }
      }
    };
  }
}
