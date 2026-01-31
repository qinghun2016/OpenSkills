import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { ElementType } from 'react';
import {
  Sparkles,
  FileText,
  CheckCircle,
  Bot,
  Shield,
  Sliders,
  ArrowRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge, SourceBadge } from '@/components/common';
import { formatRelativeTime, formatCountdown } from '@/lib/utils';
import { useProposals, useDecisions, useSkills, useAdminStatus, useSchedulerStatus } from '@/hooks/useApi';

export function Dashboard() {
  const { data: proposals = [], isLoading: isLoadingProposals } = useProposals();
  const { data: decisions = [], isLoading: isLoadingDecisions } = useDecisions({ limit: 5 });
  const { data: skills = [], isLoading: isLoadingSkills } = useSkills();
  const { data: adminStatus, isLoading: isLoadingAdmin } = useAdminStatus();
  const { data: schedulerStatus } = useSchedulerStatus();

  const pendingCount = proposals.filter((p) => p.status === 'pending').length;
  const approvedCount = proposals.filter(
    (p) => p.status === 'approved' || p.status === 'applied',
  ).length;
  const rejectedCount = proposals.filter((p) => p.status === 'rejected').length;

  const userSkills = skills.filter((s) => s.scope === 'user').length;
  const projectSkills = skills.filter((s) => s.scope === 'project').length;

  const isLoading = isLoadingProposals || isLoadingDecisions || isLoadingSkills || isLoadingAdmin;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div key="skeleton-stats" className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={`skeleton-stats-${i}`} className="h-32" />
          ))}
        </div>
        <div key="skeleton-cards" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={`skeleton-cards-${i}`} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          key="stats-skills"
          title="Skills 总数"
          value={skills.length}
          icon={Sparkles}
          description={`User: ${userSkills} / Project: ${projectSkills}`}
          trend="neutral"
          href="/skills"
        />
        <StatsCard
          key="stats-proposals"
          title="待审提议"
          value={pendingCount}
          icon={FileText}
          description={pendingCount > 0 ? '需要审查' : '没有待审提议'}
          trend={pendingCount > 0 ? 'warning' : 'success'}
          href="/proposals"
        />
        <StatsCard
          key="stats-decisions"
          title="已处理决策"
          value={decisions.length}
          icon={CheckCircle}
          description={`批准: ${approvedCount} / 拒绝: ${rejectedCount}`}
          trend="neutral"
          href="/decisions"
        />
        <StatsCard
          key="stats-admin"
          title="管理员状态"
          value={adminStatus?.isOnline ? '在线' : '休眠'}
          icon={Shield}
          description={schedulerStatus?.wake?.nextRun
            ? `下次唤醒: ${formatCountdown(schedulerStatus.wake.nextRun)}`
            : '自动唤醒已禁用'}
          trend={adminStatus?.isOnline ? 'success' : 'neutral'}
          href="/admin"
        />
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Quick Actions */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">快速入口</CardTitle>
            <CardDescription>常用功能快速访问</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <QuickAction
              key="quick-proposals"
              icon={FileText}
              title="查看待审提议"
              description={`${pendingCount} 个待处理`}
              href="/proposals"
              highlight={pendingCount > 0}
            />
            <QuickAction
              key="quick-skills"
              icon={Sparkles}
              title="管理 Skills"
              description={`共 ${skills.length} 个`}
              href="/skills"
            />
            <QuickAction
              key="quick-crawler"
              icon={Bot}
              title="Crawler 控制"
              description="查看爬取记录"
              href="/crawler"
            />
            <QuickAction
              key="quick-preferences"
              icon={Sliders}
              title="偏好设置"
              description="自定义界面"
              href="/preferences"
            />
          </CardContent>
        </Card>

        {/* Recent Proposals */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">最近提议</CardTitle>
              <CardDescription>最新的改进提议</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/proposals" className="gap-1">
                查看全部 <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {proposals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <p className="text-muted-foreground">暂无提议</p>
              </div>
            ) : (
              <div className="space-y-3">
                {proposals.slice(0, 5).map((proposal, idx) => (
                  <Link
                    key={proposal.id ?? `proposal-${idx}`}
                    to="/proposals"
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3 transition-all hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <StatusBadge status={proposal.status} />
                      <div>
                        <p className="font-medium">{proposal.skillName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(proposal.createdAt)}
                        </p>
                      </div>
                    </div>
                    <SourceBadge source={proposal.trigger} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Decisions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">最近决策</CardTitle>
            <CardDescription>最新的审查决策记录</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/decisions" className="gap-1">
              查看全部 <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {decisions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">暂无决策记录</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {decisions.slice(0, 6).map((decision, idx) => (
                <div
                  key={decision.id ?? `decision-${idx}`}
                  className="rounded-lg border border-border bg-muted/30 p-3"
                >
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={decision.decision === 'approve' ? 'approved' : 'rejected'}
                    >
                      {decision.decision === 'approve' ? '批准' : '拒绝'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(decision.decidedAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-mono truncate">
                    {decision.proposalId}
                  </p>
                  {decision.reason && (
                    <p className="mt-1 text-xs text-muted-foreground truncate">
                      {decision.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: ElementType;
  description: string;
  trend: 'success' | 'warning' | 'neutral';
  href: string;
}

function StatsCard({ title, value, icon: Icon, description, trend, href }: StatsCardProps) {
  const trendColors = {
    success: 'text-green-500',
    warning: 'text-yellow-500',
    neutral: 'text-primary',
  };

  const trendBg = {
    success: 'bg-green-500/10',
    warning: 'bg-yellow-500/10',
    neutral: 'bg-primary/10',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      <Link to={href}>
        <Card className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{title}</p>
                <p className={`mt-1 text-3xl font-bold ${trendColors[trend]}`}>
                  {value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{description}</p>
              </div>
              <div className={`rounded-lg p-2 ${trendBg[trend]}`}>
                <Icon className={`h-5 w-5 ${trendColors[trend]}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

interface QuickActionProps {
  icon: ElementType;
  title: string;
  description: string;
  href: string;
  highlight?: boolean;
}

function QuickAction({ icon: Icon, title, description, href, highlight }: QuickActionProps) {
  return (
    <Link
      to={href}
      className={`flex items-center gap-3 rounded-lg border p-3 transition-all hover:bg-muted/50 ${
        highlight ? 'border-primary/50 bg-primary/5' : 'border-border'
      }`}
    >
      <div className={`rounded-lg p-2 ${highlight ? 'bg-primary/10' : 'bg-muted'}`}>
        <Icon className={`h-4 w-4 ${highlight ? 'text-primary' : 'text-muted-foreground'}`} />
      </div>
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
