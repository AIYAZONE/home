import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { Transaction } from '@/types';
import { Loader2, Pencil, Plus, Search, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ListRow, ListRowLeading, ListRowTrailing } from '@/components/ui/list-row';
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { Select } from '@/components/ui/select';
import { TransactionEditorModal } from '@/components/finance/TransactionEditorModal';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';
import { useConfirm } from '@/hooks/useConfirm';

export default function FinanceTransactions() {
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const { transactions, isLoading: isTransactionsLoading, addTransactionAsync, updateTransactionAsync, deleteTransaction, isAdding, isUpdating } = useTransactions({ monthsBack: 6 });
  const { categories } = useCategories();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const { openConfirm, dialog } = useConfirm();

  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [isSavingRecurring, setIsSavingRecurring] = useState(false);

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

  const editingTransaction = useMemo(() => {
    if (!editingTransactionId) return null;
    return (transactions ?? []).find((t) => t.id === editingTransactionId) ?? null;
  }, [transactions, editingTransactionId]);

  const openAdd = () => {
    setIsEditing(false);
    setEditingTransactionId(null);
    setIsAddingOpen(true);
  };

  const openEdit = (t: Transaction) => {
    setIsAddingOpen(false);
    setIsEditing(true);
    setEditingTransactionId(t.id);
  };

  const closeEditor = () => {
    setIsAddingOpen(false);
    setIsEditing(false);
    setEditingTransactionId(null);
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

      <TransactionEditorModal
        open={isAddingOpen || isEditing}
        mode={isEditing ? 'edit' : 'add'}
        familyId={profile?.family_id}
        transactions={transactions}
        categories={categories}
        initialValue={
          isEditing && editingTransaction
            ? {
                visibility: editingTransaction.visibility ?? 'family',
                amount: editingTransaction.amount,
                category: editingTransaction.category,
                description: editingTransaction.description,
                type: editingTransaction.type === 'income' ? 'income' : 'expense',
                date: editingTransaction.date,
              }
            : null
        }
        isSubmitting={isAdding || isUpdating || isSavingRecurring}
        onClose={closeEditor}
        onSubmit={async (payload, { recurring }) => {
          if (!profile?.id) return;
          if (isEditing && editingTransaction) {
            try {
              await updateTransactionAsync({ id: editingTransaction.id, patch: payload as any });
              closeEditor();
            } catch {
              return;
            }
            return;
          }
          try {
            await addTransactionAsync({ ...payload, owner_user_id: profile.id } as any);
            closeEditor();
          } catch {
            return;
          }
          if (!recurring || !profile.family_id) return;
          try {
            setIsSavingRecurring(true);
            const { error } = await supabase
              .from('recurring_transactions')
              .insert({
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
              })
              .select()
              .single();
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['recurring_transactions'] });
            pushToast({ variant: 'success', title: '已设置固定项', message: '到期后会提示你确认生成交易。' });
          } catch (err: any) {
            pushToast({ variant: 'danger', title: '固定项保存失败', message: toUserMessage(err) });
          } finally {
            setIsSavingRecurring(false);
          }
        }}
      />

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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const ok = await openConfirm({ title: '确认删除', message: '确认删除这条交易吗？此操作不可撤销。', confirmText: '删除', tone: 'danger' });
                          if (!ok) return;
                          deleteTransaction(transaction.id);
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
      {dialog}
    </Page>
  );
}
