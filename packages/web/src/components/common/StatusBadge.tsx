import { Badge } from '@/components/ui/Badge';
import { Clock, CheckCircle, XCircle } from 'lucide-react';
import type { ProposalStatus } from '@/api/types';

interface StatusBadgeProps {
  status: ProposalStatus;
  showIcon?: boolean;
}

const statusConfig = {
  pending: {
    label: '待审核',
    icon: Clock,
    variant: 'pending' as const,
  },
  approved: {
    label: '已批准',
    icon: CheckCircle,
    variant: 'approved' as const,
  },
  applied: {
    label: '已应用',
    icon: CheckCircle,
    variant: 'approved' as const,
  },
  rejected: {
    label: '已拒绝',
    icon: XCircle,
    variant: 'rejected' as const,
  },
};

const fallbackConfig = {
  label: '未知',
  icon: Clock,
  variant: 'pending' as const,
};

export function StatusBadge({ status, showIcon = true }: StatusBadgeProps) {
  const config = (status && statusConfig[status as keyof typeof statusConfig]) ?? fallbackConfig;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1">
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </Badge>
  );
}
