import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import type { MealPlanData } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useMealPlan(date: string | null) {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ['meal_plans', profile?.family_id, date],
    queryFn: async () => {
      if (!profile?.family_id || !date) return null;
      const { data, error } = await supabase
        .from('meal_plans')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('plan_date', date)
        .maybeSingle();
      if (error) throw error;
      return (data?.plan_json ?? null) as MealPlanData | null;
    },
    enabled: !!profile?.family_id && !!date,
  });

  const upsertMutation = useMutation({
    mutationFn: async (input: {
      plan: MealPlanData;
      constraintsSnapshot?: unknown;
    }) => {
      if (!profile?.family_id || !date) throw new Error('缺少家庭信息');
      const payload = {
        family_id: profile.family_id,
        plan_date: date,
        plan_json: input.plan,
        constraints_snapshot: input.constraintsSnapshot ?? null,
        created_by_user_id: profile.id,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('meal_plans')
        .upsert(payload, { onConflict: 'family_id,plan_date' })
        .select()
        .single();
      if (error) throw error;
      return (data.plan_json ?? null) as MealPlanData | null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans'] });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  return {
    plan: query.data,
    isLoading: query.isLoading,
    error: query.error,
    savePlan: upsertMutation.mutateAsync,
    isSaving: upsertMutation.isPending,
  };
}
