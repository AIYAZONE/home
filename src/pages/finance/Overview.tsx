import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { AllocationRule, Category, FundAccount, RecurringTransaction, Transaction } from '@/types';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, DollarSign, Loader2, Plus, TrendingDown, TrendingUp, X, Receipt, PiggyBank, Repeat } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney, formatPercent } from '@/lib/format';
import { isFundReachedTarget } from '@/lib/fund';
import { cn } from '@/lib/utils';
import { normalizeCategoryName } from '@/lib/category';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { MetricCard } from '@/components/ui/metric-card';
import { ListRow, ListRowLeading, ListRowTrailing } from '@/components/ui/list-row';
import { Page, PageActions, PageBody, PageDescription, PageHeader, PageSection, PageTitle } from '@/components/ui/page';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';
import { TransactionEditorModal } from '@/components/finance/TransactionEditorModal';
import { useBudgets } from '@/hooks/useBudgets';
import { computeBudgetMetrics, toMonthStartKey, topEntries } from '@/lib/budget';

const quickLinks = [
  { name: '交易记录', href: '/finance/transactions', icon: Receipt, description: '查看和管理所有交易' },
  { name: '资产统计', href: '/finance/assets', icon: BarChart3, description: '汇总资产/负债与基金余额' },
  { name: '预算管理', href: '/finance/budgets', icon: PiggyBank, description: '设置和跟踪预算' },
  { name: '固定支出', href: '/finance/recurring', icon: Repeat, description: '管理周期性支出' },
];

