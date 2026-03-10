import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/lib/format';
import { Category } from '@/types';

type BudgetEditorMode = 'add' | 'edit';

export type BudgetEditorInitialValue = {
  id?: string | null;
  category_name?: string | null;
  category_id?: string | null;
  amount?: number | null;
};

export function BudgetEditorModal(props: {
  open: boolean;
  mode: BudgetEditorMode;
  title?: string;
  description?: string;
  categories: Category[];
  avgMonthlySpentByCategory: Map<string, number>;
  recurringRecommendations?: Array<{ category: string; cadence: 'weekly' | 'monthly'; amount: number; monthlyAmount: number }>;
  initialValue?: BudgetEditorInitialValue | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: { id?: string | null; category_id: string | null; category_name: string; amount: number }) => void;
  onDelete?: (id: string) => void;
}) {
  const [categoryName, setCategoryName] = useState('');
  const [amount, setAmount] = useState('');

  const avg = useMemo(() => {
    const key = categoryName.trim();
    if (!key) return 0;
    return props.avgMonthlySpentByCategory.get(key) ?? 0;
  }, [categoryName, props.avgMonthlySpentByCategory]);

  const suggestedBudget = useMemo(() => Math.max(0, avg * 1.1), [avg]);

  const isValid = useMemo(() => {
    const name = categoryName.trim();
    const amountNumber = Number(amount);
    return !!name && Number.isFinite(amountNumber) && amountNumber > 0;
  }, [categoryName, amount]);

  useEffect(() => {
    if (!props.open) return;
    const init = props.initialValue ?? {};
    setCategoryName((init.category_name ?? '').trim());
    setAmount(init.amount != null ? String(init.amount) : '');
  }, [props.open, props.initialValue]);

  if (!props.open) return null;

  const canEditCategory = props.mode === 'add';
  const datalistId = 'budget-editor-category-options';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center" onClick={props.onClose}>
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle>{props.title ?? (props.mode === 'edit' ? '编辑预算' : '新增预算')}</CardTitle>
                <CardDescription>{props.description ?? '编辑以当月预算为准。'}</CardDescription>
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
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!isValid) return;
                const name = categoryName.trim();
                const amountNumber = Number(amount);
                const categoryId = props.categories.find((c) => c.name === name)?.id ?? null;
                props.onSubmit({ id: props.initialValue?.id ?? null, category_id: categoryId, category_name: name, amount: amountNumber });
              }}
            >
              {props.mode === 'add' && (props.recurringRecommendations?.length ?? 0) > 0 ? (
                <div className="rounded-2xl border border-border/60 bg-surface p-3">
                  <div className="text-sm font-medium">来自固定支出推荐</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {props.recurringRecommendations!.slice(0, 6).map((r) => (
                      <Button
                        key={`${r.category}-${r.cadence}-${r.amount}`}
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setCategoryName(r.category);
                          setAmount(String(r.monthlyAmount));
                        }}
                      >
                        {r.category} · {formatMoney(r.monthlyAmount)}
                        {r.cadence === 'weekly' ? <span className="ml-1 opacity-70">（折算）</span> : null}
                      </Button>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">点击即可带入分类与金额，然后直接保存。</div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium">分类</label>
                  <Input
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    placeholder="例如：餐饮、交通"
                    list={datalistId}
                    disabled={!canEditCategory}
                  />
                  <datalist id={datalistId}>{props.categories.map((c) => <option key={c.id} value={c.name} />)}</datalist>
                  {!canEditCategory ? <div className="text-xs text-muted-foreground">如需更换分类，请删除后重新新增。</div> : null}
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium">预算金额</label>
                  <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                  {categoryName.trim() && avg > 0 ? (
                    <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1 truncate">过去 3 个月月均 {formatMoney(avg)}，建议 {formatMoney(suggestedBudget)}</div>
                      <Button
                        className="w-full shrink-0 sm:w-auto"
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setAmount(String(Math.round(suggestedBudget * 100) / 100))}
                      >
                        填入建议
                      </Button>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">建议从“最常超支的分类”开始设置预算。</div>
                  )}
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {props.mode === 'edit' && props.initialValue?.id && props.onDelete ? (
                  <Button
                    type="button"
                    variant="danger"
                    className="w-full sm:w-auto sm:mr-auto"
                    disabled={props.isSubmitting}
                    onClick={() => {
                      const ok = window.confirm('确认删除该预算？');
                      if (!ok) return;
                      props.onDelete!(props.initialValue!.id as string);
                    }}
                  >
                    删除
                  </Button>
                ) : null}
                <Button type="button" variant="secondary" onClick={props.onClose} className="w-full sm:w-auto" disabled={props.isSubmitting}>
                  取消
                </Button>
                <Button type="submit" className="w-full sm:w-auto" disabled={!isValid || !!props.isSubmitting}>
                  {props.isSubmitting ? '保存中…' : '保存'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
