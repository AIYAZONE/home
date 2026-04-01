import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { ActionItem } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useActionItems() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ['action_items', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('action_items')
        .select('*')
        .eq('family_id', profile.family_id)
        .in('status', ['todo', 'doing'])
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as ActionItem[];
    },
    enabled: !!profile?.family_id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (args: { id: string; status: ActionItem['status'] }) => {
      const { error } = await supabase.from('action_items').update({ status: args.status }).eq('id', args.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action_items'] });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '操作失败', message: toUserMessage(err) });
    },
  });

  return {
    items: query.data,
    isLoading: query.isLoading,
    error: query.error,
    updateStatus: updateStatusMutation.mutateAsync,
    isUpdating: updateStatusMutation.isPending,
  };
}

