import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Bot,
  Clock,
  Zap,
  Save,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Textarea } from '@/components/ui/Textarea';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';
import { useConfig, useUpdateConfig } from '@/hooks/useApi';
import { toast } from '@/components/ui/Toaster';
import type { Config as ConfigType, AdminMode } from '@/api/types';

/** 规范化配置：对 crawl.topics 去重，保证与 localConfig 同形，用于比较是否有未保存更改 */
function normalizeConfig(c: ConfigType | null): ConfigType | null {
  if (!c) return null;
  const topics = c.crawl?.topics ?? [];
  const deduped = topics.filter((t, i) => topics.indexOf(t) === i);
  return { ...c, crawl: { ...c.crawl, topics: deduped } };
}

export function Config() {
  const { data: config, isLoading } = useConfig();
  const updateMutation = useUpdateConfig();
  const [localConfig, setLocalConfig] = useState<ConfigType | null>(null);
  const [newTopicInput, setNewTopicInput] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    if (config) {
      setLocalConfig(normalizeConfig(config));
    }
  }, [config]);

  const normalizedConfig = normalizeConfig(config ?? null);
  const hasChanges =
    normalizedConfig != null &&
    localConfig != null &&
    JSON.stringify(normalizedConfig) !== JSON.stringify(localConfig);

  const handleSave = async () => {
    if (!localConfig) return;

    try {
      await updateMutation.mutateAsync(localConfig);
      toast({
        title: '配置已保存',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: '保存失败',
        variant: 'destructive',
      });
    }
  };

  const handleReset = () => {
    if (config) {
      setLocalConfig(normalizeConfig(config));
    }
  };

  const updateLocalConfig = <K extends keyof ConfigType>(key: K, value: ConfigType[K]) => {
    if (!localConfig) return;
    setLocalConfig({ ...localConfig, [key]: value });
  };

  const removeCrawlTopic = (indexToRemove: number) => {
    setLocalConfig((prev) => {
      if (!prev) return prev;
      const topics = prev.crawl?.topics ?? [];
      if (indexToRemove < 0 || indexToRemove >= topics.length) return prev;
      return {
        ...prev,
        crawl: {
          ...prev.crawl,
          topics: topics.filter((_, i) => i !== indexToRemove),
        },
      };
    });
  };

  const addCrawlTopic = () => {
    const value = newTopicInput.trim();
    if (!value || !localConfig?.crawl) return;
    if (localConfig.crawl.topics.includes(value)) {
      setNewTopicInput('');
      return;
    }
    setLocalConfig({
      ...localConfig,
      crawl: {
        ...localConfig.crawl,
        topics: [...localConfig.crawl.topics, value],
      },
    });
    setNewTopicInput('');
  };

  if (isLoading || !localConfig) {
    return (
      <div className="space-y-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-auto max-w-4xl space-y-6"
    >
      {/* Save Bar */}
      {hasChanges && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky top-20 z-10 flex items-center justify-between rounded-lg border border-primary/50 bg-card/95 p-4 shadow-lg backdrop-blur-sm"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <span>有未保存的更改</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              重置
            </Button>
            <Button onClick={handleSave} loading={updateMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              保存
            </Button>
          </div>
        </motion.div>
      )}

      {/* Admin Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            管理员模式
          </CardTitle>
          <CardDescription>配置提议审查的决策模式</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">审查模式</p>
              <p className="text-sm text-muted-foreground">
                决定谁可以审查和批准提议
              </p>
            </div>
            <Select
              value={localConfig.adminMode}
              onValueChange={(value) => updateLocalConfig('adminMode', value as AdminMode)}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="human_only">仅人类</SelectItem>
                <SelectItem value="agent_only">仅 Agent</SelectItem>
                <SelectItem value="agent_then_human">Agent 初审 + 人类终审</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg bg-muted/50 p-4 text-sm">
            <p className="font-medium mb-2">模式说明</p>
            <ul className="space-y-1 text-muted-foreground">
              <li><strong>仅人类</strong>: 所有提议需要人类手动审查决策</li>
              <li><strong>仅 Agent</strong>: Agent 自动审查所有提议</li>
              <li><strong>Agent 初审 + 人类终审</strong>: Agent 先审查，再由人类确认</li>
            </ul>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">管理员 Skill 引用</p>
              <p className="text-sm text-muted-foreground">
                指定用于审查的管理员 Skill
              </p>
            </div>
            <Input
              value={localConfig.skillsAdminSkillRef}
              onChange={(e) => updateLocalConfig('skillsAdminSkillRef', e.target.value)}
              className="w-48"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">提议保留天数</p>
              <p className="text-sm text-muted-foreground">
                过期提议将被自动清理
              </p>
            </div>
            <Input
              type="number"
              value={localConfig.proposalValidity.retentionDays}
              onChange={(e) =>
                updateLocalConfig('proposalValidity', {
                  ...localConfig.proposalValidity,
                  retentionDays: parseInt(e.target.value) || 90,
                })
              }
              className="w-24"
            />
          </div>
        </CardContent>
      </Card>

      {/* Crawler Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Crawler 配置
          </CardTitle>
          <CardDescription>配置 GitHub 仓库爬取设置</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">启用 Crawler</p>
              <p className="text-sm text-muted-foreground">
                自动扫描 GitHub 仓库寻找 Skills
              </p>
            </div>
            <Switch
              checked={localConfig.crawl.enabled}
              onCheckedChange={(checked) =>
                updateLocalConfig('crawl', { ...localConfig.crawl, enabled: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">调度计划</p>
              <p className="text-sm text-muted-foreground">Cron 表达式</p>
            </div>
            <Input
              value={localConfig.crawl.schedule}
              onChange={(e) =>
                updateLocalConfig('crawl', { ...localConfig.crawl, schedule: e.target.value })
              }
              className="w-48 font-mono"
              placeholder="0 2 * * *"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">最低 Star 数</p>
              <p className="text-sm text-muted-foreground">只扫描超过此 Star 数的仓库</p>
            </div>
            <Input
              type="number"
              value={localConfig.crawl.minStars}
              onChange={(e) =>
                updateLocalConfig('crawl', {
                  ...localConfig.crawl,
                  minStars: parseInt(e.target.value) || 0,
                })
              }
              className="w-24"
            />
          </div>

          <div>
            <p className="font-medium mb-2">搜索 Topics</p>
            <div className="flex flex-wrap items-center gap-2">
              {localConfig.crawl.topics.map((topic, index) => (
                <Badge key={`${topic}-${index}`} variant="secondary" className="gap-1">
                  {topic}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeCrawlTopic(index);
                    }}
                    className="ml-1 hover:text-destructive"
                    aria-label={`删除 topic ${topic}`}
                  >
                    ×
                  </button>
                </Badge>
              ))}
              <Input
                value={newTopicInput}
                onChange={(e) => setNewTopicInput(e.target.value)}
                placeholder="添加 topic..."
                className="w-32"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCrawlTopic();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCrawlTopic}
                disabled={!newTopicInput.trim()}
              >
                添加
              </Button>
            </div>
          </div>

          <div>
            <p className="font-medium mb-2">GitHub Token</p>
            <Input
              type="password"
              value={localConfig.crawl.githubToken}
              onChange={(e) =>
                updateLocalConfig('crawl', { ...localConfig.crawl, githubToken: e.target.value })
              }
              placeholder="ghp_..."
            />
            <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
              <p>用于访问 GitHub API，建议勾选 <code className="rounded bg-muted px-1">public_repo</code> 权限。</p>
              <p>
                <strong>获取步骤：</strong>
                <br />1. 打开{' '}
                <a
                  href="https://github.com/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:no-underline"
                >
                  GitHub → Settings → Developer settings → Personal access tokens
                </a>
                <br />2. 点击 “Generate new token” → 选择 “Generate new token (classic)”
                <br />3. 勾选 <code className="rounded bg-muted px-1">public_repo</code>，设置过期时间后生成，<strong>立即复制</strong>（只显示一次）
              </p>
              <p>
                详细图文说明见项目内文档：<code className="rounded bg-muted px-1">docs/guides/GITHUB_TOKEN_SETUP.md</code>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Wake Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            唤醒配置
          </CardTitle>
          <CardDescription>配置管理员自动唤醒设置</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">启用自动唤醒</p>
              <p className="text-sm text-muted-foreground">
                定期唤醒管理员处理待审提议
              </p>
            </div>
            <Switch
              checked={localConfig.wake.enabled}
              onCheckedChange={(checked) =>
                updateLocalConfig('wake', { ...localConfig.wake, enabled: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">唤醒调度</p>
              <p className="text-sm text-muted-foreground">Cron 表达式</p>
            </div>
            <Input
              value={localConfig.wake.schedule}
              onChange={(e) =>
                updateLocalConfig('wake', { ...localConfig.wake, schedule: e.target.value })
              }
              className="w-48 font-mono"
              placeholder="0 */4 * * *"
            />
          </div>

          <div>
            <p className="font-medium mb-2">提醒 Prompt</p>
            <Textarea
              value={localConfig.wake.reminderPrompt}
              onChange={(e) =>
                updateLocalConfig('wake', { ...localConfig.wake, reminderPrompt: e.target.value })
              }
              placeholder="输入唤醒时的提示语..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Handoff Config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            交接配置
          </CardTitle>
          <CardDescription>配置上下文管理和交接设置</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">最大上下文 Token 数</p>
              <p className="text-sm text-muted-foreground">
                超过此限制将触发压缩
              </p>
            </div>
            <Input
              type="number"
              value={localConfig.handoff.maxContextTokens}
              onChange={(e) =>
                updateLocalConfig('handoff', {
                  ...localConfig.handoff,
                  maxContextTokens: parseInt(e.target.value) || 50000,
                })
              }
              className="w-32"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">压缩阈值</p>
              <p className="text-sm text-muted-foreground">
                当 Token 数超过此值时开始压缩
              </p>
            </div>
            <Input
              type="number"
              value={localConfig.handoff.compressWhenAbove}
              onChange={(e) =>
                updateLocalConfig('handoff', {
                  ...localConfig.handoff,
                  compressWhenAbove: parseInt(e.target.value) || 40000,
                })
              }
              className="w-32"
            />
          </div>
        </CardContent>
      </Card>

      {/* Confirm Dialog */}
      {confirmDialog && (
        <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirmDialog.title}</DialogTitle>
              <DialogDescription>{confirmDialog.description}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDialog(null)}>
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
              >
                确认
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </motion.div>
  );
}
