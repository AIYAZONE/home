import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { cn } from '@/lib/utils';

interface InvitationInfo {
  id: string;
  family_id: string;
  role: 'admin' | 'parent' | 'child';
  status: 'pending' | 'accepted' | 'expired';
  expires_at: string;
  family_name: string;
}

const PENDING_INVITE_STORAGE_KEY = 'pendingInvite';
const PENDING_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeToken(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const tokenFromUrl = url.searchParams.get('token');
    if (tokenFromUrl) return tokenFromUrl.trim() || null;
  } catch {
    // ignore
  }

  const m = raw.match(/token=([a-f0-9]+)/i);
  if (m?.[1]) return m[1];

  const tokenLike = raw.replace(/\s+/g, '');
  if (/^[a-f0-9]{16,}$/i.test(tokenLike)) return tokenLike;
  return null;
}

function setPendingInvite(token: string) {
  const payload = { token, expiresAt: Date.now() + PENDING_INVITE_TTL_MS };
  sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, JSON.stringify(payload));
}

function getPendingInvite(): string | null {
  const raw = sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { token?: string; expiresAt?: number };
    if (!parsed?.token || !parsed?.expiresAt) return null;
    if (Date.now() > parsed.expiresAt) return null;
    return String(parsed.token);
  } catch {
    return null;
  }
}

function clearPendingInvite() {
  sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
}

export default function FamilySetup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const { user } = useAuth();
  const { data: profile, isLoading: isProfileLoading } = useProfile();

  const [searchParams, setSearchParams] = useSearchParams();
  const tokenFromQuery = searchParams.get('token');

  const [joinInput, setJoinInput] = useState('');
  const [pendingToken, setPendingToken] = useState<string | null>(() => getPendingInvite());
  const [joinError, setJoinError] = useState<string | null>(null);
  const [familyName, setFamilyName] = useState('');
  const [createFamilyError, setCreateFamilyError] = useState<string | null>(null);

  useEffect(() => {
    if (tokenFromQuery) {
      const t = normalizeToken(tokenFromQuery);
      if (t) {
        setPendingInvite(t);
        setPendingToken(t);
      }

      const next = new URLSearchParams(searchParams);
      next.delete('token');
      setSearchParams(next, { replace: true });
    }
  }, [tokenFromQuery, searchParams, setSearchParams]);

  useEffect(() => {
    const t = normalizeToken(joinInput);
    if (!t) return;
    setPendingInvite(t);
    setPendingToken(t);
  }, [joinInput]);

  useEffect(() => {
    if (!profile?.family_id) return;
    navigate('/settings', { replace: true });
  }, [navigate, profile?.family_id]);

  const activeToken = useMemo(() => {
    const fromInput = normalizeToken(joinInput);
    return fromInput || pendingToken;
  }, [joinInput, pendingToken]);

  const { data: invitation, isLoading: isInvitationLoading, error: invitationError } = useQuery({
    queryKey: ['invitation-info', activeToken],
    queryFn: async () => {
      if (!activeToken) return null;
      const { data, error } = await supabase.rpc('get_invitation_info', { p_token: activeToken });
      if (error) throw error;
      const rows = (data ?? []) as InvitationInfo[];
      if (rows.length === 0) return null;
      return rows[0];
    },
    enabled: !!activeToken,
    retry: false,
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('请先登录');
      const t = activeToken;
      if (!t) throw new Error('请输入邀请链接或 Token');
      const { error } = await supabase.rpc('accept_invitation', { p_token: t });
      if (error) throw error;
    },
    onSuccess: async () => {
      if (user?.id) queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
      clearPendingInvite();
      pushToast({ variant: 'success', title: '加入成功', message: '欢迎加入家庭。' });
      navigate('/dashboard', { replace: true });
    },
    onError: (err: any) => {
      setJoinError(toUserMessage(err));
    },
  });

  const createFamilyMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.rpc('create_family', { p_name: name }).single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      if (user?.id) queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
      pushToast({ variant: 'success', title: '创建成功', message: '家庭已创建，可以开始使用。' });
      navigate('/dashboard', { replace: true });
    },
    onError: (err: any) => {
      setCreateFamilyError(toUserMessage(err));
    },
  });

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    if (!activeToken) {
      setJoinError('请输入邀请链接或 Token');
      return;
    }
    joinMutation.mutate();
  };

  const handleCreateFamily = (e: React.FormEvent) => {
    e.preventDefault();
    const name = familyName.trim();
    if (!name) {
      setCreateFamilyError('请输入家庭名称');
      return;
    }
    setCreateFamilyError(null);
    createFamilyMutation.mutate(name);
  };

  const invitationHint = useMemo(() => {
    if (!activeToken) return null;
    if (isInvitationLoading) return '正在验证邀请…';
    if (invitation) return `邀请加入「${invitation.family_name}」`;
    if (invitationError) return '邀请无效或已过期';
    return '邀请无效或已过期';
  }, [activeToken, invitation, invitationError, isInvitationLoading]);

  if (isProfileLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <Page>
      <PageHeader>
        <div className="space-y-1">
          <PageTitle>家庭设置</PageTitle>
          <PageDescription>创建或加入一个家庭后，才能开始使用家庭数据与协作功能。</PageDescription>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle>加入家庭</CardTitle>
            </div>
            <CardDescription>粘贴邀请链接或 Token，一键加入已有家庭。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {joinError ? (
              <Alert variant="danger" className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <span className="min-w-0 flex-1">{joinError}</span>
              </Alert>
            ) : null}

            {invitationHint ? <Alert variant={invitation ? 'success' : 'warning'}>{invitationHint}</Alert> : null}

            <form onSubmit={handleJoin} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">邀请链接 / Token</label>
                <Input
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  placeholder="粘贴 https://.../join?token= 或 token"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button type="submit" className="flex-1" disabled={joinMutation.isPending || (activeToken ? false : true)}>
                  {joinMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  加入家庭
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!activeToken}
                  onClick={() => {
                    clearPendingInvite();
                    setJoinInput('');
                    setPendingToken(null);
                    setJoinError(null);
                  }}
                >
                  清除
                </Button>
              </div>
            </form>

            <div className={cn('text-xs text-muted-foreground', activeToken ? '' : 'opacity-80')}>
              没有邀请？让管理员在「设置 → 家庭设置」里生成邀请链接发送给你。
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <CardHeader>
            <CardTitle>创建家庭</CardTitle>
            <CardDescription>你将成为管理员，可邀请家人加入。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {createFamilyError ? <Alert variant="danger">{createFamilyError}</Alert> : null}
            <form onSubmit={handleCreateFamily} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">家庭名称</label>
                <Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="例如：王氏家族" />
              </div>

              <Button type="submit" className="w-full" disabled={createFamilyMutation.isPending}>
                {createFamilyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                创建家庭
              </Button>
            </form>

            <div className="text-xs text-muted-foreground">
              已有家庭邀请码？优先选择加入，避免创建重复家庭。
              <Link to="/join" className="ml-2 text-primary hover:underline">
                打开邀请页
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
