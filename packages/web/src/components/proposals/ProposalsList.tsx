import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Search, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScopeBadge, SourceBadge, StatusBadge } from '@/components/common';
import { formatRelativeTime } from '@/lib/utils';
import type { ProposalSummary, ProposalStatus, ProposalScope, ProposalTrigger } from '@/api/types';

interface ProposalsListProps {
  proposals: ProposalSummary[];
  isLoading?: boolean;
  onSelect?: (proposal: ProposalSummary) => void;
  selectedProposal?: ProposalSummary | null;
  search?: string;
  onSearchChange?: (search: string) => void;
  statusFilter?: ProposalStatus | 'all';
  onStatusFilterChange?: (filter: ProposalStatus | 'all') => void;
  scopeFilter?: ProposalScope | 'all';
  onScopeFilterChange?: (filter: ProposalScope | 'all') => void;
  sourceFilter?: ProposalTrigger | 'all';
  onSourceFilterChange?: (filter: ProposalTrigger | 'all') => void;
}

export function ProposalsList({
  proposals,
  isLoading,
  onSelect,
  selectedProposal,
  search: externalSearch,
  onSearchChange: externalOnSearchChange,
  statusFilter: externalStatusFilter,
  onStatusFilterChange: externalOnStatusFilterChange,
  scopeFilter: externalScopeFilter,
  onScopeFilterChange: externalOnScopeFilterChange,
  sourceFilter: externalSourceFilter,
  onSourceFilterChange: externalOnSourceFilterChange,
}: ProposalsListProps) {
  const [internalSearch, setInternalSearch] = useState('');
  const [internalStatusFilter, setInternalStatusFilter] = useState<ProposalStatus | 'all'>('all');
  const [internalScopeFilter, setInternalScopeFilter] = useState<ProposalScope | 'all'>('all');
  const [internalSourceFilter, setInternalSourceFilter] = useState<ProposalTrigger | 'all'>('all');

  // Use external filters if provided, otherwise use internal state
  const search = externalSearch !== undefined ? externalSearch : internalSearch;
  const statusFilter = externalStatusFilter !== undefined ? externalStatusFilter : internalStatusFilter;
  const scopeFilter = externalScopeFilter !== undefined ? externalScopeFilter : internalScopeFilter;
  const sourceFilter = externalSourceFilter !== undefined ? externalSourceFilter : internalSourceFilter;

  const setSearch = externalOnSearchChange || setInternalSearch;
  const setStatusFilter = externalOnStatusFilterChange || setInternalStatusFilter;
  const setScopeFilter = externalOnScopeFilterChange || setInternalScopeFilter;
  const setSourceFilter = externalOnSourceFilterChange || setInternalSourceFilter;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="搜索提议..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Status Filter */}
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
            <Button
              key={status}
              type="button"
              variant={statusFilter === status ? 'secondary' : 'ghost'}
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setStatusFilter(status);
              }}
              className={`text-xs ${
                statusFilter === status 
                  ? 'bg-primary/20 text-primary font-semibold border border-primary/30' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {status === 'all' ? '全部' : status === 'approved' ? '已批准' : status === 'pending' ? '待审核' : '已拒绝'}
            </Button>
          ))}
        </div>

        {/* Scope Filter */}
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {(['all', 'user', 'project'] as const).map((scope) => (
            <Button
              key={scope}
              type="button"
              variant={scopeFilter === scope ? 'secondary' : 'ghost'}
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setScopeFilter(scope);
              }}
              className={`text-xs capitalize ${
                scopeFilter === scope 
                  ? 'bg-primary/20 text-primary font-semibold border border-primary/30' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {scope === 'all' ? '范围' : scope === 'user' ? '用户' : '项目'}
            </Button>
          ))}
        </div>

        {/* Source Filter */}
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {(['all', 'human', 'agent', 'crawler'] as const).map((source) => (
            <Button
              key={source}
              type="button"
              variant={sourceFilter === source ? 'secondary' : 'ghost'}
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSourceFilter(source);
              }}
              className={`text-xs capitalize ${
                sourceFilter === source 
                  ? 'bg-primary/20 text-primary font-semibold border border-primary/30' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {source === 'all' ? '来源' : source === 'human' ? '人工' : source === 'agent' ? 'Agent' : '爬虫'}
            </Button>
          ))}
        </div>
      </div>

      {/* List */}
      {proposals.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="暂无提议"
          description={
            search || statusFilter !== 'all' || scopeFilter !== 'all' || sourceFilter !== 'all'
              ? '未找到匹配的提议，请尝试调整筛选条件'
              : '当前没有任何改进提议'
          }
        />
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="space-y-2">
            {proposals.map((proposal, index) => (
              <motion.div
                key={proposal.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: index * 0.03 }}
              >
                <Card
                  data-testid={`proposal-item-${proposal.skillName}`}
                  className={`cursor-pointer transition-all duration-200 hover:border-primary/50 hover:shadow-md ${
                    selectedProposal?.id === proposal.id
                      ? 'border-primary bg-primary/5'
                      : ''
                  }`}
                  onClick={() => onSelect?.(proposal)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{proposal.skillName}</h3>
                          <StatusBadge status={proposal.status} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground font-mono">
                          {proposal.id}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-2">
                          <ScopeBadge scope={proposal.scope} />
                          <SourceBadge source={proposal.trigger} />
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(proposal.createdAt)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}
