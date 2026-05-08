import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { useAllocationRules } from '@/hooks/useAllocationRules';
import { AllocationRule, FundAccount, FundAllocation } from '@/types';
import { RefreshCw, Loader2, Plus, Shield, Target, Sparkles, Trash2, Pencil, TrendingUp, ChevronDown, ChevronUp, Info, Lightbulb, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { format } from 'date-fns';
import { formatMoney, formatPercent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { isFundReachedTarget } from '@/lib/fund';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';
import { useConfirm } from '@/hooks/useConfirm';

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

type FundKind = 'safety' | 'goal' | 'dream';
type FundAccountPayload = Omit<FundAccount, 'id' | 'created_at' | 'updated_at' | 'family_id'>;

export default function FundManager() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const { openConfirm, dialog } = useConfirm();
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [expandedGuide, setExpandedGuide] = useState(true);
  const [selectedKind, setSelectedKind] = useState<'safety' | 'goal' | 'dream' | null>(null);
  const [adjustingFund, setAdjustingFund] = useState<FundAccount | null>(null);
  const [adjustKind, setAdjustKind] = useState<'deposit' | 'withdrawal' | 'adjustment'>('deposit');
  const [adjustDirection, setAdjustDirection] = useState<'increase' | 'decrease'>('increase');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [editingRuleFund, setEditingRuleFund] = useState<FundAccount | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [rulePercentage, setRulePercentage] = useState('');
  const [rulePriority, setRulePriority] = useState('');
  const [ruleActive, setRuleActive] = useState(true);

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

  const { data: allocations } = useQuery({
    queryKey: ['fund_allocations', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('fund_allocations')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as FundAllocation[];
    },
    enabled: !!profile?.family_id,
  });

  const {
    rules: allocationRules,
    isLoading: isRulesLoading,
    upsertRule,
    deleteRule,
    isDeleting: isDeletingRule,
  } = useAllocationRules();

  const createFundMutation = useMutation({
    mutationFn: async (payload: FundAccountPayload) => {
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
    onError: (err: unknown) => {
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
    onError: (err: unknown) => {
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
    onError: (err: unknown) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  const closeAdjust = () => {
    setAdjustingFund(null);
    setAdjustKind('deposit');
    setAdjustDirection('increase');
    setAdjustAmount('');
    setAdjustNote('');
  };

  const openAdjust = (fund: FundAccount) => {
    setAdjustingFund(fund);
    setAdjustKind('deposit');
    setAdjustDirection('increase');
    setAdjustAmount('');
    setAdjustNote('');
  };

  const adjustFundMutation = useMutation({
    mutationFn: async (payload: {
      fund: FundAccount;
      kind: 'deposit' | 'withdrawal' | 'adjustment';
      direction: 'increase' | 'decrease';
      amount: number;
      note: string | null;
    }) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');

      const absAmount = Math.round(Math.abs(payload.amount) * 100) / 100;
      if (!Number.isFinite(absAmount) || absAmount <= 0) throw new Error('请输入有效金额');

      const delta =
        payload.kind === 'deposit'
          ? absAmount
          : payload.kind === 'withdrawal'
            ? -absAmount
            : payload.direction === 'increase'
              ? absAmount
              : -absAmount;

      const current = Number(payload.fund.current_amount) || 0;
      if (current + delta < 0) throw new Error('余额不足，无法完成本次变动');

      const { error: insertError } = await supabase.from('fund_allocations').insert({
        family_id: profile.family_id,
        fund_account_id: payload.fund.id,
        transaction_id: null,
        amount: delta,
        kind: payload.kind,
        note: payload.note,
      });
      if (insertError) throw insertError;

      const { error: rpcError } = await supabase.rpc('update_fund_account_amount', {
        p_fund_id: payload.fund.id,
        p_delta: delta,
      });

      if (!rpcError) return;

      const { error: updateError } = await supabase
        .from('fund_accounts')
        .update({ current_amount: current + delta, updated_at: new Date().toISOString() })
        .eq('id', payload.fund.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fund_accounts'] });
      queryClient.invalidateQueries({ queryKey: ['fund_allocations'] });
      closeAdjust();
      pushToast({ variant: 'success', title: '已更新', message: '进度已更新。' });
    },
    onError: (err: unknown) => {
      pushToast({ variant: 'danger', title: '更新失败', message: toUserMessage(err) });
    },
  });

  useEffect(() => {
    if (!adjustingFund) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAdjust();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [adjustingFund]);

  const resetForm = () => {
    setFormName('');
    setFormKind('safety');
    setFormTargetAmount('');
    setFormTargetDate('');
    setFormDescription('');
  };

  const closeFundForm = () => {
    resetForm();
    setIsAdding(false);
    setIsEditing(null);
  };

  const openCreateFund = (kind: FundKind = 'safety') => {
    resetForm();
    setFormKind(kind);
    setIsEditing(null);
    setIsAdding(true);
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

  useEffect(() => {
    const isOpen = Boolean(isAdding || isEditing);
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeByEffect = () => {
      setFormName('');
      setFormKind('safety');
      setFormTargetAmount('');
      setFormTargetDate('');
      setFormDescription('');
      setIsAdding(false);
      setIsEditing(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeByEffect();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isAdding, isEditing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const existing = isEditing ? (funds ?? []).find((f) => f.id === isEditing) : undefined;
    const payload = {
      name: formName.trim(),
      kind: formKind,
      target_amount: parseFloat(formTargetAmount) || 0,
      current_amount: existing ? Number(existing.current_amount) : 0,
      target_date: formTargetDate || null,
      description: formDescription.trim() || null,
      priority: 0,
      is_active: true,
    } satisfies FundAccountPayload;

    if (isEditing) {
      updateFundMutation.mutate({ id: isEditing, updates: payload });
    } else {
      createFundMutation.mutate(payload);
    }
  };

  const totalTarget = (funds ?? []).reduce((acc, f) => acc + Number(f.target_amount), 0);
  const totalCurrent = (funds ?? []).reduce((acc, f) => acc + Number(f.current_amount), 0);
  const totalProgress = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0;

  const kindOrder: FundKind[] = ['safety', 'goal', 'dream'];

  const sortedFunds = useMemo(() => {
    return [...(funds ?? [])].sort((a, b) => {
      const kindDiff = kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind);
      if (kindDiff !== 0) return kindDiff;
      const priorityDiff = Number(a.priority) - Number(b.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return String(a.created_at).localeCompare(String(b.created_at));
    });
  }, [funds]);

  const fundsByKind = sortedFunds.reduce((acc, f) => {
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
      return { level: 'info', message: `安全垫进度 ${formatPercent(safetyProgress, 0)}，建议优先填满后再投资其他基金` };
    }
    return { level: 'success', message: '安全垫已达标，可以开始投资目标基金和梦想基金' };
  };

  const fundStatus = getFundStatus();

  const recentAllocationsByFund = useMemo(() => {
    const map: Record<string, FundAllocation[]> = {};
    for (const a of allocations ?? []) {
      if (!map[a.fund_account_id]) map[a.fund_account_id] = [];
      if (map[a.fund_account_id].length < 3) map[a.fund_account_id].push(a);
    }
    return map;
  }, [allocations]);

  const ruleByFundId = useMemo(() => {
    const map: Record<string, AllocationRule> = {};
    for (const r of allocationRules ?? []) {
      if (!map[r.fund_account_id]) map[r.fund_account_id] = r;
    }
    return map;
  }, [allocationRules]);

  const activeRulePercentTotal = useMemo(() => {
    return (allocationRules ?? []).filter((r) => r.is_active).reduce((acc, r) => acc + Number(r.percentage), 0);
  }, [allocationRules]);

  const pauseReachedRulesMutation = useMutation({
    mutationFn: async (ruleIds: string[]) => {
      if (!profile?.family_id) throw new Error('缺少家庭信息');
      if (ruleIds.length === 0) return;
      const { error } = await supabase
        .from('allocation_rules')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('family_id', profile.family_id)
        .in('id', ruleIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allocation_rules'] });
      pushToast({ variant: 'success', title: '已暂停', message: '已暂停所有已达标基金的存钱计划规则。' });
    },
    onError: (err: unknown) => {
      pushToast({ variant: 'danger', title: '暂停失败', message: toUserMessage(err) });
    },
  });

  const closeRuleEditor = () => {
    setEditingRuleFund(null);
    setEditingRuleId(null);
    setRulePercentage('');
    setRulePriority('');
    setRuleActive(true);
  };

  const openRuleEditor = (fund: FundAccount) => {
    const existing = ruleByFundId[fund.id];
    setEditingRuleFund(fund);
    setEditingRuleId(existing?.id ?? null);
    setRulePercentage(existing ? String(existing.percentage) : '');
    setRulePriority(existing ? String(existing.priority) : String(fund.priority));
    setRuleActive(existing ? existing.is_active : true);
  };

  useEffect(() => {
    if (!editingRuleFund) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRuleEditor();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [editingRuleFund]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle>3 层基金体系</CardTitle>
          </div>
          <Badge variant={totalProgress >= 100 ? 'success' : totalProgress >= 50 ? 'warning' : 'default'}>
            {formatPercent(totalProgress, 0)}
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
              <div className="text-lg font-semibold">{formatMoney(totalTarget)}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">已积累</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg font-semibold text-emerald-600">{formatMoney(totalCurrent)}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">总进度</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-lg font-semibold">{formatPercent(totalProgress, 1)}</div>
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
                {(['safety', 'goal', 'dream'] as const).map((kind, idx) => {
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
                      onClick={() => setSelectedKind(selectedKind === kind ? null : kind)}
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
                          <span className="font-medium">{formatPercent(kindProgress, 0)}</span>
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

        <Card className="bg-card/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base">存钱计划</CardTitle>
                <CardDescription className="truncate">把每次收入按比例分配到不同基金，形成可追溯的存钱流水。</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {(() => {
                  const reachedRuleIds = (funds ?? [])
                    .map((f) => {
                      const r = ruleByFundId[f.id];
                      if (!r?.is_active) return null;
                      if (!isFundReachedTarget(f)) return null;
                      return r.id;
                    })
                    .filter((x): x is string => Boolean(x));

                  return reachedRuleIds.length > 0 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pauseReachedRulesMutation.isPending}
                      onClick={async () => {
                        const ok = await openConfirm({
                          title: '确认暂停',
                          message: `确认暂停 ${reachedRuleIds.length} 条已达标基金规则吗？`,
                          confirmText: '暂停',
                        });
                        if (!ok) return;
                        pauseReachedRulesMutation.mutate(reachedRuleIds);
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      暂停已达标
                    </Button>
                  ) : null;
                })()}
                <Badge variant={activeRulePercentTotal > 100 ? 'danger' : activeRulePercentTotal === 100 ? 'success' : 'default'}>
                  {formatPercent(activeRulePercentTotal, 0)}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {isRulesLoading ? (
              <div className="text-sm text-muted-foreground">加载规则中…</div>
            ) : (funds ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground">创建基金后才能设置存钱计划规则。</div>
            ) : (
              <div className="space-y-3">
                {kindOrder.map((kind) => {
                  const kindFunds = [...(fundsByKind[kind] || [])].sort((a, b) => {
                    const aRule = ruleByFundId[a.id];
                    const bRule = ruleByFundId[b.id];
                    const aPriority = aRule ? Number(aRule.priority) : Number(a.priority);
                    const bPriority = bRule ? Number(bRule.priority) : Number(b.priority);
                    if (aPriority !== bPriority) return aPriority - bPriority;
                    return String(a.created_at).localeCompare(String(b.created_at));
                  });
                  if (kindFunds.length === 0) return null;

                  const kindCfg = fundKindConfig[kind];
                  return (
                    <div key={kind} className="rounded-xl border border-border/60 bg-background/40 p-3">
                      <div className="mb-3 flex items-center gap-2 border-b border-border/70 pb-2">
                        <Badge variant="default" className="text-xs">{kindCfg.label}</Badge>
                        <span className="text-xs text-muted-foreground">按优先级排序</span>
                      </div>
                      <div className="space-y-2">
                        {kindFunds.map((fund) => {
                          const cfg = fundKindConfig[fund.kind];
                          const rule = ruleByFundId[fund.id];
                          const isActive = !!rule?.is_active;
                          const pct = isActive ? Number(rule?.percentage ?? 0) : 0;
                          const isReached = isFundReachedTarget(fund);
                          return (
                            <div key={fund.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background p-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="truncate font-medium">{fund.name}</div>
                                  <Badge variant="default" className="text-xs">{cfg.label}</Badge>
                                  {isReached ? (
                                    <Badge variant="success" className="text-xs">已达标</Badge>
                                  ) : null}
                                  {isActive ? (
                                    <Badge variant="success" className="text-xs">{formatPercent(pct, 0)}</Badge>
                                  ) : (
                                    <Badge variant="default" className="text-xs">未启用</Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">优先级 {rule ? rule.priority : fund.priority}</div>
                                {isReached && isActive ? (
                                  <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">已达标仍在分配，建议暂停该规则。</div>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="secondary" onClick={() => openRuleEditor(fund)}>
                                  <Pencil className="h-4 w-4" />
                                  {rule ? '编辑' : '设置'}
                                </Button>
                                {rule ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={async () => {
                                      const ok = await openConfirm({ title: '确认删除', message: '确认删除该规则吗？', confirmText: '删除', tone: 'danger' });
                                      if (!ok) return;
                                      deleteRule(rule.id);
                                    }}
                                    disabled={isDeletingRule}
                                    aria-label="删除规则"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {activeRulePercentTotal > 100 ? (
                  <Alert variant="warning" className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium">规则总和超过 100%</div>
                      <div className="text-sm opacity-90">请调整各基金的分配比例，确保启用规则的总和不超过 100%。</div>
                    </div>
                  </Alert>
                ) : activeRulePercentTotal < 100 ? (
                  <div className="text-xs text-muted-foreground">剩余 {formatPercent(100 - activeRulePercentTotal, 0)} 的收入不会自动分配到基金。</div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        {isFundsLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
        ) : (funds?.length ?? 0) === 0 ? (
          <div className="py-8 text-center">
            <div className="mb-2 text-4xl">🏦</div>
            <div className="text-lg font-medium mb-2">开始建立你的 3 层基金结构</div>
            <div className="text-sm text-muted-foreground mb-4">建议从安全垫开始，为家庭财务建立护城河</div>
            {!isAdding && (
              <Button onClick={() => openCreateFund('safety')}>
                <Plus className="h-4 w-4" />
                创建第一个基金
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {(['safety', 'goal', 'dream'] as const).map((kind) => {
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
                        {formatMoney(kindTotal, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / {formatMoney(kindTarget, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>

                  {kindFunds.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-6 text-center">
                      <Icon className={cn('h-8 w-8 mx-auto mb-2 opacity-30', cfg.color)} />
                      <div className="text-sm text-muted-foreground mb-3">暂无 {cfg.label}</div>
                      <Button variant="secondary" size="sm" onClick={() => openCreateFund(kind)}>
                        <Plus className="h-4 w-4" />
                        添加 {cfg.label}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-muted-foreground">总进度</span>
                          <span className="font-medium">{formatPercent(kindProgress, 1)}</span>
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
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
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
                                      <span className="font-semibold text-emerald-600">{formatMoney(fund.current_amount)}</span>
                                    </div>
                                    <div className="text-sm">
                                      <span className="text-muted-foreground">目标：</span>
                                      <span className="font-semibold">{formatMoney(fund.target_amount)}</span>
                                    </div>
                                    <div className="text-sm">
                                      <span className="text-muted-foreground">进度：</span>
                                      <span className={cn('font-semibold', progress >= 100 ? 'text-emerald-600' : 'text-foreground')}>{formatPercent(progress, 1)}</span>
                                    </div>
                                  </div>
                                  <div className="mt-2 h-2 w-full rounded-full bg-muted/60">
                                    <div
                                      className={cn('h-2 rounded-full transition-all', progress >= 100 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-500' : 'bg-blue-500')}
                                      style={{ width: `${Math.min(100, progress)}%` }}
                                    />
                                  </div>
                                  {(recentAllocationsByFund[fund.id]?.length ?? 0) > 0 && (
                                    <div className="mt-3 space-y-1">
                                      {recentAllocationsByFund[fund.id].map((a) => {
                                        const label = a.kind === 'deposit' ? '存入' : a.kind === 'withdrawal' ? '取出' : '调整';
                                        const value = Number(a.amount);
                                        return (
                                          <div key={a.id} className="flex items-center justify-between text-xs text-muted-foreground">
                                            <span className="truncate">{label}{a.note ? ` · ${a.note}` : ''}</span>
                                            <span className={cn('shrink-0 font-medium', value >= 0 ? 'text-emerald-600' : 'text-destructive')}>
                                              {formatMoney(value, { signDisplay: 'always', minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => openAdjust(fund)}>
                                    <RefreshCw className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => openEdit(fund)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={deleteFundMutation.isPending}
                                    onClick={async () => {
                                      const ok = await openConfirm({ title: '确认删除', message: `确认删除「${fund.name}」吗？`, confirmText: '删除', tone: 'danger' });
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
              <Button variant="secondary" className="w-full" onClick={() => openCreateFund('safety')}>
                <Plus className="h-4 w-4" />
                添加新基金
              </Button>
            )}
          </div>
        )}

        {(isAdding || isEditing) &&
          createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 py-5 backdrop-blur-sm"
              onClick={closeFundForm}
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
                <Card className="border border-border/60 bg-popover shadow-lg">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle>{isEditing ? '编辑基金' : '创建新基金'}</CardTitle>
                        <CardDescription className="truncate">设置基金信息与目标金额。</CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" onClick={closeFundForm} aria-label="关闭">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
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
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {(Object.entries(fundKindConfig) as Array<[FundKind, (typeof fundKindConfig)[FundKind]]>).map(([key, cfg]) => {
                              const Icon = cfg.icon;
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => setFormKind(key)}
                                  className={cn(
                                    'min-h-11 flex items-center justify-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-all',
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

                      <div className="flex flex-nowrap justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={closeFundForm} className="shrink-0">
                          取消
                        </Button>
                        <Button type="submit" disabled={createFundMutation.isPending || updateFundMutation.isPending} className="shrink-0">
                          {createFundMutation.isPending || updateFundMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : null}
                          {isEditing ? '更新' : '创建'}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </div>,
            document.body,
          )}

        {adjustingFund &&
          createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
              onClick={closeAdjust}
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
                <Card className="border border-border/60 bg-popover shadow-lg">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle>更新进度</CardTitle>
                        <CardDescription className="truncate">{adjustingFund.name}</CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" onClick={closeAdjust} aria-label="关闭">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="text-sm font-medium text-foreground">类型</div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant={adjustKind === 'deposit' ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={() => setAdjustKind('deposit')}
                        >
                          存入
                        </Button>
                        <Button
                          type="button"
                          variant={adjustKind === 'withdrawal' ? 'danger' : 'secondary'}
                          size="sm"
                          onClick={() => setAdjustKind('withdrawal')}
                        >
                          取出
                        </Button>
                        <Button
                          type="button"
                          variant={adjustKind === 'adjustment' ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={() => setAdjustKind('adjustment')}
                        >
                          调整
                        </Button>
                      </div>
                      {adjustKind === 'adjustment' ? (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>方向：</span>
                          <Button
                            type="button"
                            variant={adjustDirection === 'increase' ? 'primary' : 'secondary'}
                            size="sm"
                            onClick={() => setAdjustDirection('increase')}
                          >
                            增加
                          </Button>
                          <Button
                            type="button"
                            variant={adjustDirection === 'decrease' ? 'danger' : 'secondary'}
                            size="sm"
                            onClick={() => setAdjustDirection('decrease')}
                          >
                            减少
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    <form
                      className="space-y-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!adjustingFund) return;
                        adjustFundMutation.mutate({
                          fund: adjustingFund,
                          kind: adjustKind,
                          direction: adjustDirection,
                          amount: Number(adjustAmount),
                          note: adjustNote.trim() ? adjustNote.trim() : null,
                        });
                      }}
                    >
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">金额</label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={adjustAmount}
                          onChange={(e) => setAdjustAmount(e.target.value)}
                          placeholder="0.00"
                          required
                        />
                        <div className="text-xs text-muted-foreground">
                          当前已存：{formatMoney(adjustingFund.current_amount, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">备注（可选）</label>
                        <Input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="例如：工资结余、意外维修" />
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={closeAdjust}>
                          取消
                        </Button>
                        <Button type="submit" disabled={adjustFundMutation.isPending}>
                          {adjustFundMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          确认
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </div>,
            document.body,
          )}

        {editingRuleFund &&
          createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
              onClick={closeRuleEditor}
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
                <Card className="border border-border/60 bg-popover shadow-lg">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle>存钱计划规则</CardTitle>
                        <CardDescription className="truncate">{editingRuleFund.name}</CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" onClick={closeRuleEditor} aria-label="关闭">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">启用</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border bg-background"
                          checked={ruleActive}
                          onChange={(e) => setRuleActive(e.target.checked)}
                        />
                        <span className="text-sm text-muted-foreground">收入入账后参与分配</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">分配比例（%）</label>
                        <Input
                          type="number"
                          value={rulePercentage}
                          onChange={(e) => setRulePercentage(e.target.value)}
                          placeholder="例如 20"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">优先级</label>
                        <Input
                          type="number"
                          value={rulePriority}
                          onChange={(e) => setRulePriority(e.target.value)}
                          placeholder="例如 1"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="secondary" onClick={closeRuleEditor}>
                        取消
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          if (!editingRuleFund) return;
                          const prio = rulePriority.trim() === '' ? 0 : Math.trunc(Number(rulePriority));
                          const pct = Math.round(Number(rulePercentage) * 100) / 100;

                          if (!Number.isFinite(prio)) {
                            pushToast({ variant: 'danger', title: '保存失败', message: '请输入有效优先级。' });
                            return;
                          }

                          if (ruleActive) {
                            if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
                              pushToast({ variant: 'danger', title: '保存失败', message: '请输入 0-100 之间的百分比。' });
                              return;
                            }
                          } else {
                            if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
                              pushToast({ variant: 'danger', title: '保存失败', message: '请输入 0-100 之间的百分比。' });
                              return;
                            }
                            if (!editingRuleId) {
                              closeRuleEditor();
                              return;
                            }
                          }

                          const existing = editingRuleId ? ruleByFundId[editingRuleFund.id] : undefined;
                          const existingPct = existing && existing.is_active ? Number(existing.percentage) : 0;
                          const nextPct = ruleActive ? pct : 0;
                          const nextTotal = activeRulePercentTotal - existingPct + nextPct;
                          if (nextTotal > 100.000001) {
                            pushToast({ variant: 'danger', title: '保存失败', message: '启用规则的百分比总和不能超过 100%。' });
                            return;
                          }

                          upsertRule(
                            {
                              id: editingRuleId ?? undefined,
                              fund_account_id: editingRuleFund.id,
                              percentage: pct,
                              priority: prio,
                              is_active: ruleActive,
                            },
                            { onSuccess: closeRuleEditor },
                          );
                        }}
                      >
                        保存
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>,
            document.body,
          )}
        {dialog}
      </CardContent>
    </Card>
  );
}
