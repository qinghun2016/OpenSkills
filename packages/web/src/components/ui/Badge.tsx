import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        success:
          'border-transparent bg-[var(--success)] text-white',
        warning:
          'border-transparent bg-[var(--warning)] text-white',
        user:
          'border-indigo-500/30 bg-indigo-500/10 text-indigo-400',
        project:
          'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
        agent:
          'border-purple-500/30 bg-purple-500/10 text-purple-400',
        human:
          'border-blue-500/30 bg-blue-500/10 text-blue-400',
        crawler:
          'border-orange-500/30 bg-orange-500/10 text-orange-400',
        pending:
          'border-yellow-500/30 bg-yellow-500/10 text-yellow-500',
        approved:
          'border-green-500/30 bg-green-500/10 text-green-500',
        rejected:
          'border-red-500/30 bg-red-500/10 text-red-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
