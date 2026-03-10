import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { AllocationRule, Category, FundAccount, RecurringTransaction, Transaction } from '@/types';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, DollarSign, Loader2, Plus, TrendingDown, TrendingUp, X, Receipt, PiggyBank, Repeat } from 'lucide-react';
import { formatMoney, formatPercent } from '@/lib/format';
import { isFundReachedTarget } from '@/lib/fund';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';
import { TransactionEditorModal } from '@/components/finance/TransactionEditorModal';

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
    <Page>
      <PageHeader>
        <div className="space-y-1">
          <PageTitle>财务中心</PageTitle>
          <PageDescription>清晰记录每一笔，持续改善家庭现金流。</PageDescription>
        </div>
        <PageActions>
          <Button onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4" />
            记一笔
          </Button>
        </PageActions>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">总余额</CardTitle>
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold tracking-tight">{formatMoney(balance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">本月收入</CardTitle>
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold tracking-tight text-emerald-600">{formatMoney(monthIncome, { signDisplay: 'always' })}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">本月支出</CardTitle>
              <TrendingDown className="h-5 w-5 text-rose-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold tracking-tight text-rose-600">{formatMoney(-monthExpense, { signDisplay: 'always' })}</div>
          </CardContent>
        </Card>
      </div>

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
            pendingRecurringRef.current = {
              family_id: profile.family_id,
              owner_user_id: profile.id,
              visibility: payload.visibility,
              amount: payload.amount,
              category: payload.category,
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
