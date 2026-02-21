import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { RecurringTransaction } from '@/types';
import { Loader2, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';

export default function FinanceRecurring() {
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const { data: recurringTransactions, isLoading } = useQuery({
    queryKey: ['recurring_transactions', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('recurring_transactions')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('next_run_date', { ascending: true });
      if (error) throw error;
      return data as RecurringTransaction[];
    },
    enabled: !!profile?.family_id,
  });

  const dueRecurringTransactions = useMemo(() => {
    const all = recurringTransactions ?? [];
    const today = new Date().toISOString().slice(0, 10);
    return all.filter((r) => r.active && r.next_run_date <= today);
  }, [recurringTransactions]);

  const toggleMutation = useMutation({
    mutationFn: async (payload: { id: string; active: boolean }) => {
      const { data, error } = await supabase
        .from('recurring_transactions')
        .update({ active: payload.active, updated_at: new Date().toISOString() })
        .eq('id', payload.id)
        .select()
        .single();
      if (error) throw error;
      return data as RecurringTransaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring_transactions'] });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '更新失败', message: toUserMessage(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring_transactions'] });
      pushToast({ variant: 'success', title: '已删除', message: '固定项已删除。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('generate_recurring_transaction', { p_id: id });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      pushToast({ variant: 'success', title: '已生成', message: '本期交易已生成。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '生成失败', message: toUserMessage(err) });
    },
  });

  if (isProfileLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <Page>
      <PageHeader>
        <PageTitle>固定支出/订阅</PageTitle>
        <PageDescription>到期后提醒你确认生成交易，避免每月重复手工录入。</PageDescription>
      </PageHeader>

      {dueRecurringTransactions.length > 0 && (
        <Alert variant="warning" className="space-y-2">
          <div className="font-medium">有 {dueRecurringTransactions.length} 个固定项到期</div>
          <div className="space-y-2">
            {dueRecurringTransactions.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <div className="truncate">
                    {r.category} · {r.type === 'income' ? '+' : '-'}¥{Number(r.amount).toFixed(2)}
                  </div>
                  <div className="text-xs opacity-80">到期日：{r.next_run_date}</div>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={generateMutation.isPending}
                  onClick={() => generateMutation.mutate(r.id)}
                >
                  生成本期
                </Button>
              </div>
            ))}
          </div>
        </Alert>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>固定项列表</CardTitle>
          <CardDescription>共 {(recurringTransactions ?? []).length} 个固定项</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
          ) : (recurringTransactions?.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">暂无固定项，可在记账时勾选"设为固定支出/订阅"。</div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {(recurringTransactions ?? []).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-sm font-medium">{r.category}</div>
                      {r.visibility === 'private' ? <Badge variant="warning">私密</Badge> : null}
                      {!r.active ? <Badge variant="default">已暂停</Badge> : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {r.type === 'income' ? '收入' : '支出'} · ¥{Number(r.amount).toFixed(2)} · {r.cadence === 'monthly' ? '每月' : '每周'} · 下次到期 {r.next_run_date}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={generateMutation.isPending || r.next_run_date > new Date().toISOString().slice(0, 10)}
                      onClick={() => generateMutation.mutate(r.id)}
                    >
                      生成
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={toggleMutation.isPending}
                      onClick={() => toggleMutation.mutate({ id: r.id, active: !r.active })}
                    >
                      {r.active ? '暂停' : '启用'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        const ok = window.confirm(`确认删除固定项「${r.category}」吗？`);
                        if (!ok) return;
                        deleteMutation.mutate(r.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
