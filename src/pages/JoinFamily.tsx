import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, AlertCircle, CheckCircle, Users } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';

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

export default function JoinFamily() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const pushToast = useToastStore((s) => s.push);

  useEffect(() => {
    if (!token) return;
    const payload = { token, expiresAt: Date.now() + PENDING_INVITE_TTL_MS };
    sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, JSON.stringify(payload));
  }, [token]);

  const { data: invitation, isLoading: isChecking } = useQuery({
    queryKey: ['invitation-info', token],
    queryFn: async () => {
      if (!token) throw new Error('无效的邀请链接');

      const { data, error } = await supabase.rpc('get_invitation_info', { p_token: token });
      if (error) throw error;
      const rows = (data ?? []) as InvitationInfo[];
      if (rows.length === 0) throw new Error('邀请链接无效或已过期');
      return rows[0];
    },
    enabled: !!token,
    retry: false,
  });

  // Join Mutation
  const joinMutation = useMutation({
    mutationFn: async () => {
      if (!user || !token) return;
      const { error } = await supabase.rpc('accept_invitation', { p_token: token });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
      pushToast({ variant: 'success', title: '加入成功', message: '欢迎加入家庭。' });
      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    },
    onError: (err: any) => {
      setError(toUserMessage(err));
    },
  });

  if (!token) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-10">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle>无效的链接</CardTitle>
              <CardDescription>邀请链接缺失或不完整。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="danger" className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <span>请检查链接是否完整，或让管理员重新生成邀请。</span>
              </Alert>
              <Link
                to="/dashboard"
                className={cn(
                  'inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:brightness-95 active:brightness-90',
                )}
              >
                返回
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!invitation && !isChecking) {
     return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-10">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle>邀请无效</CardTitle>
              <CardDescription>该邀请链接无效、已过期或已被使用。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="warning">请联系管理员重新生成邀请链接。</Alert>
              <Link
                to="/dashboard"
                className={cn(
                  'inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-secondary px-4 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 active:bg-secondary/70',
                )}
              >
                返回
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-10">
          <div className="absolute inset-0 -z-10">
            <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
          </div>
          <Card className="w-full max-w-md bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary">
                <Users className="h-6 w-6" />
              </div>
              <CardTitle>加入 {invitation.family_name}</CardTitle>
              <CardDescription>请先登录或注册账号以加入该家庭。</CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                to={`/login?returnUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`}
                className={cn(
                  'inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:brightness-95 active:brightness-90',
                )}
              >
                登录 / 注册
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary">
              <Users className="h-6 w-6" />
            </div>
            <CardTitle>加入家庭</CardTitle>
            <CardDescription>
              {joinMutation.isSuccess
                ? '加入成功，正在跳转至仪表板…'
                : `确认加入「${invitation.family_name}」后，你将可访问家庭数据。`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {joinMutation.isSuccess ? (
              <Alert variant="success" className="flex items-center justify-center gap-2">
                <CheckCircle className="h-4 w-4" />
                加入成功
              </Alert>
            ) : (
              <>
                {error ? (
                  <Alert variant="danger" className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4" />
                    <span className="min-w-0 flex-1">{error}</span>
                  </Alert>
                ) : null}

                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => navigate('/dashboard')}>
                    取消
                  </Button>
                  <Button className="flex-1" onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending}>
                    {joinMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    确认加入
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
