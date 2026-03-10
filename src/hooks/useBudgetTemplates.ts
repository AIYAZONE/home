import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from './useProfile';
import { BudgetTemplate } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useBudgetTemplates() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ['budget_templates', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('budget_templates')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as BudgetTemplate[];
    },
    enabled: !!profile?.family_id,
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: {
      category_id?: string | null;
      category_name: string;
      amount: number;
      active?: boolean;
      priority?: number;
    }) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');
      const { data, error } = await supabase
        .from('budget_templates')
        .upsert(
          {
            family_id: profile.family_id,
            category_id: payload.category_id ?? null,
            category_name: payload.category_name,
            method: 'fixed',
            amount: payload.amount,
            active: payload.active ?? true,
            priority: payload.priority ?? 100,
            start_month: null,
            end_month: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'family_id,category_name' },
        )
        .select()
        .single();
      if (error) throw error;
      return data as BudgetTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget_templates'] });
      pushToast({ variant: 'success', title: '模板已保存', message: '常用预算模板已更新。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('budget_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget_templates'] });
      pushToast({ variant: 'success', title: '模板已删除', message: '该模板已删除。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  return {
    templates: query.data,
    isLoading: query.isLoading,
    error: query.error,
    upsertTemplate: upsertMutation.mutate,
    deleteTemplate: deleteMutation.mutate,
    isUpserting: upsertMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

