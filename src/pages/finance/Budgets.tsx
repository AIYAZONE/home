import { useMemo, useState } from 'react';
import { useBudgets } from '@/hooks/useBudgets';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { ChevronLeft, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ListRow, ListRowLeading, ListRowTrailing } from '@/components/ui/list-row';
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { compareByLocale, formatMoney, formatPercent } from '@/lib/format';
import { addMonths, computeAverageMonthlySpentByCategory, computeBudgetMetrics, parseMonthStartKey, toMonthStartKey, topEntries } from '@/lib/budget';
import { BudgetGuideCard } from '@/components/finance/BudgetGuideCard';

export default function FinanceBudgets() {
  const nowMonthStart = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1), []);
  const [monthValue, setMonthValue] = useState(() => toMonthStartKey(nowMonthStart).slice(0, 7));

  const monthStartKey = useMemo(() => `${monthValue}-01`, [monthValue]);
  const monthStart = useMemo(() => parseMonthStartKey(monthStartKey), [monthStartKey]);
  const monthLabel = useMemo(() => {
    const y = monthStart.getFullYear();
    const m = String(monthStart.getMonth() + 1).padStart(2, '0');
    return `${y}年${m}月`;
  }, [monthStart]);

  const monthsBack = useMemo(() => {
    const diff = (nowMonthStart.getFullYear() - monthStart.getFullYear()) * 12 + (nowMonthStart.getMonth() - monthStart.getMonth());
    const base = Math.max(6, diff + 6);
    return Math.min(36, Math.max(6, base));
  }, [monthStart, nowMonthStart]);

  const { budgets, isLoading: isBudgetsLoading, upsertBudget, deleteBudget, isUpserting, isDeleting } = useBudgets(monthStartKey);
  const { transactions, isLoading: isTransactionsLoading } = useTransactions({ monthsBack });
  const { categories, isLoading: isCategoriesLoading } = useCategories();

  const [budgetCategoryName, setBudgetCategoryName] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');

  const budgetCategoryOptions = useMemo(
    () => (categories ?? []).filter((c) => c.kind === 'expense' || c.kind === 'both').sort((a, b) => compareByLocale(a.name, b.name)),
    [categories],
  );

  const metrics = useMemo(
    () => computeBudgetMetrics({ budgets: budgets ?? [], transactions: transactions ?? [], monthStart }),
    [budgets, transactions, monthStart],
  );

  const avgMonthlySpentByCategory = useMemo(
    () => computeAverageMonthlySpentByCategory({ transactions: transactions ?? [], monthStart, months: 3 }),
    [transactions, monthStart],
  );

  const selectedCategoryAvg = useMemo(() => {
    const key = budgetCategoryName.trim();
    if (!key) return 0;
    return avgMonthlySpentByCategory.get(key) ?? 0;
  }, [avgMonthlySpentByCategory, budgetCategoryName]);

  const suggestedBudget = useMemo(() => Math.max(0, selectedCategoryAvg * 1.1), [selectedCategoryAvg]);

  const topUnbudgeted = useMemo(() => topEntries(metrics.unbudgetedByCategory, 5), [metrics.unbudgetedByCategory]);

  const isLoading = isBudgetsLoading || isTransactionsLoading || isCategoriesLoading;

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <Page className="mx-auto max-w-6xl">
      <PageHeader>
        <div>
          <PageTitle>预算管理</PageTitle>
          <PageDescription>按 {monthLabel}（自然月）为支出分类设置预算，并区分“全部支出/纳入预算的支出”，避免口径误导。</PageDescription>
        </div>
        <PageActions>
          <Button
            variant="secondary"
            onClick={() => {
              const prev = addMonths(monthStart, -1);
              setMonthValue(toMonthStartKey(prev).slice(0, 7));
            }}
          >
            <ChevronLeft className="h-4 w-4" />
            上月
          </Button>
          <Input
            type="month"
            value={monthValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v) setMonthValue(v);
            }}
            className="w-[160px]"
          />
          <Button
            variant="secondary"
            onClick={() => {
              const next = addMonths(monthStart, 1);
              setMonthValue(toMonthStartKey(next).slice(0, 7));
            }}
          >
            下月
            <ChevronRight className="h-4 w-4" />
          </Button>
        </PageActions>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">本月预算（已配置分类合计）</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg font-semibold">{formatMoney(metrics.totalBudget)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">已花费（全部支出）</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg font-semibold">{formatMoney(metrics.spentAll)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">未预算支出</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg font-semibold">{formatMoney(metrics.unbudgetedSpent)}</div>
            <div className="mt-1 text-xs text-muted-foreground">口径：未预算分类</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">预算覆盖率</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg font-semibold">{formatPercent(metrics.coverageRatio * 100, 0)}</div>
            <div className="mt-1 text-xs text-muted-foreground">口径：预算支出/全部</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div>
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>预算配置</CardTitle>
                  <CardDescription>执行率只统计“已配置预算的分类”。未配置预算的支出会进入“未预算支出”。</CardDescription>
                </div>
                <Badge variant={metrics.executionRatio >= 1 ? 'danger' : metrics.executionRatio >= 0.8 ? 'warning' : 'success'}>
                  执行率 {formatPercent(metrics.executionRatio * 100, 0)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <form
                className="grid grid-cols-1 gap-3 md:grid-cols-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = budgetCategoryName.trim();
                  const amountNumber = Number(budgetAmount);
                  if (!name || !Number.isFinite(amountNumber) || amountNumber <= 0) return;
                  upsertBudget({ category_name: name, amount: amountNumber });
                  setBudgetCategoryName('');
                  setBudgetAmount('');
                }}
              >
                <div className="space-y-1.5 md:col-span-3">
                  <label className="text-sm font-medium">分类</label>
                  <Input value={budgetCategoryName} onChange={(e) => setBudgetCategoryName(e.target.value)} placeholder="例如：餐饮、交通" list="budget-category-options" />
                  <datalist id="budget-category-options">{budgetCategoryOptions.map((c) => <option key={c.id} value={c.name} />)}</datalist>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium">预算金额</label>
                  <Input value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} placeholder="0.00" />
                  {budgetCategoryName.trim() && selectedCategoryAvg > 0 ? (
                    <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1 truncate">过去 3 个月月均 {formatMoney(selectedCategoryAvg)}，建议 {formatMoney(suggestedBudget)}</div>
                      <Button className="w-full shrink-0 sm:w-auto" type="button" size="sm" variant="secondary" onClick={() => setBudgetAmount(String(Math.round(suggestedBudget * 100) / 100))}>填入建议</Button>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">建议从“最常超支的分类”开始设置预算。</div>
                  )}
                </div>
                <div className="space-y-1.5 md:col-span-1">
                  <div className="hidden h-5 md:block" />
                  <Button type="submit" className="w-full" disabled={!budgetCategoryName.trim() || !budgetAmount.trim() || isUpserting}>
                    {isUpserting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    保存
                  </Button>
                </div>
              </form>

              {(budgets?.length ?? 0) === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">暂无预算配置。可以先点右侧“未预算分类”的按钮快速开始。</div>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border">
                  {budgets?.map((b) => {
                    const spent = metrics.spentByCategory.get(b.category_name.trim()) ?? 0;
                    const ratio = b.amount > 0 ? spent / b.amount : 0;
                    const badge: 'success' | 'warning' | 'danger' = ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warning' : 'success';
                    return (
                      <ListRow key={b.id}>
                        <ListRowLeading className="items-start">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-medium">{b.category_name}</div>
                              <Badge variant={badge} className="whitespace-nowrap">{formatPercent(ratio * 100, 0)}</Badge>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              预算 {formatMoney(b.amount)} · 已花费 {formatMoney(spent)} · 剩余 {formatMoney(Math.max(0, Number(b.amount) - spent))}
                            </div>
                            <div className="mt-3 h-2 w-full rounded-full bg-muted/60">
                              <div
                                className={cn('h-2 rounded-full', ratio >= 1 ? 'bg-rose-500' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500')}
                                style={{ width: `${Math.min(100, ratio * 100)}%` }}
                              />
                            </div>
                          </div>
                        </ListRowLeading>
                        <ListRowTrailing className="sm:justify-end">
                          <div className="flex items-center gap-2 sm:justify-end">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="w-full sm:w-auto"
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
                              className="w-full sm:w-auto"
                              disabled={isDeleting}
                              onClick={() => {
                                if (window.confirm('确认删除？')) deleteBudget(b.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </ListRowTrailing>
                      </ListRow>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <BudgetGuideCard
            monthLabel={monthLabel}
            metrics={metrics}
            topUnbudgeted={topUnbudgeted}
            onPickCategory={(name) => {
              setBudgetCategoryName(name);
              if (!budgetAmount.trim()) {
                const avg = avgMonthlySpentByCategory.get(name) ?? 0;
                if (avg > 0) setBudgetAmount(String(Math.round(avg * 1.1 * 100) / 100));
              }
            }}
          />
        </div>
      </div>
    </Page>
  );
}
