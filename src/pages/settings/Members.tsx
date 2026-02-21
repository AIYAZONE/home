import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { UserProfile } from '@/types';
import { Loader2, User, Crown, Shield, Baby, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';

export default function SettingsMembers() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);

  const { data: members, isLoading } = useQuery({
    queryKey: ['family-members', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as UserProfile[];
    },
    enabled: !!profile?.family_id,
  });

  const roleConfig: Record<string, { label: string; icon: typeof Shield; color: string; description: string }> = {
    admin: { label: '管理员', icon: Crown, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30', description: '拥有所有权限，可管理成员角色' },
    parent: { label: '家长', icon: Shield, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30', description: '可记账、邀请成员、查看家庭数据' },
    child: { label: '孩子', icon: Baby, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30', description: '可查看部分数据、参与任务' },
  };

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

  return (
    <Page>
      <PageHeader>
        <PageTitle>成员管理</PageTitle>
        <PageDescription>管理家庭成员及其角色权限。</PageDescription>
      </PageHeader>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>家庭成员</CardTitle>
          <CardDescription>共 {(members ?? []).length} 人</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
          ) : (members?.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">暂无成员</div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {members?.map((member) => {
                const roleCfg = roleConfig[member.role] || roleConfig.parent;
                const RoleIcon = roleCfg.icon;
                const canChangeRole = profile?.role === 'admin' && member.id !== profile.id;

                return (
                  <div key={member.id} className="flex items-center justify-between gap-4 px-4 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-muted/60 text-muted-foreground">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {member.name || member.email?.split('@')[0] || 'Unknown User'}
                          {member.id === profile?.id ? <span className="ml-2 text-xs text-muted-foreground">(我)</span> : null}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{member.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium', roleCfg.color)}>
                        <RoleIcon className="h-3.5 w-3.5" />
                        {roleCfg.label}
                      </div>
                      {canChangeRole && (
                        <select
                          value={member.role}
                          onChange={(e) => updateRoleMutation.mutate({ userId: member.id, newRole: e.target.value as any })}
                          disabled={updateRoleMutation.isPending}
                          className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                        >
                          <option value="admin">管理员</option>
                          <option value="parent">家长</option>
                          <option value="child">孩子</option>
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
