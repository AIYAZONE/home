import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { FundAccount, AllocationRule } from '@/types';
import { Loader2, Plus, Shield, Target, Sparkles, Trash2, Pencil, TrendingUp, ChevronDown, ChevronUp, Info, Lightbulb, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';

const fundKindConfig: Record<string, { 
  label: string; 
  icon: typeof Shield; 
  color: string; 
  bgColor: string; 
  borderColor: string;
  description: string;
  detail: string;
  suggestedAmount: string;
  priority: number;
  examples: string[];
}> = {
  safety: { 
    label: '安全垫', 
    icon: Shield, 
    color: 'text-emerald-600', 
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    description: '应急储备金，家庭财务的护城河',
    detail: '安全垫是家庭财务的第一道防线，用于应对失业、疾病、意外等突发情况。建议优先填满安全垫后再投资其他基金。',
    suggestedAmount: '建议金额：3-6 个月家庭必要支出（约 3-10 万元）',
    priority: 1,
    examples: ['失业期间的生活费', '突发医疗支出', '家庭紧急维修', '意外事故备用金'],
  },
  goal: { 
    label: '目标基金', 
    icon: Target, 
    color: 'text-blue-600', 
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800',
    description: '中长期目标，人生重要里程碑',
    detail: '目标基金用于规划人生中的重要目标，如子女教育、购房首付、养老金等。建议根据目标时间合理配置资金。',
    suggestedAmount: '根据具体目标设定，建议分阶段积累',
    priority: 2,
    examples: ['子女教育基金', '购房首付', '养老储备', '换车基金'],
  },
  dream: { 
    label: '梦想基金', 
    icon: Sparkles, 
    color: 'text-purple-600', 
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    borderColor: 'border-purple-200 dark:border-purple-800',
    description: '人生梦想，让生活更有意义',
    detail: '梦想基金用于实现人生中"想做但非必须"的事情，如创业、环球旅行、学习新技能等。在安全垫和目标基金稳定后再投入。',
    suggestedAmount: '根据梦想规模设定，可分多个小目标',
    priority: 3,
    examples: ['创业启动资金', '环球旅行', '学习新技能', '高品质生活升级'],
  },
};

export default function FundManager() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [expandedGuide, setExpandedGuide] = useState(true);
  const [selectedKind, setSelectedKind] = useState<'safety' | 'goal' | 'dream' | null>(null);

  const [formName, setFormName] = useState('');
  const [formKind, setFormKind] = useState<'safety' | 'goal' | 'dream'>('safety');
  const [formTargetAmount, setFormTargetAmount] = useState('');
  const [formTargetDate, setFormTargetDate] = useState('');
  const [formDescription, setFormDescription] = useState('');

  const { data: funds, isLoading: isFundsLoading } = useQuery({
    queryKey: ['fund_accounts', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('fund_accounts')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('is_active', true)
        .order('kind', { ascending: true })
        .order('priority', { ascending: true });
      if (error) throw error;
      return data as FundAccount[];
    },
    enabled: !!profile?.family_id,
  });

  const createFundMutation = useMutation({
    mutationFn: async (payload: Omit<FundAccount, 'id' | 'created_at' | 'updated_at'>) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');
      const { data, error } = await supabase
        .from('fund_accounts')
        .insert({ ...payload, family_id: profile.family_id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund_accounts'] });
      resetForm();
      setIsAdding(false);
      pushToast({ variant: 'success', title: '已创建', message: '基金账户已创建。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '创建失败', message: toUserMessage(err) });
    },
  });

  const updateFundMutation = useMutation({
    mutationFn: async (payload: { id: string; updates: Partial<FundAccount> }) => {
      const { data, error } = await supabase
        .from('fund_accounts')
        .update({ ...payload.updates, updated_at: new Date().toISOString() })
        .eq('id', payload.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund_accounts'] });
      resetForm();
      setIsEditing(null);
      pushToast({ variant: 'success', title: '已更新', message: '基金账户已更新。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '更新失败', message: toUserMessage(err) });
    },
  });

  const deleteFundMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fund_accounts').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund_accounts'] });
      pushToast({ variant: 'success', title: '已删除', message: '基金账户已删除。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  const resetForm = () => {
    setFormName('');
    setFormKind('safety');
    setFormTargetAmount('');
    setFormTargetDate('');
    setFormDescription('');
  };

  const openEdit = (fund: FundAccount) => {
    setIsAdding(false);
    setIsEditing(fund.id);
    setFormName(fund.name);
    setFormKind(fund.kind);
    setFormTargetAmount(String(fund.target_amount));
    setFormTargetDate(fund.target_date || '');
    setFormDescription(fund.description || '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: formName.trim(),
      kind: formKind,
      target_amount: parseFloat(formTargetAmount) || 0,
      current_amount: 0,
      target_date: formTargetDate || null,
      description: formDescription.trim() || null,
      priority: 0,
      is_active: true,
    };

    if (isEditing) {
      updateFundMutation.mutate({ id: isEditing, updates: payload });
    } else {
      createFundMutation.mutate(payload as any);
    }
  };

  const totalTarget = (funds ?? []).reduce((acc, f) => acc + Number(f.target_amount), 0);
  const totalCurrent = (funds ?? []).reduce((acc, f) => acc + Number(f.current_amount), 0);
  const totalProgress = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0;

  const fundsByKind = (funds ?? []).reduce((acc, f) => {
    if (!acc[f.kind]) acc[f.kind] = [];
    acc[f.kind].push(f);
    return acc;
  }, {} as Record<string, FundAccount[]>);

  const safetyFunds = fundsByKind['safety'] || [];
  const safetyTotal = safetyFunds.reduce((acc, f) => acc + Number(f.current_amount), 0);
  const safetyTarget = safetyFunds.reduce((acc, f) => acc + Number(f.target_amount), 0);
  const safetyProgress = safetyTarget > 0 ? (safetyTotal / safetyTarget) * 100 : 0;

  const getFundStatus = () => {
    if (safetyFunds.length === 0) {
      return { level: 'warning', message: '建议优先创建安全垫基金，建立家庭财务护城河' };
    }
    if (safetyProgress < 100) {
      return { level: 'info', message: `安全垫进度 ${safetyProgress.toFixed(0)}%，建议优先填满后再投资其他基金` };
    }
    return { level: 'success', message: '安全垫已达标，可以开始投资目标基金和梦想基金' };
  };

  const fundStatus = getFundStatus();

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle>3 层基金体系</CardTitle>
          </div>
          <Badge variant={totalProgress >= 100 ? 'success' : totalProgress >= 50 ? 'warning' : 'default'}>
            {totalProgress.toFixed(0)}%
          </Badge>
        </div>
        <CardDescription>安全垫 → 目标基金 → 梦想基金，按优先级积累家庭财富</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">总目标</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg font-semibold">¥{totalTarget.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">已积累</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg font-semibold text-emerald-600">¥{totalCurrent.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">总进度</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg font-semibold">{totalProgress.toFixed(1)}%</div>
              <div className="mt-2 h-2 w-full rounded-full bg-muted/60">
                <div
                  className={cn('h-2 rounded-full transition-all', totalProgress >= 100 ? 'bg-emerald-500' : totalProgress >= 50 ? 'bg-amber-500' : 'bg-blue-500')}
                  style={{ width: `${Math.min(100, totalProgress)}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {fundStatus.level === 'warning' && (
          <Alert variant="warning" className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">建议先建立安全垫</div>
              <div className="text-sm opacity-90">{fundStatus.message}</div>
            </div>
          </Alert>
        )}
        {fundStatus.level === 'info' && (
          <Alert variant="info" className="flex items-start gap-3">
            <Info className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">安全垫建设中</div>
              <div className="text-sm opacity-90">{fundStatus.message}</div>
            </div>
          </Alert>
        )}
        {fundStatus.level === 'success' && (
          <Alert variant="success" className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">安全垫已达标 🎉</div>
              <div className="text-sm opacity-90">{fundStatus.message}</div>
            </div>
          </Alert>
        )}

        <div className="rounded-xl border border-border bg-muted/30">
          <button
            type="button"
            onClick={() => setExpandedGuide(!expandedGuide)}
            className="flex w-full items-center justify-between p-4 text-left"
          >
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              <span className="font-medium">什么是 3 层基金？如何规划？</span>
            </div>
            {expandedGuide ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
          {expandedGuide && (
            <div className="border-t border-border px-4 pb-4 pt-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {['safety', 'goal', 'dream'].map((kind, idx) => {
                  const cfg = fundKindConfig[kind];
                  const Icon = cfg.icon;
                  const kindFunds = fundsByKind[kind] || [];
                  const kindTotal = kindFunds.reduce((acc, f) => acc + Number(f.current_amount), 0);
                  const kindTarget = kindFunds.reduce((acc, f) => acc + Number(f.target_amount), 0);
                  const kindProgress = kindTarget > 0 ? (kindTotal / kindTarget) * 100 : 0;

                  return (
                    <div
                      key={kind}
                      className={cn(
                        'rounded-xl border-2 p-4 transition-all cursor-pointer',
                        cfg.borderColor,
                        selectedKind === kind ? 'ring-2 ring-primary/50' : 'hover:shadow-md'
                      )}
                      onClick={() => setSelectedKind(selectedKind === kind ? null : kind as any)}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', cfg.bgColor)}>
                          <Icon className={cn('h-5 w-5', cfg.color)} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{cfg.label}</span>
                            <Badge variant="default" className="text-xs">第 {idx + 1} 优先</Badge>
                          </div>
                        </div>
                      </div>

                      <p className="text-sm text-muted-foreground mb-3">{cfg.description}</p>

                      <div className="space-y-2 text-sm">
                        <div className="font-medium text-foreground">{cfg.suggestedAmount}</div>
                        <div className="text-muted-foreground">{cfg.detail}</div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-border">
                        <div className="text-xs text-muted-foreground mb-2">常见用途：</div>
                        <div className="flex flex-wrap gap-1">
                          {cfg.examples.map((ex, i) => (
                            <Badge key={i} variant="default" className="text-xs">{ex}</Badge>
                          ))}
                        </div>
                      </div>

                      {kindFunds.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">进度</span>
                            <span className="font-medium">{kindProgress.toFixed(0)}%</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full rounded-full bg-muted/60">
                            <div
                              className={cn('h-1.5 rounded-full', kindProgress >= 100 ? 'bg-emerald-500' : 'bg-blue-500')}
                              style={{ width: `${Math.min(100, kindProgress)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 p-4">
                <div className="flex items-start gap-2">
                  <Lightbulb className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium text-amber-800 dark:text-amber-200">建议的积累顺序</div>
                    <ol className="mt-2 space-y-1 text-amber-700 dark:text-amber-300">
                      <li>1. <strong>优先填满安全垫</strong> — 这是家庭财务的底线，建议存够 3-6 个月生活费</li>
                      <li>2. <strong>逐步积累目标基金</strong> — 根据目标时间远近，合理分配资金</li>
                      <li>3. <strong>最后投入梦想基金</strong> — 在前两层稳定后，为梦想买单</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {(isAdding || isEditing) && (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-2 pb-2 border-b border-border">
              <Plus className="h-4 w-4" />
              <span className="font-medium">{isEditing ? '编辑基金' : '创建新基金'}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">基金名称 *</label>
                <Input
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="例如：应急储备金、教育基金"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">基金类型 *</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(fundKindConfig).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFormKind(key as any)}
                        className={cn(
                          'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                          formKind === key 
                            ? cn(cfg.bgColor, cfg.color, 'ring-2 ring-primary/50', cfg.borderColor) 
                            : 'bg-muted/50 hover:bg-muted border border-transparent'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">{fundKindConfig[formKind].suggestedAmount}</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">目标金额 *</label>
                <Input
                  type="number"
                  value={formTargetAmount}
                  onChange={(e) => setFormTargetAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">目标日期（可选）</label>
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
                  placeholder="备注信息，例如：用于应对突发失业情况"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  resetForm();
                  setIsAdding(false);
                  setIsEditing(null);
                }}
              >
                取消
              </Button>
              <Button type="submit" disabled={createFundMutation.isPending || updateFundMutation.isPending}>
                {createFundMutation.isPending || updateFundMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {isEditing ? '更新' : '创建'}
              </Button>
            </div>
          </form>
        )}

        {isFundsLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
        ) : (funds?.length ?? 0) === 0 ? (
          <div className="py-8 text-center">
            <div className="mb-2 text-4xl">🏦</div>
            <div className="text-lg font-medium mb-2">开始建立你的 3 层基金结构</div>
            <div className="text-sm text-muted-foreground mb-4">建议从安全垫开始，为家庭财务建立护城河</div>
            {!isAdding && (
              <Button onClick={() => { resetForm(); setFormKind('safety'); setIsAdding(true); }}>
                <Plus className="h-4 w-4" />
                创建第一个基金
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {['safety', 'goal', 'dream'].map((kind) => {
              const kindFunds = fundsByKind[kind] || [];
              const cfg = fundKindConfig[kind];
              const Icon = cfg.icon;
              const kindTotal = kindFunds.reduce((acc, f) => acc + Number(f.current_amount), 0);
              const kindTarget = kindFunds.reduce((acc, f) => acc + Number(f.target_amount), 0);
              const kindProgress = kindTarget > 0 ? (kindTotal / kindTarget) * 100 : 0;

              return (
                <div key={kind} className={cn('rounded-xl border-2 p-4', cfg.borderColor)}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', cfg.bgColor)}>
                        <Icon className={cn('h-5 w-5', cfg.color)} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-lg">{cfg.label}</span>
                          <Badge variant="default" className="text-xs">第 {cfg.priority} 优先</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">{cfg.description}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">已存 / 目标</div>
                      <div className="font-semibold">
                        ¥{kindTotal.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} / ¥{kindTarget.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>

                  {kindFunds.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-6 text-center">
                      <Icon className={cn('h-8 w-8 mx-auto mb-2 opacity-30', cfg.color)} />
                      <div className="text-sm text-muted-foreground mb-3">暂无 {cfg.label}</div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => { resetForm(); setFormKind(kind as any); setIsAdding(true); }}
                      >
                        <Plus className="h-4 w-4" />
                        添加 {cfg.label}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-muted-foreground">总进度</span>
                          <span className="font-medium">{kindProgress.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted/60">
                          <div
                            className={cn('h-2 rounded-full transition-all', kindProgress >= 100 ? 'bg-emerald-500' : kindProgress >= 50 ? 'bg-amber-500' : 'bg-blue-500')}
                            style={{ width: `${Math.min(100, kindProgress)}%` }}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        {kindFunds.map((fund) => {
                          const progress = fund.target_amount > 0 ? (Number(fund.current_amount) / Number(fund.target_amount)) * 100 : 0;
                          return (
                            <div key={fund.id} className="rounded-xl border border-border bg-card/50 p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{fund.name}</span>
                                    {fund.target_date && (
                                      <Badge variant="default">{format(new Date(fund.target_date), 'yyyy-MM-dd')}</Badge>
                                    )}
                                    {progress >= 100 && (
                                      <Badge variant="success">已达标</Badge>
                                    )}
                                  </div>
                                  {fund.description && (
                                    <div className="mt-1 text-sm text-muted-foreground">{fund.description}</div>
                                  )}
                                  <div className="mt-3 flex items-center gap-4">
                                    <div className="text-sm">
                                      <span className="text-muted-foreground">已存：</span>
                                      <span className="font-semibold text-emerald-600">¥{Number(fund.current_amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="text-sm">
                                      <span className="text-muted-foreground">目标：</span>
                                      <span className="font-semibold">¥{Number(fund.target_amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="text-sm">
                                      <span className="text-muted-foreground">进度：</span>
                                      <span className={cn('font-semibold', progress >= 100 ? 'text-emerald-600' : 'text-foreground')}>{progress.toFixed(1)}%</span>
                                    </div>
                                  </div>
                                  <div className="mt-2 h-2 w-full rounded-full bg-muted/60">
                                    <div
                                      className={cn('h-2 rounded-full transition-all', progress >= 100 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-500' : 'bg-blue-500')}
                                      style={{ width: `${Math.min(100, progress)}%` }}
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => openEdit(fund)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={deleteFundMutation.isPending}
                                    onClick={() => {
                                      const ok = window.confirm(`确认删除「${fund.name}」吗？`);
                                      if (!ok) return;
                                      deleteFundMutation.mutate(fund.id);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {!isAdding && !isEditing && (
              <Button variant="secondary" className="w-full" onClick={() => { resetForm(); setIsAdding(true); }}>
                <Plus className="h-4 w-4" />
                添加新基金
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
