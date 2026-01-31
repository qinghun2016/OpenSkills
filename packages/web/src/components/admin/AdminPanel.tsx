import * as React from 'react';
import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Clock,
  Zap,
  History,
  CheckCircle,
  XCircle,
  Activity,
  Brain,
  Archive,
  Search,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui';
import { formatDate, formatRelativeTime, formatCountdown } from '@/lib/utils';
import { useAdminStatus, useWakeHistory, useTriggerWake, useSchedulerStatus, useMergeStatus, useTriggerMerge } from '@/hooks/useApi';
import { toast } from '@/components/ui/Toaster';
import type { WakeHistory } from '@/api/types';

export function AdminPanel() {
  const { data: status, isLoading: isLoadingStatus } = useAdminStatus();
  const { data: history = [], isLoading: isLoadingHistory } = useWakeHistory();
  const { data: schedulerStatus, isLoading: isLoadingScheduler } = useSchedulerStatus();
  const { data: mergeStatus } = useMergeStatus();
  const triggerMutation = useTriggerWake();
  const triggerMergeMutation = useTriggerMerge();

  // Filter and pagination state
  const [search, setSearch] = useState('');
  const [triggerFilter, setTriggerFilter] = useState<'all' | 'scheduled' | 'manual' | 'proposal'>('all');
  const [resultFilter, setResultFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Filter history
  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const matchesSearch = search === '' || 
        item.id.toLowerCase().includes(search.toLowerCase()) ||
        item.triggeredAt.toLowerCase().includes(search.toLowerCase());
      const matchesTrigger = triggerFilter === 'all' || item.trigger === triggerFilter;
      const matchesResult = resultFilter === 'all' || item.result === resultFilter;
      return matchesSearch && matchesTrigger && matchesResult;
    });
  }, [history, search, triggerFilter, resultFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const paginatedHistory = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredHistory.slice(startIndex, endIndex);
  }, [filteredHistory, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, triggerFilter, resultFilter]);

  const handleTriggerWake = async () => {
    // 如果调度器未初始化，显示更清晰的错误
    if (!schedulerStatus?.wake) {
      toast({
        title: '唤醒失败',
        description: '调度器未初始化，请先配置 .openskills/config.json',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      await triggerMutation.mutateAsync();
      const isInExtensionPanel = typeof window !== 'undefined' && window.self !== window.top;

      // When embedded in extension panel iframe, notify parent to execute OpenSkills: Trigger Wake (starts Agent via CLI)
      if (isInExtensionPanel) {
        try {
          window.parent.postMessage({ type: 'openskills.triggerWake' }, '*');
        } catch {
          // ignore
        }
        toast({
          title: '唤醒成功',
          description: '管理员已被手动唤醒',
          variant: 'success',
        });
      } else {
        // Standalone browser: API only records the event; Agent is started by extension's Trigger Wake command
        toast({
          title: 'API 已触发',
          description: '要启动 Agent，请在 Cursor 中运行「OpenSkills: Trigger Wake」或通过扩展面板操作',
          variant: 'success',
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      toast({
        title: '唤醒失败',
        description: errorMessage.includes('503') 
          ? '调度器未初始化，请先配置 .openskills/config.json'
          : `无法唤醒管理员: ${errorMessage}`,
        variant: 'destructive',
      });
    }
  };

  const handleTriggerMerge = async () => {
    try {
      const result = await triggerMergeMutation.mutateAsync();
      if (result.triggered) {
        toast({
          title: '合并成功',
          description: `已合并 ${result.fileCounts.total} 个文件`,
          variant: 'success',
        });
      } else {
        toast({
          title: '合并跳过',
          description: result.reason,
          variant: 'default',
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      toast({
        title: '合并失败',
        description: errorMessage.includes('503') 
          ? '调度器未初始化，请先配置 .openskills/config.json'
          : `无法执行合并: ${errorMessage}`,
        variant: 'destructive',
      });
    }
  };

  if (isLoadingStatus) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="管理员状态"
          icon={Shield}
          value={status?.isOnline ? '在线' : '休眠'}
          status={status?.isOnline ? 'online' : 'offline'}
          description={`模式: ${status?.mode || '-'}`}
        />
        <StatusCard
          title="待审提议"
          icon={Clock}
          value={status?.pendingProposals?.toString() || '0'}
          status={status?.pendingProposals ? 'warning' : 'success'}
          description="等待审查的提议"
        />
        <StatusCard
          title="Token 估算"
          icon={Brain}
          value={status?.tokenEstimate?.toLocaleString() || '0'}
          status="neutral"
          description="当前上下文预估"
        />
        <StatusCard
          title="下次唤醒"
          icon={Zap}
          value={status?.nextWakeAt ? formatCountdown(status.nextWakeAt) : '-'}
          status="neutral"
          description={status?.nextWakeAt ? formatDate(status.nextWakeAt) : '未计划'}
        />
      </div>

      {/* Actions & History */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Scheduler Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              调度器状态
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingScheduler ? (
              <Skeleton className="h-32" />
            ) : schedulerStatus?.crawl && schedulerStatus?.wake ? (
              <>
                <SchedulerItem
                  name="Crawler"
                  enabled={schedulerStatus.crawl.enabled}
                  nextRun={schedulerStatus.crawl.nextRun}
                  lastRun={schedulerStatus.crawl.lastRun}
                />
                <SchedulerItem
                  name="Wake"
                  enabled={schedulerStatus.wake.enabled}
                  nextRun={schedulerStatus.wake.nextRun}
                  lastRun={schedulerStatus.wake.lastRun}
                />
              </>
            ) : (
              <p className="text-muted-foreground">调度器未初始化</p>
            )}

            <div className="pt-4 border-t space-y-2">
              <Button
                onClick={handleTriggerWake}
                loading={triggerMutation.isPending}
                className="w-full"
              >
                <Zap className="mr-2 h-4 w-4" />
                手动唤醒管理员
              </Button>
              <Button
                onClick={handleTriggerMerge}
                loading={triggerMergeMutation.isPending}
                variant="outline"
                className="w-full"
                disabled={!mergeStatus?.enabled}
              >
                <Archive className="mr-2 h-4 w-4" />
                合并历史数据
                {mergeStatus?.lastRecord && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({mergeStatus.lastRecord.fileCounts.total} 文件)
                  </span>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Wake History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              唤醒历史 {history.length > 0 && `(${history.length})`}
            </CardTitle>
            <CardDescription>
              {filteredHistory.length !== history.length && (
                <span>显示 {filteredHistory.length} / {history.length} 条记录</span>
              )}
            </CardDescription>
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
                title="暂无唤醒记录"
                description="管理员唤醒记录将显示在这里"
              />
            ) : (
              <>
                {/* Filters */}
                <div className="mb-4 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="搜索唤醒记录..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
                      {(['all', 'scheduled', 'manual', 'proposal'] as const).map((trigger) => (
                        <Button
                          key={trigger}
                          type="button"
                          variant={triggerFilter === trigger ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => setTriggerFilter(trigger)}
                          className={`text-xs ${
                            triggerFilter === trigger 
                              ? 'bg-primary/20 text-primary font-semibold border border-primary/30' 
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                          }`}
                        >
                          {trigger === 'all' ? '全部' : trigger === 'scheduled' ? '计划' : trigger === 'manual' ? '手动' : '提议'}
                        </Button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
                      {(['all', 'success', 'failed'] as const).map((result) => (
                        <Button
                          key={result}
                          type="button"
                          variant={resultFilter === result ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => setResultFilter(result)}
                          className={`text-xs ${
                            resultFilter === result 
                              ? 'bg-primary/20 text-primary font-semibold border border-primary/30' 
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                          }`}
                        >
                          {result === 'all' ? '全部' : result === 'success' ? '成功' : '失败'}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* History List */}
                {filteredHistory.length === 0 ? (
                  <EmptyState
                    icon={History}
                    title="未找到匹配的记录"
                    description="尝试调整筛选条件"
                  />
                ) : (
                  <>
                    <div className="space-y-2">
                      {paginatedHistory.map((item) => (
                        <WakeHistoryItem key={item.id} item={item} />
                      ))}
                    </div>
                    {filteredHistory.length > itemsPerPage && (
                      <div className="mt-4">
                        <Pagination
                          currentPage={currentPage}
                          totalPages={totalPages}
                          itemsPerPage={itemsPerPage}
                          totalItems={filteredHistory.length}
                          onPageChange={setCurrentPage}
                          onItemsPerPageChange={setItemsPerPage}
                        />
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface StatusCardProps {
  title: string;
  icon: React.ElementType;
  value: string;
  status: 'online' | 'offline' | 'warning' | 'success' | 'neutral';
  description: string;
}

function StatusCard({ title, icon: Icon, value, status, description }: StatusCardProps) {
  const statusColors = {
    online: 'text-green-500',
    offline: 'text-muted-foreground',
    warning: 'text-yellow-500',
    success: 'text-green-500',
    neutral: 'text-primary',
  };

  const statusBg = {
    online: 'bg-green-500/10',
    offline: 'bg-muted',
    warning: 'bg-yellow-500/10',
    success: 'bg-green-500/10',
    neutral: 'bg-primary/10',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className={`mt-1 text-2xl font-bold ${statusColors[status]}`}>
                {value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </div>
            <div className={`rounded-lg p-2 ${statusBg[status]}`}>
              <Icon className={`h-5 w-5 ${statusColors[status]}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface SchedulerItemProps {
  name: string;
  enabled: boolean;
  nextRun: string | null;
  lastRun: string | null;
}

function SchedulerItem({ name, enabled, nextRun, lastRun }: SchedulerItemProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-3">
        <div
          className={`h-2 w-2 rounded-full ${
            enabled ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'
          }`}
        />
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">
            {enabled ? '已启用' : '已禁用'}
          </p>
        </div>
      </div>
      <div className="text-right text-xs">
        {nextRun && (
          <p className="text-muted-foreground">
            下次: {formatCountdown(nextRun)}
          </p>
        )}
        {lastRun && (
          <p className="text-muted-foreground">
            上次: {formatRelativeTime(lastRun)}
          </p>
        )}
      </div>
    </div>
  );
}

function WakeHistoryItem({ item }: { item: WakeHistory }) {
  const triggerLabels = {
    scheduled: '计划唤醒',
    manual: '手动唤醒',
    proposal: '提议触发',
  };

  const triggerColors = {
    scheduled: 'text-blue-500',
    manual: 'text-purple-500',
    proposal: 'text-orange-500',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3 transition-all hover:border-primary/50 hover:shadow-sm"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`flex-shrink-0 ${item.result === 'success' ? 'text-green-500' : 'text-red-500'}`}>
          {item.result === 'success' ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <XCircle className="h-5 w-5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-medium ${triggerColors[item.trigger]}`}>
              {triggerLabels[item.trigger]}
            </p>
            <Badge 
              variant={item.result === 'success' ? 'approved' : 'rejected'}
              className="text-xs"
            >
              {item.result === 'success' ? '成功' : '失败'}
            </Badge>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(item.triggeredAt)}
            </span>
            {item.proposalsProcessed > 0 && (
              <span className="flex items-center gap-1">
                处理 {item.proposalsProcessed} 个提议
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
