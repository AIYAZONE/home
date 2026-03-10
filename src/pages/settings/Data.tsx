import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { Transaction } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { Download, FileJson, FileSpreadsheet, Loader2 } from 'lucide-react';

export default function SettingsData() {
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const pushToast = useToastStore((s) => s.push);

  const [isExporting, setIsExporting] = useState(false);

  const { data: family } = useQuery({
    queryKey: ['family', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return null;
      const { data, error } = await supabase.from('families').select('*').eq('id', profile.family_id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.family_id,
  });

  const exportData = async (format: 'json' | 'csv') => {
    if (!profile?.family_id) return;
    setIsExporting(true);
    try {
      const [transactionsRes, categoriesRes, budgetsRes, recurringRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('family_id', profile.family_id).order('date', { ascending: false }),
        supabase.from('categories').select('*').eq('family_id', profile.family_id),
        supabase.from('budgets').select('*').eq('family_id', profile.family_id),
        supabase.from('recurring_transactions').select('*').eq('family_id', profile.family_id),
      ]);

      if (transactionsRes.error) throw transactionsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (budgetsRes.error) throw budgetsRes.error;
      if (recurringRes.error) throw recurringRes.error;

      const data = {
        exportDate: new Date().toISOString(),
        family: {
          id: profile.family_id,
          name: family?.name,
        },
        transactions: transactionsRes.data || [],
        categories: categoriesRes.data || [],
        budgets: budgetsRes.data || [],
        recurringTransactions: recurringRes.data || [],
      };

      let content: string;
      let filename: string;
      let mimeType: string;

      if (format === 'json') {
        content = JSON.stringify(data, null, 2);
        filename = `family-data-${new Date().toISOString().slice(0, 10)}.json`;
        mimeType = 'application/json';
      } else {
        const csvRows: string[] = [];
        csvRows.push('日期,类型,分类,金额,描述,可见范围');
        (data.transactions as Transaction[]).forEach((t) => {
          csvRows.push(
            [
              new Date(t.date).toISOString().slice(0, 10),
              t.type === 'income' ? '收入' : t.type === 'expense' ? '支出' : '转账',
              `"${t.category.replace(/"/g, '""')}"`,
              t.amount,
              t.description ? `"${t.description.replace(/"/g, '""')}"` : '',
              t.visibility === 'private' ? '私密' : '家庭',
            ].join(','),
          );
        });
        content = csvRows.join('\n');
        filename = `family-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
        mimeType = 'text/csv;charset=utf-8';
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      try {
        await supabase.from('audit_logs').insert({
          family_id: profile.family_id,
          actor_id: profile.id,
          action: 'data.exported',
          entity_type: 'data_export',
          metadata: {
            format,
            filename,
            counts: {
              transactions: (transactionsRes.data || []).length,
              categories: (categoriesRes.data || []).length,
              budgets: (budgetsRes.data || []).length,
              recurringTransactions: (recurringRes.data || []).length,
            },
          },
        });
      } catch {}

      pushToast({ variant: 'success', title: '导出成功', message: `已下载 ${filename}` });
    } catch (err: unknown) {
      pushToast({ variant: 'danger', title: '导出失败', message: toUserMessage(err) });
    } finally {
      setIsExporting(false);
    }
  };

  if (!profile?.family_id) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>数据管理</CardTitle>
            <CardDescription>需要先加入一个家庭后才能导出数据。</CardDescription>
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

  return (
    <Page>
      <PageHeader>
        <div className="space-y-1">
          <PageTitle>数据管理</PageTitle>
          <PageDescription>导出家庭数据，便于备份与迁移。</PageDescription>
        </div>
      </PageHeader>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            <CardTitle>导出</CardTitle>
          </div>
          <CardDescription>支持全量 JSON 备份与交易 CSV。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Button disabled={isExporting} onClick={() => exportData('json')}>
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
            导出 JSON
          </Button>
          <Button variant="secondary" disabled={isExporting} onClick={() => exportData('csv')}>
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            导出 CSV
          </Button>
        </CardContent>
      </Card>
    </Page>
  );
}
