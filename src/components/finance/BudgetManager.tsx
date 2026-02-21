import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { Budget, Category, Transaction } from '@/types';
import { Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';

interface BudgetManagerProps {
  transactions: Transaction[];
  monthStart: Date;
  monthStartKey: string;
}

export default function BudgetManager({ transactions, monthStart, monthStartKey }: BudgetManagerProps) {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [budgetCategoryName, setBudgetCategoryName] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');

  const { data: budgets, isLoading: isBudgetsLoading } = useQuery({
    queryKey: ['budgets', profile?.family_id, monthStartKey],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('month_start', monthStartKey)
        .order('amount', { ascending: false });
      if (error) throw error;
      return data as Budget[];
    },
    enabled: !!profile?.family_id,
  });

  const { data: categories } = useQuery({
    queryKey: ['categories', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Category[];
    },
    enabled: !!profile?.family_id,
  });

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    transactions
      .filter((t) => t.type === 'expense' && new Date(t.date) >= monthStart)
      .forEach((t) => {
        const key = t.category.trim();
        map.set(key, (map.get(key) ?? 0) + t.amount);
      });
    return map;
  }, [transactions, monthStart]);

  const budgetCategoryOptions = useMemo(() => {
    return (categories ?? [])
      .filter((c) => c.kind === 'expense' || c.kind === 'both')
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }, [categories]);

  const budgetSummary = useMemo(() => {
    const totalBudget = (budgets ?? []).reduce((acc, b) => acc + Number(b.amount), 0);
    const totalSpent = (budgets ?? []).reduce((acc, b) => acc + (spentByCategory.get(b.category_name) ?? 0), 0);
    const ratio = totalBudget > 0 ? totalSpent / totalBudget : 0;
    return { totalBudget, totalSpent, ratio };
  }, [budgets, spentByCategory]);

  const upsertMutation = useMutation({
    mutationFn: async (payload: { category_name: string; amount: number }) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');
      const { data, error } = await supabase
        .from('budgets')
        .upsert(
          {
            family_id: profile.family_id,
            month_start: monthStartKey,
            category_name: payload.category_name,
            amount: payload.amount,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'family_id,month_start,category_name' },
        )
        .select()
        .single();
      if (error) throw error;
      return data as Budget;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      setBudgetCategoryName('');
      setBudgetAmount('');
      pushToast({ variant: 'success', title: '预算已保存', message: '本月预算已更新。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('budgets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      pushToast({ variant: 'success', title: '预算已删除', message: '该分类预算已删除。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>预算管理</CardTitle>
            <CardDescription>为本月支出分类设置预算，并实时跟踪执行进度。</CardDescription>
          </div>
          <Badge variant={budgetSummary.ratio >= 1 ? 'danger' : budgetSummary.ratio >= 0.8 ? 'warning' : 'success'}>
            {(budgetSummary.ratio * 100).toFixed(0)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">本月预算</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg font-semibold">¥{budgetSummary.totalBudget.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">已花费（预算内分类）</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg font-semibold">¥{budgetSummary.totalSpent.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">剩余</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg font-semibold">¥{Math.max(0, budgetSummary.totalBudget - budgetSummary.totalSpent).toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        <form
          className="grid grid-cols-1 gap-3 md:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            const name = budgetCategoryName.trim();
            const amountNumber = Number(budgetAmount);
            if (!name || !Number.isFinite(amountNumber) || amountNumber <= 0) return;
            upsertMutation.mutate({ category_name: name, amount: amountNumber });
          }}
        >
          <div className="space-y-1.5 md:col-span-3">
            <label className="text-sm font-medium text-foreground">分类</label>
            <Input
              value={budgetCategoryName}
              onChange={(e) => setBudgetCategoryName(e.target.value)}
              placeholder="例如：餐饮、交通、房租"
              list="budget-category-options"
            />
            <datalist id="budget-category-options">
              {budgetCategoryOptions.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-foreground">预算金额</label>
            <Input value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
          </div>

          <div className="flex items-end md:col-span-1">
            <Button type="submit" className="w-full" disabled={!budgetCategoryName.trim() || !budgetAmount.trim() || upsertMutation.isPending}>
              {upsertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </div>
        </form>

        {isBudgetsLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
        ) : (budgets?.length ?? 0) === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">暂无预算配置，先为常用支出分类设置预算。</div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {budgets?.map((b) => {
              const spent = spentByCategory.get(b.category_name) ?? 0;
              const ratio = b.amount > 0 ? spent / b.amount : 0;
              const clamped = Math.max(0, Math.min(1, ratio));
              const remaining = Math.max(0, b.amount - spent);
              const badge = ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warning' : 'success';
              return (
                <div key={b.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium">{b.category_name}</div>
                        <Badge variant={badge as any}>{(ratio * 100).toFixed(0)}%</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        预算 ¥{Number(b.amount).toFixed(2)} · 已花费 ¥{spent.toFixed(2)} · 剩余 ¥{remaining.toFixed(2)}
                      </div>
                      <div className="mt-3 h-2 w-full rounded-full bg-muted/60">
                        <div
                          className={cn('h-2 rounded-full', ratio >= 1 ? 'bg-rose-500' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500')}
                          style={{ width: `${clamped * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setBudgetCategoryName(b.category_name);
                          setBudgetAmount(String(b.amount));
                        }}
                      >
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          const ok = window.confirm(`确认删除「${b.category_name}」本月预算吗？`);
                          if (!ok) return;
                          deleteMutation.mutate(b.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        删除
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
