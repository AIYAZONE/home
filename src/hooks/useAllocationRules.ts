import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from './useProfile';
import { AllocationRule } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

type AllocationRuleUpsertPayload = {
  id?: string;
  fund_account_id: string;
  percentage: number;
  priority: number;
  is_active: boolean;
};

export function useAllocationRules() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ['allocation_rules', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('allocation_rules')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as AllocationRule[];
    },
    enabled: !!profile?.family_id,
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: AllocationRuleUpsertPayload) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');

      if (payload.id) {
        const { data, error } = await supabase
          .from('allocation_rules')
          .update({
            fund_account_id: payload.fund_account_id,
            percentage: payload.percentage,
            priority: payload.priority,
            is_active: payload.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', payload.id)
          .select()
          .single();
        if (error) throw error;
        return data as AllocationRule;
      }

      const { data, error } = await supabase
        .from('allocation_rules')
        .insert({
          family_id: profile.family_id,
          fund_account_id: payload.fund_account_id,
          percentage: payload.percentage,
          priority: payload.priority,
          is_active: payload.is_active,
        })
        .select()
        .single();
      if (error) throw error;
      return data as AllocationRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocation_rules'] });
      pushToast({ variant: 'success', title: '已保存', message: '存钱计划规则已更新。' });
    },
    onError: (err: unknown) => {
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('allocation_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocation_rules'] });
      pushToast({ variant: 'success', title: '已删除', message: '该规则已删除。' });
    },
    onError: (err: unknown) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  return {
    rules: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    upsertRule: upsertMutation.mutate,
    upsertRuleAsync: upsertMutation.mutateAsync,
    deleteRule: deleteMutation.mutate,
    deleteRuleAsync: deleteMutation.mutateAsync,
    isUpserting: upsertMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

