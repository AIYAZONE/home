import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

type MetricTone = 'default' | 'success' | 'warning' | 'danger';

const tones: Record<MetricTone, string> = {
  default: 'border-border/55',
  success: 'border-emerald-500/25',
  warning: 'border-amber-500/25',
  danger: 'border-rose-500/25',
};

export function MetricCard({
  className,
  label,
  value,
  hint,
  tone = 'default',
  right,
}: {
  className?: string;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: MetricTone;
  right?: React.ReactNode;
}) {
  return (
    <Card className={cn('relative overflow-hidden', tones[tone], className)}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className="mt-2 text-2xl font-semibold leading-none tracking-tight text-foreground">{value}</div>
            {hint ? <div className="mt-2 text-xs text-muted-foreground">{hint}</div> : null}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

