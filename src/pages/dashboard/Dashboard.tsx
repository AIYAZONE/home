import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { Budget, Transaction } from '@/types';
import { formatMoney, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: profile, isLoading: isProfileLoading } = useProfile();

  const { data: transactions, isLoading: isTransactionsLoading } = useQuery({
    queryKey: ['dashboard-transactions', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const from = new Date();
      from.setMonth(from.getMonth() - 6);
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('family_id', profile.family_id)
        .gte('date', from.toISOString())
        .order('date', { ascending: true });
      if (error) throw error;
      return data as Transaction[];
    },
    enabled: !!profile?.family_id,
  });

  const monthStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, []);

  const monthStartKey = useMemo(() => monthStart.toISOString().slice(0, 10), [monthStart]);

  const { data: budgets, isLoading: isBudgetsLoading } = useQuery({
    queryKey: ['dashboard-budgets', profile?.family_id, monthStartKey],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('month_start', monthStartKey);
      if (error) throw error;
      return data as Budget[];
    },
    enabled: !!profile?.family_id,
  });

  const monthIncome = useMemo(() => {
    return (
      (transactions ?? [])
        .filter((t) => t.type === 'income' && new Date(t.date) >= monthStart)
        .reduce((acc, curr) => acc + curr.amount, 0) || 0
    );
  }, [transactions, monthStart]);

  const monthExpense = useMemo(() => {
    return (
      (transactions ?? [])
        .filter((t) => t.type === 'expense' && new Date(t.date) >= monthStart)
        .reduce((acc, curr) => acc + curr.amount, 0) || 0
    );
  }, [transactions, monthStart]);

  const totalBalance = useMemo(() => {
    const income = (transactions ?? []).filter((t) => t.type === 'income').reduce((acc, curr) => acc + curr.amount, 0) || 0;
    const expense = (transactions ?? []).filter((t) => t.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0) || 0;
    return income - expense;
  }, [transactions]);

  const trendData = useMemo(() => {
    const days = 30;
    const now = new Date();
    const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const map = new Map<string, { date: string; income: number; expense: number }>();

    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      map.set(key, { date: key.slice(5), income: 0, expense: 0 });
    }

    (transactions ?? []).forEach((t) => {
      const key = new Date(t.date).toISOString().slice(0, 10);
      const row = map.get(key);
      if (!row) return;
      if (t.type === 'income') row.income += t.amount;
      if (t.type === 'expense') row.expense += t.amount;
    });

    return Array.from(map.values());
  }, [transactions]);

  const pieData = useMemo(() => {
    const rows = (transactions ?? []).filter((t) => t.type === 'expense' && new Date(t.date) >= monthStart);
    const byCat = new Map<string, number>();
    rows.forEach((t) => byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount));
    const sorted = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 6);
    const rest = sorted.slice(6).reduce((acc, [, v]) => acc + v, 0);
    const data = top.map(([name, value]) => ({ name, value }));
    if (rest > 0) data.push({ name: '其他', value: rest });
    return data;
  }, [transactions, monthStart]);

  const colors = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#A855F7', '#0EA5E9', '#64748B'];

  const budgetStats = useMemo(() => {
    const budgetTotal = (budgets ?? []).reduce((acc, b) => acc + Number(b.amount), 0);

    const spentByCategory = new Map<string, number>();
    (transactions ?? [])
      .filter((t) => t.type === 'expense' && new Date(t.date) >= monthStart)
      .forEach((t) => {
        const key = t.category.trim();
        spentByCategory.set(key, (spentByCategory.get(key) ?? 0) + t.amount);
      });

    const spentTotal = (budgets ?? []).reduce((acc, b) => acc + (spentByCategory.get(b.category_name) ?? 0), 0);
    const ratio = budgetTotal > 0 ? spentTotal / budgetTotal : 0;
    return { budgetTotal, spentTotal, ratio };
  }, [budgets, transactions, monthStart]);

  const isLoading = isProfileLoading || isTransactionsLoading || isBudgetsLoading;

  return (
    <Page>
      <PageHeader>
        <div className="space-y-1">
          <PageTitle>家庭概览</PageTitle>
          <PageDescription>快速掌握家庭经营状况，聚焦关键指标与行动。</PageDescription>
        </div>
        <PageActions>
          <Button variant="secondary" onClick={() => navigate('/settings')}>邀请成员</Button>
          <Button onClick={() => navigate('/finance')}>快速记账</Button>
        </PageActions>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { title: '总余额', value: formatMoney(totalBalance), trend: 0 },
          { title: '本月收入', value: formatMoney(monthIncome, { signDisplay: 'always' }), trend: 0, tone: 'income' as const },
          { title: '本月支出', value: formatMoney(-monthExpense, { signDisplay: 'always' }), trend: 0, tone: 'expense' as const },
          {
            title: '预算执行率',
            value: budgetStats.budgetTotal > 0 ? formatPercent(budgetStats.ratio * 100, 0) : '—',
            trend: 0,
            tag: budgetStats.budgetTotal > 0 ? (budgetStats.ratio >= 1 ? '超支' : budgetStats.ratio >= 0.8 ? '紧张' : '良好') : '未设置',
            tagVariant:
              budgetStats.budgetTotal > 0 ? (budgetStats.ratio >= 1 ? 'danger' : budgetStats.ratio >= 0.8 ? 'warning' : 'success') : 'default',
          },
        ].map((stat) => {
          const positive = stat.trend > 0;
          const negative = stat.trend < 0;
          const tagVariant = (stat as any).tagVariant ?? 'warning';
          return (
            <Card key={stat.title} className="bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                  {stat.tag ? <Badge variant={tagVariant}>{stat.tag}</Badge> : null}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-end justify-between gap-3">
                  <div
                    className={cn(
                      'text-2xl font-semibold tracking-tight',
                      stat.tone === 'income' && 'text-emerald-600',
                      stat.tone === 'expense' && 'text-rose-600',
                    )}
                  >
                    {isLoading ? <Skeleton className="h-8 w-32" /> : stat.value}
                  </div>
                  {stat.tag ? null : (
                    <div
                      className={cn(
                        'inline-flex items-center gap-1 text-sm font-medium',
                        positive && 'text-emerald-600',
                        negative && 'text-rose-600',
                        !positive && !negative && 'text-muted-foreground',
                      )}
                    >
                      {positive && <TrendingUp className="h-4 w-4" />}
                      {negative && <TrendingDown className="h-4 w-4" />}
                      {positive ? `+${stat.trend}%` : negative ? `${stat.trend}%` : '—'}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>趋势</CardTitle>
            <CardDescription>近 30 天收入与支出趋势。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56 rounded-xl border border-border bg-card">
              {isLoading ? (
                <div className="p-4">
                  <Skeleton className="h-48 w-full" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: '1px solid hsl(var(--border))',
                        background: 'hsl(var(--card))',
                      }}
                      formatter={(v: any, name: any) => [formatMoney(v), name === 'income' ? '收入' : '支出']}
                      labelFormatter={(label: any) => `日期 ${label}`}
                    />
                    <Legend formatter={(value: any) => (value === 'income' ? '收入' : '支出')} />
                    <Line type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="expense" stroke="#EF4444" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>本月支出结构</CardTitle>
            <CardDescription>按分类汇总（仅支出）。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56 rounded-xl border border-border bg-card">
              {isLoading ? (
                <div className="p-4">
                  <Skeleton className="h-48 w-full" />
                </div>
              ) : pieData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">暂无本月支出</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: '1px solid hsl(var(--border))',
                        background: 'hsl(var(--card))',
                      }}
                      formatter={(v: any) => formatMoney(v)}
                    />
                    <Legend />
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} stroke="hsl(var(--border))">
                      {pieData.map((_, idx) => (
                        <Cell key={idx} fill={colors[idx % colors.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
