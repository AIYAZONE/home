import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBudgets } from '@/hooks/useBudgets';
import { useBudgetsForMonths } from '@/hooks/useBudgetsForMonths';
import { useBudgetTemplates } from '@/hooks/useBudgetTemplates';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { ListRow, ListRowLeading, ListRowTrailing } from '@/components/ui/list-row';
import { MetricCard } from '@/components/ui/metric-card';
import { Page, PageActions, PageBody, PageDescription, PageHeader, PageSection, PageTitle } from '@/components/ui/page';
import { compareByLocale, formatMoney, formatPercent } from '@/lib/format';
import { addMonths, computeAverageMonthlySpentByCategory, computeBudgetMetrics, parseMonthStartKey, toMonthStartKey, topEntries } from '@/lib/budget';
import { BudgetEditorModal, BudgetEditorInitialValue } from '@/components/finance/BudgetEditorModal';
import { ApplyTemplatesPreviewModal } from '@/components/finance/ApplyTemplatesPreviewModal';
import type { BudgetTemplate } from '@/types';

export default function FinanceBudgets() {
  const nowMonthStart = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1), []);
  const [monthValue, setMonthValue] = useState(() => toMonthStartKey(nowMonthStart).slice(0, 7));
  const [summaryMode, setSummaryMode] = useState<'month' | 'quarter' | 'year'>('month');
  const [tab, setTab] = useState<'config' | 'review' | 'templates'>('config');

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
    upsertBudgetAsync,
    deleteBudgetAsync,
    ensureMonthBudgets,
    applyTemplatesToMonthAsync,
    isEnsuring,
    isApplyingTemplates,
    isUpserting,
    isDeleting,
  } = useBudgets(monthStartKey);
  const { transactions, isLoading: isTransactionsLoading } = useTransactions({ monthsBack });
  const { categories, isLoading: isCategoriesLoading } = useCategories();
  const {
    templates,
    isLoading: isTemplatesLoading,
    upsertTemplate,
    deleteTemplate,
    saveMonthBudgetsAsTemplates,
    isUpserting: isTemplateUpserting,
    isDeleting: isTemplateDeleting,
    isSavingMonthAsTemplates,
  } = useBudgetTemplates();

  const [templateCategoryName, setTemplateCategoryName] = useState('');
  const [templateAmount, setTemplateAmount] = useState('');
  const [isBudgetEditorOpen, setIsBudgetEditorOpen] = useState(false);
  const [budgetEditorMode, setBudgetEditorMode] = useState<'add' | 'edit'>('add');
  const [budgetEditorInitialValue, setBudgetEditorInitialValue] = useState<BudgetEditorInitialValue | null>(null);
  const [confirmDeleteBudget, setConfirmDeleteBudget] = useState<null | { id: string; name: string }>(null);
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState<null | { id: string; name: string }>(null);
  const [applyTemplatePreview, setApplyTemplatePreview] = useState<BudgetTemplate | null>(null);

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

  const isLoading = isBudgetsLoading || isTransactionsLoading || isCategoriesLoading;

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

  const requestDeleteBudget = (payload: { id: string; name: string }) => {
    setConfirmDeleteBudget(payload);
  };

  const requestDeleteTemplate = (payload: { id: string; name: string }) => {
    setConfirmDeleteTemplate(payload);
  };

  const existingBudgetByCategory = useMemo(() => {
    return new Map((budgets ?? []).map((b) => [b.category_name.trim(), b]));
  }, [budgets]);

  const applyPreviewAdds = useMemo(() => {
    if (!applyTemplatePreview) return [];
    const key = String(applyTemplatePreview.category_name ?? '').trim();
    if (!key) return [];
    const existing = existingBudgetByCategory.get(key);
    if (existing) return [];
    return [
      {
        category_id: applyTemplatePreview.category_id ?? null,
        category_name: key,
        amount: Number(applyTemplatePreview.amount),
      },
    ];
  }, [applyTemplatePreview, existingBudgetByCategory]);

  const applyPreviewOverwrites = useMemo(() => {
    if (!applyTemplatePreview) return [];
    const key = String(applyTemplatePreview.category_name ?? '').trim();
    if (!key) return [];
    const existing = existingBudgetByCategory.get(key);
    if (!existing) return [];
    return [
      {
        category_id: applyTemplatePreview.category_id ?? null,
        category_name: key,
        amount: Number(applyTemplatePreview.amount),
        existingAmount: Number(existing.amount),
      },
    ];
  }, [applyTemplatePreview, existingBudgetByCategory]);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <Page className="mx-auto max-w-6xl">
      <PageHeader>
        <div>
          <PageTitle>预算管理</PageTitle>
          <PageDescription>聚焦当月预算配置；复盘与模板分区管理，避免同屏混杂。</PageDescription>
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
          {tab === 'config' ? (
            <Button variant="secondary" disabled={isEnsuring} onClick={() => ensureMonthBudgets()}>
              {isEnsuring ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              补齐本月
            </Button>
          ) : null}
        </PageActions>
      </PageHeader>

      <PageBody>
        <PageSection>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full gap-2 sm:w-auto">
              <Button className="flex-1 sm:flex-none" size="sm" variant={tab === 'config' ? 'primary' : 'secondary'} onClick={() => setTab('config')}>配置</Button>
              <Button className="flex-1 sm:flex-none" size="sm" variant={tab === 'review' ? 'primary' : 'secondary'} onClick={() => setTab('review')}>复盘</Button>
              <Button className="flex-1 sm:flex-none" size="sm" variant={tab === 'templates' ? 'primary' : 'secondary'} onClick={() => setTab('templates')}>模板</Button>
            </div>
            {tab === 'review' ? (
              <Button size="sm" variant="secondary" onClick={() => setTab('config')}>去配置本月</Button>
            ) : null}
          </div>
        </PageSection>

        {tab === 'config' ? (
          <>
            <PageSection>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <MetricCard label="本月预算（已配置合计）" value={formatMoney(metrics.totalBudget)} />
                <MetricCard label="本月已花费（全部支出）" value={formatMoney(metrics.spentAll)} />
                <MetricCard tone={metrics.unbudgetedSpent > 0 ? 'warning' : 'success'} label="本月未预算支出" value={formatMoney(metrics.unbudgetedSpent)} hint="口径：未预算分类" />
              </div>

              <div className="mt-4 space-y-3">
                <Alert variant={metrics.unbudgetedSpent > 0 ? 'warning' : 'success'}>
                  {metrics.unbudgetedSpent > 0 ? (
                    <span>未预算支出合计 {formatMoney(metrics.unbudgetedSpent)}。优先把支出最多的分类纳入预算。</span>
                  ) : (
                    <span>支出覆盖良好：你的支出大多已纳入预算。下一步关注是否有分类超支。</span>
                  )}
                </Alert>
                {topUnbudgeted.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {topUnbudgeted.map(([name, amount]) => (
                      <Button
                        key={name}
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const avg = avgMonthlySpentByCategory.get(name) ?? 0;
                          const suggested = avg > 0 ? Math.round(avg * 1.1 * 100) / 100 : 0;
                          openAddBudget({ category_name: name, amount: suggested || amount });
                        }}
                      >
                        {name} {formatMoney(amount)}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            </PageSection>

            <PageSection>
              <Card className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>本月预算</CardTitle>
                      <CardDescription>先补齐缺口，再逐步调整超支分类的预算上限。</CardDescription>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => openAddBudget(null)}>
                      <Plus className="h-4 w-4" />
                      新增预算
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  {(budgets?.length ?? 0) === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">暂无预算配置。建议先点“补齐本月”，或手动新增预算。</div>
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
                                  variant="ghost"
                                  size="sm"
                                  className="h-9 w-9 p-0"
                                  onClick={() => {
                                    openEditBudget(b);
                                  }}
                                  aria-label="编辑"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-9 w-9 p-0"
                                  disabled={isDeleting}
                                  onClick={() => {
                                    requestDeleteBudget({ id: b.id, name: b.category_name });
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
            </PageSection>
          </>
        ) : null}

        {tab === 'review' ? (
          <PageSection>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-medium text-foreground">{summaryLabel}汇总</div>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button className="flex-1 sm:flex-none" size="sm" variant={summaryMode === 'month' ? 'primary' : 'secondary'} onClick={() => setSummaryMode('month')}>月度</Button>
                <Button className="flex-1 sm:flex-none" size="sm" variant={summaryMode === 'quarter' ? 'primary' : 'secondary'} onClick={() => setSummaryMode('quarter')}>季度</Button>
                <Button className="flex-1 sm:flex-none" size="sm" variant={summaryMode === 'year' ? 'primary' : 'secondary'} onClick={() => setSummaryMode('year')}>年度</Button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="预算（已配置合计）" value={formatMoney(summaryMetrics.totalBudget)} />
              <MetricCard label="已花费（全部支出）" value={formatMoney(summaryMetrics.spentAll)} />
              <MetricCard tone={summaryMetrics.unbudgetedSpent > 0 ? 'warning' : 'success'} label="未预算支出" value={formatMoney(summaryMetrics.unbudgetedSpent)} hint="口径：未预算分类" />
              <MetricCard
                tone={summaryMetrics.coverageRatio >= 0.8 ? 'success' : summaryMetrics.coverageRatio >= 0.5 ? 'warning' : 'danger'}
                label="预算覆盖率"
                value={formatPercent(summaryMetrics.coverageRatio * 100, 0)}
                hint="口径：预算支出/全部"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={summaryMetrics.executionRatio >= 1 ? 'danger' : summaryMetrics.executionRatio >= 0.8 ? 'warning' : 'success'}>
                执行率 {formatPercent(summaryMetrics.executionRatio * 100, 0)}
              </Badge>
              {summaryMode === 'month' ? <span>口径：预算支出 / 预算合计。</span> : <span>口径：时间范围内预算支出 / 预算合计。</span>}
              {(isQuarterBudgetsLoading || isYearBudgetsLoading) && summaryMode !== 'month' ? <span>（预算汇总加载中…）</span> : null}
            </div>
          </PageSection>
        ) : null}

        {tab === 'templates' ? (
          <PageSection>
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>常用预算模板</CardTitle>
                    <CardDescription>管理固定预算；应用模板时先预览确认，默认仅新增缺失分类。</CardDescription>
                  </div>
                  <Badge variant="default" className="whitespace-nowrap">{(templates?.length ?? 0)} 条</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <div className="text-sm text-muted-foreground">应用到：{monthLabel}</div>

                <Button
                  className="w-full"
                  variant="secondary"
                  disabled={isSavingMonthAsTemplates}
                  onClick={() => saveMonthBudgetsAsTemplates({ budgets: (budgets ?? []).map((b) => ({ category_id: b.category_id ?? null, category_name: b.category_name, amount: Number(b.amount) })) })}
                >
                  {isSavingMonthAsTemplates ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  本月保存为模板
                </Button>

                <form
                  className="grid grid-cols-1 gap-3 md:grid-cols-6"
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
                  <div className="space-y-1.5 md:col-span-4">
                    <label className="text-sm font-medium">分类</label>
                    <Input value={templateCategoryName} onChange={(e) => setTemplateCategoryName(e.target.value)} placeholder="例如：房租、学费" list="budget-category-options" />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-medium">每月金额</label>
                    <Input value={templateAmount} onChange={(e) => setTemplateAmount(e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="md:col-span-6">
                    <Button type="submit" className="w-full" disabled={!templateCategoryName.trim() || !templateAmount.trim() || isTemplateUpserting}>
                      {isTemplateUpserting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      保存模板
                    </Button>
                  </div>
                </form>
                <datalist id="budget-category-options">{budgetCategoryOptions.map((c) => <option key={c.id} value={c.name} />)}</datalist>

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
                              onClick={() => {
                                setApplyTemplatePreview(t);
                              }}
                            >
                              用到{monthLabel}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full sm:w-auto"
                              disabled={isTemplateDeleting}
                              onClick={() => {
                                requestDeleteTemplate({ id: t.id, name: t.category_name });
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
              </CardContent>
            </Card>
          </PageSection>
        ) : null}
      </PageBody>

      <ApplyTemplatesPreviewModal
        open={!!applyTemplatePreview}
        monthLabel={monthLabel}
        adds={applyPreviewAdds}
        overwrites={applyPreviewOverwrites}
        defaultOverwrite={false}
        isSubmitting={isApplyingTemplates}
        onClose={() => setApplyTemplatePreview(null)}
        onConfirm={async (overwrite) => {
          if (!applyTemplatePreview) return;
          try {
            await applyTemplatesToMonthAsync({
              templates: [
                {
                  category_id: applyTemplatePreview.category_id ?? null,
                  category_name: String(applyTemplatePreview.category_name ?? '').trim(),
                  amount: Number(applyTemplatePreview.amount),
                },
              ],
              overwrite,
            });
            setApplyTemplatePreview(null);
          } catch {
            return;
          }
        }}
      />

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
        onRequestDelete={
          budgetEditorMode === 'edit'
            ? (id) => {
                const name = budgetEditorInitialValue?.category_name?.trim() || '该分类';
                closeBudgetEditor();
                requestDeleteBudget({ id, name });
              }
            : undefined
        }
      />

      {confirmDeleteBudget && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center" onClick={() => setConfirmDeleteBudget(null)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>确认删除</CardTitle>
                <CardDescription>将删除「{confirmDeleteBudget.name}」的本月预算配置。</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setConfirmDeleteBudget(null)} disabled={isDeleting}>
                  取消
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  className="w-full sm:w-auto"
                  disabled={isDeleting}
                  onClick={async () => {
                    try {
                      await deleteBudgetAsync(confirmDeleteBudget.id);
                      setConfirmDeleteBudget(null);
                    } catch {
                      return;
                    }
                  }}
                >
                  {isDeleting ? '删除中…' : '删除'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>,
        document.body,
      )}

      {confirmDeleteTemplate && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center" onClick={() => setConfirmDeleteTemplate(null)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>确认删除</CardTitle>
                <CardDescription>将删除模板「{confirmDeleteTemplate.name}」。</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setConfirmDeleteTemplate(null)} disabled={isTemplateDeleting}>
                  取消
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  className="w-full sm:w-auto"
                  disabled={isTemplateDeleting}
                  onClick={() => {
                    deleteTemplate(confirmDeleteTemplate.id);
                    setConfirmDeleteTemplate(null);
                  }}
                >
                  {isTemplateDeleting ? '删除中…' : '删除'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>,
        document.body,
      )}
    </Page>
  );
}
