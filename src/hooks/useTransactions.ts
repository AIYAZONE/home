import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from './useProfile';
import { Transaction } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useTransactions(options?: { monthsBack?: number }) {
  const monthsBack = options?.monthsBack ?? 6;
  const { data: profile } = useProfile();
  const pushToast = useToastStore((s) => s.push);
  const queryClient = useQueryClient();

  const queryFn = async () => {
    if (!profile?.family_id) return [];
    const from = new Date();
    from.setMonth(from.getMonth() - monthsBack);
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('family_id', profile.family_id)
      .gte('date', from.toISOString())
      .order('date', { ascending: false });
    if (error) throw error;
    return data as Transaction[];
  };

  const query = useQuery({
    queryKey: ['transactions', profile?.family_id, monthsBack],
    queryFn,
    enabled: !!profile?.family_id,
  });

  const addMutation = useMutation({
    mutationFn: async (newTransaction: Omit<Transaction, 'id' | 'created_at' | 'family_id'>) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');
      const { data, error } = await supabase
        .from('transactions')
        .insert({ ...newTransaction, family_id: profile.family_id })
        .select()
        .single();
      if (error) throw error;
      return data as Transaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      pushToast({ variant: 'success', title: '已保存', message: '交易已添加。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; patch: Partial<Transaction> }) => {
      const { data, error } = await supabase
        .from('transactions')
        .update(payload.patch)
        .eq('id', payload.id)
        .select()
        .single();
      if (error) throw error;
      return data as Transaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      pushToast({ variant: 'success', title: '已更新', message: '交易已更新。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '更新失败', message: toUserMessage(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      pushToast({ variant: 'success', title: '已删除', message: '交易已删除。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  return {
    transactions: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    addTransaction: addMutation.mutate,
    addTransactionAsync: addMutation.mutateAsync,
    updateTransaction: updateMutation.mutate,
    updateTransactionAsync: updateMutation.mutateAsync,
    deleteTransaction: deleteMutation.mutate,
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
