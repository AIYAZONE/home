import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHealthRevisits } from '@/hooks/useHealthRevisits';

export function HealthRevisitCard(props: { subjectUserId: string | null }) {
  const { revisits, isLoading, addRevisit, isAdding } = useHealthRevisits(props.subjectUserId);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  return (
    <Card>
      <CardHeader>
        <CardTitle>复诊管理</CardTitle>
        <CardDescription>记录复诊安排并形成时间线。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="复诊原因" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Button
            type="button"
            disabled={!reason.trim() || !date || isAdding}
            onClick={() => {
              addRevisit({
                related_report_file_id: null,
                department: null,
                hospital: null,
                revisit_reason: reason.trim(),
                revisit_date: date,
                status: 'scheduled',
                notes: null,
              });
              setReason('');
            }}
          >
            添加
          </Button>
        </div>
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">加载中…</div>
        ) : (revisits?.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">暂无复诊计划</div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {(revisits ?? []).slice(0, 8).map((it) => (
              <div key={it.id} className="px-4 py-3">
                <div className="text-sm font-medium">{it.revisit_reason || '复诊计划'}</div>
                <div className="mt-1 text-xs text-muted-foreground">{it.revisit_date}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
