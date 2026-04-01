import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { Check, Copy, Loader2, Trash2, UserPlus } from 'lucide-react';

type Invitation = {
  id: string;
  token: string;
  email: string | null;
  role: 'admin' | 'parent' | 'child';
  status: 'pending' | 'accepted' | 'expired';
  expires_at: string;
  created_at: string;
};

export default function SettingsInvitations() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pushToast = useToastStore((s) => s.push);
  const [searchParams, setSearchParams] = useSearchParams();
  const actionRef = useRef<string | null>(null);

  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);

  const generateToken = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  };

  const inviteLinkFromToken = (token: string) => `${window.location.origin}/join?token=${token}`;

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
      return data as Invitation[];
    },
    enabled: !!profile?.family_id,
  });

  const createInvitationMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.family_id) throw new Error('缺少家庭信息，请先完成家庭设置。');
      const token = generateToken();

      const { data, error } = await supabase
        .from('invitations')
        .insert({
          family_id: profile.family_id,
          token,
          email: null,
          created_by: profile.id,
          role: 'parent',
        })
        .select()
        .single();
      if (error) throw error;
      return data as Invitation;
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

  useEffect(() => {
    const action = searchParams.get('action');
    if (action !== 'generate') return;
    if (!profile?.family_id) return;
    if (actionRef.current === 'generate') return;
    actionRef.current = 'generate';
    const next = new URLSearchParams(searchParams);
    next.delete('action');
    setSearchParams(next, { replace: true });
    createInvitationMutation.mutate();
  }, [createInvitationMutation, profile?.family_id, searchParams, setSearchParams]);

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

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    pushToast({ variant: 'success', title: '复制成功', message: '邀请链接已复制到剪贴板。' });
  };

  if (!profile?.family_id) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>邀请管理</CardTitle>
            <CardDescription>需要先加入一个家庭后才能邀请家人。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          <PageTitle>邀请管理</PageTitle>
          <PageDescription>生成邀请链接并管理有效期。</PageDescription>
        </div>
      </PageHeader>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <CardTitle>生成邀请链接</CardTitle>
          </div>
          <CardDescription>复制链接发送给家人加入你的家庭。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => createInvitationMutation.mutate()} disabled={createInvitationMutation.isPending}>
            {createInvitationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            生成链接
          </Button>

          {generatedLink ? (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 truncate text-sm text-foreground">{generatedLink}</div>
              <Button type="button" variant="secondary" size="sm" onClick={() => copyToClipboard(generatedLink)}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? '已复制' : '复制'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>邀请记录</CardTitle>
          <CardDescription>可复制历史邀请，或手动撤销。</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {isInvitationsLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>
          ) : (invitations?.length ?? 0) === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">暂无邀请记录</div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {invitations?.map((inv) => {
                const link = inviteLinkFromToken(inv.token);
                const canRevoke = inv.status === 'pending';
                return (
                  <div key={inv.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{inv.status === 'pending' ? '待加入' : inv.status === 'accepted' ? '已加入' : '已过期'}</div>
                      <div className="truncate text-xs text-muted-foreground">{link}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => copyToClipboard(link)}>
                        <Copy className="h-4 w-4" />
                        复制
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={!canRevoke || revokeInvitationMutation.isPending}
                        onClick={() => revokeInvitationMutation.mutate(inv.id)}
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
