import { useMemo } from 'react';
import { CheckCircle2, Sparkles, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useActionItems } from '@/hooks/useActionItems';
import { useCopilot } from '@/contexts/CopilotContext';

function formatDueDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

export function ActionInboxCard() {
  const { items, isLoading, updateStatus, isUpdating } = useActionItems();
  const { openWithDraft } = useCopilot();

  const top = useMemo(() => (items ?? []).slice(0, 5), [items]);

  return (
    <Card className="bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">行动收件箱</CardTitle>
            <CardDescription>AI 帮你把“下一步”拆好，你只需要确认并完成。</CardDescription>
          </div>
          <Badge variant="default">{isLoading ? '…' : String(items?.length ?? 0)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {(top ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4">
            <div className="text-sm font-medium">暂无行动</div>
            <div className="mt-1 text-sm text-muted-foreground">你可以让 AI 先生成一份本周健康行动清单。</div>
            <div className="mt-3">
              <Button
                type="button"
                onClick={() => openWithDraft('给我本周健康行动清单：只要 3 条最容易坚持的。')}
              >
                <Sparkles className="h-4 w-4" />
                让 AI 生成
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {top.map((it) => (
              <div key={it.id} className="flex items-start justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-medium">{it.title}</div>
                    {it.due_date ? (
                      <span className={cn('text-xs', new Date(it.due_date) < new Date() ? 'text-rose-600' : 'text-muted-foreground')}>
                        截止 {formatDueDate(it.due_date)}
                      </span>
                    ) : null}
                  </div>
                  {it.next_step ? <div className="mt-1 text-xs text-muted-foreground">{it.next_step}</div> : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={isUpdating}
                    onClick={async () => {
                      await updateStatus({ id: it.id, status: 'done' });
                    }}
                    aria-label="完成"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={isUpdating}
                    onClick={async () => {
                      await updateStatus({ id: it.id, status: 'dismissed' });
                    }}
                    aria-label="忽略"
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

