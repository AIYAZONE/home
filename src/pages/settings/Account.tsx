import { useState } from 'react';
import { CircleUser, LogOut, Shield, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useToastStore } from '@/stores/toast';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';

export default function SettingsAccount() {
  const { user, signOut } = useAuth();
  const { data: profile, refetch } = useProfile();
  const navigate = useNavigate();
  const pushToast = useToastStore((s) => s.push);
  const [isEditingName, setIsEditingName] = useState(false);
  const [name, setName] = useState(profile?.name ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    pushToast({ variant: 'default', title: '已退出登录', message: '期待你下次回来。' });
    navigate('/login');
  };

  const handleSaveName = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('users').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', user.id);
      if (error) throw error;
      await refetch();
      setIsEditingName(false);
      pushToast({ variant: 'success', title: '已保存', message: '昵称已更新。' });
    } catch (err: any) {
      pushToast({ variant: 'danger', title: '保存失败', message: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Page>
      <PageHeader>
        <div className="space-y-1">
          <PageTitle>账户中心</PageTitle>
          <PageDescription>账号信息与登录安全设置。</PageDescription>
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CircleUser className="h-5 w-5 text-primary" />
              <CardTitle>账户信息</CardTitle>
            </div>
            <CardDescription>当前登录账号的基础信息。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
              <div className="text-xs text-muted-foreground">昵称</div>
              {isEditingName ? (
                <div className="mt-2 flex gap-2">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="输入昵称" className="flex-1" />
                  <Button size="sm" onClick={handleSaveName} disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => { setName(profile?.name ?? ''); setIsEditingName(false); }}>取消</Button>
                </div>
              ) : (
                <div className="mt-1 flex items-center justify-between">
                  <div className="truncate text-sm font-semibold text-foreground">{profile?.name || '未设置'}</div>
                  <Button size="sm" variant="ghost" onClick={() => { setName(profile?.name ?? ''); setIsEditingName(true); }}>编辑</Button>
                </div>
              )}
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
              <div className="text-xs text-muted-foreground">邮箱</div>
              <div className="mt-1 truncate text-sm font-semibold text-foreground">{user?.email ?? '-'}</div>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
              <div className="text-xs text-muted-foreground">用户 ID</div>
              <div className="mt-1 truncate text-sm font-semibold text-foreground">{user?.id ?? '-'}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>登录与安全</CardTitle>
            </div>
            <CardDescription>管理会话与退出登录。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="danger" className="w-full justify-start" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
              退出登录
            </Button>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
