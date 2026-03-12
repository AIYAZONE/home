import { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/useProfile';
import { useCategories } from '@/hooks/useCategories';
import { Budget, RecurringTransaction } from '@/types';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toUserMessage } from '@/lib/error';
import { normalizeCategoryName } from '@/lib/category';
import { useToastStore } from '@/stores/toast';
import { useConfirm } from '@/hooks/useConfirm';

export default function FinanceRecurring() {
  const { data: profile, isLoading: isProfileLoading } = useProfile();
  const { categories, isLoading: isCategoriesLoading, createCategoryAsync, isCreating: isCategoryCreating } = useCategories();
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const { openConfirm, dialog } = useConfirm();
  const toDateKey = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formVisibility, setFormVisibility] = useState<'family' | 'private'>('family');
  const [formOwnerMode, setFormOwnerMode] = useState<'shared' | 'me'>('me');
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [forcedCategoryId, setForcedCategoryId] = useState<string | null>(null);
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<'income' | 'expense'>('expense');
  const [formCadence, setFormCadence] = useState<'weekly' | 'monthly'>('monthly');
  const [formNextRunDate, setFormNextRunDate] = useState(() => toDateKey(new Date()));
  const [formActive, setFormActive] = useState(true);

  const categoryNameById = useMemo(() => {
    return new Map((categories ?? []).map((c) => [c.id, c.name] as const));
  }, [categories]);

  const categoryIdByName = useMemo(() => {
    return new Map((categories ?? []).map((c) => [normalizeCategoryName(c.name), c.id] as const));
  }, [categories]);

  const resolveRecurringCategoryName = useCallback((r: RecurringTransaction) => {
    const name = r.category_id ? categoryNameById.get(r.category_id) ?? r.category : r.category;
    return normalizeCategoryName(name);
  }, [categoryNameById]);

  const normalizedFormCategory = useMemo(() => normalizeCategoryName(formCategory), [formCategory]);
  const isCategoryInLibrary = useMemo(() => {
    if (isCategoriesLoading) return true;
    const key = normalizedFormCategory;
    if (!key) return true;
    return categoryIdByName.has(key);
  }, [categoryIdByName, isCategoriesLoading, normalizedFormCategory]);

  const { data: recurringTransactions, isLoading } = useQuery({
    queryKey: ['recurring_transactions', profile?.family_id],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('recurring_transactions')
        .select('*')
        .eq('family_id', profile.family_id)
        .order('next_run_date', { ascending: true });
      if (error) throw error;
      return data as RecurringTransaction[];
    },
    enabled: !!profile?.family_id,
  });

  const currentMonthStartKey = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
  }, []);

  const { data: currentMonthBudgets } = useQuery({
    queryKey: ['budgets', profile?.family_id, currentMonthStartKey],
    queryFn: async () => {
      if (!profile?.family_id) return [];
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('family_id', profile.family_id)
        .eq('month_start', currentMonthStartKey);
      if (error) throw error;
      return data as Budget[];
    },
    enabled: !!profile?.family_id,
  });

  const budgetRecommendations = useMemo(() => {
    const existing = new Set((recurringTransactions ?? []).map((r) => resolveRecurringCategoryName(r)).filter(Boolean));
    return (currentMonthBudgets ?? [])
      .map((b) => ({ category: normalizeCategoryName(b.category_name), amount: Number(b.amount) }))
      .filter((b) => b.category && Number.isFinite(b.amount) && b.amount > 0 && !existing.has(b.category))
      .sort((a, b) => b.amount - a.amount);
  }, [currentMonthBudgets, recurringTransactions, resolveRecurringCategoryName]);

  const dueRecurringTransactions = useMemo(() => {
    const all = recurringTransactions ?? [];
    const today = toDateKey(new Date());
    return all.filter((r) => r.active && r.next_run_date <= today);
  }, [recurringTransactions, toDateKey]);

  const canEdit = (r: RecurringTransaction) => {
    if (!profile?.id) return false;
    if (r.owner_user_id == null) return true;
    return r.owner_user_id === profile.id;
  };

  const openCreate = () => {
    setEditingId(null);
    setFormVisibility('family');
    setFormOwnerMode('me');
    setFormAmount('');
    setFormCategory('');
    setForcedCategoryId(null);
    setFormDescription('');
    setFormType('expense');
    setFormCadence('monthly');
    setFormNextRunDate(toDateKey(new Date()));
    setFormActive(true);
    setIsEditorOpen(true);
  };

  const openEdit = (r: RecurringTransaction) => {
    if (!canEdit(r)) {
      pushToast({ variant: 'danger', title: '无法编辑', message: '该固定项仅创建者可编辑。' });
      return;
    }
    setEditingId(r.id);
    setFormVisibility(r.visibility);
    setFormOwnerMode(r.owner_user_id == null ? 'shared' : 'me');
    setFormAmount(String(r.amount));
    setFormCategory(resolveRecurringCategoryName(r));
    setForcedCategoryId(r.category_id ?? null);
    setFormDescription(r.description ?? '');
    setFormType(r.type);
    setFormCadence(r.cadence);
    setFormNextRunDate(r.next_run_date);
    setFormActive(r.active);
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingId(null);
  };

  const toggleMutation = useMutation({
    mutationFn: async (payload: { id: string; active: boolean }) => {
      const { data, error } = await supabase
        .from('recurring_transactions')
        .update({ active: payload.active, updated_at: new Date().toISOString() })
        .eq('id', payload.id)
        .select()
        .single();
      if (error) throw error;
      return data as RecurringTransaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring_transactions'] });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '更新失败', message: toUserMessage(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recurring_transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring_transactions'] });
      pushToast({ variant: 'success', title: '已删除', message: '固定项已删除。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '删除失败', message: toUserMessage(err) });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('generate_recurring_transaction', { p_id: id });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      pushToast({ variant: 'success', title: '已生成', message: '本期交易已生成。' });
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '生成失败', message: toUserMessage(err) });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: { id: string | null; values: Omit<RecurringTransaction, 'id' | 'created_at' | 'updated_at'> }) => {
      if (payload.id) {
        const { data, error } = await supabase
          .from('recurring_transactions')
          .update({ ...payload.values, updated_at: new Date().toISOString() })
          .eq('id', payload.id)
          .select()
          .single();
        if (error) throw error;
        return data as RecurringTransaction;
      }
      const { data, error } = await supabase.from('recurring_transactions').insert(payload.values).select().single();
      if (error) throw error;
      return data as RecurringTransaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring_transactions'] });
      pushToast({ variant: 'success', title: '已保存', message: '固定项已保存。' });
      closeEditor();
    },
    onError: (err: any) => {
      pushToast({ variant: 'danger', title: '保存失败', message: toUserMessage(err) });
    },
  });

  if (isProfileLoading) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <Page>
      <PageHeader>
        <div>
          <PageTitle>固定支出/订阅</PageTitle>
          <PageDescription>到期后提醒你确认生成交易，避免每月重复手工录入。</PageDescription>
        </div>
        <PageActions>
          <Button onClick={openCreate}><Plus className="h-4 w-4" />新增固定项</Button>
        </PageActions>
      </PageHeader>

      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center" onClick={closeEditor}>
          <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>{editingId ? '编辑固定项' : '新增固定项'}</CardTitle>
                    <CardDescription>用于自动提醒并生成本期交易。</CardDescription>
                  </div>
                  <button
                    className="grid h-10 w-10 place-items-center rounded-2xl p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    onClick={closeEditor}
                    type="button"
                    aria-label="关闭"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!profile?.family_id) return;
                    const owner_user_id =
                      formVisibility === 'private' ? profile.id : formOwnerMode === 'shared' ? null : profile.id;
                    const category_id = forcedCategoryId ?? categoryIdByName.get(normalizedFormCategory) ?? null;
                    saveMutation.mutate({
                      id: editingId,
                      values: {
                        family_id: profile.family_id,
                        owner_user_id,
                        visibility: formVisibility,
                        amount: parseFloat(formAmount),
                        category: normalizedFormCategory,
                        category_id,
                        description: formDescription.trim() ? formDescription.trim() : null,
                        type: formType,
                        cadence: formCadence,
                        next_run_date: formNextRunDate,
                        active: formActive,
                      },
                    });
                  }}
                  className="space-y-4"
                >
                  {!editingId && budgetRecommendations.length > 0 ? (
                    <div className="rounded-2xl border border-border/60 bg-surface p-3">
                      <div className="text-sm font-medium">来自本月预算推荐</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {budgetRecommendations.slice(0, 6).map((b) => (
                          <Button
                            key={`${b.category}-${b.amount}`}
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              const now = new Date();
                              const nextMonthStart = toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 1));
                              setFormType('expense');
                              setFormCadence('monthly');
                              setFormCategory(b.category);
                              setFormAmount(String(b.amount));
                              setFormNextRunDate(nextMonthStart);
                            }}
                          >
                            {b.category} · {formatMoney(-b.amount, { signDisplay: 'always' })}
                          </Button>
                        ))}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">点击即可带入分类与金额（默认下次到期为下个月 1 号）。</div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">类型</label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" variant={formType === 'expense' ? 'danger' : 'secondary'} onClick={() => setFormType('expense')}>
                          支出
                        </Button>
                        <Button type="button" variant={formType === 'income' ? 'primary' : 'secondary'} onClick={() => setFormType('income')}>
                          收入
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">可见范围</label>
                      <Select
                        value={formVisibility}
                        onChange={(e) => {
                          const next = e.target.value === 'private' ? 'private' : 'family';
                          setFormVisibility(next);
                          if (next === 'private') setFormOwnerMode('me');
                        }}
                      >
                        <option value="family">家庭可见</option>
                        <option value="private">仅自己</option>
                      </Select>
                    </div>

                    {formVisibility === 'family' && (
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-sm font-medium">维护方式</label>
                        <Select value={formOwnerMode} onChange={(e) => setFormOwnerMode(e.target.value === 'shared' ? 'shared' : 'me')}>
                          <option value="me">仅我维护</option>
                          <option value="shared">共同维护</option>
                        </Select>
                        <div className="text-xs text-muted-foreground">共同维护表示家庭成员都可编辑该固定项。</div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">下次到期</label>
                      <Input type="date" required value={formNextRunDate} onChange={(e) => setFormNextRunDate(e.target.value)} />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">周期</label>
                      <Select value={formCadence} onChange={(e) => setFormCadence(e.target.value === 'weekly' ? 'weekly' : 'monthly')}>
                        <option value="monthly">每月</option>
                        <option value="weekly">每周</option>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">金额</label>
                      <Input type="number" required value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0.00" />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">分类</label>
                      <Input
                        type="text"
                        required
                        value={formCategory}
                        onChange={(e) => {
                          setFormCategory(e.target.value);
                          setForcedCategoryId(null);
                        }}
                        placeholder="例如：物业费"
                        list="recurring-category-options"
                      />
                      <datalist id="recurring-category-options">{(categories ?? []).map((c) => <option key={c.id} value={c.name} />)}</datalist>
                      {!normalizedFormCategory || isCategoryInLibrary ? null : (
                        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          <div className="min-w-0 flex-1 truncate">该分类不在分类库中，可一键加入，后续录入更省事。</div>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={isCategoryCreating}
                            onClick={async () => {
                              try {
                                const created = await createCategoryAsync({ name: normalizedFormCategory, kind: formType });
                                setFormCategory(created.name);
                                setForcedCategoryId(created.id);
                              } catch {
                                return;
                              }
                            }}
                          >
                            加入分类库
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-sm font-medium">描述（选填）</label>
                      <Input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="备注信息" />
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} />
                        启用该固定项
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="secondary" onClick={closeEditor} className="w-full sm:w-auto">
                      取消
                    </Button>
                    <Button type="submit" disabled={saveMutation.isPending} className="w-full sm:w-auto">
                      {saveMutation.isPending ? '保存中…' : '保存'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {dueRecurringTransactions.length > 0 && (
        <Alert variant="warning" className="space-y-2">
          <div className="font-medium">有 {dueRecurringTransactions.length} 个固定项到期</div>
          <div className="space-y-2">
            {dueRecurringTransactions.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <div className="truncate">
                            {resolveRecurringCategoryName(r)} · {formatMoney(r.type === 'income' ? r.amount : -r.amount, { signDisplay: 'always' })}
                  </div>
                  <div className="text-xs opacity-80">到期日：{r.next_run_date}</div>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={generateMutation.isPending}
                  onClick={() => generateMutation.mutate(r.id)}
                >
                  生成本期
                </Button>
              </div>
            ))}
          </div>
        </Alert>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>固定项列表</CardTitle>
          <CardDescription>共 {(recurringTransactions ?? []).length} 个固定项</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">加载中…</div>
          ) : (recurringTransactions?.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              暂无固定项，可在此新增，或在记账时勾选"设为固定支出/订阅"。
            </div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {(recurringTransactions ?? []).map((r) => (
                <div
                  key={r.id}
                  className={cn(
                    'flex items-center justify-between gap-4 px-4 py-3 transition-colors',
                    canEdit(r) ? 'cursor-pointer hover:bg-surface-2' : 'cursor-default',
                  )}
                  onClick={() => openEdit(r)}
                  role={canEdit(r) ? 'button' : undefined}
                  tabIndex={canEdit(r) ? 0 : -1}
                  onKeyDown={(e) => {
                    if (!canEdit(r)) return;
                    if (e.key === 'Enter' || e.key === ' ') openEdit(r);
                  }}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-sm font-medium">{resolveRecurringCategoryName(r)}</div>
                      {r.visibility === 'private' ? <Badge variant="warning">私密</Badge> : null}
                      {r.visibility === 'family' && r.owner_user_id != null && r.owner_user_id !== profile?.id ? <Badge variant="default">只读</Badge> : null}
                      {!r.active ? <Badge variant="default">已暂停</Badge> : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {r.type === 'income' ? '收入' : '支出'} · {formatMoney(r.amount)} · {r.cadence === 'monthly' ? '每月' : '每周'} · 下次到期 {r.next_run_date}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={saveMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(r);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                      编辑
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={generateMutation.isPending || r.next_run_date > new Date().toISOString().slice(0, 10)}
                      onClick={(e) => {
                        e.stopPropagation();
                        generateMutation.mutate(r.id);
                      }}
                    >
                      生成
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={toggleMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMutation.mutate({ id: r.id, active: !r.active });
                      }}
                    >
                      {r.active ? '暂停' : '启用'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deleteMutation.isPending}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const ok = await openConfirm({
                          title: '确认删除',
                          message: `确认删除固定项「${resolveRecurringCategoryName(r)}」吗？`,
                          confirmText: '删除',
                          tone: 'danger',
                        });
                        if (!ok) return;
                        deleteMutation.mutate(r.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {dialog}
    </Page>
  );
}
