import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { Budget, Category, Transaction } from '@/types';
import { useNavigate } from 'react-router-dom';
import { Calendar, DollarSign, Loader2, Pencil, Plus, Search, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';

export default function FinanceOverview() {
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pushToast = useToastStore((s) => s.push);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);

  // Form state
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [keyword, setKeyword] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPreset, setFilterPreset] = useState<'30d' | 'thisMonth' | 'all'>('30d');

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryKind, setNewCategoryKind] = useState<'expense' | 'income' | 'both'>('expense');

  const monthStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, []);

  const monthStartKey = useMemo(() => monthStart.toISOString().slice(0, 10), [monthStart]);

  const [budgetCategoryName, setBudgetCategoryName] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');

  // Fetch Transactions
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

  const { data: categories, isLoading: isCategoriesLoading } = useQuery({
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

  // Add Transaction Mutation
  const addTransactionMutation = useMutation({
    mutationFn: async (newTransaction: Omit<Transaction, 'id' | 'created_at' | 'family_id'>) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息，请先完成家庭设置。');
      const { data, error } = await supabase
        .from('transactions')
        .insert({ ...newTransaction, family_id: profile.family_id })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setIsAdding(false);
      setAmount('');
      setCategory('');
      setDescription('');
      setDate(new Date().toISOString().slice(0, 10));
      pushToast({ variant: 'success', title: '已保存', message: '交易已添加。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (payload: { name: string; kind: Category['kind'] }) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息，请先完成家庭设置。');
      const { data, error } = await supabase
        .from('categories')
        .insert({ family_id: profile.family_id, name: payload.name, kind: payload.kind })
        .select()
        .single();
      if (error) throw error;
      return data as Category;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setNewCategoryName('');
      setNewCategoryKind('expense');
      pushToast({ variant: 'success', title: '已添加分类', message: '分类已保存。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '添加失败', message: toUserMessage(err) });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      pushToast({ variant: 'success', title: '已删除分类', message: '分类已删除。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  const upsertBudgetMutation = useMutation({
    mutationFn: async (payload: { category_name: string; amount: number }) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息，请先完成家庭设置。');
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

  const deleteBudgetMutation = useMutation({
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

  const updateTransactionMutation = useMutation({
    mutationFn: async (payload: { id: string; patch: Partial<Transaction> }) => {
      const { data, error } = await supabase
        .from('transactions')
        .update(payload.patch)
        .eq('id', payload.id)
        .select()
        .single();
      if (error) throw error;
      return data as Transaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      pushToast({ variant: 'success', title: '已更新', message: '交易已更新。' });
      setIsEditing(false);
      setEditingTransactionId(null);
      setAmount('');
      setCategory('');
      setDescription('');
      setDate(new Date().toISOString().slice(0, 10));
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '更新失败', message: toUserMessage(err) });
    },
  });

  const deleteTransactionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      pushToast({ variant: 'success', title: '已删除', message: '交易已删除。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addTransactionMutation.mutate({
      amount: parseFloat(amount),
      category,
      description,
      type,
      date: new Date(`${date}T12:00:00`).toISOString(),
    });
  };

  const filteredTransactions = useMemo(() => {
    const all = transactions ?? [];
    const now = new Date();
    const from =
      filterPreset === 'all'
        ? null
        : filterPreset === 'thisMonth'
          ? new Date(now.getFullYear(), now.getMonth(), 1)
          : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const q = keyword.trim().toLowerCase();
    const cat = filterCategory.trim().toLowerCase();

    return all.filter((t) => {
      if (from && new Date(t.date) < from) return false;
      if (filterType !== 'all' && t.type !== filterType) return false;
      if (cat && !t.category.toLowerCase().includes(cat)) return false;
      if (!q) return true;
      return (
        t.category.toLowerCase().includes(q) ||
        (t.description ? t.description.toLowerCase().includes(q) : false) ||
        String(t.amount).includes(q)
      );
    });
  }, [transactions, filterPreset, filterType, filterCategory, keyword]);

  const editingTransaction = useMemo(() => {
    if (!editingTransactionId) return null;
    return (transactions ?? []).find((t) => t.id === editingTransactionId) ?? null;
  }, [transactions, editingTransactionId]);

  const openAdd = () => {
    setIsEditing(false);
    setEditingTransactionId(null);
    setAmount('');
    setCategory('');
    setDescription('');
    setType('expense');
    setDate(new Date().toISOString().slice(0, 10));
    setIsAdding(true);
  };

  const openEdit = (t: Transaction) => {
    setIsAdding(false);
    setIsEditing(true);
    setEditingTransactionId(t.id);
    setAmount(String(t.amount));
    setCategory(t.category);
    setDescription(t.description ?? '');
    setType(t.type === 'income' ? 'income' : 'expense');
    setDate(new Date(t.date).toISOString().slice(0, 10));
  };

  const closeEditor = () => {
    setIsAdding(false);
    setIsEditing(false);
    setEditingTransactionId(null);
  };

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
        <Card className="w-full max-w-md bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <CardHeader>
            <CardTitle>需要先完成家庭设置</CardTitle>
            <CardDescription>创建或加入家庭后，才能开始记录交易。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full" onClick={() => navigate('/family/setup')}>
              前往家庭设置
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const monthIncome =
    (transactions ?? [])
      .filter((t) => t.type === 'income' && new Date(t.date) >= monthStart)
      .reduce((acc, curr) => acc + curr.amount, 0) || 0;

  const monthExpense =
    (transactions ?? [])
      .filter((t) => t.type === 'expense' && new Date(t.date) >= monthStart)
      .reduce((acc, curr) => acc + curr.amount, 0) || 0;

  const balance = monthIncome - monthExpense;

  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    (transactions ?? [])
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

  return (
    <Page>
      <PageHeader>
        <div className="space-y-1">
          <PageTitle>财务中心</PageTitle>
          <PageDescription>清晰记录每一笔，持续改善家庭现金流。</PageDescription>
        </div>
        <PageActions>
          <Button onClick={() => (isAdding || isEditing ? closeEditor() : openAdd())}>
            <Plus className="h-4 w-4" />
            记一笔
          </Button>
        </PageActions>
      </PageHeader>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">总余额</CardTitle>
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-semibold tracking-tight">¥{balance.toFixed(2)}</div>
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
            <div className="text-2xl font-semibold tracking-tight text-emerald-600">+¥{monthIncome.toFixed(2)}</div>
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
            <div className="text-2xl font-semibold tracking-tight text-rose-600">-¥{monthExpense.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {(isAdding || isEditing) && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
          onClick={closeEditor}
        >
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <Card className="bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>{isEditing ? '编辑交易' : '添加新交易'}</CardTitle>
                    <CardDescription>{isEditing ? '更新交易信息并保存。' : '快速录入，后续可在列表里编辑与补充。'}</CardDescription>
                  </div>
                  <button
                    className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-accent"
                    onClick={closeEditor}
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const payload = {
                      amount: parseFloat(amount),
                      category: category.trim(),
                      description: description.trim() ? description.trim() : null,
                      type,
                      date: new Date(`${date}T12:00:00`).toISOString(),
                    };

                    if (isEditing && editingTransaction) {
                      updateTransactionMutation.mutate({ id: editingTransaction.id, patch: payload });
                      return;
                    }
                    addTransactionMutation.mutate(payload as any);
                  }}
                  className="space-y-4"
                >
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

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">分类</label>
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
                      {isCategoriesLoading ? (
                        <div className="text-xs text-muted-foreground">分类加载中…</div>
                      ) : quickCategories.length === 0 ? (
                        <div className="text-xs text-muted-foreground">还没有可用分类，可在下方新增。</div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {quickCategories.slice(0, 12).map((c) => (
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
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={closeEditor}>
                      取消
                    </Button>
                    <Button type="submit" disabled={addTransactionMutation.isPending || updateTransactionMutation.isPending}>
                      {addTransactionMutation.isPending || updateTransactionMutation.isPending ? '保存中…' : '保存'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>筛选</CardTitle>
          <CardDescription>按时间、类型、分类与关键词快速定位。</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium text-foreground">关键词</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="金额、分类、备注…" className="pl-9" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">时间</label>
              <select
                value={filterPreset}
                onChange={(e) => setFilterPreset(e.target.value as any)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <option value="30d">近 30 天</option>
                <option value="thisMonth">本月</option>
                <option value="all">全部</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">类型</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <option value="all">全部</option>
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium text-foreground">分类包含</label>
              <Input
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                placeholder="例如：餐饮"
                list="filter-category-options"
              />
              <datalist id="filter-category-options">
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>

            <div className="flex items-end md:col-span-2">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setKeyword('');
                  setFilterType('all');
                  setFilterCategory('');
                  setFilterPreset('30d');
                }}
              >
                重置筛选
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
              upsertBudgetMutation.mutate({ category_name: name, amount: amountNumber });
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
              <Button
                type="submit"
                className="w-full"
                disabled={!budgetCategoryName.trim() || !budgetAmount.trim() || upsertBudgetMutation.isPending}
              >
                {upsertBudgetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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
                          disabled={deleteBudgetMutation.isPending}
                          onClick={() => {
                            const ok = window.confirm(`确认删除「${b.category_name}」本月预算吗？`);
                            if (!ok) return;
                            deleteBudgetMutation.mutate(b.id);
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

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>分类管理</CardTitle>
          <CardDescription>统一管理家庭分类，交易录入可快捷选择。</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <form
            className="grid grid-cols-1 gap-3 md:grid-cols-5"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newCategoryName.trim();
              if (!name) return;
              createCategoryMutation.mutate({ name, kind: newCategoryKind });
            }}
          >
            <div className="space-y-1.5 md:col-span-3">
              <label className="text-sm font-medium text-foreground">分类名称</label>
              <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="例如：餐饮、交通、房租" />
            </div>

            <div className="space-y-1.5 md:col-span-1">
              <label className="text-sm font-medium text-foreground">适用类型</label>
              <select
                value={newCategoryKind}
                onChange={(e) => setNewCategoryKind(e.target.value as any)}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <option value="expense">支出</option>
                <option value="income">收入</option>
                <option value="both">通用</option>
              </select>
            </div>

            <div className="flex items-end md:col-span-1">
              <Button
                type="submit"
                className="w-full"
                disabled={!newCategoryName.trim() || createCategoryMutation.isPending}
              >
                {createCategoryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                添加
              </Button>
            </div>
          </form>

          {isCategoriesLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
          ) : (categories?.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">暂无分类，先添加一个常用分类吧。</div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {categories?.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant={c.kind === 'income' ? 'success' : c.kind === 'expense' ? 'danger' : 'default'}>
                        {c.kind === 'income' ? '收入' : c.kind === 'expense' ? '支出' : '通用'}
                      </Badge>
                      <div className="text-xs text-muted-foreground">用于快捷选择与筛选建议</div>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deleteCategoryMutation.isPending}
                    onClick={() => {
                      const ok = window.confirm(`确认删除分类「${c.name}」吗？不会删除历史交易记录。`);
                      if (!ok) return;
                      deleteCategoryMutation.mutate(c.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    删除
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction List */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>最近交易</CardTitle>
          <CardDescription>当前显示 {filteredTransactions.length} 条记录。</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {isTransactionsLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>
          ) : filteredTransactions.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">暂无交易记录</div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {filteredTransactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-accent/40">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={cn(
                        'grid h-9 w-9 place-items-center rounded-xl',
                        transaction.type === 'income' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
                      )}
                    >
                      {transaction.type === 'income' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{transaction.category}</div>
                      <div className="truncate text-xs text-muted-foreground">{format(new Date(transaction.date), 'PPP', { locale: zhCN })}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div
                        className={cn(
                          'text-sm font-semibold',
                          transaction.type === 'income' ? 'text-emerald-600' : 'text-foreground',
                        )}
                      >
                        {transaction.type === 'income' ? '+' : '-'}¥{transaction.amount.toFixed(2)}
                      </div>
                      {transaction.description ? (
                        <div className="text-xs text-muted-foreground">{transaction.description}</div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(transaction)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const ok = window.confirm('确认删除这条交易吗？此操作不可撤销。');
                          if (!ok) return;
                          deleteTransactionMutation.mutate(transaction.id);
                        }}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
