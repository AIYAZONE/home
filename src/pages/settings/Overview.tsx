import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { Users, User, UserPlus, Download } from 'lucide-react';
import { format } from 'date-fns';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';

export default function SettingsOverview() {
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const { members, isLoading: isMembersLoading } = useFamilyMembers();

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
          <PageTitle>家庭概览</PageTitle>
          <PageDescription>家庭设置入口与状态总览。</PageDescription>
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
              <CardTitle>成员概览</CardTitle>
            </div>
            <Badge>{members?.length || 0} 人</Badge>
          </div>
          <CardDescription>备注名、角色与权限在“成员管理”中设置。</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {isMembersLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">加载中…</div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">共 {members?.length || 0} 人</div>
              <Button variant="secondary" onClick={() => navigate('/settings/members')}>
                <User className="h-4 w-4" />
                前往成员管理
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>快捷入口</CardTitle>
          </div>
          <CardDescription>将高频操作拆分到子页面，避免概览页过长。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" onClick={() => navigate('/settings/members')}>
            <User className="h-4 w-4" />
            成员管理
          </Button>
          <Button variant="secondary" onClick={() => navigate('/settings/invitations')}>
            <UserPlus className="h-4 w-4" />
            邀请管理
          </Button>
          <Button variant="secondary" onClick={() => navigate('/settings/data')}>
            <Download className="h-4 w-4" />
            数据管理
          </Button>
        </CardContent>
      </Card>
    </Page>
  );
}
