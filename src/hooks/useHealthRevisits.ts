import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { HealthRevisit } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useHealthRevisits(subjectUserId: string | null) {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ['health_revisits', profile?.family_id, subjectUserId],
    queryFn: async () => {
      if (!profile?.family_id || !subjectUserId) return [];
      const { data, error } = await supabase
        .from('health_revisits')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('subject_user_id', subjectUserId)
        .order('revisit_date', { ascending: true });
      if (error) throw error;
      return data as HealthRevisit[];
    },
    enabled: !!profile?.family_id && !!subjectUserId,
  });

  const addMutation = useMutation({
    mutationFn: async (payload: Omit<HealthRevisit, 'id' | 'family_id' | 'subject_user_id' | 'created_by_user_id' | 'created_at' | 'updated_at'>) => {
      if (!profile?.family_id || !subjectUserId) throw new Error('缺少家庭信息');
      const { error } = await supabase.from('health_revisits').insert({
        family_id: profile.family_id,
        subject_user_id: subjectUserId,
        created_by_user_id: profile.id,
        ...payload,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health_revisits'] });
      pushToast({ variant: 'success', title: '已添加', message: '复诊计划已保存。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  return {
    revisits: query.data,
    isLoading: query.isLoading,
    error: query.error,
    addRevisit: addMutation.mutate,
    isAdding: addMutation.isPending,
  };
}
