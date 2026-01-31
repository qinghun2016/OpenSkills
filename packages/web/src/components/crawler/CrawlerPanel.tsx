import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Bot,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  GitFork,
  Star,
  FileText,
  Loader2,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui';
import { formatRelativeTime } from '@/lib/utils';
import { useCrawlerRuns, useCachedRepos, useTriggerCrawl, useCrawlJobStatus } from '@/hooks/useApi';
import { toast } from '@/components/ui/Toaster';
import type { CrawlRun, CachedRepo } from '@/api/types';

export function CrawlerPanel() {
  const { data: runs = [], isLoading: isLoadingRuns } = useCrawlerRuns();
  const { data: repos = [], isLoading: isLoadingRepos } = useCachedRepos();
  const triggerMutation = useTriggerCrawl();
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { data: jobStatus } = useCrawlJobStatus(activeJobId);

  // Pagination for runs
  const [runsCurrentPage, setRunsCurrentPage] = useState(1);
  const [runsItemsPerPage, setRunsItemsPerPage] = useState(10);
  const runsTotalPages = Math.ceil(runs.length / runsItemsPerPage);
  const paginatedRuns = useMemo(() => {
    const startIndex = (runsCurrentPage - 1) * runsItemsPerPage;
    const endIndex = startIndex + runsItemsPerPage;
    return runs.slice(startIndex, endIndex);
  }, [runs, runsCurrentPage, runsItemsPerPage]);

  // Pagination for repos
  const [reposCurrentPage, setReposCurrentPage] = useState(1);
  const [reposItemsPerPage, setReposItemsPerPage] = useState(10);
  const reposTotalPages = Math.ceil(repos.length / reposItemsPerPage);
  const paginatedRepos = useMemo(() => {
    const startIndex = (reposCurrentPage - 1) * reposItemsPerPage;
    const endIndex = startIndex + reposItemsPerPage;
    return repos.slice(startIndex, endIndex);
  }, [repos, reposCurrentPage, reposItemsPerPage]);

  const handleTrigger = async () => {
    try {
      const { jobId } = await triggerMutation.mutateAsync();
      setActiveJobId(jobId);
      toast({
        title: 'Crawler 已启动',
        description: '异步运行中，各 topic 独立执行',
        variant: 'success',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法启动 Crawler';
      toast({
        title: '启动失败',
        description: message,
        variant: 'destructive',
      });
    }
  };

  if (jobStatus?.status === 'completed' || jobStatus?.status === 'failed') {
    setActiveJobId(null);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Crawl Runs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            运行记录 {runs.length > 0 && `(${runs.length})`}
          </CardTitle>
          <Button
            size="sm"
            onClick={handleTrigger}
            loading={triggerMutation.isPending}
          >
            <Play className="mr-2 h-4 w-4" />
            立即运行
          </Button>
        </CardHeader>
        <CardContent>
          {isLoadingRuns ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="暂无运行记录"
              description="点击上方按钮开始首次爬取"
            />
          ) : (
            <>
              <div className="space-y-3">
                {paginatedRuns.map((run) => (
                  <CrawlRunItem key={run.id} run={run} />
                ))}
              </div>
              {runs.length > runsItemsPerPage && (
                <div className="mt-4">
                  <Pagination
                    currentPage={runsCurrentPage}
                    totalPages={runsTotalPages}
                    itemsPerPage={runsItemsPerPage}
                    totalItems={runs.length}
                    onPageChange={setRunsCurrentPage}
                    onItemsPerPageChange={setRunsItemsPerPage}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Cached Repos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitFork className="h-5 w-5" />
            已缓存仓库 {repos.length > 0 && `(${repos.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingRepos ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : repos.length === 0 ? (
            <EmptyState
              icon={GitFork}
              title="暂无缓存"
              description="运行 Crawler 后，扫描过的仓库将显示在这里"
            />
          ) : (
            <>
              <div className="space-y-2">
                {paginatedRepos.map((repo) => (
                  <CachedRepoItem key={repo.name} repo={repo} />
                ))}
              </div>
              {repos.length > reposItemsPerPage && (
                <div className="mt-4">
                  <Pagination
                    currentPage={reposCurrentPage}
                    totalPages={reposTotalPages}
                    itemsPerPage={reposItemsPerPage}
                    totalItems={repos.length}
                    onPageChange={setReposCurrentPage}
                    onItemsPerPageChange={setReposItemsPerPage}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CrawlRunItem({ run }: { run: CrawlRun }) {
  const statusConfig = {
    running: {
      icon: Loader2,
      variant: 'pending' as const,
      label: '运行中',
      iconClass: 'animate-spin',
    },
    completed: {
      icon: CheckCircle,
      variant: 'approved' as const,
      label: '已完成',
      iconClass: '',
    },
    failed: {
      icon: XCircle,
      variant: 'rejected' as const,
      label: '失败',
      iconClass: '',
    },
  };

  const config = statusConfig[run.status];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-lg border border-border bg-muted/30 p-3"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Icon className={`h-5 w-5 ${config.iconClass}`} />
          <div>
            <div className="flex items-center gap-2">
              <Badge variant={config.variant}>{config.label}</Badge>
              <span className="font-mono text-xs text-muted-foreground">
                {run.id}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
              <span>扫描 {run.reposScanned} 个仓库</span>
              <span>创建 {run.proposalsCreated} 个提议</span>
            </div>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(run.startedAt)}
          </div>
        </div>
      </div>
      {run.error && (
        <p className="mt-2 rounded bg-red-500/10 p-2 text-xs text-red-500">
          {run.error}
        </p>
      )}
    </motion.div>
  );
}

function CachedRepoItem({ repo }: { repo: CachedRepo }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium">{repo.name}</span>
          <div className="flex items-center gap-1 text-yellow-500">
            <Star className="h-3 w-3 fill-current" />
            <span className="text-xs">{repo.stars}</span>
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="h-3 w-3" />
          <span>{repo.skillsFound} Skills 发现</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">
        {formatRelativeTime(repo.lastCrawled)}
      </span>
    </div>
  );
}
