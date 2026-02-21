import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { Category } from '@/types';
import { Loader2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';

export default function FinanceCategories() {
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryKind, setNewCategoryKind] = useState<'expense' | 'income' | 'both'>('expense');

  const { data: categories, isLoading } = useQuery({
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

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; kind: Category['kind'] }) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');
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

  const deleteMutation = useMutation({
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

  if (isProfileLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <Page>
      <PageHeader>
        <PageTitle>分类管理</PageTitle>
        <PageDescription>统一管理家庭分类，交易录入可快捷选择。</PageDescription>
      </PageHeader>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>添加分类</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <form
            className="grid grid-cols-1 gap-3 md:grid-cols-5"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newCategoryName.trim();
              if (!name) return;
              createMutation.mutate({ name, kind: newCategoryKind });
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
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="expense">支出</option>
                <option value="income">收入</option>
                <option value="both">通用</option>
              </select>
            </div>

            <div className="flex items-end md:col-span-1">
              <Button type="submit" className="w-full" disabled={!newCategoryName.trim() || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                添加
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>已有分类</CardTitle>
          <CardDescription>共 {(categories ?? []).length} 个分类</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
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
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      const ok = window.confirm(`确认删除分类「${c.name}」吗？不会删除历史交易记录。`);
                      if (!ok) return;
                      deleteMutation.mutate(c.id);
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
    </Page>
  );
}
