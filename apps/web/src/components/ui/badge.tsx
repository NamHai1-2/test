import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
  {
    variants: {
      variant: {
        neutral: 'bg-slate-50 text-slate-700 ring-slate-500/20',
        success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
        warning: 'bg-amber-50 text-amber-800 ring-amber-600/25',
        danger: 'bg-red-50 text-red-700 ring-red-600/20',
        info: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
        purple: 'bg-violet-50 text-violet-700 ring-violet-600/20',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  /** Small coloured dot before the label. */
  dot?: boolean;
}

export function Badge({ className, variant, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
