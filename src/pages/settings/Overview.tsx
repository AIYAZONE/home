import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { UserProfile, Transaction } from '@/types';
import { Users, UserPlus, Copy, Check, Loader2, Shield, User, Trash2, Crown, Baby, ChevronDown, Info, Download, FileJson, FileSpreadsheet } from 'lucide-react';
import { format } from 'date-fns';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';
import { cn } from '@/lib/utils';

export default function SettingsOverview() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [inviteEmail] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState<string | null>(null);
  const roleMenuAnchorRef = useRef<HTMLElement | null>(null);
  const [roleMenuPos, setRoleMenuPos] = useState<null | { top: number; left: number }>(null);
  const [isExporting, setIsExporting] = useState(false);
  const pushToast = useToastStore((s) => s.push);

  const roleConfig: Record<string, { label: string; icon: typeof Shield; color: string; description: string }> = {
    admin: { label: '管理员', icon: Crown, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30', description: '拥有所有权限，可管理成员角色' },
    parent: { label: '家长', icon: Shield, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30', description: '可记账、邀请成员、查看家庭数据' },
    child: { label: '孩子', icon: Baby, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30', description: '可查看部分数据、参与任务' },
  };

  const generateToken = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  };

  const inviteLinkFromToken = (token: string) => `${window.location.origin}/join?token=${token}`;

  // Fetch Family Members
  const { data: members, isLoading: isMembersLoading } = useQuery({
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

  const { data: invitations, isLoading: isInvitationsLoading } = useQuery({
    queryKey: ['invitations', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Array<{
        id: string;
        token: string;
        email: string | null;
        role: 'admin' | 'parent' | 'child';
        status: 'pending' | 'accepted' | 'expired';
        expires_at: string;
        created_at: string;
      }>;
    },
    enabled: !!profile?.family_id,
  });

  // Fetch Family Details
  const { data: family } = useQuery({
    queryKey: ['family', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return null;
      const { data, error } = await supabase
        .from('families')
        .select('*')
        .eq('id', profile.family_id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.family_id,
  });

  // Create Invitation Mutation
  const createInvitationMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.family_id) throw new Error('缺少家庭信息，请先完成家庭设置。');
      
      const token = generateToken();
      
      const { data, error } = await supabase
        .from('invitations')
        .insert({
          family_id: profile.family_id,
          token,
          email: inviteEmail || null, // Optional
          created_by: profile.id,
          role: 'parent' // Default to parent for now
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setGeneratedLink(inviteLinkFromToken(data.token));
      pushToast({ variant: 'success', title: '已生成邀请链接', message: '复制后发送给家人即可加入。' });
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
    onError: (err: unknown) => {
      pushToast({ variant: 'danger', title: '生成失败', message: toUserMessage(err) });
    },
  });

  const revokeInvitationMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('invitations').update({ status: 'expired' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      pushToast({ variant: 'success', title: '已撤销', message: '邀请已设置为过期。' });
    },
    onError: (err: unknown) => {
      pushToast({ variant: 'danger', title: '撤销失败', message: toUserMessage(err) });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: 'admin' | 'parent' | 'child' }) => {
      const { error } = await supabase.rpc('update_member_role', { p_user_id: userId, p_new_role: newRole });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-members'] });
      setRoleMenuOpen(null);
      roleMenuAnchorRef.current = null;
      setRoleMenuPos(null);
      pushToast({ variant: 'success', title: '角色已更新', message: '成员角色已成功更改。' });
    },
    onError: (err: unknown) => {
      pushToast({ variant: 'danger', title: '更新失败', message: toUserMessage(err) });
    },
  });

  const closeRoleMenu = () => {
    setRoleMenuOpen(null);
    roleMenuAnchorRef.current = null;
    setRoleMenuPos(null);
  };

  const syncRoleMenuPos = () => {
    const el = roleMenuAnchorRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const menuWidth = 160;
    const margin = 8;
    let left = rect.right - menuWidth;
    left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin));
    const top = rect.bottom + 8;
    setRoleMenuPos({ top, left });
  };

  const openRoleMenu = (el: HTMLElement, memberId: string) => {
    roleMenuAnchorRef.current = el;
    setRoleMenuOpen(memberId);
    syncRoleMenuPos();
  };

  useEffect(() => {
    if (!roleMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRoleMenu();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [roleMenuOpen]);

  useEffect(() => {
    if (!roleMenuOpen) return;
    const onReposition = () => syncRoleMenuPos();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [roleMenuOpen]);

  const exportData = async (format: 'json' | 'csv') => {
    if (!profile?.family_id) return;
    setIsExporting(true);
    try {
      const [transactionsRes, categoriesRes, budgetsRes, recurringRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('family_id', profile.family_id).order('date', { ascending: false }),
        supabase.from('categories').select('*').eq('family_id', profile.family_id),
        supabase.from('budgets').select('*').eq('family_id', profile.family_id),
        supabase.from('recurring_transactions').select('*').eq('family_id', profile.family_id),
      ]);

      const data = {
        exportDate: new Date().toISOString(),
        family: {
          id: profile.family_id,
          name: family?.name,
        },
        transactions: transactionsRes.data || [],
        categories: categoriesRes.data || [],
        budgets: budgetsRes.data || [],
        recurringTransactions: recurringRes.data || [],
      };

      let content: string;
      let filename: string;
      let mimeType: string;

      if (format === 'json') {
        content = JSON.stringify(data, null, 2);
        filename = `family-data-${new Date().toISOString().slice(0, 10)}.json`;
        mimeType = 'application/json';
      } else {
        const csvRows: string[] = [];
        csvRows.push('日期,类型,分类,金额,描述,可见范围');
        (data.transactions as Transaction[]).forEach((t) => {
          csvRows.push(
            [
              new Date(t.date).toISOString().slice(0, 10),
              t.type === 'income' ? '收入' : t.type === 'expense' ? '支出' : '转账',
              `"${t.category.replace(/"/g, '""')}"`,
              t.amount,
              t.description ? `"${t.description.replace(/"/g, '""')}"` : '',
              t.visibility === 'private' ? '私密' : '家庭',
            ].join(',')
          );
        });
        content = csvRows.join('\n');
        filename = `family-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
        mimeType = 'text/csv;charset=utf-8';
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      pushToast({ variant: 'success', title: '导出成功', message: `已下载 ${filename}` });
    } catch (err: unknown) {
      pushToast({ variant: 'danger', title: '导出失败', message: toUserMessage(err) });
    } finally {
      setIsExporting(false);
    }
  };

  const handleGenerateLink = () => {
    createInvitationMutation.mutate();
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    pushToast({ variant: 'success', message: '已复制到剪贴板', title: '复制成功' });
  };

  const copyInviteToken = async (token: string) => {
    await navigator.clipboard.writeText(inviteLinkFromToken(token));
    pushToast({ variant: 'success', title: '复制成功', message: '邀请链接已复制到剪贴板。' });
  };

  if (!profile?.family_id) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>家庭设置</CardTitle>
            <CardDescription>需要先加入一个家庭后才能管理成员与邀请。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="warning">请先完成家庭设置（创建或加入）。</Alert>
            <Button className="w-full" onClick={() => navigate('/family/setup')}>
              前往家庭设置
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Page>
      <PageHeader>
        <div className="space-y-1">
          <PageTitle>家庭设置</PageTitle>
          <PageDescription>成员、邀请与基础信息的统一管理入口。</PageDescription>
        </div>
      </PageHeader>

      <Card className="bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>家庭信息</CardTitle>
          </div>
          <CardDescription>名称与创建时间。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary">
              <Users className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">{family?.name || 'My Family'}</div>
              <div className="text-sm text-muted-foreground">
                创建于 {family?.created_at ? format(new Date(family.created_at), 'yyyy年MM月dd日') : '-'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <CardTitle>家庭成员</CardTitle>
            </div>
            <Badge>{members?.length || 0} 人</Badge>
          </div>
          <CardDescription>角色与权限将影响可见数据范围。</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="space-y-2 text-sm">
                <div className="font-medium text-foreground">角色权限说明</div>
                <div className="grid gap-1.5">
                  {Object.entries(roleConfig).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <div className={cn('flex h-5 w-5 items-center justify-center rounded', cfg.color)}>
                          <Icon className="h-3 w-3" />
                        </div>
                        <span className="font-medium">{cfg.label}</span>
                        <span className="text-muted-foreground">— {cfg.description}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {isMembersLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {members?.map((member) => {
                const roleCfg = roleConfig[member.role] || roleConfig.parent;
                const RoleIcon = roleCfg.icon;
                const canChangeRole = profile?.role === 'admin' && member.id !== profile.id;
                const isMenuOpen = roleMenuOpen === member.id;

                return (
                  <div key={member.id} className="flex items-center justify-between gap-4 px-4 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-muted/60 text-muted-foreground">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {member.name || member.email?.split('@')[0] || 'Unknown User'}
                          {member.id === profile.id ? <span className="ml-2 text-xs text-muted-foreground">(我)</span> : null}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{member.email}</div>
                      </div>
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        disabled={!canChangeRole}
                        onClick={(e) => {
                          if (isMenuOpen) closeRoleMenu();
                          else openRoleMenu(e.currentTarget, member.id);
                        }}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                          roleCfg.color,
                          canChangeRole && 'hover:opacity-80 cursor-pointer',
                          !canChangeRole && 'cursor-default'
                        )}
                      >
                        <RoleIcon className="h-3.5 w-3.5" />
                        {roleCfg.label}
                        {canChangeRole && <ChevronDown className="h-3 w-3" />}
                      </button>

                      {isMenuOpen && canChangeRole && (
                        roleMenuPos &&
                        createPortal(
                          <>
                            <div className="fixed inset-0 z-[9998]" onClick={closeRoleMenu} />
                            <div
                              className="fixed z-[9999] w-40 rounded-lg border border-border bg-card p-1 shadow-lg"
                              style={{ top: roleMenuPos.top, left: roleMenuPos.left }}
                              role="menu"
                            >
                              {Object.entries(roleConfig).map(([roleKey, cfg]) => {
                                const Icon = cfg.icon;
                                const isSelected = roleKey === member.role;
                                return (
                                  <button
                                    key={roleKey}
                                    type="button"
                                    disabled={isSelected || updateRoleMutation.isPending}
                                    onClick={() => updateRoleMutation.mutate({ userId: member.id, newRole: roleKey as 'admin' | 'parent' | 'child' })}
                                    className={cn(
                                      'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                                      isSelected ? 'bg-muted/50 text-muted-foreground' : 'hover:bg-accent text-foreground'
                                    )}
                                    role="menuitem"
                                  >
                                    <Icon className="h-3.5 w-3.5" />
                                    {cfg.label}
                                    {isSelected && <span className="ml-auto text-xs">当前</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </>,
                          document.body,
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <CardTitle>邀请家人</CardTitle>
          </div>
          <CardDescription>生成邀请链接，发送给家人即可加入家庭。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!generatedLink ? (
            <Button onClick={handleGenerateLink} disabled={createInvitationMutation.isPending}>
              {createInvitationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              生成邀请链接
            </Button>
          ) : (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
              <Alert variant="success">
                <div className="space-y-2">
                  <div className="text-sm font-medium">邀请链接已生成</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground break-all">
                      {generatedLink}
                    </code>
                    <Button variant="secondary" size="sm" onClick={copyToClipboard}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied ? '已复制' : '复制'}
                    </Button>
                  </div>
                </div>
              </Alert>
              <Button variant="ghost" onClick={() => setGeneratedLink('')} className="px-0">
                生成新的链接
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>邀请列表</CardTitle>
          <CardDescription>查看已生成的邀请链接，支持复制与撤销。</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {isInvitationsLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>
          ) : (invitations?.length ?? 0) === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">暂无邀请记录</div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {invitations?.map((inv) => {
                const badgeVariant: 'success' | 'danger' | 'warning' =
                  inv.status === 'accepted' ? 'success' : inv.status === 'expired' ? 'danger' : 'warning';
                const statusLabel = inv.status === 'accepted' ? '已接受' : inv.status === 'expired' ? '已过期' : '待加入';
                return (
                  <div key={inv.id} className="flex items-center justify-between gap-4 px-4 py-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium">角色：{inv.role === 'admin' ? '管理员' : inv.role === 'child' ? '孩子' : '成员'}</div>
                        <Badge variant={badgeVariant}>{statusLabel}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        过期时间 {format(new Date(inv.expires_at), 'yyyy年MM月dd日')}
                        {inv.email ? ` · 绑定邮箱 ${inv.email}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => copyInviteToken(inv.token)}>
                        <Copy className="h-4 w-4" />
                        复制
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={inv.status !== 'pending' || revokeInvitationMutation.isPending}
                        onClick={() => {
                          const ok = window.confirm('确认撤销该邀请吗？撤销后该链接将不可再加入。');
                          if (!ok) return;
                          revokeInvitationMutation.mutate(inv.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        撤销
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            <CardTitle>数据导出</CardTitle>
          </div>
          <CardDescription>导出家庭财务数据，支持 JSON 与 CSV 格式。</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                导出的数据仅包含当前家庭的财务记录，可用于备份或迁移到其他工具。JSON 格式包含完整数据，CSV 格式仅包含交易记录。
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => exportData('csv')}
              disabled={isExporting}
            >
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              导出 CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => exportData('json')}
              disabled={isExporting}
            >
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
              导出 JSON
            </Button>
          </div>
        </CardContent>
      </Card>
    </Page>
  );
}
