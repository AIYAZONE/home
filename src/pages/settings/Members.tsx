import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useMemberRemarks } from '@/hooks/useMemberRemarks';
import { useProfile } from '@/hooks/useProfile';
import { useCreateMember, type CreateMemberResult } from '@/hooks/useCreateMember';
import { Loader2, User, UserPlus, Crown, Shield, Baby, Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMemberSelectLabel, isPlaceholderMemberEmail, normalizeMemberAccount, validateMemberAccount } from '@/lib/member';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ListRow, ListRowLeading, ListRowTrailing } from '@/components/ui/list-row';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';

function generateMemberPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

const EMPTY_ADD_FORM = { name: '', account: '', role: 'child' as 'child' | 'parent', password: '' };

export default function SettingsMembers() {
  const { data: profile } = useProfile();
  const { members, isLoading, updateRole, isUpdatingRole } = useFamilyMembers();
  const { remarkByMemberId, upsertRemarkAsync, isUpserting } = useMemberRemarks();
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [remarkName, setRemarkName] = useState('');

  const queryClient = useQueryClient();
  const canManageMembers = profile?.role === 'admin' || profile?.role === 'parent';
  const createMember = useCreateMember();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addError, setAddError] = useState<string | null>(null);
  const [created, setCreated] = useState<(CreateMemberResult & { password: string }) | null>(null);

  const closeAddModal = () => {
    setIsAddOpen(false);
    setAddForm(EMPTY_ADD_FORM);
    setAddError(null);
    setCreated(null);
  };

  const submitAddMember = async () => {
    setAddError(null);
    const name = addForm.name.trim();
    if (!name) {
      setAddError('请填写成员名字，例如：儿子、妈妈。');
      return;
    }
    const account = normalizeMemberAccount(addForm.account);
    const accountError = validateMemberAccount(account);
    if (accountError) {
      setAddError(accountError);
      return;
    }
    if (addForm.password.length < 6) {
      setAddError('密码至少 6 位，可点「随机生成」。');
      return;
    }
    try {
      const result = await createMember.mutateAsync({ ...addForm, name, account });
      setCreated({ ...result, password: addForm.password });
      queryClient.invalidateQueries({ queryKey: ['family-members'] });
      queryClient.invalidateQueries({ queryKey: ['family-meal-constraints'] });
    } catch (err: any) {
      setAddError(err?.message || '创建成员失败，请稍后再试。');
    }
  };

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
    if (!editingMemberId && !isAddOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      closeRemarkModal();
      closeAddModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editingMemberId, isAddOpen]);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <Page>
      <PageHeader>
        <PageTitle>成员管理</PageTitle>
        <PageDescription>管理家庭成员及其角色权限。</PageDescription>
      </PageHeader>

      {canManageMembers && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setIsAddOpen(true)}>
            <UserPlus className="h-4 w-4" />
            手动添加成员
          </Button>
        </div>
      )}

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
                            {isPlaceholderMemberEmail(member.email)
                              ? `账号登录：${member.email?.split('@')[0]}`
                              : member.email}
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

      {isAddOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
            onClick={closeAddModal}
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
              <Card className="border border-border/60 bg-popover shadow-lg">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>{created ? '成员已创建' : '手动添加成员'}</CardTitle>
                      <CardDescription>
                        {created
                          ? '把登录信息交给家人，用账号密码即可登录。'
                          : '无需邮箱即可创建，适合孩子等暂无账号的家庭成员；之后可补绑邮箱。'}
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={closeAddModal} aria-label="关闭">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {created ? (
                    <div className="space-y-3">
                      <Alert variant="success">「{addForm.name}」已加入家庭，现在就能在口味偏好页为 TA 设置忌口。</Alert>
                      <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">登录账号</span>
                          <span className="font-mono font-medium text-foreground">{created.account}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">初始密码</span>
                          <span className="font-mono font-medium text-foreground">{created.password}</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        在登录页选「账号登录」，输入上面的账号和密码即可。建议登录后尽快在设置里修改密码。
                      </div>
                      <div className="flex justify-end">
                        <Button type="button" onClick={closeAddModal}>
                          完成
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {addError && <Alert variant="danger">{addError}</Alert>}
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">名字</label>
                        <Input
                          value={addForm.name}
                          onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="例如：儿子、妈妈"
                          maxLength={30}
                        />
                        <div className="text-xs text-muted-foreground">家人看到的名字，之后可用备注名再个性化。</div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">登录账号</label>
                        <Input
                          value={addForm.account}
                          onChange={(e) => setAddForm((f) => ({ ...f, account: e.target.value }))}
                          placeholder="例如：son" 
                          autoComplete="off"
                        />
                        <div className="text-xs text-muted-foreground">2-20 位小写字母、数字、- 或 _，登录时输入它。</div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">角色</label>
                        <Select
                          value={addForm.role}
                          onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value as 'child' | 'parent' }))}
                        >
                          <option value="child">孩子（只读为主）</option>
                          <option value="parent">家长（可参与管理与推荐）</option>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">初始密码</label>
                        <div className="flex gap-2">
                          <Input
                            value={addForm.password}
                            onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                            placeholder="至少 6 位"
                            autoComplete="new-password"
                          />
                          <Button type="button" variant="secondary" onClick={() => setAddForm((f) => ({ ...f, password: generateMemberPassword() }))}>
                            随机生成
                          </Button>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={closeAddModal}>
                          取消
                        </Button>
                        <Button type="button" disabled={createMember.isPending} onClick={submitAddMember}>
                          {createMember.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                          创建成员
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>,
          document.body,
        )}
    </Page>
  );
}
