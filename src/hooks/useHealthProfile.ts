import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { HealthProfile } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useHealthProfile(subjectUserId: string | null) {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ['health_profile', profile?.family_id, subjectUserId],
    queryFn: async () => {
      if (!profile?.family_id || !subjectUserId) return null;
      const { data, error } = await supabase
        .from('health_profiles')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('subject_user_id', subjectUserId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as HealthProfile | null;
    },
    enabled: !!profile?.family_id && !!subjectUserId,
  });

  const upsertMutation = useMutation({
    mutationFn: async (patch: Partial<HealthProfile>) => {
      if (!profile?.family_id || !subjectUserId) throw new Error('缺少家庭信息');
      const payload = {
        family_id: profile.family_id,
        subject_user_id: subjectUserId,
        created_by_user_id: profile.id,
        ...patch,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('health_profiles')
        .upsert(payload, { onConflict: 'family_id,subject_user_id' })
        .select()
        .single();
      if (error) throw error;
      return data as HealthProfile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health_profile'] });
      pushToast({ variant: 'success', title: '已保存', message: '健康档案已更新。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  return {
    profile: query.data,
    isLoading: query.isLoading,
    error: query.error,
    saveProfile: upsertMutation.mutate,
    isSaving: upsertMutation.isPending,
  };
}

