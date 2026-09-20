import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';

export interface MemberMealSummary {
  userId: string;
  name: string;
  /** 健康档案里的过敏原（原文，可能为逗号分隔） */
  allergies: string | null;
  /** 口味偏好：忌口 / 爱吃 / 辣度 */
  disliked: string | null;
  liked: string | null;
  spicyLevel: string | null;
  hasHealthProfile: boolean;
  hasMealPreference: boolean;
}

const SPICY_LABELS: Record<string, string> = {
  none: '不吃辣',
  mil: '微辣',
  med: '中辣',
  hot: '重辣',
};

export function spicyLabel(level: string | null): string | null {
  return level ? SPICY_LABELS[level] ?? null : null;
}

/**
 * 汇总全家每位成员的健康约束（过敏原）与口味偏好，
 * 供「今天吃什么」页面展示"这次推荐结合了谁"。仅家长/管理员角色在 RLS 下能读到全家数据。
 */
export function useFamilyMealConstraints() {
  const { data: profile } = useProfile();

  const query = useQuery({
    queryKey: ['family-meal-constraints', profile?.family_id],
    queryFn: async (): Promise<MemberMealSummary[]> => {
      if (!profile?.family_id) return [];
      const [membersRes, healthRes, prefRes] = await Promise.all([
        supabase
          .from('users')
          .select('id, name, email')
          .eq('family_id', profile.family_id),
        supabase
          .from('health_profiles')
          .select('subject_user_id, allergies')
          .eq('family_id', profile.family_id),
        supabase
          .from('meal_preferences')
          .select('subject_user_id, disliked, liked, spicy_level')
          .eq('family_id', profile.family_id),
      ]);
      const firstError = membersRes.error ?? healthRes.error ?? prefRes.error;
      if (firstError) throw firstError;

      const healthByUser = new Map((healthRes.data ?? []).map((h: any) => [h.subject_user_id, h]));
      const prefByUser = new Map((prefRes.data ?? []).map((p: any) => [p.subject_user_id, p]));

      return ((membersRes.data ?? []) as Array<{ id: string; name: string | null; email: string | null }>).map(
        (m) => {
          const health = healthByUser.get(m.id);
          const pref = prefByUser.get(m.id);
          return {
            userId: m.id,
            name: m.name || m.email?.split('@')[0] || '成员',
            allergies: health?.allergies?.trim() || null,
            disliked: pref?.disliked?.trim() || null,
            liked: pref?.liked?.trim() || null,
            spicyLevel: pref?.spicy_level ?? null,
            hasHealthProfile: Boolean(health),
            hasMealPreference: Boolean(pref),
          } satisfies MemberMealSummary;
        },
      );
    },
    enabled: !!profile?.family_id,
  });

  return { members: query.data, isLoading: query.isLoading, error: query.error };
}
