import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { GrowthGoal, GrowthKeyResult } from '@/types';
import { Loader2, Plus, Target, Trash2, Pencil, CheckCircle, Pause, XCircle, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';

const categoryConfig: Record<string, { label: string; color: string }> = {
  education: { label: '教育', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30' },
  career: { label: '职业', color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30' },
  skill: { label: '技能', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
  health: { label: '健康', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
  finance: { label: '财务', color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/30' },
  other: { label: '其他', color: 'text-gray-600 bg-gray-50 dark:bg-gray-950/30' },
};

const statusConfig: Record<string, { label: string; icon: typeof Target; color: string }> = {
  active: { label: '进行中', icon: Target, color: 'text-blue-600' },
  completed: { label: '已完成', icon: CheckCircle, color: 'text-emerald-600' },
  paused: { label: '已暂停', icon: Pause, color: 'text-amber-600' },
  cancelled: { label: '已取消', icon: XCircle, color: 'text-gray-500' },
};

export default function GrowthOverview() {
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [isAdding, setIsAdding] = useState(false);
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState<GrowthGoal['category']>('other');
  const [formTargetDate, setFormTargetDate] = useState('');

  const { data: goals, isLoading: isGoalsLoading } = useQuery({
    queryKey: ['growth_goals', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('growth_goals')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('created_at', { ascending: false });
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
    mutationFn: async (payload: Omit<GrowthGoal, 'id' | 'created_at' | 'updated_at'>) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');
      const { data, error } = await supabase
        .from('growth_goals')
        .insert({ ...payload, family_id: profile.family_id, owner_user_id: profile.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['growth_goals'] });
      resetForm();
      setIsAdding(false);
      pushToast({ variant: 'success', title: '已创建', message: '目标已创建。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '创建失败', message: toUserMessage(err) });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (payload: { id: string; status: GrowthGoal['status'] }) => {
      const { data, error } = await supabase
        .from('growth_goals')
        .update({ status: payload.status, updated_at: new Date().toISOString() })
        .eq('id', payload.id)
        .select()
        .single();
      if (error) throw error;
      return data;
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

  const resetForm = () => {
    setFormTitle('');
    setFormDescription('');
    setFormCategory('other');
    setFormTargetDate('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createGoalMutation.mutate({
      title: formTitle.trim(),
      description: formDescription.trim() || null,
      category: formCategory,
      status: 'active',
      priority: 0,
      target_date: formTargetDate || null,
    } as any);
  };

  const activeGoals = (goals ?? []).filter((g) => g.status === 'active');
  const completedGoals = (goals ?? []).filter((g) => g.status === 'completed');
  const otherGoals = (goals ?? []).filter((g) => g.status !== 'active' && g.status !== 'completed');

  if (isProfileLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

  if (!profile?.family_id) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>成长规划</CardTitle>
            <CardDescription>需要先加入家庭后才能设定成长目标。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <Page>
      <PageHeader>
        <div className="space-y-1">
          <PageTitle>成长规划</PageTitle>
          <PageDescription>设定目标、跟踪进度、持续成长。</PageDescription>
        </div>
        <PageActions>
          <Button onClick={() => { resetForm(); setIsAdding(true); }}>
            <Plus className="h-4 w-4" />
            新目标
          </Button>
        </PageActions>
      </PageHeader>

      {isAdding && (
        <Card>
          <CardHeader>
            <CardTitle>创建新目标</CardTitle>
            <CardDescription>设定一个清晰的目标，并定义关键结果来衡量进度。</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium text-foreground">目标标题</label>
                  <Input
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="例如：学会英语、减肥10斤、存够首付"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">分类</label>
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
                  <label className="text-sm font-medium text-foreground">目标日期</label>
                  <Input
                    type="date"
                    value={formTargetDate}
                    onChange={(e) => setFormTargetDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium text-foreground">描述（可选）</label>
                  <Input
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="详细说明目标内容"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => { resetForm(); setIsAdding(false); }}>
                  取消
                </Button>
                <Button type="submit" disabled={createGoalMutation.isPending}>
                  {createGoalMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  创建
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isGoalsLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
      ) : (goals?.length ?? 0) === 0 ? (
        <Card className="py-12">
          <CardContent className="text-center">
            <Target className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <div className="mt-4 text-lg font-medium">还没有目标</div>
            <div className="mt-1 text-sm text-muted-foreground">创建你的第一个成长目标吧！</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {activeGoals.length > 0 && (
            <div>
              <div className="mb-3 text-sm font-medium text-muted-foreground">进行中 ({activeGoals.length})</div>
              <div className="space-y-3">
                {activeGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    isExpanded={expandedGoal === goal.id}
                    onToggle={() => setExpandedGoal(expandedGoal === goal.id ? null : goal.id)}
                    onStatusChange={(status) => updateStatusMutation.mutate({ id: goal.id, status })}
                    onDelete={() => deleteGoalMutation.mutate(goal.id)}
                    keyResults={keyResults ?? []}
                  />
                ))}
              </div>
            </div>
          )}

          {completedGoals.length > 0 && (
            <div>
              <div className="mb-3 text-sm font-medium text-muted-foreground">已完成 ({completedGoals.length})</div>
              <div className="space-y-3">
                {completedGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    isExpanded={expandedGoal === goal.id}
                    onToggle={() => setExpandedGoal(expandedGoal === goal.id ? null : goal.id)}
                    onStatusChange={(status) => updateStatusMutation.mutate({ id: goal.id, status })}
                    onDelete={() => deleteGoalMutation.mutate(goal.id)}
                    keyResults={keyResults ?? []}
                  />
                ))}
              </div>
            </div>
          )}

          {otherGoals.length > 0 && (
            <div>
              <div className="mb-3 text-sm font-medium text-muted-foreground">其他 ({otherGoals.length})</div>
              <div className="space-y-3">
                {otherGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    isExpanded={expandedGoal === goal.id}
                    onToggle={() => setExpandedGoal(expandedGoal === goal.id ? null : goal.id)}
                    onStatusChange={(status) => updateStatusMutation.mutate({ id: goal.id, status })}
                    onDelete={() => deleteGoalMutation.mutate(goal.id)}
                    keyResults={keyResults ?? []}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}

function GoalCard({
  goal,
  isExpanded,
  onToggle,
  onStatusChange,
  onDelete,
  keyResults,
}: {
  goal: GrowthGoal;
  isExpanded: boolean;
  onToggle: () => void;
  onStatusChange: (status: GrowthGoal['status']) => void;
  onDelete: () => void;
  keyResults: GrowthKeyResult[];
}) {
  const catCfg = categoryConfig[goal.category] || categoryConfig.other;
  const statusCfg = statusConfig[goal.status] || statusConfig.active;
  const StatusIcon = statusCfg.icon;

  const progress = keyResults.length > 0
    ? keyResults.reduce((acc, kr) => acc + (kr.current_value / kr.target_value) * 100, 0) / keyResults.length
    : 0;

  return (
    <Card className={cn('transition-colors', goal.status === 'completed' && 'opacity-70')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <button
              onClick={onToggle}
              className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-accent"
            >
              <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{goal.title}</CardTitle>
                <Badge className={cn('text-xs', catCfg.color)}>{catCfg.label}</Badge>
              </div>
              {goal.description && (
                <CardDescription className="mt-1">{goal.description}</CardDescription>
              )}
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <StatusIcon className={cn('h-3 w-3', statusCfg.color)} />
                  {statusCfg.label}
                </div>
                {goal.target_date && (
                  <div>目标日期：{format(new Date(goal.target_date), 'yyyy-MM-dd')}</div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {goal.status !== 'completed' && (
              <Button variant="ghost" size="sm" onClick={() => onStatusChange('completed')}>
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              </Button>
            )}
            {goal.status === 'active' && (
              <Button variant="ghost" size="sm" onClick={() => onStatusChange('paused')}>
                <Pause className="h-4 w-4 text-amber-600" />
              </Button>
            )}
            {goal.status === 'paused' && (
              <Button variant="ghost" size="sm" onClick={() => onStatusChange('active')}>
                <Target className="h-4 w-4 text-blue-600" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">关键结果 ({keyResults.length})</span>
              <span className="font-medium">{formatPercent(progress, 0)}</span>
            </div>
            {keyResults.length > 0 && (
              <div className="h-2 w-full rounded-full bg-muted/60">
                <div
                  className={cn('h-2 rounded-full', progress >= 100 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-500' : 'bg-blue-500')}
                  style={{ width: `${Math.min(100, progress)}%` }}
                />
              </div>
            )}
            {keyResults.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                暂无关键结果
              </div>
            ) : (
              <div className="space-y-2">
                {keyResults.map((kr) => {
                  const krProgress = kr.target_value > 0 ? (kr.current_value / kr.target_value) * 100 : 0;
                  return (
                    <div key={kr.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{kr.title}</span>
                        <span className="text-sm text-muted-foreground">
                          {kr.current_value}/{kr.target_value}{kr.unit || ''}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-muted/60">
                        <div
                          className={cn('h-1.5 rounded-full', krProgress >= 100 ? 'bg-emerald-500' : 'bg-blue-500')}
                          style={{ width: `${Math.min(100, krProgress)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
