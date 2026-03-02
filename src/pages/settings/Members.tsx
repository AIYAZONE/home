import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useProfile } from '@/hooks/useProfile';
import { Loader2, User, Crown, Shield, Baby } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';

export default function SettingsMembers() {
  const { data: profile } = useProfile();
  const { members, isLoading, updateRole, isUpdatingRole } = useFamilyMembers();

  const roleConfig: Record<string, { label: string; icon: typeof Shield; color: string }> = {
    admin: { label: '管理员', icon: Crown, color: 'text-amber-600 bg-amber-50' },
    parent: { label: '家长', icon: Shield, color: 'text-blue-600 bg-blue-50' },
    child: { label: '孩子', icon: Baby, color: 'text-purple-600 bg-purple-50' },
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <Page>
      <PageHeader>
        <PageTitle>成员管理</PageTitle>
        <PageDescription>管理家庭成员及其角色权限。</PageDescription>
      </PageHeader>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3"><CardTitle>家庭成员</CardTitle><CardDescription>共 {(members ?? []).length} 人</CardDescription></CardHeader>
        <CardContent className="pt-0">
          {(members?.length ?? 0) === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">暂无成员</div> : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {members?.map((member) => {
                const roleCfg = roleConfig[member.role] || roleConfig.parent;
                const RoleIcon = roleCfg.icon;
                const canChangeRole = profile?.role === 'admin' && member.id !== profile.id;

                return (
                  <div key={member.id} className="flex items-center justify-between gap-4 px-4 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-muted/60"><User className="h-4 w-4" /></div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{member.name || member.email?.split('@')[0] || 'Unknown'}{member.id === profile?.id ? <span className="ml-2 text-xs text-muted-foreground">(我)</span> : null}</div>
                        <div className="truncate text-xs text-muted-foreground">{member.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={cn('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium', roleCfg.color)}>
                        <RoleIcon className="h-3.5 w-3.5" />{roleCfg.label}
                      </div>
                      {canChangeRole && (
                        <select value={member.role} onChange={(e) => updateRole({ userId: member.id, newRole: e.target.value as any })} disabled={isUpdatingRole} className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
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
