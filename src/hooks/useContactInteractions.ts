import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { ContactInteraction } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useContactInteractions(contactId: string | null) {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ['contact_interactions', profile?.family_id, contactId],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const q = supabase
        .from('contact_interactions')
        .select('*')
        .eq('family_id', profile.family_id);
      const { data, error } = contactId
        ? await q.eq('contact_id', contactId).order('interaction_date', { ascending: false }).limit(50)
        : await q.order('interaction_date', { ascending: false }).limit(50);
      if (error) throw error;
      return data as ContactInteraction[];
    },
    enabled: !!profile?.family_id,
  });

  const addMutation = useMutation({
    mutationFn: async (
      payload: Omit<ContactInteraction, 'id' | 'created_at' | 'updated_at' | 'family_id' | 'created_by_user_id'>,
    ) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');
      const { data, error } = await supabase
        .from('contact_interactions')
        .insert({
          family_id: profile.family_id,
          created_by_user_id: profile.id,
          updated_at: new Date().toISOString(),
          ...payload,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ContactInteraction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact_interactions'] });
      pushToast({ variant: 'success', title: '已记录', message: '互动已保存。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contact_interactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact_interactions'] });
      pushToast({ variant: 'success', title: '已删除', message: '互动已删除。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  return {
    interactions: query.data,
    isLoading: query.isLoading,
    error: query.error,
    addInteraction: addMutation.mutate,
    deleteInteraction: deleteMutation.mutate,
    isAdding: addMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

