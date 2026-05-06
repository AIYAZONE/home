import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { HealthFollowup } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useHealthAlerts(subjectUserId: string | null) {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ['health_followups', profile?.family_id, subjectUserId],
    queryFn: async () => {
      if (!profile?.family_id || !subjectUserId) return [];
      const { data, error } = await supabase
        .from('health_followups')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('subject_user_id', subjectUserId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as HealthFollowup[];
    },
    enabled: !!profile?.family_id && !!subjectUserId,
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; status: HealthFollowup['status'] }) => {
      const patch: Partial<HealthFollowup> & { updated_at: string; resolved_at?: string | null } = {
        status: payload.status,
        updated_at: new Date().toISOString(),
      };
      if (payload.status === 'done') patch.resolved_at = new Date().toISOString();
      const { error } = await supabase.from('health_followups').update(patch).eq('id', payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health_followups'] });
      pushToast({ variant: 'success', title: '已更新', message: '随访状态已更新。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '更新失败', message: toUserMessage(err) });
    },
  });

  return {
    alerts: query.data,
    isLoading: query.isLoading,
    error: query.error,
    updateAlertStatus: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
  };
}
