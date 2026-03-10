import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { RecurringTransaction } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useRecurringTransactions(options: { familyId?: string | null } = {}) {
  const familyId = options.familyId ?? null;
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ['recurring_transactions', familyId],
    queryFn: async () => {
      if (!familyId) return [];
      const { data, error } = await supabase
        .from('recurring_transactions')
        .select('*')
        .eq('family_id', familyId)
        .order('next_run_date', { ascending: true });
      if (error) throw error;
      return data as RecurringTransaction[];
    },
    enabled: !!familyId,
  });

  const generateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('generate_recurring_transaction', { p_id: id });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      pushToast({ variant: 'success', title: '已生成', message: '本期交易已生成。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '生成失败', message: toUserMessage(err) });
    },
  });

  return {
    recurringTransactions: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    generateRecurring: generateMutation.mutate,
    isGenerating: generateMutation.isPending,
  };
}

