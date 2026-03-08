import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { InsurancePolicy } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useInsurancePolicies(subjectUserId: string | null) {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ['insurance_policies', profile?.family_id, subjectUserId],
    queryFn: async () => {
      if (!profile?.family_id || !subjectUserId) return [];
      const { data, error } = await supabase
        .from('insurance_policies')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('subject_user_id', subjectUserId)
        .order('end_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as InsurancePolicy[];
    },
    enabled: !!profile?.family_id && !!subjectUserId,
  });

  const addMutation = useMutation({
    mutationFn: async (payload: Omit<InsurancePolicy, 'id' | 'created_at' | 'updated_at' | 'family_id' | 'subject_user_id' | 'created_by_user_id'>) => {
      if (!profile?.family_id || !subjectUserId) throw new Error('缺少家庭信息');
      const { data, error } = await supabase
        .from('insurance_policies')
        .insert({
          family_id: profile.family_id,
          subject_user_id: subjectUserId,
          created_by_user_id: profile.id,
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data as InsurancePolicy;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insurance_policies'] });
      pushToast({ variant: 'success', title: '已添加', message: '保险条目已添加。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '添加失败', message: toUserMessage(err) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; patch: Partial<InsurancePolicy> }) => {
      const { data, error } = await supabase
        .from('insurance_policies')
        .update({ ...payload.patch, updated_at: new Date().toISOString() })
        .eq('id', payload.id)
        .select()
        .single();
      if (error) throw error;
      return data as InsurancePolicy;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insurance_policies'] });
      pushToast({ variant: 'success', title: '已更新', message: '保险条目已更新。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '更新失败', message: toUserMessage(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('insurance_policies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insurance_policies'] });
      pushToast({ variant: 'success', title: '已删除', message: '保险条目已删除。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  return {
    policies: query.data,
    isLoading: query.isLoading,
    error: query.error,
    addPolicy: addMutation.mutate,
    updatePolicy: updateMutation.mutate,
    deletePolicy: deleteMutation.mutate,
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

