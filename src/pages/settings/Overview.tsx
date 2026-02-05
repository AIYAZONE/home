import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { UserProfile } from '@/types';
import { Users, UserPlus, Copy, Check, Loader2, Shield, User, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';

export default function SettingsOverview() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [inviteEmail] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const pushToast = useToastStore((s) => s.push);

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
    onError: (err: any) => {
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
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '撤销失败', message: toUserMessage(err) });
    },
  });

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
          {isMembersLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {members?.map((member) => (
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

                  <div className="flex items-center gap-2">
                    {member.role === 'admin' ? (
                      <Badge className="gap-1" variant="warning">
                        <Shield className="h-3 w-3" />
                        管理员
                      </Badge>
                    ) : (
                      <Badge variant="success">成员</Badge>
                    )}
                  </div>
                </div>
              ))}
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
                const badgeVariant = inv.status === 'accepted' ? 'success' : inv.status === 'expired' ? 'danger' : 'warning';
                const statusLabel = inv.status === 'accepted' ? '已接受' : inv.status === 'expired' ? '已过期' : '待加入';
                return (
                  <div key={inv.id} className="flex items-center justify-between gap-4 px-4 py-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium">角色：{inv.role === 'admin' ? '管理员' : inv.role === 'child' ? '孩子' : '成员'}</div>
                        <Badge variant={badgeVariant as any}>{statusLabel}</Badge>
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
    </Page>
  );
}
