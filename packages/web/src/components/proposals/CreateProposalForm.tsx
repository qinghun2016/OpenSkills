import { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { useCreateProposal, useApproveProposal, useApplyDecision } from '@/hooks/useApi';
import { toast } from '@/components/ui/Toaster';
import type { ProposalCreateInput, ProposalScope } from '@/api/types';

/**
 * 若内容不是 unified diff（不以 --- 开头），则当作新建文件的完整内容，转为 diff
 */
/** 人类用户仅提交自然语言时使用的占位 diff，由 skills-admin 润色后生成真实 diff */
export const NATURAL_LANGUAGE_PLACEHOLDER_DIFF =
  '[自然语言提议，由 skills-admin 根据「提议理由」润色并生成 diff 后再审查]';

/** 若非 unified diff（不以 --- 开头），则当作新建文件的完整内容转为 diff */
function toUnifiedDiff(skillName: string, content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith('---')) return trimmed;
  const lines = trimmed.split('\n');
  const lineCount = lines.length;
  const diffBody = lines.map((line) => `+${line}`).join('\n');
  return `--- /dev/null
+++ b/.cursor/skills/${skillName}/SKILL.md
@@ -0,0 +1,${lineCount} @@
${diffBody}
`;
}

export interface CreateProposalFormProps {
  onSuccess?: () => void;
}

export function CreateProposalForm({ onSuccess }: CreateProposalFormProps) {
  const [skillName, setSkillName] = useState('');
  const [scope, setScope] = useState<ProposalScope>('project');
  const [reason, setReason] = useState('');
  const [diff, setDiff] = useState('');

  const createProposal = useCreateProposal();
  const approveProposal = useApproveProposal();
  const applyDecision = useApplyDecision();

  const handleSubmit = async (mode: 'create_only' | 'create_and_apply') => {
    if (!skillName.trim()) {
      toast({ title: '请填写技能名称', variant: 'destructive' });
      return;
    }
    if (!reason.trim()) {
      toast({ title: '请填写提议理由', variant: 'destructive' });
      return;
    }
    const diffContent = diff.trim();
    const finalDiff = diffContent
      ? toUnifiedDiff(skillName, diffContent)
      : NATURAL_LANGUAGE_PLACEHOLDER_DIFF;
    const input: ProposalCreateInput = {
      skillName: skillName.trim(),
      scope,
      reason: reason.trim(),
      diff: finalDiff,
      trigger: 'human',
      proposerMeta: { source: 'human', name: '用户' },
    };

    try {
      const proposal = await createProposal.mutateAsync(input);
      toast({ title: `提议已创建：${proposal.skillName}`, variant: 'success' });

      if (mode === 'create_and_apply') {
        await approveProposal.mutateAsync({
          id: proposal.id,
          reason: '用户提议，格式校验通过，直接审核通过',
        });
        await applyDecision.mutateAsync(proposal.id);
        toast({ title: '已通过并应用', variant: 'success' });
      }

      setSkillName('');
      setReason('');
      setDiff('');
      onSuccess?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: msg, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <PlusCircle className="h-4 w-4" />
          创建提议（用户提议）
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="text-sm font-medium text-muted-foreground">技能名称</label>
          <Input
            data-testid="create-proposal-skill-name"
            placeholder="例如 my-skill"
            value={skillName}
            onChange={(e) => setSkillName(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">作用域</label>
          <Select value={scope} onValueChange={(v) => setScope(v as ProposalScope)}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">项目级 (project)</SelectItem>
              <SelectItem value="user">用户级 (user)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">提议理由</label>
          <Textarea
            data-testid="create-proposal-reason"
            placeholder="说明本提议的目的或变更原因"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">
            Diff 或完整 SKILL 内容（可选）
          </label>
          <Textarea
            data-testid="create-proposal-diff"
            placeholder="留空则仅提交自然语言，由 skills-admin 根据「提议理由」润色并生成 diff 后再审查；也可粘贴 unified diff 或完整 SKILL.md 内容"
            value={diff}
            onChange={(e) => setDiff(e.target.value)}
            rows={8}
            className="mt-1 font-mono text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            data-testid="create-proposal-submit-only"
            variant="secondary"
            onClick={() => handleSubmit('create_only')}
            disabled={createProposal.isPending}
          >
            仅创建
          </Button>
          <Button
            data-testid="create-proposal-submit-and-apply"
            onClick={() => handleSubmit('create_and_apply')}
            disabled={createProposal.isPending || approveProposal.isPending || applyDecision.isPending}
          >
            创建并立即通过并应用
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
