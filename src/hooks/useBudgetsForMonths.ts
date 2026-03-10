import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from './useProfile';
import { Budget } from '@/types';

export function useBudgetsForMonths(monthStarts: string[]) {
  const { data: profile } = useProfile();

  const key = monthStarts.slice().sort().join(',');

  const query = useQuery({
    queryKey: ['budgets_for_months', profile?.family_id, key],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      if (monthStarts.length === 0) return [];
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('family_id', profile.family_id)
        .in('month_start', monthStarts)
        .order('month_start', { ascending: true })
        .order('amount', { ascending: false });
      if (error) throw error;
      return data as Budget[];
    },
    enabled: !!profile?.family_id && monthStarts.length > 0,
  });

  return {
    budgets: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

