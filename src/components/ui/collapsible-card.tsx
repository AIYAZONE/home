import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

export function CollapsibleCard({
  className,
  defaultOpen = false,
  title,
  description,
  badge,
  actions,
  children,
}: {
  className?: string;
  defaultOpen?: boolean;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className={cn('overflow-hidden', className)}>
      <details
        className="group"
        open={open}
        onToggle={(e) => {
          setOpen((e.target as HTMLDetailsElement).open);
        }}
      >
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-5 sm:py-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold leading-tight text-foreground">{title}</div>
              {badge ? <div className="shrink-0">{badge}</div> : null}
            </div>
            {description ? <div className="mt-1 truncate text-xs text-muted-foreground">{description}</div> : null}
          </div>
          <div className="flex items-center gap-2">
            {actions ? (
              <div
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                {actions}
              </div>
            ) : null}
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
          </div>
        </summary>
        <div className="border-t border-border/60 px-4 pb-4 sm:px-5 sm:pb-5">
          {children}
        </div>
      </details>
    </Card>
  );
}
