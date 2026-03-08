import { useState, useMemo } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { Transaction } from '@/types';
import { Loader2, Pencil, Plus, Search, Trash2, TrendingDown, TrendingUp, X, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { compareByLocale, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ListRow, ListRowLeading, ListRowTrailing } from '@/components/ui/list-row';
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { Select } from '@/components/ui/select';

export default function FinanceTransactions() {
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const { transactions, isLoading: isTransactionsLoading, addTransaction, updateTransaction, deleteTransaction, isAdding, isUpdating, isDeleting } = useTransactions({ monthsBack: 6 });
  const { categories } = useCategories();

  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [visibility, setVisibility] = useState<'family' | 'private'>('family');

  const [keyword, setKeyword] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPreset, setFilterPreset] = useState<'30d' | 'thisMonth' | 'all'>('30d');

  const filteredTransactions = useMemo(() => {
    const all = transactions ?? [];
    const now = new Date();
    const from = filterPreset === 'all' ? null : filterPreset === 'thisMonth' ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const q = keyword.trim().toLowerCase();
    const cat = filterCategory.trim().toLowerCase();

    return all.filter((t) => {
      if (from && new Date(t.date) < from) return false;
      if (filterType !== 'all' && t.type !== filterType) return false;
      if (cat && !t.category.toLowerCase().includes(cat)) return false;
      if (!q) return true;
      return t.category.toLowerCase().includes(q) || (t.description ? t.description.toLowerCase().includes(q) : false) || String(t.amount).includes(q);
    });
  }, [transactions, filterPreset, filterType, filterCategory, keyword]);

  const latestTransaction = useMemo(() => (transactions ?? [])[0] ?? null, [transactions]);

  const frequentCategoryTemplates = useMemo(() => {
    const byCategory = new Map<string, number>();
    (transactions ?? []).filter((t) => (type === 'income' ? t.type === 'income' : t.type === 'expense')).forEach((t) => {
      const key = t.category.trim();
      if (!key) return;
      byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
    });
    return Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]).map(([name]) => name).slice(0, 8);
  }, [transactions, type]);

  const recommendedCategories = useMemo(() => {
    const q = description.trim().toLowerCase();
    const candidates = q.length >= 2 ? (transactions ?? []).filter((t) => (t.description ?? '').toLowerCase().includes(q)) : (transactions ?? []).filter((t) => (type === 'income' ? t.type === 'income' : t.type === 'expense'));
    const scores = new Map<string, number>();
    candidates.forEach((t) => {
      const key = t.category.trim();
      if (!key) return;
      scores.set(key, (scores.get(key) ?? 0) + 1);
    });
    const current = category.trim();
    const picked = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]).map(([name]) => name).filter((name) => name !== current).slice(0, 3);
    if (picked.length > 0) return picked;
    return frequentCategoryTemplates.slice(0, 3);
  }, [transactions, description, type, category, frequentCategoryTemplates]);

  const editingTransaction = useMemo(() => {
    if (!editingTransactionId) return null;
    return (transactions ?? []).find((t) => t.id === editingTransactionId) ?? null;
  }, [transactions, editingTransactionId]);

  const quickCategories = useMemo(() => (categories ?? []).filter((c) => c.kind === 'both' || c.kind === type).sort((a, b) => compareByLocale(a.name, b.name)), [categories, type]);

  const openAdd = () => {
    setIsEditing(false);
    setEditingTransactionId(null);
    setAmount('');
    setCategory('');
    setDescription('');
    setType('expense');
    setDate(new Date().toISOString().slice(0, 10));
    setVisibility('family');
    setIsAddingOpen(true);
  };

  const openEdit = (t: Transaction) => {
    setIsAddingOpen(false);
    setIsEditing(true);
    setEditingTransactionId(t.id);
    setAmount(String(t.amount));
    setCategory(t.category);
    setDescription(t.description ?? '');
    setType(t.type === 'income' ? 'income' : 'expense');
    setDate(new Date(t.date).toISOString().slice(0, 10));
    setVisibility(t.visibility ?? 'family');
  };

  const closeEditor = () => {
    setIsAddingOpen(false);
    setIsEditing(false);
    setEditingTransactionId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const basePayload = { visibility, amount: parseFloat(amount), category: category.trim(), description: description.trim() || null, type, date: new Date(`${date}T12:00:00`).toISOString() };
    if (isEditing && editingTransaction) {
      updateTransaction({ id: editingTransaction.id, patch: basePayload });
      setIsEditing(false);
      setEditingTransactionId(null);
      setAmount('');
      setCategory('');
      setDescription('');
      return;
    }
    addTransaction({ ...basePayload, owner_user_id: profile!.id } as any);
    setAmount('');
    setCategory('');
    setDescription('');
    setDate(new Date().toISOString().slice(0, 10));
  };

  if (isProfileLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <Page>
      <PageHeader>
        <PageTitle>交易记录</PageTitle>
        <PageDescription>查看和管理所有交易记录。</PageDescription>
        <PageActions>
          <Button onClick={() => (isAddingOpen || isEditing ? closeEditor() : openAdd())}><Plus className="h-4 w-4" />记一笔</Button>
        </PageActions>
      </PageHeader>

      <Card>
        <CardHeader className="pb-3"><CardTitle>筛选</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium">关键词</label>
              <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="金额、分类、备注…" className="pl-9" /></div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">时间</label>
              <Select value={filterPreset} onChange={(e) => setFilterPreset(e.target.value as any)}>
                <option value="30d">近 30 天</option>
                <option value="thisMonth">本月</option>
                <option value="all">全部</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">类型</label>
              <Select value={filterType} onChange={(e) => setFilterType(e.target.value as any)}>
                <option value="all">全部</option>
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium">分类</label>
              <Input value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} placeholder="例如：餐饮" list="filter-category-options" />
              <datalist id="filter-category-options">{(categories ?? []).map((c) => <option key={c.id} value={c.name} />)}</datalist>
            </div>
            <div className="flex md:items-end md:col-span-2">
              <Button variant="secondary" className="w-full" onClick={() => { setKeyword(''); setFilterType('all'); setFilterCategory(''); setFilterPreset('30d'); }}>重置筛选</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {(isAddingOpen || isEditing) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center" onClick={closeEditor}>
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div><CardTitle>{isEditing ? '编辑交易' : '添加新交易'}</CardTitle><CardDescription>快速录入</CardDescription></div>
                  <button
                    className="grid h-10 w-10 place-items-center rounded-2xl p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    onClick={closeEditor}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {isAddingOpen && latestTransaction && (
                    <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-surface-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-xs text-muted-foreground">最近：{formatMoney(latestTransaction.type === 'income' ? latestTransaction.amount : -latestTransaction.amount, { signDisplay: 'always' })} · {latestTransaction.category}</div>
                      <Button type="button" size="sm" variant="secondary" onClick={() => { setAmount(String(latestTransaction.amount)); setCategory(latestTransaction.category); setDescription(latestTransaction.description ?? ''); setType(latestTransaction.type === 'income' ? 'income' : 'expense'); setVisibility(latestTransaction.visibility ?? 'family'); }}>重复</Button>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">类型</label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" variant={type === 'expense' ? 'danger' : 'secondary'} onClick={() => setType('expense')}>支出</Button>
                        <Button type="button" variant={type === 'income' ? 'primary' : 'secondary'} onClick={() => setType('income')}>收入</Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">可见范围</label>
                      <Select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
                        <option value="family">家庭可见</option>
                        <option value="private">仅自己</option>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">日期</label>
                      <div className="relative"><Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="pl-9" /></div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">金额</label>
                      <Input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-sm font-medium">分类</label>
                      {recommendedCategories.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <div className="text-xs text-muted-foreground">推荐</div>
                          {recommendedCategories.map((name) => (
                            <button key={name} type="button" className={cn('rounded-full border px-3 py-1 text-xs font-medium', name === category ? 'border-primary/30 bg-primary/10' : 'border-border bg-card')} onClick={() => setCategory(name)}>{name}</button>
                          ))}
                        </div>
                      )}
                      <Input type="text" required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="例如：餐饮、交通" list="category-options" />
                      <datalist id="category-options">{(categories ?? []).map((c) => <option key={c.id} value={c.name} />)}</datalist>
                      {quickCategories.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {quickCategories.slice(0, 8).map((c) => (
                            <button key={c.id} type="button" className={cn('rounded-full border px-3 py-1 text-xs font-medium', c.name === category ? 'border-primary/30 bg-primary/10' : 'border-border bg-card')} onClick={() => setCategory(c.name)}>{c.name}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5 md:col-span-2"><label className="text-sm font-medium">描述（选填）</label><Input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="备注信息" /></div>
                  </div>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="secondary" onClick={closeEditor} className="w-full sm:w-auto">
                      取消
                    </Button>
                    <Button type="submit" disabled={isAdding || isUpdating} className="w-full sm:w-auto">
                      {isAdding || isUpdating ? '保存中…' : '保存'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="pb-3"><CardTitle>最近交易</CardTitle><CardDescription>当前显示 {filteredTransactions.length} 条记录。</CardDescription></CardHeader>
        <CardContent className="pt-0">
          {isTransactionsLoading ? <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div> : filteredTransactions.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">暂无交易记录</div> : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {filteredTransactions.map((transaction) => (
                <ListRow key={transaction.id}>
                  <ListRowLeading>
                    <div className={cn('grid h-9 w-9 place-items-center rounded-xl', transaction.type === 'income' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700')}>
                      {transaction.type === 'income' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2"><div className="truncate text-sm font-medium">{transaction.category}</div>{transaction.visibility === 'private' ? <Badge variant="warning">私密</Badge> : null}</div>
                      <div className="truncate text-xs text-muted-foreground">{format(new Date(transaction.date), 'PPP', { locale: zhCN })}</div>
                    </div>
                  </ListRowLeading>
                  <ListRowTrailing className="sm:justify-end">
                    <div className="sm:text-right">
                      <div className={cn('text-sm font-semibold', transaction.type === 'income' ? 'text-emerald-600' : '')}>
                        {formatMoney(transaction.type === 'income' ? transaction.amount : -transaction.amount, { signDisplay: 'always' })}
                      </div>
                      {transaction.description && <div className="text-xs text-muted-foreground">{transaction.description}</div>}
                    </div>
                    <div className="flex items-center gap-1 sm:justify-end">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(transaction)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => { if (window.confirm('确认删除？')) deleteTransaction(transaction.id); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </ListRowTrailing>
                </ListRow>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
