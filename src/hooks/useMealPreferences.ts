import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import type { MealPreference } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useMealPreferences(subjectUserId: string | null) {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ['meal_preferences', profile?.family_id, subjectUserId],
    queryFn: async () => {
      if (!profile?.family_id || !subjectUserId) return null;
      const { data, error } = await supabase
        .from('meal_preferences')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('subject_user_id', subjectUserId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as MealPreference | null;
    },
    enabled: !!profile?.family_id && !!subjectUserId,
  });

  const upsertMutation = useMutation({
    mutationFn: async (patch: Partial<Pick<MealPreference, 'disliked' | 'liked' | 'spicy_level' | 'notes'>>) => {
      if (!profile?.family_id || !subjectUserId) throw new Error('缺少家庭信息');
      const payload = {
        family_id: profile.family_id,
        subject_user_id: subjectUserId,
        created_by_user_id: profile.id,
        ...patch,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('meal_preferences')
        .upsert(payload, { onConflict: 'family_id,subject_user_id' })
        .select()
        .single();
      if (error) throw error;
      return data as MealPreference;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_preferences'] });
      pushToast({ variant: 'success', title: '已保存', message: '口味偏好已更新。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  return {
    pref: query.data,
    isLoading: query.isLoading,
    error: query.error,
    savePref: upsertMutation.mutate,
    isSaving: upsertMutation.isPending,
  };
}
