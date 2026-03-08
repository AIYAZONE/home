import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { RelationshipEvent } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useRelationshipEvents() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ['relationship_events', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('relationship_events')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('occurred_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as RelationshipEvent[];
    },
    enabled: !!profile?.family_id,
  });

  const addMutation = useMutation({
    mutationFn: async (payload: Omit<RelationshipEvent, 'id' | 'created_at' | 'updated_at' | 'family_id' | 'created_by_user_id'>) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');
      const { data, error } = await supabase
        .from('relationship_events')
        .insert({
          family_id: profile.family_id,
          created_by_user_id: profile.id,
          ...payload,
        })
        .select()
        .single();
      if (error) throw error;
      return data as RelationshipEvent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relationship_events'] });
      pushToast({ variant: 'success', title: '已添加', message: '事件已记录。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '添加失败', message: toUserMessage(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('relationship_events').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['relationship_events'] });
      pushToast({ variant: 'success', title: '已删除', message: '事件已删除。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  return {
    events: query.data,
    isLoading: query.isLoading,
    error: query.error,
    addEvent: addMutation.mutate,
    deleteEvent: deleteMutation.mutate,
    isAdding: addMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

