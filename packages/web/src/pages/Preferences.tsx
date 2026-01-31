import { motion } from 'framer-motion';
import {
  Sliders,
  Sun,
  Moon,
  Monitor,
  Bell,
  History,
  RotateCcw,
  Clock,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { useTheme } from '@/components/ThemeProvider';
import { usePreferences, useUpdatePreferences, usePreferencesHistory, useRollbackPreferences } from '@/hooks/useApi';
import { toast } from '@/components/ui/Toaster';
import { formatRelativeTime } from '@/lib/utils';
import type { Preferences as PreferencesType, NotificationSettings } from '@/api/types';

export function Preferences() {
  const { theme, setTheme } = useTheme();
  const { data: preferences, isLoading } = usePreferences();
  const { data: history = [], isLoading: isLoadingHistory } = usePreferencesHistory();
  const updateMutation = useUpdatePreferences();
  const rollbackMutation = useRollbackPreferences();

  const handleUpdatePreference = async <K extends keyof PreferencesType>(
    key: K,
    value: PreferencesType[K]
  ) => {
    try {
      await updateMutation.mutateAsync({ [key]: value });
      toast({
        title: '设置已保存',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: '保存失败',
        variant: 'destructive',
      });
    }
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    handleUpdatePreference('theme', newTheme);
  };

  const handleRollback = async (historyId: string) => {
    try {
      await rollbackMutation.mutateAsync(historyId);
      toast({
        title: '设置已回滚',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: '回滚失败',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
      {/* Theme Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sliders className="h-5 w-5" />
            主题设置
          </CardTitle>
          <CardDescription>自定义界面外观</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">主题模式</p>
              <p className="text-sm text-muted-foreground">选择界面配色方案</p>
            </div>
            <div className="flex gap-2">
              {[
                { value: 'light' as const, icon: Sun, label: '浅色' },
                { value: 'dark' as const, icon: Moon, label: '深色' },
                { value: 'system' as const, icon: Monitor, label: '系统' },
              ].map(({ value, icon: Icon, label }) => (
                <Button
                  key={value}
                  variant={theme === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleThemeChange(value)}
                  className="gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">侧边栏默认折叠</p>
              <p className="text-sm text-muted-foreground">启动时侧边栏是否折叠</p>
            </div>
            <Switch
              checked={preferences?.sidebarCollapsed}
              onCheckedChange={(checked) =>
                handleUpdatePreference('sidebarCollapsed', checked)
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            通知设置
          </CardTitle>
          <CardDescription>配置通知提醒</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            {
              key: 'newProposal' as const,
              label: '新提议通知',
              description: '收到新的改进提议时通知',
            },
            {
              key: 'decisionMade' as const,
              label: '决策通知',
              description: '提议被审核通过或拒绝时通知',
            },
            {
              key: 'wakeTriggered' as const,
              label: '唤醒通知',
              description: '管理员被唤醒时通知',
            },
          ].map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{label}</p>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
              <Switch
                checked={preferences?.notifications?.[key]}
                onCheckedChange={(checked) => {
                  const currentNotifications = preferences?.notifications || {
                    newProposal: false,
                    decisionMade: false,
                    wakeTriggered: false,
                  };
                  handleUpdatePreference('notifications', {
                    ...currentNotifications,
                    [key]: checked,
                  } as NotificationSettings);
                }}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Default Filter */}
      <Card>
        <CardHeader>
          <CardTitle>默认筛选</CardTitle>
          <CardDescription>设置页面默认筛选条件</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">提议列表默认筛选</p>
              <p className="text-sm text-muted-foreground">进入提议页面时的默认状态筛选</p>
            </div>
            <Select
              value={preferences?.defaultProposalFilter || 'all'}
              onValueChange={(value) =>
                handleUpdatePreference('defaultProposalFilter', value as 'all' | 'pending' | 'approved' | 'rejected')
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="pending">待审核</SelectItem>
                <SelectItem value="approved">已批准</SelectItem>
                <SelectItem value="rejected">已拒绝</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            设置历史
          </CardTitle>
          <CardDescription>查看并回滚历史设置</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingHistory ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <EmptyState
              icon={History}
              title="暂无历史记录"
              description="修改设置后，历史记录将显示在这里"
            />
          ) : (
            <div className="space-y-2">
              {history.slice(0, 10).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{formatRelativeTime(item.timestamp)}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {Object.keys(item.diff).map((key) => (
                        <span key={key} className="mr-2">
                          {key}: {String(item.diff[key].from)} → {String(item.diff[key].to)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRollback(item.id)}
                    loading={rollbackMutation.isPending}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
