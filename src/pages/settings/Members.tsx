import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useMemberRemarks } from '@/hooks/useMemberRemarks';
import { useProfile } from '@/hooks/useProfile';
import { Loader2, User, Crown, Shield, Baby, Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMemberSelectLabel } from '@/lib/member';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ListRow, ListRowLeading, ListRowTrailing } from '@/components/ui/list-row';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { Select } from '@/components/ui/select';

export default function SettingsMembers() {
  const { data: profile } = useProfile();
  const { members, isLoading, updateRole, isUpdatingRole } = useFamilyMembers();
  const { remarkByMemberId, upsertRemarkAsync, isUpserting } = useMemberRemarks();
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [remarkName, setRemarkName] = useState('');

  const roleConfig: Record<string, { label: string; icon: typeof Shield; color: string }> = {
    admin: { label: '管理员', icon: Crown, color: 'text-amber-700 bg-amber-500/10 dark:text-amber-300' },
    parent: { label: '家长', icon: Shield, color: 'text-sky-700 bg-sky-500/10 dark:text-sky-300' },
    child: { label: '孩子', icon: Baby, color: 'text-fuchsia-700 bg-fuchsia-500/10 dark:text-fuchsia-300' },
  };

  const closeRemarkModal = () => {
    setEditingMemberId(null);
    setRemarkName('');
  };

  useEffect(() => {
    if (!editingMemberId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRemarkModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editingMemberId]);

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
                const remark = remarkByMemberId[member.id]?.remark_name?.trim() || '';
                const fallbackName = member.name || member.email?.split('@')[0] || 'Unknown';
                const displayName = formatMemberSelectLabel(member, remarkByMemberId);

                return (
                  <ListRow key={member.id}>
                    <ListRowLeading>
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-muted/60"><User className="h-4 w-4" /></div>
                      <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {displayName}
                            {member.id === profile?.id ? <span className="ml-2 text-xs text-muted-foreground">(我)</span> : null}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {remark ? `原名：${fallbackName} · ` : null}
                            {member.email}
                          </div>
                      </div>
                    </ListRowLeading>
                    <ListRowTrailing className="sm:justify-end">
                      <div className={cn('inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-medium', roleCfg.color)}>
                        <RoleIcon className="h-4 w-4" />
                        {roleCfg.label}
                      </div>
                      {canChangeRole ? (
                        <Select
                          value={member.role}
                          onChange={(e) => updateRole({ userId: member.id, newRole: e.target.value as 'admin' | 'parent' | 'child' })}
                          disabled={isUpdatingRole}
                          className="w-full sm:w-auto"
                        >
                          <option value="admin">管理员</option>
                          <option value="parent">家长</option>
                          <option value="child">孩子</option>
                        </Select>
                      ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingMemberId(member.id);
                            setRemarkName(remarkByMemberId[member.id]?.remark_name ?? '');
                          }}
                          aria-label="设置备注名"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                    </ListRowTrailing>
                  </ListRow>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {editingMemberId &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
            onClick={closeRemarkModal}
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
              <Card className="border border-border/60 bg-popover shadow-lg">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>设置备注名</CardTitle>
                      <CardDescription>备注名仅你自己可见。</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={closeRemarkModal} aria-label="关闭">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">备注名</label>
                    <Input value={remarkName} onChange={(e) => setRemarkName(e.target.value)} placeholder="例如：老婆、儿子、外婆" />
                    <div className="text-xs text-muted-foreground">留空则清除备注。</div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={closeRemarkModal}>
                      取消
                    </Button>
                    <Button
                      type="button"
                      disabled={isUpserting}
                      onClick={async () => {
                        try {
                          await upsertRemarkAsync({ memberUserId: editingMemberId, remarkName });
                          closeRemarkModal();
                        } catch {
                          return;
                        }
                      }}
                    >
                      保存
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>,
          document.body,
        )}
    </Page>
  );
}
