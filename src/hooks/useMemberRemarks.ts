import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from './useProfile';
import { FamilyMemberRemark } from '@/types';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';

export function useMemberRemarks() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const query = useQuery({
    queryKey: ['member-remarks', profile?.family_id, profile?.id],
    queryFn: async () => {
      if (!profile?.family_id || !profile?.id) return [];
      const { data, error } = await supabase
        .from('family_member_remarks')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('owner_user_id', profile.id);
      if (error) throw error;
      return data as FamilyMemberRemark[];
    },
    enabled: !!profile?.family_id && !!profile?.id,
  });

  const remarkByMemberId = useMemo(() => {
    const map: Record<string, FamilyMemberRemark> = {};
    for (const r of query.data ?? []) {
      map[r.member_user_id] = r;
    }
    return map;
  }, [query.data]);

  const upsertMutation = useMutation({
    mutationFn: async (payload: { memberUserId: string; remarkName: string }) => {
      if (!profile?.family_id || !profile?.id) throw new Error('缺少家庭信息');
      const name = payload.remarkName.trim();

      if (name === '') {
        const { error } = await supabase
          .from('family_member_remarks')
          .delete()
          .eq('family_id', profile.family_id)
          .eq('owner_user_id', profile.id)
          .eq('member_user_id', payload.memberUserId);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('family_member_remarks')
        .upsert(
          {
            family_id: profile.family_id,
            owner_user_id: profile.id,
            member_user_id: payload.memberUserId,
            remark_name: name,
          },
          { onConflict: 'owner_user_id,member_user_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-remarks'] });
      pushToast({ variant: 'success', title: '已保存', message: '备注名已更新。' });
    },
    onError: (err: unknown) => {
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  return {
    remarkByMemberId,
    remarks: query.data,
    isLoading: query.isLoading,
    upsertRemark: upsertMutation.mutate,
    upsertRemarkAsync: upsertMutation.mutateAsync,
    isUpserting: upsertMutation.isPending,
  };
}
