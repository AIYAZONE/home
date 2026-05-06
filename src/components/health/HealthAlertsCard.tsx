import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useHealthAlerts } from '@/hooks/useHealthAlerts';

export function HealthAlertsCard(props: { subjectUserId: string | null }) {
  const { alerts, isLoading, updateAlertStatus, isUpdating } = useHealthAlerts(props.subjectUserId);
  const rows = (alerts ?? []).slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle>异常预警与随访</CardTitle>
        <CardDescription>根据报告异常项自动生成随访建议。</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">加载中…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">暂无异常随访任务</div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {rows.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{it.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{it.description || '—'}</div>
                </div>
                <div className="flex items-center gap-2">
                  {it.status !== 'done' ? (
                    <Button size="sm" variant="secondary" disabled={isUpdating} onClick={() => updateAlertStatus({ id: it.id, status: 'done' })}>
                      标记完成
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={isUpdating} onClick={() => updateAlertStatus({ id: it.id, status: 'todo' })}>
                      重新打开
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