export default function FinanceOverview() {
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pushToast = useToastStore((s) => s.push);
  const [isAdding, setIsAdding] = useState(false);
  const [summaryMode, setSummaryMode] = useState<'month' | 'quarter' | 'year'>('month');
  const pendingRecurringRef = useRef<null | Omit<RecurringTransaction, 'id' | 'created_at' | 'updated_at'>>(null);
  const [allocationPrompt, setAllocationPrompt] = useState<null | {
    transaction: Transaction;
    items: Array<{ fund: FundAccount; percentage: number; amount: number; ruleId: string }>;
    leftover: number;
    skipped: Array<{ fund: FundAccount; reason: string }>;
  }>(null);
  const [isApplyingAllocation, setIsApplyingAllocation] = useState(false);

  const monthStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, []);

  const monthStartKey = useMemo(() => toMonthStartKey(monthStart), [monthStart]);

  const {
    budgets,
    isLoading: isBudgetsLoading,
    ensureMonthBudgets,
    isEnsuring: isEnsuringBudgets,
  } = useBudgets(monthStartKey);

  const { data: transactions } = useQuery({
    queryKey: ['transactions', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const from = new Date();
      from.setMonth(from.getMonth() - 6);
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('family_id', profile.family_id)
        .gte('date', from.toISOString())
        .order('date', { ascending: false });
      if (error) throw error;
      return data as Transaction[];
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

  const createRecurringMutation = useMutation({
    mutationFn: async (payload: Omit<RecurringTransaction, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase.from('recurring_transactions').insert(payload).select().single();
      if (error) throw error;
      return data as RecurringTransaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring_transactions'] });
      pushToast({ variant: 'success', title: '已设置固定项', message: '到期后会提示你确认生成交易。' });
    },
    onError: (err: unknown) => {
      pushToast({ variant: 'danger', title: '固定项保存失败', message: toUserMessage(err) });
    },
  });

  const addTransactionMutation = useMutation({
    mutationFn: async (newTransaction: Omit<Transaction, 'id' | 'created_at' | 'family_id'>) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');
      const { data, error } = await supabase
        .from('transactions')
        .insert({ ...newTransaction, family_id: profile.family_id })
        .select()
        .single();
      if (error) throw error;
      return data as Transaction;
    },
    onSuccess: async (created) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      if (pendingRecurringRef.current) {
        createRecurringMutation.mutate(pendingRecurringRef.current);
        pendingRecurringRef.current = null;
      }
      setIsAdding(false);
      pushToast({ variant: 'success', title: '已保存', message: '交易已添加。' });
      await maybeOpenAllocationPrompt(created);
    },
    onError: (err: unknown) => {
      pendingRecurringRef.current = null;
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  const closeEditor = useCallback(() => {
    setIsAdding(false);
    pendingRecurringRef.current = null;
  }, []);

  const closeAllocationPrompt = useCallback(() => {
    if (isApplyingAllocation) return;
    setAllocationPrompt(null);
  }, [isApplyingAllocation]);

  useEffect(() => {
    if (!allocationPrompt) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAllocationPrompt();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [allocationPrompt, closeAllocationPrompt]);

  if (isProfileLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

  if (!profile?.family_id) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>需要先完成家庭设置</CardTitle>
            <CardDescription>创建或加入家庭后，才能开始记录交易。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate('/family/setup')}>
              前往家庭设置
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const monthIncome = (transactions ?? [])
    .filter((t) => t.type === 'income' && new Date(t.date) >= monthStart)
    .reduce((acc, curr) => acc + curr.amount, 0) || 0;

  const monthExpense = (transactions ?? [])
    .filter((t) => t.type === 'expense' && new Date(t.date) >= monthStart)
    .reduce((acc, curr) => acc + curr.amount, 0) || 0;

  const balance = monthIncome - monthExpense;

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const upcomingKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }, []);

  const { data: upcomingRecurring, isLoading: isRecurringLoading } = useQuery({
    queryKey: ['recurring_upcoming', profile?.family_id, todayKey, upcomingKey],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('recurring_transactions')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('active', true)
        .gte('next_run_date', todayKey)
        .lte('next_run_date', upcomingKey)
        .order('next_run_date', { ascending: true });
      if (error) throw error;
      return data as RecurringTransaction[];
    },
    enabled: !!profile?.family_id,
  });

  const period = useMemo(() => {
    const y = monthStart.getFullYear();
    if (summaryMode === 'year') {
      const start = new Date(y, 0, 1);
      const end = new Date(y + 1, 0, 1);
      return { start, end, label: `${y}年` };
    }
    if (summaryMode === 'quarter') {
      const q0 = Math.floor(monthStart.getMonth() / 3) * 3;
      const start = new Date(y, q0, 1);
      const end = new Date(y, q0 + 3, 1);
      const q = Math.floor(monthStart.getMonth() / 3) + 1;
      return { start, end, label: `${y}年第${q}季度` };
    }
    const start = monthStart;
    const end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    return { start, end, label: `${y}年${String(monthStart.getMonth() + 1).padStart(2, '0')}月` };
  }, [monthStart, summaryMode]);

  const summaryIncome = useMemo(() => {
    return (transactions ?? [])
      .filter((t) => t.type === 'income')
      .reduce((acc, t) => {
        const d = new Date(t.date);
        if (d < period.start || d >= period.end) return acc;
        return acc + t.amount;
      }, 0);
  }, [transactions, period]);

  const summaryExpense = useMemo(() => {
    return (transactions ?? [])
      .filter((t) => t.type === 'expense')
      .reduce((acc, t) => {
        const d = new Date(t.date);
        if (d < period.start || d >= period.end) return acc;
        return acc + t.amount;
      }, 0);
  }, [transactions, period]);

  const summaryBalance = useMemo(() => summaryIncome - summaryExpense, [summaryIncome, summaryExpense]);

  const monthBudgetMetrics = useMemo(() => {
    return computeBudgetMetrics({ budgets: budgets ?? [], transactions: transactions ?? [], monthStart });
  }, [budgets, transactions, monthStart]);

  const topUnbudgeted = useMemo(() => topEntries(monthBudgetMetrics.unbudgetedByCategory, 3), [monthBudgetMetrics.unbudgetedByCategory]);

  const recentTransactions = useMemo(() => (transactions ?? []).slice(0, 8), [transactions]);

  const trendMonths = useMemo(() => {
    const base = new Date();
    base.setDate(1);
    return Array.from({ length: 6 }).map((_, i) => new Date(base.getFullYear(), base.getMonth() - (5 - i), 1));
  }, []);

  const trendData = useMemo(() => {
    const index = new Map<string, { month: string; income: number; expense: number }>();
    for (const m of trendMonths) {
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      index.set(key, { month: `${m.getMonth() + 1}月`, income: 0, expense: 0 });
    }
    for (const t of transactions ?? []) {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = index.get(key);
      if (!bucket) continue;
      if (t.type === 'income') bucket.income += Number(t.amount);
      if (t.type === 'expense') bucket.expense += Number(t.amount);
    }
    return Array.from(index.values());
  }, [transactions, trendMonths]);

  const hasTransactions = (transactions?.length ?? 0) > 0;

  const maybeOpenAllocationPrompt = async (created: Transaction) => {
    if (created.type !== 'income') return;
    const familyId = profile.family_id;

    const { data: existing } = await supabase
      .from('fund_allocations')
      .select('id')
      .eq('family_id', familyId)
      .eq('transaction_id', created.id)
      .limit(1);
    if ((existing ?? []).length > 0) return;

    const { data: rules, error: rulesError } = await supabase
      .from('allocation_rules')
      .select('*')
      .eq('family_id', familyId)
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true });
    if (rulesError) return;

    const activeRules = (rules as AllocationRule[]).filter((r) => Number(r.percentage) > 0);
    if (activeRules.length === 0) return;

    const { data: funds, error: fundsError } = await supabase
      .from('fund_accounts')
      .select('*')
      .eq('family_id', familyId)
      .eq('is_active', true)
      .order('priority', { ascending: true });
    if (fundsError) return;

    const fundById = new Map<string, FundAccount>((funds as FundAccount[]).map((f) => [f.id, f]));

    const roundMoney = (n: number) => Math.round(n * 100) / 100;
    const skipped: Array<{ fund: FundAccount; reason: string }> = [];
    const items = activeRules.reduce(
      (acc, r) => {
        const fund = fundById.get(r.fund_account_id);
        if (!fund) return acc;
        if (isFundReachedTarget(fund)) {
          skipped.push({ fund, reason: '已达标' });
          return acc;
        }
        const pct = Number(r.percentage);
        const amount = roundMoney((Number(created.amount) * pct) / 100);
        if (!Number.isFinite(amount) || amount <= 0) return acc;
        acc.push({ fund, percentage: pct, amount, ruleId: r.id });
        return acc;
      },
      [] as Array<{ fund: FundAccount; percentage: number; amount: number; ruleId: string }>,
    );

    const totalAllocated = items.reduce((acc, x) => acc + x.amount, 0);
    if (totalAllocated <= 0 && skipped.length === 0) return;

    setAllocationPrompt({
      transaction: created,
      items,
      leftover: roundMoney(Number(created.amount) - totalAllocated),
      skipped,
    });
  };

  const applyAllocation = async () => {
    if (!allocationPrompt) return;
    const familyId = profile.family_id;

    setIsApplyingAllocation(true);
    try {
      const { data: existing } = await supabase
        .from('fund_allocations')
        .select('id')
        .eq('family_id', familyId)
        .eq('transaction_id', allocationPrompt.transaction.id)
        .limit(1);
      if ((existing ?? []).length > 0) {
        pushToast({ variant: 'warning', title: '已分配过', message: '这笔收入已经执行过存钱计划。' });
        setAllocationPrompt(null);
        return;
      }

      const fundIds = allocationPrompt.items.map((x) => x.fund.id);
      const latestFundById = new Map<string, FundAccount>();
      if (fundIds.length > 0) {
        const { data: latestFunds } = await supabase
          .from('fund_accounts')
          .select('*')
          .eq('family_id', familyId)
          .in('id', fundIds);
        for (const f of (latestFunds as FundAccount[] | null) ?? []) latestFundById.set(f.id, f);
      }

      let appliedCount = 0;
      let skippedCount = 0;
      for (const item of allocationPrompt.items) {
        const latestFund = latestFundById.get(item.fund.id) ?? item.fund;
        if (isFundReachedTarget(latestFund)) {
          skippedCount += 1;
          continue;
        }
        const { error: insertError } = await supabase.from('fund_allocations').insert({
          family_id: familyId,
          fund_account_id: latestFund.id,
          transaction_id: allocationPrompt.transaction.id,
          amount: item.amount,
          kind: 'deposit',
          note: '存钱计划',
        });
        if (insertError) throw insertError;
        appliedCount += 1;

        const { error: rpcError } = await supabase.rpc('update_fund_account_amount', {
          p_fund_id: latestFund.id,
          p_delta: item.amount,
        });
        if (!rpcError) continue;

        const current = Number(latestFund.current_amount) || 0;
        const { error: updateError } = await supabase
          .from('fund_accounts')
          .update({ current_amount: current + item.amount, updated_at: new Date().toISOString() })
          .eq('id', latestFund.id);
        if (updateError) throw updateError;
      }

      if (appliedCount <= 0) {
        pushToast({ variant: 'warning', title: '未执行分配', message: '所有可分配的基金均已达标或暂不可用，本次未产生分配记录。' });
        setAllocationPrompt(null);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['fund_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['fund_allocations'] });
      pushToast({
        variant: 'success',
        title: '已分配',
        message: skippedCount > 0 ? `存钱计划已执行（已跳过 ${skippedCount} 个已达标基金）。` : '存钱计划已执行，基金进度已更新。',
      });
      setAllocationPrompt(null);
    } catch (err: unknown) {
      pushToast({ variant: 'danger', title: '分配失败', message: toUserMessage(err) });
    } finally {
      setIsApplyingAllocation(false);
    }
  };

  return (
    <Page className="mx-auto max-w-6xl">
      <PageHeader>
        <div className="space-y-1">
          <PageTitle>财务中心 · 概览</PageTitle>
          <PageDescription>一眼看懂状态，快速执行下一步。</PageDescription>
        </div>
        <PageActions>
          <Button onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4" />
            记一笔
          </Button>
          <Button variant="secondary" disabled={isEnsuringBudgets} onClick={() => ensureMonthBudgets()}>
            {isEnsuringBudgets ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            补齐本月预算
          </Button>
          <Button variant="secondary" onClick={() => navigate('/finance/transactions')}>
            查看交易
          </Button>
        </PageActions>
      </PageHeader>

      <PageBody>
        {!hasTransactions ? (
          <PageSection>
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle>快速开始</CardTitle>
                <CardDescription>先记一笔，再把固定支出与常用预算存成模板。</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Button onClick={() => setIsAdding(true)}>
                    <Plus className="h-4 w-4" />
                    记第一笔
                  </Button>
                  <Button variant="secondary" onClick={() => navigate('/finance/budgets')}>
                    去配置预算
                  </Button>
                </div>
              </CardContent>
            </Card>
          </PageSection>
        ) : null}

        <PageSection>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium text-foreground">{period.label}汇总</div>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button className="flex-1 sm:flex-none" size="sm" variant={summaryMode === 'month' ? 'primary' : 'secondary'} onClick={() => setSummaryMode('month')}>月度</Button>
              <Button className="flex-1 sm:flex-none" size="sm" variant={summaryMode === 'quarter' ? 'primary' : 'secondary'} onClick={() => setSummaryMode('quarter')}>季度</Button>
              <Button className="flex-1 sm:flex-none" size="sm" variant={summaryMode === 'year' ? 'primary' : 'secondary'} onClick={() => setSummaryMode('year')}>年度</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="收入"
              value={<span className="text-emerald-600">{formatMoney(summaryIncome, { signDisplay: 'always' })}</span>}
              right={<TrendingUp className="h-5 w-5 text-emerald-600" />}
            />
            <MetricCard
              label="支出"
              value={<span className="text-rose-600">{formatMoney(-summaryExpense, { signDisplay: 'always' })}</span>}
              right={<TrendingDown className="h-5 w-5 text-rose-600" />}
            />
            <MetricCard label="结余" value={formatMoney(summaryBalance)} right={<DollarSign className="h-5 w-5 text-primary" />} />
            <MetricCard
              tone={(budgets?.length ?? 0) > 0 ? (monthBudgetMetrics.executionRatio >= 1 ? 'danger' : monthBudgetMetrics.executionRatio >= 0.8 ? 'warning' : 'success') : 'default'}
              label="预算健康（本月）"
              value={
                isBudgetsLoading
                  ? '—'
                  : (budgets?.length ?? 0) === 0
                    ? '未配置'
                    : `${formatPercent(monthBudgetMetrics.executionRatio * 100, 0)}`
              }
              hint={
                isBudgetsLoading
                  ? null
                  : (budgets?.length ?? 0) === 0
                    ? '建议先从常用支出开始'
                    : `未预算支出 ${formatMoney(monthBudgetMetrics.unbudgetedSpent)}`
              }
              right={<PiggyBank className="h-5 w-5 text-primary" />}
            />
          </div>
        </PageSection>

        <PageSection>
          <CollapsibleCard
            defaultOpen={false}
            title="快捷入口"
            description="低频入口默认收起，需要时展开。"
            badge={<span className="text-xs text-muted-foreground">{quickLinks.length} 项</span>}
          >
            <div className="pt-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {quickLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link key={link.href} to={link.href}>
                      <Card className="h-full transition-all hover:shadow-md hover:border-primary/30">
                        <CardContent className="flex flex-col items-center justify-center p-4 text-center">
                          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="text-sm font-medium">{link.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{link.description}</div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          </CollapsibleCard>
        </PageSection>

        <PageSection>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>预算健康</CardTitle>
                    <CardDescription>先解决未预算支出，再关注超支分类。</CardDescription>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => navigate('/finance/budgets')}>
                    去预算管理
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {(budgets?.length ?? 0) === 0 ? (
                  <div className="rounded-xl border border-border/60 bg-surface-2 px-3 py-3 text-sm text-muted-foreground">
                    本月还没有配置预算。建议从“房租/餐饮/交通”等固定支出开始，并保存为模板，后续月份自动补齐。
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border/60 bg-surface-2 px-3 py-3">
                      <div className="text-xs text-muted-foreground">执行率（本月）</div>
                      <div className="mt-2 text-lg font-semibold">{formatPercent(monthBudgetMetrics.executionRatio * 100, 0)}</div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-surface-2 px-3 py-3">
                      <div className="text-xs text-muted-foreground">未预算支出</div>
                      <div className="mt-2 text-lg font-semibold">{formatMoney(monthBudgetMetrics.unbudgetedSpent)}</div>
                    </div>
                  </div>
                )}

                {topUnbudgeted.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">支出较多的未预算分类：</div>
                    <div className="flex flex-wrap gap-2">
                      {topUnbudgeted.map(([name, amount]) => (
                        <Button key={name} size="sm" variant="secondary" onClick={() => navigate('/finance/budgets')}>
                          {name} {formatMoney(amount)}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>固定项提醒</CardTitle>
                    <CardDescription>未来 7 天到期的固定支出与收入。</CardDescription>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => navigate('/finance/recurring')}>
                    去固定支出
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {isRecurringLoading ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">加载中…</div>
                ) : (upcomingRecurring?.length ?? 0) === 0 ? (
                  <div className="rounded-xl border border-border/60 bg-surface-2 px-3 py-3 text-sm text-muted-foreground">
                    未来 7 天没有到期固定项。可以从交易记录里把常见账单设为固定项。
                  </div>
                ) : (
                  <div className="divide-y divide-border rounded-xl border border-border">
                    {upcomingRecurring?.slice(0, 4).map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{r.category}</div>
                          <div className="text-xs text-muted-foreground">到期日 {r.next_run_date}</div>
                        </div>
                        <div className="shrink-0 text-sm font-semibold">
                          {formatMoney(r.type === 'income' ? r.amount : -r.amount, { signDisplay: 'always' })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {(upcomingRecurring?.length ?? 0) > 4 ? (
                  <div className="text-xs text-muted-foreground">还有 {Math.max(0, (upcomingRecurring?.length ?? 0) - 4)} 个到期项…</div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </PageSection>

        <PageSection>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="overflow-hidden lg:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>趋势</CardTitle>
                    <CardDescription>近 6 个月收入与支出趋势。</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="h-56 rounded-xl border border-border bg-card">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid hsl(var(--border))',
                          background: 'hsl(var(--card))',
                        }}
                        formatter={(v: any, name: any) => [formatMoney(v), name === 'income' ? '收入' : '支出']}
                      />
                      <Legend formatter={(value: any) => (value === 'income' ? '收入' : '支出')} />
                      <Line type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="expense" stroke="#EF4444" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>最近交易</CardTitle>
                    <CardDescription>最近 {recentTransactions.length} 笔记录。</CardDescription>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => navigate('/finance/transactions')}>
                    查看全部
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {recentTransactions.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">暂无交易记录</div>
                ) : (
                  <div className="divide-y divide-border rounded-xl border border-border">
                    {recentTransactions.slice(0, 6).map((t) => (
                      <ListRow key={t.id}>
                        <ListRowLeading>
                          <div
                            className={cn(
                              'grid h-9 w-9 place-items-center rounded-xl',
                              t.type === 'income'
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
                            )}
                          >
                            {t.type === 'income' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{t.category}</div>
                            <div className="truncate text-xs text-muted-foreground">{new Date(t.date).toISOString().slice(0, 10)}</div>
                          </div>
                        </ListRowLeading>
                        <ListRowTrailing className="sm:justify-end">
                          <div className="text-sm font-semibold">
                            {formatMoney(t.type === 'income' ? t.amount : -t.amount, { signDisplay: 'always' })}
                          </div>
                        </ListRowTrailing>
                      </ListRow>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </PageSection>
      </PageBody>

      <TransactionEditorModal
        open={isAdding}
        mode="add"
        familyId={profile?.family_id}
        transactions={transactions}
        categories={categories}
        isSubmitting={addTransactionMutation.isPending}
        onClose={closeEditor}
        onSubmit={(payload, { recurring }) => {
          if (!profile?.family_id) return;
          if (recurring) {
            const categoryKey = normalizeCategoryName(payload.category);
            const category_id = (categories ?? []).find((c) => normalizeCategoryName(c.name) === categoryKey)?.id ?? null;
            pendingRecurringRef.current = {
              family_id: profile.family_id,
              owner_user_id: profile.id,
              visibility: payload.visibility,
              amount: payload.amount,
              category: categoryKey,
              category_id,
              description: payload.description,
              type: payload.type,
              cadence: recurring.cadence,
              next_run_date: recurring.next_run_date,
              active: true,
            };
          } else {
            pendingRecurringRef.current = null;
          }
          addTransactionMutation.mutate({ ...payload, owner_user_id: profile.id });
        }}
      />

      {allocationPrompt &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
            onClick={closeAllocationPrompt}
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
              <Card className="border border-border/60 bg-popover shadow-lg">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>存钱计划分配</CardTitle>
                      <CardDescription className="truncate">
                        {allocationPrompt.items.length > 0
                          ? `本次收入 ${formatMoney(allocationPrompt.transaction.amount)}，将按规则分配到基金。`
                          : `本次收入 ${formatMoney(allocationPrompt.transaction.amount)}，当前没有可分配的基金。`}
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={closeAllocationPrompt} aria-label="关闭" disabled={isApplyingAllocation}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {allocationPrompt.skipped.length > 0 ? (
                    <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                      本次已跳过 {allocationPrompt.skipped.length} 个已达标基金：
                      <span className="ml-1 text-foreground">
                        {allocationPrompt.skipped
                          .slice(0, 3)
                          .map((x) => x.fund.name)
                          .join('、')}
                        {allocationPrompt.skipped.length > 3 ? '…' : ''}
                      </span>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    {allocationPrompt.items.map((item) => (
                      <div key={item.fund.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-background/40 px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{item.fund.name}</div>
                          <div className="text-xs text-muted-foreground">{formatPercent(item.percentage, 2)}</div>
                        </div>
                        <div className="font-semibold">{formatMoney(item.amount)}</div>
                      </div>
                    ))}
                  </div>

                  {allocationPrompt.leftover > 0 ? (
                    <div className="text-xs text-muted-foreground">未分配 {formatMoney(allocationPrompt.leftover)}，不会自动分配到基金。</div>
                  ) : null}

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={closeAllocationPrompt} disabled={isApplyingAllocation}>
                      跳过
                    </Button>
                    <Button type="button" onClick={applyAllocation} disabled={isApplyingAllocation}>
                      {isApplyingAllocation ? '分配中…' : '确认分配'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>,
          document.body,
        )}
    </Page>
  );
}
