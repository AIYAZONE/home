import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from './useProfile';
import type { BalanceSheetItem, FundAccount } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

type BalanceSheetItemInput = Omit<BalanceSheetItem, 'id' | 'family_id' | 'created_at' | 'updated_at' | 'owner_user_id'> & {
  owner_user_id?: string | null;
};

type BalanceSheetItemPatch = Partial<Omit<BalanceSheetItem, 'family_id' | 'created_at' | 'owner_user_id'>>;

export function useBalanceSheet() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const itemsQuery = useQuery({
    queryKey: ['balance_sheet_items', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('balance_sheet_items')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as BalanceSheetItem[];
    },
    enabled: !!profile?.family_id,
  });

  const fundAccountsQuery = useQuery({
    queryKey: ['fund_accounts', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('fund_accounts')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('is_active', true)
        .order('priority', { ascending: true });
      if (error) throw error;
      return data as FundAccount[];
    },
    enabled: !!profile?.family_id,
  });

  const stats = useMemo(() => {
    const activeItems = (itemsQuery.data ?? []).filter((i) => i.is_active);
    const totalAssets = activeItems.filter((i) => i.kind === 'asset').reduce((acc, i) => acc + Number(i.amount), 0);
    const totalLiabilities = activeItems.filter((i) => i.kind === 'liability').reduce((acc, i) => acc + Number(i.amount), 0);
    const netWorth = totalAssets - totalLiabilities;
    const fundTotal = (fundAccountsQuery.data ?? []).reduce((acc, f) => acc + Number(f.current_amount), 0);
    const combinedNetWorth = netWorth + fundTotal;
    return { totalAssets, totalLiabilities, netWorth, fundTotal, combinedNetWorth };
  }, [itemsQuery.data, fundAccountsQuery.data]);

  const addMutation = useMutation({
    mutationFn: async (payload: BalanceSheetItemInput) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');
      const { data, error } = await supabase
        .from('balance_sheet_items')
        .insert({
          ...payload,
          family_id: profile.family_id,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data as BalanceSheetItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balance_sheet_items'] });
      pushToast({ variant: 'success', title: '已保存', message: '资产数据已添加。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; patch: BalanceSheetItemPatch }) => {
      const { family_id: _familyId, created_at: _createdAt, owner_user_id: _ownerUserId, ...safePatch } = payload.patch as any;
      const { data, error } = await supabase
        .from('balance_sheet_items')
        .update({ ...safePatch, updated_at: new Date().toISOString() })
        .eq('id', payload.id)
        .select()
        .single();
      if (error) throw error;
      return data as BalanceSheetItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balance_sheet_items'] });
      pushToast({ variant: 'success', title: '已更新', message: '资产数据已更新。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '更新失败', message: toUserMessage(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('balance_sheet_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balance_sheet_items'] });
      pushToast({ variant: 'success', title: '已删除', message: '资产数据已删除。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  return {
    items: itemsQuery.data,
    fundAccounts: fundAccountsQuery.data,
    stats,
    isLoading: itemsQuery.isLoading || fundAccountsQuery.isLoading,
    error: itemsQuery.error ?? fundAccountsQuery.error,
    addItem: addMutation.mutate,
    updateItem: updateMutation.mutate,
    deleteItem: deleteMutation.mutate,
    isAdding: addMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
