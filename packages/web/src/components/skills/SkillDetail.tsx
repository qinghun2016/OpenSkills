import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Clock, FolderOpen, ExternalLink, Pencil, Code } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { ScopeBadge } from '@/components/common/ScopeBadge';
import { formatDate } from '@/lib/utils';
import { createUnifiedDiff } from '@/lib/diff';
import { useCreateProposal, useApproveProposal, useApplyDecision } from '@/hooks/useApi';
import { toast } from '@/components/ui/Toaster';
import type { Skill } from '@/api/types';
import type { ProposalScope } from '@/api/types';

interface SkillDetailProps {
  skill: Skill | null;
  isLoading?: boolean;
  isError?: boolean;
  onSaveSuccess?: () => void;
}

function validateSkillContent(content: string): { valid: boolean; error?: string } {
  const trimmed = content.trim();
  if (!trimmed) return { valid: false, error: '内容不能为空' };
  if (trimmed.includes('---')) {
    const lines = trimmed.split('\n');
    if (lines[0]?.trim() === '---') {
      const rest = lines.slice(1).join('\n');
      if (!rest.includes('---')) return { valid: false, error: 'YAML frontmatter 需成对 ---' };
    }
  }
  return { valid: true };
}

export function SkillDetail({ skill, isLoading, isError, onSaveSuccess }: SkillDetailProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [viewMode, setViewMode] = useState<'render' | 'source'>('render');

  const createProposal = useCreateProposal();
  const approveProposal = useApproveProposal();
  const applyDecision = useApplyDecision();

  const handleEditOpen = () => {
    if (skill?.content) {
      setEditContent(skill.content);
      setEditDialogOpen(true);
    }
  };

  const handleEditSave = async () => {
    if (!skill) return;
    const validation = validateSkillContent(editContent);
    if (!validation.valid) {
      toast({ title: validation.error, variant: 'destructive' });
      return;
    }
    const originalContent = skill.content || '';
    if (originalContent === editContent) {
      setEditDialogOpen(false);
      return;
    }
    try {
      const diff = createUnifiedDiff('SKILL.md', originalContent, editContent);
      const proposal = await createProposal.mutateAsync({
        skillName: skill.name,
        scope: skill.scope as ProposalScope,
        reason: '用户直接修改，格式校验通过',
        diff,
        trigger: 'human',
        proposerMeta: { source: 'human', name: '用户' },
      });
      await approveProposal.mutateAsync({
        id: proposal.id,
        reason: '用户直接修改，格式校验通过，直接审核通过',
      });
      await applyDecision.mutateAsync(proposal.id);
      toast({ title: '已保存并应用', variant: 'success' });
      setEditDialogOpen(false);
      onSaveSuccess?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: msg, variant: 'destructive' });
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
            <p className="font-medium mb-2">加载 Skill 详情时出错</p>
            <p className="text-xs">可能是文件格式不正确或文件不存在</p>
            <p className="text-xs mt-1">请检查文件路径和格式（.mdc 或 .md）</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!skill) {
    return (
      <Card>
        <CardContent className="flex h-96 items-center justify-center text-muted-foreground">
          <div className="text-center">
            <FileText className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>选择一个 Skill 查看详情</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      key={`${skill.scope}-${skill.name}`}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {skill.scope === 'user' && skill.name.startsWith('cursor-user-rule-') && skill.description
                ? skill.description
                : skill.name}
              {skill.type === 'rule' && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400">
                  规则
                </span>
              )}
              <ScopeBadge scope={skill.scope} />
            </CardTitle>
            {skill.description && !(skill.scope === 'user' && skill.name.startsWith('cursor-user-rule-')) && (
              <p className="mt-1 text-sm text-muted-foreground">
                {skill.description}
              </p>
            )}
            {skill.scope === 'user' && skill.name.startsWith('cursor-user-rule-') && (
              <p className="mt-1 text-xs text-muted-foreground font-mono">{skill.name}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {skill.content && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={handleEditOpen}
                data-testid="skill-edit-button"
              >
                <Pencil className="h-4 w-4" />
                编辑
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-1"
              title={skill.content ? '文件内容已显示' : '文件内容已加载'}
            >
              <ExternalLink className="h-4 w-4" />
              {skill.content ? '文件已打开' : '打开文件'}
            </Button>
          </div>
        </CardHeader>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>编辑 Skill：{skill.name}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto min-h-0">
              <Textarea
                data-testid="skill-edit-content"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="font-mono text-sm min-h-[360px]"
                placeholder="SKILL.md 内容"
              />
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setEditDialogOpen(false)}>
                取消
              </Button>
              <Button
                onClick={handleEditSave}
                disabled={createProposal.isPending || approveProposal.isPending || applyDecision.isPending}
              >
                保存并应用
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <CardContent className="space-y-4">
          {/* Metadata */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <FolderOpen className="h-4 w-4" />
              <span className="font-mono text-xs">{skill.path}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>最后修改: {formatDate(skill.lastModified)}</span>
            </div>
          </div>

          {/* Content: render / source toggle */}
          {skill.content && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button
                  variant={viewMode === 'render' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-1"
                  onClick={() => setViewMode('render')}
                >
                  <FileText className="h-3 w-3" />
                  渲染
                </Button>
                <Button
                  variant={viewMode === 'source' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-1"
                  onClick={() => setViewMode('source')}
                >
                  <Code className="h-3 w-3" />
                  源码
                </Button>
              </div>
              <div className="rounded-lg bg-muted/50 p-4 overflow-auto max-h-[60vh]">
                {viewMode === 'render' ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{skill.content}</ReactMarkdown>
                  </div>
                ) : (
                  <pre className="font-mono text-sm whitespace-pre-wrap">
                    {skill.content}
                  </pre>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
