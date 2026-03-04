import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { AllocationRule, Category, FundAccount, RecurringTransaction, Transaction } from '@/types';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Calendar, DollarSign, Loader2, Plus, TrendingDown, TrendingUp, X, Receipt, PiggyBank, Repeat } from 'lucide-react';
import { formatMoney, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';

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

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [visibility, setVisibility] = useState<'family' | 'private'>('family');
  const [recurringActive, setRecurringActive] = useState(false);
  const [recurringCadence, setRecurringCadence] = useState<'weekly' | 'monthly'>('monthly');
  const pendingRecurringRef = useRef<null | Omit<RecurringTransaction, 'id' | 'created_at' | 'updated_at'>>(null);
  const [allocationPrompt, setAllocationPrompt] = useState<null | { transaction: Transaction; items: Array<{ fund: FundAccount; percentage: number; amount: number; ruleId: string }>; leftover: number }>(null);
  const [isApplyingAllocation, setIsApplyingAllocation] = useState(false);

  const monthStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, []);

  const { data: transactions, isLoading: isTransactionsLoading } = useQuery({
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
    onError: (err: any) => {
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
      setRecurringActive(false);
      setIsAdding(false);
      setAmount('');
      setCategory('');
      setDescription('');
      setDate(new Date().toISOString().slice(0, 10));
      pushToast({ variant: 'success', title: '已保存', message: '交易已添加。' });
      await maybeOpenAllocationPrompt(created);
    },
    onError: (err: any) => {
      pendingRecurringRef.current = null;
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  const latestTransaction = useMemo(() => {
    const all = transactions ?? [];
    if (all.length === 0) return null;
    return all[0];
  }, [transactions]);

  const frequentCategoryTemplates = useMemo(() => {
    const all = transactions ?? [];
    const byCategory = new Map<string, number>();
    all.filter((t) => (type === 'income' ? t.type === 'income' : t.type === 'expense')).forEach((t) => {
      const key = t.category.trim();
      if (!key) return;
      byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
    });
    return Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .slice(0, 8);
  }, [transactions, type]);

  const recommendedCategories = useMemo(() => {
    const q = description.trim().toLowerCase();
    const all = transactions ?? [];
    const candidates =
      q.length >= 2
        ? all.filter((t) => (t.description ?? '').toLowerCase().includes(q))
        : all.filter((t) => (type === 'income' ? t.type === 'income' : t.type === 'expense'));
    const scores = new Map<string, number>();
    candidates.forEach((t) => {
      const key = t.category.trim();
      if (!key) return;
      scores.set(key, (scores.get(key) ?? 0) + 1);
    });
    const current = category.trim();
    const picked = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .filter((name) => name !== current)
      .slice(0, 3);
    if (picked.length > 0) return picked;
    return frequentCategoryTemplates.slice(0, 3);
  }, [transactions, description, type, category, frequentCategoryTemplates]);

  const quickCategories = useMemo(() => {
    const all = categories ?? [];
    return all
      .filter((c) => c.kind === 'both' || c.kind === type)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }, [categories, type]);

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

  const closeEditor = () => {
    setIsAdding(false);
    setRecurringActive(false);
  };

  const closeAllocationPrompt = () => {
    if (isApplyingAllocation) return;
    setAllocationPrompt(null);
  };

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
  }, [allocationPrompt, isApplyingAllocation]);

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
    const items = activeRules
      .map((r) => {
        const fund = fundById.get(r.fund_account_id);
        if (!fund) return null;
        const pct = Number(r.percentage);
        const amount = roundMoney((Number(created.amount) * pct) / 100);
        if (!Number.isFinite(amount) || amount <= 0) return null;
        return { fund, percentage: pct, amount, ruleId: r.id };
      })
      .filter((x): x is { fund: FundAccount; percentage: number; amount: number; ruleId: string } => Boolean(x));

    const totalAllocated = items.reduce((acc, x) => acc + x.amount, 0);
    if (totalAllocated <= 0) return;

    setAllocationPrompt({
      transaction: created,
      items,
      leftover: roundMoney(Number(created.amount) - totalAllocated),
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

      for (const item of allocationPrompt.items) {
        const { error: insertError } = await supabase.from('fund_allocations').insert({
          family_id: familyId,
          fund_account_id: item.fund.id,
          transaction_id: allocationPrompt.transaction.id,
          amount: item.amount,
          kind: 'deposit',
          note: '存钱计划',
        });
        if (insertError) throw insertError;

        const { error: rpcError } = await supabase.rpc('update_fund_account_amount', {
          p_fund_id: item.fund.id,
          p_delta: item.amount,
        });
        if (!rpcError) continue;

        const current = Number(item.fund.current_amount) || 0;
        const { error: updateError } = await supabase
          .from('fund_accounts')
          .update({ current_amount: current + item.amount, updated_at: new Date().toISOString() })
          .eq('id', item.fund.id);
        if (updateError) throw updateError;
      }

      queryClient.invalidateQueries({ queryKey: ['fund_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['fund_allocations'] });
      pushToast({ variant: 'success', title: '已分配', message: '存钱计划已执行，基金进度已更新。' });
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

      {isAdding && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
          onClick={closeEditor}
        >
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>添加新交易</CardTitle>
                    <CardDescription>快速录入，后续可在列表里编辑与补充。</CardDescription>
                  </div>
                  <button
                    className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-accent"
                    onClick={closeEditor}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (recurringActive) {
                      const nextRun = new Date(`${date}T12:00:00`);
                      nextRun.setHours(0, 0, 0, 0);
                      pendingRecurringRef.current = {
                        family_id: profile.family_id!,
                        owner_user_id: profile.id,
                        visibility,
                        amount: parseFloat(amount),
                        category: category.trim(),
                        description: description.trim() ? description.trim() : null,
                        type,
                        cadence: recurringCadence,
                        next_run_date: nextRun.toISOString().slice(0, 10),
                        active: true,
                      };
                    } else {
                      pendingRecurringRef.current = null;
                    }
                    addTransactionMutation.mutate({
                      visibility,
                      amount: parseFloat(amount),
                      category: category.trim(),
                      description: description.trim() ? description.trim() : null,
                      type,
                      date: new Date(`${date}T12:00:00`).toISOString(),
                      owner_user_id: profile.id,
                    } as any);
                  }}
                  className="space-y-4"
                >
                  {latestTransaction ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2">
                      <div className="text-xs text-muted-foreground">
                        最近一笔：{formatMoney(latestTransaction.type === 'income' ? latestTransaction.amount : -latestTransaction.amount, { signDisplay: 'always' })} · {latestTransaction.category}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setAmount(String(latestTransaction.amount));
                          setCategory(latestTransaction.category);
                          setDescription(latestTransaction.description ?? '');
                          setType(latestTransaction.type === 'income' ? 'income' : 'expense');
                          setVisibility(latestTransaction.visibility ?? 'family');
                        }}
                      >
                        重复上一笔
                      </Button>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">类型</label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" variant={type === 'expense' ? 'danger' : 'secondary'} onClick={() => setType('expense')}>
                          支出
                        </Button>
                        <Button type="button" variant={type === 'income' ? 'primary' : 'secondary'} onClick={() => setType('income')}>
                          收入
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">可见范围</label>
                      <select
                        value={visibility}
                        onChange={(e) => setVisibility(e.target.value as any)}
                        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                      >
                        <option value="family">家庭可见</option>
                        <option value="private">仅自己</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">日期</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="pl-9" />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">金额</label>
                      <Input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-sm font-medium text-foreground">分类</label>
                      {recommendedCategories.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <div className="text-xs text-muted-foreground">推荐</div>
                          {recommendedCategories.map((name) => (
                            <button
                              key={name}
                              type="button"
                              className={cn(
                                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                name === category
                                  ? 'border-primary/30 bg-primary/10 text-foreground'
                                  : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
                              )}
                              onClick={() => setCategory(name)}
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      )}
                      <Input
                        type="text"
                        required
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        placeholder="例如：餐饮、交通"
                        list="category-options"
                      />
                      <datalist id="category-options">
                        {(categories ?? []).map((c) => (
                          <option key={c.id} value={c.name} />
                        ))}
                      </datalist>
                      {quickCategories.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {quickCategories.slice(0, 8).map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className={cn(
                                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                c.name === category
                                  ? 'border-primary/30 bg-primary/10 text-foreground'
                                  : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
                              )}
                              onClick={() => setCategory(c.name)}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-sm font-medium text-foreground">描述（选填）</label>
                      <Input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="备注信息" />
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-sm font-medium text-foreground">固定支出/订阅（可选）</label>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={recurringActive}
                            onChange={(e) => setRecurringActive(e.target.checked)}
                          />
                          设为固定支出/订阅
                        </label>
                        {recurringActive && (
                          <>
                            <select
                              value={recurringCadence}
                              onChange={(e) => setRecurringCadence(e.target.value as any)}
                              className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                            >
                              <option value="monthly">每月</option>
                              <option value="weekly">每周</option>
                            </select>
                            <div className="text-xs text-muted-foreground">保存后在"下次到期"当天提示确认生成交易。</div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={closeEditor}>
                      取消
                    </Button>
                    <Button type="submit" disabled={addTransactionMutation.isPending}>
                      {addTransactionMutation.isPending ? '保存中…' : '保存'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

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
                        本次收入 {formatMoney(allocationPrompt.transaction.amount)}，将按规则分配到基金。
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={closeAllocationPrompt} aria-label="关闭" disabled={isApplyingAllocation}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
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
                    <div className="text-xs text-muted-foreground">剩余 {formatMoney(allocationPrompt.leftover)} 不会自动分配到基金。</div>
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
