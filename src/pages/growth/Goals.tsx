import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { useMemberRemarks } from '@/hooks/useMemberRemarks';
import { GrowthGoal, GrowthKeyResult } from '@/types';
import { Loader2, Plus, Target, Trash2, CheckCircle, Pause, ChevronDown } from 'lucide-react';
import { formatMemberSelectLabel } from '@/lib/member';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { Select } from '@/components/ui/select';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';

export default function GrowthGoals() {
  const { data: profile } = useProfile();
  const { members } = useFamilyMembers();
  const { remarkByMemberId } = useMemberRemarks();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [isAdding, setIsAdding] = useState(false);
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<'all' | string>('all');

  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<GrowthGoal['category']>('other');
  const [formTargetDate, setFormTargetDate] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSubjectUserId, setFormSubjectUserId] = useState<string>('');

  const isParentLike = profile?.role === 'admin' || profile?.role === 'parent';

  useEffect(() => {
    if (!profile) return;
    if (profile.role === 'child') {
      setSubjectFilter(profile.id);
      setFormSubjectUserId(profile.id);
      return;
    }
    setSubjectFilter('all');
    setFormSubjectUserId(profile.id);
  }, [profile]);

  useEffect(() => {
    setExpandedGoal(null);
  }, [subjectFilter]);

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    (members ?? []).forEach((m) => map.set(m.id, formatMemberSelectLabel(m, remarkByMemberId)));
    return map;
  }, [members, remarkByMemberId]);

  const { data: goals, isLoading } = useQuery({
    queryKey: ['growth_goals', profile?.family_id, subjectFilter],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const q = supabase
        .from('growth_goals')
        .select('*')
        .eq('family_id', profile.family_id);
      const { data, error } =
        subjectFilter === 'all'
          ? await q.order('created_at', { ascending: false })
          : await q.eq('subject_user_id', subjectFilter).order('created_at', { ascending: false });
      if (error) throw error;
      return data as GrowthGoal[];
    },
    enabled: !!profile?.family_id,
  });

  const { data: keyResults } = useQuery({
    queryKey: ['growth_key_results', expandedGoal],
    queryFn: async () => {
      if (!expandedGoal) return [];
      const { data, error } = await supabase
        .from('growth_key_results')
        .select('*')
        .eq('goal_id', expandedGoal)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as GrowthKeyResult[];
    },
    enabled: !!expandedGoal,
  });

  const createGoalMutation = useMutation({
    mutationFn: async (
      payload: Omit<GrowthGoal, 'id' | 'created_at' | 'updated_at' | 'family_id' | 'owner_user_id'>,
    ) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');
      if (!payload.subject_user_id) throw new Error('请选择成员');
      const { data, error } = await supabase
        .from('growth_goals')
        .insert({
          ...payload,
          family_id: profile.family_id,
          owner_user_id: payload.subject_user_id,
          created_by_user_id: profile.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['growth_goals'] });
      setFormTitle('');
      setFormCategory('other');
      setFormTargetDate('');
      setFormDescription('');
      setFormSubjectUserId(profile?.id ?? '');
      setIsAdding(false);
      pushToast({ variant: 'success', title: '已创建', message: '目标已创建。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '创建失败', message: toUserMessage(err) });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (payload: { id: string; status: GrowthGoal['status'] }) => {
      const { error } = await supabase
        .from('growth_goals')
        .update({ status: payload.status, updated_at: new Date().toISOString() })
        .eq('id', payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['growth_goals'] });
      pushToast({ variant: 'success', title: '状态已更新', message: '目标状态已更改。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '更新失败', message: toUserMessage(err) });
    },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('growth_goals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['growth_goals'] });
      pushToast({ variant: 'success', title: '已删除', message: '目标已删除。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createGoalMutation.mutate({
      title: formTitle.trim(),
      description: formDescription.trim() || null,
      category: formCategory,
      status: 'active',
      priority: 0,
      target_date: formTargetDate || null,
      subject_user_id: formSubjectUserId || null,
      created_by_user_id: profile?.id ?? null,
    });
  };

  const activeGoals = (goals ?? []).filter((g) => g.status === 'active');
  const completedGoals = (goals ?? []).filter((g) => g.status === 'completed');

  return (
    <Page>
      <PageHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <PageTitle>目标列表</PageTitle>
            <PageDescription>设定目标、跟踪进度、持续成长。</PageDescription>
          </div>
          {profile?.family_id && isParentLike ? (
            <div className="w-44">
              <Select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
                <option value="all">全家</option>
                {(members ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {formatMemberSelectLabel(m, remarkByMemberId)}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>
      </PageHeader>

      {isAdding && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {isParentLike ? (
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-medium">成员</label>
                    <Select value={formSubjectUserId} onChange={(e) => setFormSubjectUserId(e.target.value)}>
                      {(members ?? []).map((m) => (
                        <option key={m.id} value={m.id}>
                          {formatMemberSelectLabel(m, remarkByMemberId)}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium">目标标题</label>
                  <Input
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="例如：学会英语、减肥10斤"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">分类</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as any)}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    <option value="education">教育</option>
                    <option value="career">职业</option>
                    <option value="skill">技能</option>
                    <option value="health">健康</option>
                    <option value="finance">财务</option>
                    <option value="other">其他</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">目标日期</label>
                  <Input type="date" value={formTargetDate} onChange={(e) => setFormTargetDate(e.target.value)} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium">描述（可选）</label>
                  <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="详细说明" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setIsAdding(false)}>取消</Button>
                <Button type="submit" disabled={createGoalMutation.isPending}>
                  {createGoalMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  创建
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
      ) : (goals?.length ?? 0) === 0 ? (
        <Card className="py-12">
          <CardContent className="text-center">
            <Target className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <div className="mt-4 text-lg font-medium">还没有目标</div>
            <div className="mt-1 text-sm text-muted-foreground mb-4">创建你的第一个成长目标吧！</div>
            <Button onClick={() => setIsAdding(true)}>
              <Plus className="h-4 w-4" />
              创建目标
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {!isAdding && (
            <Button onClick={() => setIsAdding(true)}>
              <Plus className="h-4 w-4" />
              新目标
            </Button>
          )}

          {activeGoals.length > 0 && (
            <div>
              <div className="mb-3 text-sm font-medium text-muted-foreground">进行中 ({activeGoals.length})</div>
              <div className="space-y-3">
                {activeGoals.map((goal) => (
                  <Card key={goal.id}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{goal.title}</div>
                            {goal.subject_user_id ? (
                              <Badge variant="default" className="text-xs">
                                {memberNameById.get(goal.subject_user_id) || goal.subject_user_id.slice(0, 6)}
                              </Badge>
                            ) : null}
                          </div>
                          {goal.description && <div className="text-sm text-muted-foreground mt-1">{goal.description}</div>}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => updateStatusMutation.mutate({ id: goal.id, status: 'completed' })}>
                            <CheckCircle className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => updateStatusMutation.mutate({ id: goal.id, status: 'paused' })}>
                            <Pause className="h-4 w-4 text-amber-600" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteGoalMutation.mutate(goal.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {completedGoals.length > 0 && (
            <div>
              <div className="mb-3 text-sm font-medium text-muted-foreground">已完成 ({completedGoals.length})</div>
              <div className="space-y-3">
                {completedGoals.map((goal) => (
                  <Card key={goal.id} className="opacity-70">
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="font-medium">{goal.title}</div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => deleteGoalMutation.mutate(goal.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
