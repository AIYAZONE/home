import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from './useProfile';
import { UserProfile } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useFamilyMembers() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ['family-members', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('family_id', profile.family_id);
      if (error) throw error;
      return data as UserProfile[];
    },
    enabled: !!profile?.family_id,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: 'admin' | 'parent' | 'child' }) => {
      const { error } = await supabase.rpc('update_member_role', { p_user_id: userId, p_new_role: newRole });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-members'] });
      pushToast({ variant: 'success', title: '角色已更新', message: '成员角色已成功更改。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '更新失败', message: toUserMessage(err) });
    },
  });

  return {
    members: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    updateRole: updateRoleMutation.mutate,
    isUpdatingRole: updateRoleMutation.isPending,
  };
}
