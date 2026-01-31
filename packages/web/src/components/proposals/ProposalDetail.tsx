import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, User, Clock, MessageSquare } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';
import { ScopeBadge, SourceBadge, StatusBadge } from '@/components/common';
import { DiffViewer } from './DiffViewer';
import { useApproveProposal, useRejectProposal } from '@/hooks/useApi';
import { toast } from '@/components/ui/Toaster';
import { formatDate } from '@/lib/utils';
import type { Proposal } from '@/api/types';

interface ProposalDetailProps {
  proposal: Proposal | null;
  isLoading?: boolean;
  isError?: boolean;
  onActionComplete?: () => void;
}

export function ProposalDetail({
  proposal,
  isLoading,
  isError,
  onActionComplete,
}: ProposalDetailProps) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/3b8ce49b-df8e-4d7e-9a9d-6bcf5663853e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'components/proposals/ProposalDetail.tsx:31',message:'ProposalDetail render',data:{hasProposal:!!proposal,isLoading,isError,proposalId:proposal?.id,hasProposerMeta:!!proposal?.proposerMeta},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C,D'})}).catch(()=>{});
  // #endregion
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const approveMutation = useApproveProposal();
  const rejectMutation = useRejectProposal();

  const handleApprove = async () => {
    if (!proposal) return;

    try {
      await approveMutation.mutateAsync({ id: proposal.id });
      toast({
        title: '提议已批准',
        description: `${proposal.skillName} 的改进已批准应用`,
        variant: 'success',
      });
      onActionComplete?.();
    } catch (error) {
      toast({
        title: '操作失败',
        description: '批准提议时发生错误',
        variant: 'destructive',
      });
    }
  };

  const handleReject = async () => {
    if (!proposal || !rejectReason.trim()) return;

    try {
      await rejectMutation.mutateAsync({ id: proposal.id, reason: rejectReason });
      toast({
        title: '提议已拒绝',
        description: `${proposal.skillName} 的改进已拒绝`,
      });
      setRejectDialogOpen(false);
      setRejectReason('');
      onActionComplete?.();
    } catch (error) {
      toast({
        title: '操作失败',
        description: '拒绝提议时发生错误',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="flex h-96 items-center justify-center text-muted-foreground">
          <div className="text-center">
            <FileText className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p className="mb-2">加载提议详情时出错</p>
            <p className="text-sm text-muted-foreground">
              请刷新页面重试
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!proposal) {
    return (
      <Card>
        <CardContent className="flex h-96 items-center justify-center text-muted-foreground">
          <div className="text-center">
            <FileText className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>选择一个提议查看详情</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isPending = proposal.status === 'pending';

  return (
    <>
      <motion.div
        key={proposal.id}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {proposal.skillName}
                  <StatusBadge status={proposal.status} />
                </CardTitle>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {proposal.id}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ScopeBadge scope={proposal.scope} />
                <SourceBadge source={proposal.trigger} />
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Metadata */}
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-4 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">来源:</span>
                <span>{proposal.proposerMeta?.source || '未知'}</span>
                {proposal.proposerMeta?.name && (
                  <span className="text-muted-foreground">
                    ({proposal.proposerMeta.name})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">创建时间:</span>
                <span>{proposal.proposerMeta?.createdAt ? formatDate(proposal.proposerMeta.createdAt) : '未知'}</span>
              </div>
            </div>

            {/* Reason */}
            <div>
              <h4 className="mb-2 flex items-center gap-2 font-medium">
                <MessageSquare className="h-4 w-4" />
                改进理由
              </h4>
              <p className="rounded-lg bg-muted/50 p-4 text-sm">
                {proposal.reason}
              </p>
            </div>

            {/* Diff */}
            <div>
              <h4 className="mb-2 font-medium">变更内容</h4>
              <DiffViewer diff={proposal.diff} defaultExpanded />
            </div>
          </CardContent>

          {isPending && (
            <CardFooter className="flex justify-end gap-3 border-t pt-6">
              <Button
                variant="outline"
                onClick={() => setRejectDialogOpen(true)}
                disabled={rejectMutation.isPending}
              >
                拒绝
              </Button>
              <Button
                variant="success"
                onClick={handleApprove}
                loading={approveMutation.isPending}
              >
                批准
              </Button>
            </CardFooter>
          )}
        </Card>
      </motion.div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>拒绝提议</DialogTitle>
            <DialogDescription>
              请提供拒绝该提议的理由，这将帮助提议者改进。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="请输入拒绝理由..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              loading={rejectMutation.isPending}
              disabled={!rejectReason.trim()}
            >
              确认拒绝
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
