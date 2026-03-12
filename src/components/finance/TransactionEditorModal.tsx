import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, X } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { compareByLocale, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useRecurringTransactions } from '@/hooks/useRecurringTransactions';
import { Category, Transaction } from '@/types';
import { useConfirm } from '@/hooks/useConfirm';

type TransactionEditorMode = 'add' | 'edit';

export type TransactionEditorValue = {
  visibility: 'family' | 'private';
  amount: number;
  category: string;
  description: string | null;
  type: 'income' | 'expense';
  date: string;
};

export type TransactionEditorSubmitPayload = {
  visibility: 'family' | 'private';
  amount: number;
  category: string;
  description: string | null;
  type: 'income' | 'expense';
  date: string;
};

export type TransactionEditorRecurringPayload = {
  cadence: 'weekly' | 'monthly';
  next_run_date: string;
  active: true;
};

export function TransactionEditorModal(props: {
  open: boolean;
  mode: TransactionEditorMode;
  familyId: string | null | undefined;
  transactions?: Transaction[] | null;
  categories?: Category[] | null;
  initialValue?: Partial<TransactionEditorValue> | null;
  title?: string;
  description?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: TransactionEditorSubmitPayload, options: { recurring: TransactionEditorRecurringPayload | null }) => void;
}) {
  const { openConfirm, dialog } = useConfirm();
  const navigate = useNavigate();
  const [visibility, setVisibility] = useState<'family' | 'private'>('family');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [recurringActive, setRecurringActive] = useState(false);
  const [recurringCadence, setRecurringCadence] = useState<'weekly' | 'monthly'>('monthly');

  const { recurringTransactions, isGenerating, generateRecurring } = useRecurringTransactions({ familyId: props.familyId ?? null });

  const latestTransaction = useMemo(() => (props.transactions ?? [])[0] ?? null, [props.transactions]);

  const frequentCategoryTemplates = useMemo(() => {
    const byCategory = new Map<string, number>();
    (props.transactions ?? [])
      .filter((t) => (type === 'income' ? t.type === 'income' : t.type === 'expense'))
      .forEach((t) => {
        const key = t.category.trim();
        if (!key) return;
        byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
      });
    return Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .slice(0, 8);
  }, [props.transactions, type]);

  const recommendedCategories = useMemo(() => {
    const q = description.trim().toLowerCase();
    const all = props.transactions ?? [];
    const candidates = q.length >= 2 ? all.filter((t) => (t.description ?? '').toLowerCase().includes(q)) : all.filter((t) => t.type === type);
    const scores = new Map<string, number>();
    candidates.forEach((t) => {
      const key = t.category.trim();
      if (!key) return;
      scores.set(key, (scores.get(key) ?? 0) + 1);
    });
    const current = category.trim();
    const picked = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .filter((name) => name !== current)
      .slice(0, 3);
    if (picked.length > 0) return picked;
    return frequentCategoryTemplates.slice(0, 3);
  }, [props.transactions, description, type, category, frequentCategoryTemplates]);

  const quickCategories = useMemo(() => {
    return (props.categories ?? [])
      .filter((c) => c.kind === 'both' || c.kind === type)
      .sort((a, b) => compareByLocale(a.name, b.name));
  }, [props.categories, type]);

  const dueRecurringTransactions = useMemo(() => {
    if (props.mode !== 'add') return [];
    const all = recurringTransactions ?? [];
    return all.filter((r) => r.active && r.next_run_date <= date);
  }, [recurringTransactions, date, props.mode]);

  useEffect(() => {
    if (!props.open) return;
    const v = props.initialValue ?? {};
    setVisibility(v.visibility ?? 'family');
    setAmount(v.amount != null ? String(v.amount) : '');
    setCategory(v.category ?? '');
    setDescription(v.description ?? '');
    setType(v.type ?? 'expense');
    setDate(v.date ? new Date(v.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setRecurringActive(false);
    setRecurringCadence('monthly');
  }, [props.open, props.initialValue]);

  if (!props.open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center" onClick={props.onClose}>
        <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
          <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle>{props.title ?? (props.mode === 'edit' ? '编辑交易' : '添加新交易')}</CardTitle>
                <CardDescription>{props.description ?? '快速录入'}</CardDescription>
              </div>
              <button
                className="grid h-10 w-10 place-items-center rounded-2xl p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={props.onClose}
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
                const payload: TransactionEditorSubmitPayload = {
                  visibility,
                  amount: parseFloat(amount),
                  category: category.trim(),
                  description: description.trim() ? description.trim() : null,
                  type,
                  date: new Date(`${date}T12:00:00`).toISOString(),
                };
                const recurring: TransactionEditorRecurringPayload | null =
                  props.mode === 'add' && recurringActive
                    ? { cadence: recurringCadence, next_run_date: date, active: true }
                    : null;
                props.onSubmit(payload, { recurring });
              }}
              className="space-y-4"
            >
              {props.mode === 'add' && dueRecurringTransactions.length > 0 && (
                <Alert variant="warning" className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">有 {dueRecurringTransactions.length} 个固定项到期</div>
                    <Button type="button" size="sm" variant="secondary" onClick={() => navigate('/finance/recurring')}>
                      去管理
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {dueRecurringTransactions.slice(0, 5).map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3">
                        <div className="min-w-0 text-sm">
                          <div className="truncate">
                            {r.category} · {formatMoney(r.type === 'income' ? r.amount : -r.amount, { signDisplay: 'always' })}
                          </div>
                          <div className="text-xs opacity-80">到期日：{r.next_run_date}</div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          disabled={isGenerating}
                          onClick={async () => {
                            const ok = await openConfirm({
                              title: '确认生成',
                              message: `确认生成「${r.category}」本期交易吗？`,
                              confirmText: '生成',
                            });
                            if (!ok) return;
                            generateRecurring(r.id);
                          }}
                        >
                          生成本期
                        </Button>
                      </div>
                    ))}
                  </div>
                </Alert>
              )}

              {props.mode === 'add' && latestTransaction && (
                <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-surface-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-muted-foreground">
                    最近：{formatMoney(latestTransaction.type === 'income' ? latestTransaction.amount : -latestTransaction.amount, { signDisplay: 'always' })} · {latestTransaction.category}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setAmount(String(latestTransaction.amount));
                      setCategory(latestTransaction.category);
                      setDescription(latestTransaction.description ?? '');
                      setType(latestTransaction.type === 'income' ? 'income' : 'expense');
                      setVisibility(latestTransaction.visibility ?? 'family');
                    }}
                  >
                    重复
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">类型</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant={type === 'expense' ? 'danger' : 'secondary'} onClick={() => setType('expense')}>
                      支出
                    </Button>
                    <Button type="button" variant={type === 'income' ? 'primary' : 'secondary'} onClick={() => setType('income')}>
                      收入
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">可见范围</label>
                  <Select value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
                    <option value="family">家庭可见</option>
                    <option value="private">仅自己</option>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">日期</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="pl-9" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">金额</label>
                  <Input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium">分类</label>
                  {recommendedCategories.length > 0 && (
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <div className="text-xs text-muted-foreground">推荐</div>
                      {recommendedCategories.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className={cn('rounded-full border px-3 py-1 text-xs font-medium', name === category ? 'border-primary/30 bg-primary/10' : 'border-border bg-card')}
                          onClick={() => setCategory(name)}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                  <Input type="text" required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="例如：餐饮、交通" list="category-options" />
                  <datalist id="category-options">{(props.categories ?? []).map((c) => <option key={c.id} value={c.name} />)}</datalist>
                  {quickCategories.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {quickCategories.slice(0, 8).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={cn('rounded-full border px-3 py-1 text-xs font-medium', c.name === category ? 'border-primary/30 bg-primary/10' : 'border-border bg-card')}
                          onClick={() => setCategory(c.name)}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium">描述（选填）</label>
                  <Input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="备注信息" />
                </div>

                {props.mode === 'add' && (
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-sm font-medium">固定支出/订阅（可选）</label>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={recurringActive} onChange={(e) => setRecurringActive(e.target.checked)} />
                        设为固定支出/订阅
                      </label>
                      {recurringActive && (
                        <>
                          <select
                            value={recurringCadence}
                            onChange={(e) => setRecurringCadence(e.target.value === 'weekly' ? 'weekly' : 'monthly')}
                            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                          >
                            <option value="monthly">每月</option>
                            <option value="weekly">每周</option>
                          </select>
                          <div className="text-xs text-muted-foreground">保存后在到期日提醒你确认生成交易。</div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={props.onClose} className="w-full sm:w-auto">
                  取消
                </Button>
                <Button type="submit" disabled={props.isSubmitting} className="w-full sm:w-auto">
                  {props.isSubmitting ? '保存中…' : '保存'}
                </Button>
              </div>
            </form>
          </CardContent>
          </Card>
        </div>
      </div>
      {dialog}
    </>
  );
}
