import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Bot, User, Clock, MessageSquare, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import type { Decision } from '@/api/types';

interface DecisionsListProps {
  decisions: Decision[];
  isLoading?: boolean;
  search?: string;
  onSearchChange?: (search: string) => void;
}

export function DecisionsList({ decisions, isLoading, search = '', onSearchChange }: DecisionsListProps) {
  const navigate = useNavigate();
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/3b8ce49b-df8e-4d7e-9a9d-6bcf5663853e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/decisions/DecisionsList.tsx:16',message:'DecisionsList render',data:{decisionsCount:decisions.length,isLoading},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  
  const handleProposalClick = (proposalId: string) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/3b8ce49b-df8e-4d7e-9a9d-6bcf5663853e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/decisions/DecisionsList.tsx:20',message:'handleProposalClick called',data:{proposalId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E,F'})}).catch(()=>{});
    // #endregion
    navigate(`/proposals?proposalId=${proposalId}`);
  };
  
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      {onSearchChange && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索决策记录（提案ID、理由、决策者）..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {decisions.length === 0 ? (
        <EmptyState
          icon={CheckCircle}
          title={search ? "未找到匹配的决策记录" : "暂无决策记录"}
          description={search ? "尝试使用不同的搜索关键词" : "审查提议后，决策记录将显示在这里"}
        />
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="space-y-4">
        {decisions.map((decision, index) => (
          <motion.div
            key={decision.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card 
              className="transition-all duration-200 hover:shadow-md cursor-pointer"
              onClick={() => handleProposalClick(decision.proposalId)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    {/* Decision Icon */}
                    <div
                      className={`mt-1 flex h-10 w-10 items-center justify-center rounded-full ${
                        decision.decision === 'approve'
                          ? 'bg-green-500/10'
                          : 'bg-red-500/10'
                      }`}
                    >
                      {decision.decision === 'approve' ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                    </div>

                    {/* Decision Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            decision.decision === 'approve' ? 'approved' : 'rejected'
                          }
                        >
                          {decision.decision === 'approve' ? '批准' : '拒绝'}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">
                          {decision.proposalId}
                        </span>
                      </div>

                      {/* Decided By */}
                      <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          {decision.decidedBy === 'agent' ? (
                            <Bot className="h-4 w-4" />
                          ) : (
                            <User className="h-4 w-4" />
                          )}
                          <span>
                            由 {decision.decidedBy === 'agent' ? 'Agent' : 'Human'} 决策
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          <span>{formatRelativeTime(decision.decidedAt)}</span>
                        </div>
                      </div>

                      {/* Reason */}
                      {decision.reason && (
                        <div className="mt-3">
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MessageSquare className="h-4 w-4" />
                            <span>理由</span>
                          </div>
                          <p className="mt-1 rounded-lg bg-muted/50 p-3 text-sm">
                            {decision.reason}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div className="text-right text-xs text-muted-foreground">
                    {formatDate(decision.decidedAt)}
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
