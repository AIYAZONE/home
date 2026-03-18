import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';
import { BillImportDraftTransaction } from '@/lib/billImport/mapping';
import { Transaction } from '@/types';

type InsertRow = Omit<Transaction, 'id' | 'created_at' | 'family_id'>;

export function useTransactionImport() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const mutation = useMutation({
    mutationFn: async (drafts: BillImportDraftTransaction[]) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');
      const rows: InsertRow[] = drafts.map((d) => ({
        owner_user_id: profile.id,
        visibility: d.visibility,
        amount: d.amount,
        category: d.category.trim(),
        description: d.description ? d.description.trim() : null,
        date: d.date,
        type: d.type,
      }));

      const { error } = await supabase.from('transactions').insert(
        rows.map((r) => ({ ...r, family_id: profile.family_id })),
      );
      if (error) throw error;
      return { inserted: rows.length };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      pushToast({ variant: 'success', title: '导入成功', message: `已导入 ${res.inserted} 条交易。` });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '导入失败', message: toUserMessage(err) });
    },
  });

  return {
    importAsync: mutation.mutateAsync,
    isImporting: mutation.isPending,
  };
}

