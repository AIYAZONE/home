import { cn } from '@/lib/utils';

export function BottomCTA({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('fixed inset-x-0 bottom-0 z-40 lg:hidden', className)} {...props}>
      <div className="border-t border-border/70 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}
