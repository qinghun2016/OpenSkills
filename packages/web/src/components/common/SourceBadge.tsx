import { Badge } from '@/components/ui/Badge';
import { Bot, User, Globe } from 'lucide-react';
import type { ProposalTrigger } from '@/api/types';

interface SourceBadgeProps {
  source: ProposalTrigger | 'human' | 'agent' | 'crawler';
  showIcon?: boolean;
}

const sourceConfig = {
  agent: {
    label: 'Agent',
    icon: Bot,
    variant: 'agent' as const,
  },
  human: {
    label: 'Human',
    icon: User,
    variant: 'human' as const,
  },
  crawler: {
    label: 'Crawler',
    icon: Globe,
    variant: 'crawler' as const,
  },
};

export function SourceBadge({ source, showIcon = true }: SourceBadgeProps) {
  const config = sourceConfig[source] || sourceConfig.human; // 默认使用 human
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="gap-1">
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </Badge>
  );
}
