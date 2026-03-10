import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from './useProfile';
import { Budget } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useBudgets(monthStart?: string) {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const monthStartKey = monthStart ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const query = useQuery({
    queryKey: ['budgets', profile?.family_id, monthStartKey],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { error: ensureError } = await supabase.rpc('ensure_month_budgets', { p_month_start: monthStartKey });
      if (ensureError) {
        void ensureError;
      }
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

  const ensureMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('ensure_month_budgets', { p_month_start: monthStartKey });
      if (error) throw error;
      return data as { inserted_from_templates: number; inserted_from_previous_month: number }[] | null;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      const row = data?.[0];
      const n = (row?.inserted_from_templates ?? 0) + (row?.inserted_from_previous_month ?? 0);
      pushToast({
        variant: 'success',
        title: '已补齐本月预算',
        message: n > 0 ? `已新增 ${n} 条预算（模板 ${row?.inserted_from_templates ?? 0} / 继承 ${row?.inserted_from_previous_month ?? 0}）。` : '本月预算已是最新，无需补齐。',
      });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '补齐失败', message: toUserMessage(err) });
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: { category_id?: string | null; category_name: string; amount: number }) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');
      const { data, error } = await supabase
        .from('budgets')
        .upsert(
          {
            family_id: profile.family_id,
            month_start: monthStartKey,
            category_id: payload.category_id ?? null,
            category_name: payload.category_name,
            amount: payload.amount,
            source: 'manual',
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
      pushToast({ variant: 'success', title: '预算已保存', message: '本月预算已更新。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  const deleteMutation = useMutation({
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

  return {
    budgets: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    ensureMonthBudgets: ensureMutation.mutate,
    upsertBudget: upsertMutation.mutate,
    deleteBudget: deleteMutation.mutate,
    isEnsuring: ensureMutation.isPending,
    isUpserting: upsertMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
