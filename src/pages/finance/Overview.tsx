import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { Transaction } from '@/types';
import { Plus, TrendingUp, TrendingDown, DollarSign, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';

export default function FinanceOverview() {
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [isAdding, setIsAdding] = useState(false);
  const [familyName, setFamilyName] = useState('');
  const [createFamilyError, setCreateFamilyError] = useState<string | null>(null);

  // Form state
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');

  // Create Family Mutation
  const createFamilyMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data: family, error } = await supabase
        .rpc('create_family', { p_name: name })
        .single();

      if (error) throw error;
      return family;
    },
    onSuccess: () => {
      setCreateFamilyError(null);
      setFamilyName('');
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      pushToast({ variant: 'success', title: '创建成功', message: '家庭已创建，可以开始记录交易。' });
    },
    onError: (err: any) => {
      setCreateFamilyError(toUserMessage(err));
    },
  });

  // Fetch Transactions
  const { data: transactions, isLoading: isTransactionsLoading } = useQuery({
    queryKey: ['transactions', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('date', { ascending: false });
      
      if (error) throw error;
      return data as Transaction[];
    },
    enabled: !!profile?.family_id,
  });

  // Add Transaction Mutation
  const addTransactionMutation = useMutation({
    mutationFn: async (newTransaction: Omit<Transaction, 'id' | 'created_at' | 'family_id'>) => {
      if (!profile?.family_id) throw new Error('No family ID');
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
    },
  });

  const handleCreateFamily = (e: React.FormEvent) => {
    e.preventDefault();
    const name = familyName.trim();
    if (!name) {
      setCreateFamilyError('请输入家庭名称');
      return;
    }
    setCreateFamilyError(null);
    createFamilyMutation.mutate(name);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addTransactionMutation.mutate({
      amount: parseFloat(amount),
      category,
      description,
      type,
      date: new Date().toISOString(),
    });
  };

  if (isProfileLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

  if (!profile?.family_id) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <CardHeader>
            <CardTitle>创建家庭账户</CardTitle>
            <CardDescription>创建后可邀请家人加入，一起管理家庭数据。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {createFamilyError ? <Alert variant="danger">{createFamilyError}</Alert> : null}

            <form onSubmit={handleCreateFamily} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">家庭名称</label>
                <Input
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="例如：王氏家族"
                />
              </div>

              <Button type="submit" className="w-full" disabled={createFamilyMutation.isPending}>
                {createFamilyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                创建家庭
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate Summary
  const income = transactions?.filter(t => t.type === 'income').reduce((acc, curr) => acc + curr.amount, 0) || 0;
  const expense = transactions?.filter(t => t.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0) || 0;
  const balance = income - expense;

  return (
    <Page>
      <PageHeader>
        <div className="space-y-1">
          <PageTitle>财务中心</PageTitle>
          <PageDescription>清晰记录每一笔，持续改善家庭现金流。</PageDescription>
        </div>
        <PageActions>
          <Button onClick={() => setIsAdding(!isAdding)}>
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
            <div className="text-2xl font-semibold tracking-tight text-emerald-600">+¥{income.toFixed(2)}</div>
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
            <div className="text-2xl font-semibold tracking-tight text-rose-600">-¥{expense.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Add Transaction Form */}
      {isAdding && (
        <Card className="animate-in fade-in slide-in-from-top-4">
          <CardHeader>
            <CardTitle>添加新交易</CardTitle>
            <CardDescription>快速录入，后续可在列表里编辑与补充。</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  <label className="text-sm font-medium text-foreground">金额</label>
                  <Input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">分类</label>
                  <Input type="text" required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="例如：餐饮、交通" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">描述（选填）</label>
                  <Input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="备注信息" />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setIsAdding(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={addTransactionMutation.isPending}>
                  {addTransactionMutation.isPending ? '保存中…' : '保存'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Transaction List */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>最近交易</CardTitle>
          <CardDescription>支持后续增加筛选、搜索与分类规则。</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {isTransactionsLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>
          ) : transactions?.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">暂无交易记录</div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {transactions?.map((transaction) => (
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
