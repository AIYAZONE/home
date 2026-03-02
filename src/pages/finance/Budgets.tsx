import { useState, useMemo } from 'react';
import { useBudgets } from '@/hooks/useBudgets';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';

export default function FinanceBudgets() {
  const { budgets, isLoading: isBudgetsLoading, upsertBudget, deleteBudget, isUpserting, isDeleting } = useBudgets();
  const { transactions } = useTransactions({ monthsBack: 6 });
  const { categories } = useCategories();

  const [budgetCategoryName, setBudgetCategoryName] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');

  const monthStart = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1), []);

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    (transactions ?? []).filter((t) => t.type === 'expense' && new Date(t.date) >= monthStart).forEach((t) => {
      const key = t.category.trim();
      map.set(key, (map.get(key) ?? 0) + t.amount);
    });
    return map;
  }, [transactions, monthStart]);

  const budgetCategoryOptions = useMemo(() => (categories ?? []).filter((c) => c.kind === 'expense' || c.kind === 'both').sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')), [categories]);

  const budgetSummary = useMemo(() => {
    const totalBudget = (budgets ?? []).reduce((acc, b) => acc + Number(b.amount), 0);
    const totalSpent = (budgets ?? []).reduce((acc, b) => acc + (spentByCategory.get(b.category_name) ?? 0), 0);
    return { totalBudget, totalSpent, ratio: totalBudget > 0 ? totalSpent / totalBudget : 0 };
  }, [budgets, spentByCategory]);

  if (isBudgetsLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <Page>
      <PageHeader>
        <PageTitle>预算管理</PageTitle>
        <PageDescription>为本月支出分类设置预算，并实时跟踪执行进度。</PageDescription>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">本月预算</CardTitle></CardHeader><CardContent className="pt-0"><div className="text-lg font-semibold">¥{budgetSummary.totalBudget.toFixed(2)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">已花费</CardTitle></CardHeader><CardContent className="pt-0"><div className="text-lg font-semibold">¥{budgetSummary.totalSpent.toFixed(2)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">剩余</CardTitle></CardHeader><CardContent className="pt-0"><div className="text-lg font-semibold">¥{Math.max(0, budgetSummary.totalBudget - budgetSummary.totalSpent).toFixed(2)}</div></CardContent></Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>预算配置</CardTitle>
            <Badge variant={budgetSummary.ratio >= 1 ? 'danger' : budgetSummary.ratio >= 0.8 ? 'warning' : 'success'}>{(budgetSummary.ratio * 100).toFixed(0)}%</Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <form className="grid grid-cols-1 gap-3 md:grid-cols-6" onSubmit={(e) => { e.preventDefault(); const name = budgetCategoryName.trim(); const amountNumber = Number(budgetAmount); if (!name || !Number.isFinite(amountNumber) || amountNumber <= 0) return; upsertBudget({ category_name: name, amount: amountNumber }); setBudgetCategoryName(''); setBudgetAmount(''); }}>
            <div className="space-y-1.5 md:col-span-3">
              <label className="text-sm font-medium">分类</label>
              <Input value={budgetCategoryName} onChange={(e) => setBudgetCategoryName(e.target.value)} placeholder="例如：餐饮、交通" list="budget-category-options" />
              <datalist id="budget-category-options">{budgetCategoryOptions.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium">预算金额</label>
              <Input value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="flex items-end"><Button type="submit" className="w-full" disabled={!budgetCategoryName.trim() || !budgetAmount.trim() || isUpserting}>{isUpserting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}保存</Button></div>
          </form>

          {(budgets?.length ?? 0) === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">暂无预算配置</div> : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {budgets?.map((b) => {
                const spent = spentByCategory.get(b.category_name) ?? 0;
                const ratio = b.amount > 0 ? spent / b.amount : 0;
                const badge = ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warning' : 'success';
                return (
                  <div key={b.id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2"><div className="truncate text-sm font-medium">{b.category_name}</div><Badge variant={badge as any}>{(ratio * 100).toFixed(0)}%</Badge></div>
                        <div className="mt-1 text-xs text-muted-foreground">预算 ¥{Number(b.amount).toFixed(2)} · 已花费 ¥{spent.toFixed(2)} · 剩余 ¥{Math.max(0, b.amount - spent).toFixed(2)}</div>
                        <div className="mt-3 h-2 w-full rounded-full bg-muted/60"><div className={cn('h-2 rounded-full', ratio >= 1 ? 'bg-rose-500' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => { setBudgetCategoryName(b.category_name); setBudgetAmount(String(b.amount)); }}>编辑</Button>
                        <Button variant="ghost" size="sm" disabled={isDeleting} onClick={() => { if (window.confirm('确认删除？')) deleteBudget(b.id); }}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
