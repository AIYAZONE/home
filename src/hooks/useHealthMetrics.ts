import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { HealthMetric } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useHealthMetrics(options: { subjectUserId: string | null; metricKey: HealthMetric['metric_key']; daysBack?: number }) {
  const { subjectUserId, metricKey, daysBack = 90 } = options;
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const from = new Date();
  from.setDate(from.getDate() - daysBack);
  const fromKey = from.toISOString().slice(0, 10);

  const query = useQuery({
    queryKey: ['health_metrics', profile?.family_id, subjectUserId, metricKey, fromKey],
    queryFn: async () => {
      if (!profile?.family_id || !subjectUserId) return [];
      const { data, error } = await supabase
        .from('health_metrics')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('subject_user_id', subjectUserId)
        .eq('metric_key', metricKey)
        .gte('recorded_at', fromKey)
        .order('recorded_at', { ascending: true });
      if (error) throw error;
      return data as HealthMetric[];
    },
    enabled: !!profile?.family_id && !!subjectUserId && !!metricKey,
  });

  const addMutation = useMutation({
    mutationFn: async (payload: Omit<HealthMetric, 'id' | 'created_at' | 'updated_at' | 'family_id' | 'subject_user_id' | 'created_by_user_id'>) => {
      if (!profile?.family_id || !subjectUserId) throw new Error('缺少家庭信息');
      const { data, error } = await supabase
        .from('health_metrics')
        .insert({
          family_id: profile.family_id,
          subject_user_id: subjectUserId,
          created_by_user_id: profile.id,
          ...payload,
        })
        .select()
        .single();
      if (error) throw error;
      return data as HealthMetric;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health_metrics'] });
      pushToast({ variant: 'success', title: '已记录', message: '健康指标已保存。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('health_metrics').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health_metrics'] });
      pushToast({ variant: 'success', title: '已删除', message: '记录已删除。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  return {
    metrics: query.data,
    isLoading: query.isLoading,
    error: query.error,
    addMetric: addMutation.mutate,
    deleteMetric: deleteMutation.mutate,
    isAdding: addMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

