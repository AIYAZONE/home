import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useHealthCheckPlans } from '@/hooks/useHealthCheckPlans';
import { HealthCheckPlan } from '@/types';

export function HealthCheckPlanCard(props: { subjectUserId: string | null }) {
  const { plans, isLoading, addPlan, isAdding } = useHealthCheckPlans(props.subjectUserId);
  const [title, setTitle] = useState('');
  const [nextDueDate, setNextDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [planType, setPlanType] = useState<HealthCheckPlan['plan_type']>('checkup');

  return (
    <Card>
      <CardHeader>
        <CardTitle>检查计划</CardTitle>
        <CardDescription>按成员规划检查项目并跟踪到期时间。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Select value={planType} onChange={(e) => setPlanType(e.target.value as HealthCheckPlan['plan_type'])}>
            <option value="checkup">体检</option>
            <option value="lab">化验</option>
            <option value="vaccination">疫苗</option>
            <option value="other">其他</option>
          </Select>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="计划标题" />
          <Input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
          <Button
            type="button"
            disabled={!title.trim() || !nextDueDate || isAdding}
            onClick={() => {
              addPlan({
                plan_type: planType,
                title: title.trim(),
                cadence: 'yearly',
                next_due_date: nextDueDate,
                last_completed_date: null,
                status: 'active',
                notes: null,
              });
              setTitle('');
            }}
          >
            添加
          </Button>
        </div>

        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">加载中…</div>
        ) : (plans?.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">暂无检查计划</div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {(plans ?? []).slice(0, 8).map((it) => (
              <div key={it.id} className="px-4 py-3">
                <div className="text-sm font-medium">{it.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{it.next_due_date}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
