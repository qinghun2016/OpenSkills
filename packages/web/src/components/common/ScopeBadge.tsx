import { Badge } from '@/components/ui/Badge';
import { User, FolderGit2 } from 'lucide-react';
import type { ProposalScope } from '@/api/types';

interface ScopeBadgeProps {
  scope: ProposalScope | 'user' | 'project';
  showIcon?: boolean;
}

export function ScopeBadge({ scope, showIcon = true }: ScopeBadgeProps) {
  const isUser = scope === 'user';

  return (
    <Badge variant={isUser ? 'user' : 'project'} className="gap-1">
      {showIcon && (
        isUser ? (
          <User className="h-3 w-3" />
        ) : (
          <FolderGit2 className="h-3 w-3" />
        )
      )}
      {isUser ? 'USER' : 'PROJECT'}
    </Badge>
  );
}
