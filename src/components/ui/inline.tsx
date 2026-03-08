import { cn } from '@/lib/utils';

type InlineGap = 'sm' | 'md' | 'lg';

const gapClasses: Record<InlineGap, string> = {
  sm: 'gap-2',
  md: 'gap-3',
  lg: 'gap-4',
};

export function Inline({
  gap = 'md',
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { gap?: InlineGap }) {
  return <div className={cn('flex items-center', gapClasses[gap], className)} {...props} />;
}

