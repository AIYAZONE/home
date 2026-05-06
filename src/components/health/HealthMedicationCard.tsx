import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHealthMedications } from '@/hooks/useHealthMedications';

export function HealthMedicationCard(props: { subjectUserId: string | null }) {
  const { medications, isLoading, addMedication, isAdding } = useHealthMedications(props.subjectUserId);
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>用药管理</CardTitle>
        <CardDescription>管理家庭成员的长期/短期用药计划。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="药名" />
          <Input value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="剂量" />
          <Input value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="频次" />
          <Button
            type="button"
            disabled={!name.trim() || isAdding}
            onClick={() => {
              addMedication({
                medication_name: name.trim(),
                dosage: dosage.trim() || null,
                frequency: frequency.trim() || null,
                start_date: null,
                end_date: null,
                reminder_rule: {},
                status: 'active',
                notes: null,
              });
              setName('');
              setDosage('');
              setFrequency('');
            }}
          >
            添加
          </Button>
        </div>

        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">加载中…</div>
        ) : (medications?.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">暂无用药记录</div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {(medications ?? []).slice(0, 8).map((it) => (
              <div key={it.id} className="px-4 py-3">
                <div className="text-sm font-medium">{it.medication_name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{[it.dosage, it.frequency].filter(Boolean).join(' · ') || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
