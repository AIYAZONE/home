import { CircleUser, LogOut, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { useAuth } from '@/contexts/AuthContext';
import { useToastStore } from '@/stores/toast';

export default function SettingsAccount() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const pushToast = useToastStore((s) => s.push);

  const handleSignOut = async () => {
    await signOut();
    pushToast({ variant: 'default', title: '已退出登录', message: '期待你下次回来。' });
    navigate('/login');
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
          <CardContent className="space-y-3">
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

