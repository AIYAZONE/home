import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { MealPlanData, MealRecommendResponse, MealSlot } from '@/types';

export interface RecommendMealsInput {
  date: string;
  servingUserIds?: string[];
  adhocIngredients?: string;
  direction?: string;
  swap?: { meal: MealSlot; dish: string };
  basePlan?: MealPlanData;
}

async function recommendMeals(input: RecommendMealsInput): Promise<MealRecommendResponse> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('未登录或登录已过期，请重新登录。');

  const res = await fetch('/api/meals/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.message ?? '推荐失败，请稍后再试。');
  }
  return payload as MealRecommendResponse;
}

export function useRecommendMeals() {
  const mutation = useMutation({
    mutationFn: recommendMeals,
  });

  return {
    recommend: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
