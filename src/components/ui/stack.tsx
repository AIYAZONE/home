import { cn } from '@/lib/utils';

type StackGap = 'sm' | 'md' | 'lg';

const gapClasses: Record<StackGap, string> = {
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
};

export function Stack({
  gap = 'md',
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { gap?: StackGap }) {
  return <div className={cn('flex flex-col', gapClasses[gap], className)} {...props} />;
}

