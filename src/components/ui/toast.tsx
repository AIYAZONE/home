import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ToastItem, useToastStore } from '@/stores/toast';

const variants: Record<ToastItem['variant'], string> = {
  default: 'border-border bg-card text-foreground',
  success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
  warning: 'border-amber-500/20 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  danger: 'border-destructive/20 bg-destructive/10 text-destructive',
};

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:block sm:px-0">
      <div className="pointer-events-auto w-full max-w-sm space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'animate-in fade-in slide-in-from-top-2 rounded-xl border px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/60',
              variants[t.variant],
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {t.title ? <div className="text-sm font-semibold">{t.title}</div> : null}
                <div className={cn('text-sm', t.title ? 'text-muted-foreground' : '')}>{t.message}</div>
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
