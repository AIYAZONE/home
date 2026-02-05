import { cn } from '@/lib/utils';

type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

const variants: Record<AlertVariant, string> = {
  info: 'border-border bg-card text-foreground',
  success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  warning: 'border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  danger: 'border-destructive/20 bg-destructive/10 text-destructive',
};

export function Alert({
  className,
  variant = 'info',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: AlertVariant }) {
  return (
    <div
      role="alert"
      className={cn('rounded-xl border px-4 py-3 text-sm', variants[variant], className)}
      {...props}
    />
  );
}
