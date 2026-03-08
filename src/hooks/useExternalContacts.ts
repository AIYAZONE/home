import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { ExternalContact } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useExternalContacts() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ['external_contacts', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('external_contacts')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as ExternalContact[];
    },
    enabled: !!profile?.family_id,
  });

  const addMutation = useMutation({
    mutationFn: async (payload: Omit<ExternalContact, 'id' | 'created_at' | 'updated_at' | 'family_id' | 'owner_user_id'>) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');
      const { data, error } = await supabase
        .from('external_contacts')
        .insert({
          family_id: profile.family_id,
          owner_user_id: profile.id,
          updated_at: new Date().toISOString(),
          ...payload,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ExternalContact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external_contacts'] });
      pushToast({ variant: 'success', title: '已添加', message: '联系人已添加。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '添加失败', message: toUserMessage(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('external_contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external_contacts'] });
      pushToast({ variant: 'success', title: '已删除', message: '联系人已删除。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  return {
    contacts: query.data,
    isLoading: query.isLoading,
    error: query.error,
    addContact: addMutation.mutate,
    deleteContact: deleteMutation.mutate,
    isAdding: addMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

