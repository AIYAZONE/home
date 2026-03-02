import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from './useProfile';
import { Category } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useCategories() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ['categories', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Category[];
    },
    enabled: !!profile?.family_id,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; kind: Category['kind'] }) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');
      const { data, error } = await supabase
        .from('categories')
        .insert({ family_id: profile.family_id, name: payload.name, kind: payload.kind })
        .select()
        .single();
      if (error) throw error;
      return data as Category;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      pushToast({ variant: 'success', title: '已添加分类', message: '分类已保存。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '添加失败', message: toUserMessage(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      pushToast({ variant: 'success', title: '已删除分类', message: '分类已删除。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  return {
    categories: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    createCategory: createMutation.mutate,
    deleteCategory: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
