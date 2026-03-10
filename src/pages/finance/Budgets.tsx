import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBudgets } from '@/hooks/useBudgets';
import { useBudgetsForMonths } from '@/hooks/useBudgetsForMonths';
import { useBudgetTemplates } from '@/hooks/useBudgetTemplates';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { Input } from '@/components/ui/input';
import { ListRow, ListRowLeading, ListRowTrailing } from '@/components/ui/list-row';
import { MetricCard } from '@/components/ui/metric-card';
import { Page, PageActions, PageBody, PageDescription, PageHeader, PageSection, PageTitle } from '@/components/ui/page';
import { compareByLocale, formatMoney, formatPercent } from '@/lib/format';
import { addMonths, computeAverageMonthlySpentByCategory, computeBudgetMetrics, parseMonthStartKey, toMonthStartKey, topEntries } from '@/lib/budget';
import { BudgetGuideCard } from '@/components/finance/BudgetGuideCard';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/lib/supabase';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';
import { BudgetEditorModal, BudgetEditorInitialValue } from '@/components/finance/BudgetEditorModal';

export default function FinanceBudgets() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const nowMonthStart = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1), []);
  const [monthValue, setMonthValue] = useState(() => toMonthStartKey(nowMonthStart).slice(0, 7));
  const [summaryMode, setSummaryMode] = useState<'month' | 'quarter' | 'year'>('month');

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

  const {
    budgets,
    isLoading: isBudgetsLoading,
    upsertBudget,
    upsertBudgetAsync,
    deleteBudget,
    deleteBudgetAsync,
    ensureMonthBudgets,
    isEnsuring,
    isUpserting,
    isDeleting,
  } = useBudgets(monthStartKey);
  const { transactions, isLoading: isTransactionsLoading } = useTransactions({ monthsBack });
  const { categories, isLoading: isCategoriesLoading } = useCategories();
  const { templates, isLoading: isTemplatesLoading, upsertTemplate, deleteTemplate, isUpserting: isTemplateUpserting, isDeleting: isTemplateDeleting } = useBudgetTemplates();

  const [templateCategoryName, setTemplateCategoryName] = useState('');
  const [templateAmount, setTemplateAmount] = useState('');
  const [isBudgetEditorOpen, setIsBudgetEditorOpen] = useState(false);
  const [budgetEditorMode, setBudgetEditorMode] = useState<'add' | 'edit'>('add');
  const [budgetEditorInitialValue, setBudgetEditorInitialValue] = useState<BudgetEditorInitialValue | null>(null);

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

  const topUnbudgeted = useMemo(() => topEntries(metrics.unbudgetedByCategory, 5), [metrics.unbudgetedByCategory]);

  const quarterMonthStarts = useMemo(() => {
    const y = monthStart.getFullYear();
    const quarterStartMonth = Math.floor(monthStart.getMonth() / 3) * 3;
    const q0 = new Date(y, quarterStartMonth, 1);
    return [q0, addMonths(q0, 1), addMonths(q0, 2)].map((d) => toMonthStartKey(d));
  }, [monthStart]);

  const yearMonthStarts = useMemo(() => {
    const y = monthStart.getFullYear();
    return Array.from({ length: 12 }).map((_, i) => toMonthStartKey(new Date(y, i, 1)));
  }, [monthStart]);

  const { budgets: quarterBudgets, isLoading: isQuarterBudgetsLoading } = useBudgetsForMonths(quarterMonthStarts);
  const { budgets: yearBudgets, isLoading: isYearBudgetsLoading } = useBudgetsForMonths(yearMonthStarts);

  const summaryLabel = useMemo(() => {
    if (summaryMode === 'month') return monthLabel;
    if (summaryMode === 'year') return `${monthStart.getFullYear()}年`;
    const q = Math.floor(monthStart.getMonth() / 3) + 1;
    return `${monthStart.getFullYear()}年第${q}季度`;
  }, [summaryMode, monthLabel, monthStart]);

  const summaryMetrics = useMemo(() => {
    if (summaryMode === 'month') {
      return {
        totalBudget: metrics.totalBudget,
        spentAll: metrics.spentAll,
        unbudgetedSpent: metrics.unbudgetedSpent,
        coverageRatio: metrics.coverageRatio,
        executionRatio: metrics.executionRatio,
      };
    }

    const start = summaryMode === 'year' ? new Date(monthStart.getFullYear(), 0, 1) : new Date(monthStart.getFullYear(), Math.floor(monthStart.getMonth() / 3) * 3, 1);
    const end = summaryMode === 'year' ? new Date(monthStart.getFullYear() + 1, 0, 1) : new Date(monthStart.getFullYear(), Math.floor(monthStart.getMonth() / 3) * 3 + 3, 1);
    const periodBudgets = summaryMode === 'year' ? (yearBudgets ?? []) : (quarterBudgets ?? []);
    const budgetedCategories = new Set(periodBudgets.map((b) => b.category_name.trim()).filter(Boolean));

    let spentAll = 0;
    let spentBudgeted = 0;
    let unbudgetedSpent = 0;

    (transactions ?? [])
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        const d = new Date(t.date);
        if (d < start || d >= end) return;
        spentAll += t.amount;
        const key = t.category.trim();
        if (budgetedCategories.has(key)) spentBudgeted += t.amount;
        else unbudgetedSpent += t.amount;
      });

    const totalBudget = periodBudgets.reduce((acc, b) => acc + Number(b.amount), 0);
    const coverageRatio = spentAll > 0 ? spentBudgeted / spentAll : 0;
    const executionRatio = totalBudget > 0 ? spentBudgeted / totalBudget : 0;

    return { totalBudget, spentAll, unbudgetedSpent, coverageRatio, executionRatio };
  }, [summaryMode, metrics, monthStart, transactions, quarterBudgets, yearBudgets]);

  const saveMonthAsTemplatesMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');
      const rows = (budgets ?? [])
        .map((b) => ({
          family_id: profile.family_id,
          category_id: b.category_id ?? null,
          category_name: b.category_name.trim(),
          method: 'fixed',
          amount: Number(b.amount),
          start_month: null,
          end_month: null,
          priority: 100,
          active: true,
          updated_at: new Date().toISOString(),
        }))
        .filter((r) => r.category_name && Number.isFinite(r.amount) && r.amount > 0);
      if (rows.length === 0) throw new Error('本月没有可保存的预算（金额需大于 0）');
      const { error } = await supabase.from('budget_templates').upsert(rows, { onConflict: 'family_id,category_name' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget_templates'] });
      pushToast({ variant: 'success', title: '已保存为模板', message: '下个月会优先按模板自动生成预算。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  const isLoading = isBudgetsLoading || isTransactionsLoading || isCategoriesLoading;

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  const openAddBudget = (initial?: BudgetEditorInitialValue | null) => {
    setBudgetEditorMode('add');
    setBudgetEditorInitialValue(initial ?? null);
    setIsBudgetEditorOpen(true);
  };

  const openEditBudget = (b: any) => {
    setBudgetEditorMode('edit');
    setBudgetEditorInitialValue({ id: b.id, category_id: b.category_id ?? null, category_name: b.category_name, amount: Number(b.amount) });
    setIsBudgetEditorOpen(true);
  };

  const closeBudgetEditor = () => {
    setIsBudgetEditorOpen(false);
    setBudgetEditorInitialValue(null);
  };

  return (
    <Page className="mx-auto max-w-6xl">
      <PageHeader>
        <div>
          <PageTitle>预算管理</PageTitle>
          <PageDescription>模板优先 + 继承上月补齐；用月/季/年视角复盘，编辑以当月为准。</PageDescription>
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
          <Button variant="secondary" disabled={isEnsuring} onClick={() => ensureMonthBudgets()}>
            {isEnsuring ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            补齐本月
          </Button>
        </PageActions>
      </PageHeader>

      <PageBody>
        <PageSection>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium text-foreground">{summaryLabel}汇总</div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button className="flex-1 sm:flex-none" size="sm" variant={summaryMode === 'month' ? 'primary' : 'secondary'} onClick={() => setSummaryMode('month')}>月度</Button>
              <Button className="flex-1 sm:flex-none" size="sm" variant={summaryMode === 'quarter' ? 'primary' : 'secondary'} onClick={() => setSummaryMode('quarter')}>季度</Button>
              <Button className="flex-1 sm:flex-none" size="sm" variant={summaryMode === 'year' ? 'primary' : 'secondary'} onClick={() => setSummaryMode('year')}>年度</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="预算（已配置分类合计）" value={formatMoney(summaryMetrics.totalBudget)} />
            <MetricCard label="已花费（全部支出）" value={formatMoney(summaryMetrics.spentAll)} />
            <MetricCard tone={summaryMetrics.unbudgetedSpent > 0 ? 'warning' : 'success'} label="未预算支出" value={formatMoney(summaryMetrics.unbudgetedSpent)} hint="口径：未预算分类" />
            <MetricCard
              tone={summaryMetrics.coverageRatio >= 0.8 ? 'success' : summaryMetrics.coverageRatio >= 0.5 ? 'warning' : 'danger'}
              label="预算覆盖率"
              value={formatPercent(summaryMetrics.coverageRatio * 100, 0)}
              hint="口径：预算支出/全部"
            />
          </div>
        </PageSection>

        <PageSection>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div>
              <Card className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>本月预算</CardTitle>
                      <CardDescription>执行率只统计已配置预算的分类，未配置的支出会单独计入“未预算支出”。</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openAddBudget(null)}>
                        <Plus className="h-4 w-4" />
                        新增预算
                      </Button>
                      <Badge variant={summaryMetrics.executionRatio >= 1 ? 'danger' : summaryMetrics.executionRatio >= 0.8 ? 'warning' : 'success'}>
                        执行率 {formatPercent(summaryMetrics.executionRatio * 100, 0)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
              {(budgets?.length ?? 0) === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">暂无预算配置。可以先点右侧“未预算分类”的按钮快速开始。</div>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border">
                  {budgets?.map((b) => {
                    const spent = metrics.spentByCategory.get(b.category_name.trim()) ?? 0;
                    const ratio = b.amount > 0 ? spent / b.amount : 0;
                    const badge: 'success' | 'warning' | 'danger' = ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warning' : 'success';
                    const sourceLabel = b.source === 'template' ? '模板' : b.source === 'inherited' ? '继承' : null;
                    return (
                      <ListRow key={b.id}>
                        <ListRowLeading className="items-start">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-medium">{b.category_name}</div>
                              {sourceLabel ? <Badge variant="default" className="whitespace-nowrap">{sourceLabel}</Badge> : null}
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
                                openEditBudget(b);
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
                  const avg = avgMonthlySpentByCategory.get(name) ?? 0;
                  const suggested = avg > 0 ? Math.round(avg * 1.1 * 100) / 100 : 0;
                  openAddBudget({ category_name: name, amount: suggested });
                }}
              />

              <CollapsibleCard
                defaultOpen={false}
                title="常用预算模板"
                description="低频设置：固定预算先存模板，后续月份自动补齐。"
                badge={<Badge variant="default" className="whitespace-nowrap">{(templates?.length ?? 0)} 条</Badge>}
                actions={
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={saveMonthAsTemplatesMutation.isPending}
                    onClick={() => saveMonthAsTemplatesMutation.mutate()}
                  >
                    {saveMonthAsTemplatesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    本月保存为模板
                  </Button>
                }
              >
                <div className="space-y-3 pt-4">
                  <form
                    className="grid grid-cols-1 gap-3 md:grid-cols-6 lg:grid-cols-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = templateCategoryName.trim();
                      const amountNumber = Number(templateAmount);
                      if (!name || !Number.isFinite(amountNumber) || amountNumber <= 0) return;
                      const categoryId = budgetCategoryOptions.find((c) => c.name === name)?.id ?? null;
                      upsertTemplate({ category_id: categoryId, category_name: name, amount: amountNumber });
                      setTemplateCategoryName('');
                      setTemplateAmount('');
                    }}
                  >
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">分类</label>
                      <Input value={templateCategoryName} onChange={(e) => setTemplateCategoryName(e.target.value)} placeholder="例如：房租、学费" list="budget-category-options" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">每月金额</label>
                      <Input value={templateAmount} onChange={(e) => setTemplateAmount(e.target.value)} placeholder="0.00" />
                    </div>
                    <Button type="submit" className="w-full" disabled={!templateCategoryName.trim() || !templateAmount.trim() || isTemplateUpserting}>
                      {isTemplateUpserting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      保存模板
                    </Button>
                  </form>

                  {isTemplatesLoading ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">加载中…</div>
                  ) : (templates?.length ?? 0) === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">暂无模板。建议先把房租/学费/订阅等固定支出存为模板。</div>
                  ) : (
                    <div className="divide-y divide-border rounded-xl border border-border">
                      {templates?.map((t) => (
                        <ListRow key={t.id}>
                          <ListRowLeading>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{t.category_name}</div>
                              <div className="mt-1 text-xs text-muted-foreground">每月 {formatMoney(t.amount)}</div>
                            </div>
                          </ListRowLeading>
                          <ListRowTrailing className="sm:justify-end">
                            <div className="flex items-center gap-2 sm:justify-end">
                              <Button
                                variant="secondary"
                                size="sm"
                                className="w-full sm:w-auto"
                                onClick={() => upsertBudget({ category_id: t.category_id, category_name: t.category_name, amount: Number(t.amount) })}
                              >
                                用到本月
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full sm:w-auto"
                                disabled={isTemplateDeleting}
                                onClick={() => {
                                  if (window.confirm('确认删除该模板？')) deleteTemplate(t.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </ListRowTrailing>
                        </ListRow>
                      ))}
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground">
                    {summaryMode === 'month' ? null : (
                      <span>季度/年度视角用于复盘；编辑仍以当月预算为准。</span>
                    )}
                    {(isQuarterBudgetsLoading || isYearBudgetsLoading) && summaryMode !== 'month' ? (
                      <span>（预算汇总加载中…）</span>
                    ) : null}
                  </div>
                </div>
              </CollapsibleCard>
            </div>
          </div>
        </PageSection>
      </PageBody>

      <BudgetEditorModal
        open={isBudgetEditorOpen}
        mode={budgetEditorMode}
        categories={budgetCategoryOptions}
        avgMonthlySpentByCategory={avgMonthlySpentByCategory}
        initialValue={budgetEditorInitialValue}
        isSubmitting={isUpserting || isDeleting}
        onClose={closeBudgetEditor}
        onSubmit={async (payload) => {
          try {
            await upsertBudgetAsync({ category_id: payload.category_id, category_name: payload.category_name, amount: payload.amount });
            closeBudgetEditor();
          } catch {
            return;
          }
        }}
        onDelete={
          budgetEditorMode === 'edit'
            ? async (id) => {
                try {
                  await deleteBudgetAsync(id);
                  closeBudgetEditor();
                } catch {
                  return;
                }
              }
            : undefined
        }
      />
    </Page>
  );
}
