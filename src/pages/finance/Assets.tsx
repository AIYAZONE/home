import { useMemo, useState, type FormEvent } from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ListRow, ListRowLeading, ListRowTrailing } from '@/components/ui/list-row';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { Select } from '@/components/ui/select';
import { compareByLocale, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useBalanceSheet } from '@/hooks/useBalanceSheet';
import { AssetsGuideCard } from '@/components/finance/AssetsGuideCard';
import type { BalanceSheetItem } from '@/types';
import { useConfirm } from '@/hooks/useConfirm';

const kindLabel: Record<BalanceSheetItem['kind'], string> = {
  asset: '资产',
  liability: '负债',
};

const visibilityLabel: Record<BalanceSheetItem['visibility'], string> = {
  family: '家庭可见',
  private: '仅自己',
};

const defaultCategories = {
  asset: ['现金', '银行存款', '投资', '公积金', '保险现金价值', '房产', '车辆', '其他'],
  liability: ['信用卡', '房贷', '车贷', '消费贷', '其他'],
} as const;

export default function FinanceAssets() {
  const { items, fundAccounts, stats, isLoading, addItem, updateItem, deleteItem, isAdding, isUpdating, isDeleting } = useBalanceSheet();
  const { openConfirm, dialog } = useConfirm();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<BalanceSheetItem['kind']>('asset');
  const [category, setCategory] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [visibility, setVisibility] = useState<BalanceSheetItem['visibility']>('family');
  const [note, setNote] = useState('');
  const [isActive, setIsActive] = useState(true);

  const activeItems = useMemo(() => (items ?? []).filter((i) => i.is_active), [items]);
  const grouped = useMemo(() => {
    const groups = new Map<string, BalanceSheetItem[]>();
    for (const item of activeItems) {
      const key = `${item.kind}::${item.category.trim() || '未分类'}`;
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    for (const [key, list] of groups.entries()) {
      list.sort((a, b) => b.amount - a.amount);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).sort((a, b) => compareByLocale(a[0], b[0]));
  }, [activeItems]);

  const fundByKind = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of fundAccounts ?? []) {
      map.set(f.kind, (map.get(f.kind) ?? 0) + Number(f.current_amount));
    }
    return map;
  }, [fundAccounts]);

  const resetForm = () => {
    setEditingId(null);
    setKind('asset');
    setCategory('');
    setName('');
    setAmount('');
    setAsOfDate(new Date().toISOString().slice(0, 10));
    setVisibility('family');
    setNote('');
    setIsActive(true);
  };

  const onEdit = (item: BalanceSheetItem) => {
    setEditingId(item.id);
    setKind(item.kind);
    setCategory(item.category ?? '');
    setName(item.name ?? '');
    setAmount(String(item.amount ?? ''));
    setAsOfDate(item.as_of_date ?? new Date().toISOString().slice(0, 10));
    setVisibility(item.visibility);
    setNote(item.note ?? '');
    setIsActive(item.is_active);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const categoryTrimmed = category.trim();
    const nameTrimmed = name.trim();
    const amountNumber = Number(amount);
    if (!categoryTrimmed || !nameTrimmed || !Number.isFinite(amountNumber)) return;

    const payload = {
      visibility,
      kind,
      category: categoryTrimmed,
      name: nameTrimmed,
      amount: amountNumber,
      as_of_date: asOfDate,
      note: note.trim() ? note.trim() : null,
      is_active: isActive,
    } satisfies Omit<BalanceSheetItem, 'id' | 'created_at' | 'updated_at' | 'family_id' | 'owner_user_id'>;

    if (editingId) {
      updateItem(
        { id: editingId, patch: payload },
        {
          onSuccess: () => resetForm(),
        },
      );
      return;
    }

    addItem(payload, { onSuccess: () => resetForm() });
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <Page>
      <PageHeader>
        <PageTitle>资产统计</PageTitle>
        <PageDescription>统计你录入的资产/负债，并汇总 3层基金余额，方便统一管理。</PageDescription>
      </PageHeader>

      <AssetsGuideCard
        itemsCount={(items ?? []).length}
        stats={stats}
        onPrefillBankDeposit={() => {
          setEditingId(null);
          setKind('asset');
          setCategory('银行存款');
          setName('银行卡/活期');
          setAmount('');
          setAsOfDate(new Date().toISOString().slice(0, 10));
          setVisibility('family');
          setNote('');
          setIsActive(true);
        }}
        onPrefillMortgage={() => {
          setEditingId(null);
          setKind('liability');
          setCategory('房贷');
          setName('房贷');
          setAmount('');
          setAsOfDate(new Date().toISOString().slice(0, 10));
          setVisibility('family');
          setNote('');
          setIsActive(true);
        }}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">总资产（台账）</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg font-semibold">{formatMoney(stats.totalAssets)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">总负债（台账）</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg font-semibold">{formatMoney(stats.totalLiabilities)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">净资产（台账）</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg font-semibold">{formatMoney(stats.netWorth)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">3层基金余额</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg font-semibold">{formatMoney(stats.fundTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">综合净资产</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-lg font-semibold">{formatMoney(stats.combinedNetWorth)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle>{editingId ? '编辑条目' : '新增条目'}</CardTitle>
            <CardDescription>用于记录银行存款、投资、房贷等“存量资产/负债”。</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <form className="grid grid-cols-1 gap-3 md:grid-cols-6" onSubmit={onSubmit}>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium">类型</label>
                <Select
                  value={kind}
                  onChange={(e) => {
                    const nextKind = e.target.value as BalanceSheetItem['kind'];
                    setKind(nextKind);
                    setCategory('');
                  }}
                >
                  <option value="asset">资产</option>
                  <option value="liability">负债</option>
                </Select>
              </div>

              <div className="space-y-1.5 md:col-span-4">
                <label className="text-sm font-medium">分类</label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="例如：银行存款、房贷" list="balance-sheet-category-options" />
                <datalist id="balance-sheet-category-options">
                  {defaultCategories[kind].map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>

              <div className="space-y-1.5 md:col-span-3">
                <label className="text-sm font-medium">名称</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：招行活期、沪深300基金、房贷" />
              </div>

              <div className="space-y-1.5 md:col-span-3">
                <label className="text-sm font-medium">金额</label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
              </div>

              <div className="space-y-1.5 md:col-span-3">
                <label className="text-sm font-medium">统计日期</label>
                <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
              </div>

              <div className="space-y-1.5 md:col-span-3">
                <label className="text-sm font-medium">可见性</label>
                <Select
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as BalanceSheetItem['visibility'])}
                >
                  <option value="family">家庭可见</option>
                  <option value="private">仅自己</option>
                </Select>
              </div>

              <div className="space-y-1.5 md:col-span-6">
                <label className="text-sm font-medium">备注（可选）</label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：估值口径、账户尾号等" />
              </div>

              <label className="flex items-center gap-2 text-sm md:col-span-3">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <span>计入统计</span>
              </label>

              <div className="flex items-end gap-2 md:col-span-3 md:justify-end">
                {editingId ? (
                  <Button type="button" variant="secondary" onClick={resetForm}>取消</Button>
                ) : null}
                <Button type="submit" disabled={!category.trim() || !name.trim() || !amount.trim() || isAdding || isUpdating}>
                  {isAdding || isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  保存
                </Button>
              </div>
            </form>

            {(items?.length ?? 0) === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">暂无条目，先从“银行存款/房贷/投资”等开始录入。</div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>条目列表</CardTitle>
              <Badge variant="default">{(items?.length ?? 0)} 条</Badge>
            </div>
            <CardDescription>默认仅展示“计入统计”的条目。</CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {grouped.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">暂无可统计条目</div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border">
                {grouped.map(([groupKey, list]) => {
                  const [k, c] = groupKey.split('::') as [BalanceSheetItem['kind'], string];
                  const subtotal = list.reduce((acc, i) => acc + Number(i.amount), 0);
                  return (
                    <div key={groupKey} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-sm font-medium">{kindLabel[k]} · {c}</div>
                            <Badge variant={k === 'asset' ? 'success' : 'warning'}>{formatMoney(subtotal)}</Badge>
                          </div>
                          <div className="mt-3 space-y-2">
                            {list.map((item) => (
                              <ListRow key={item.id} className="rounded-2xl border border-border px-3 py-2">
                                <ListRowLeading className="items-start">
                                  <div className="min-w-0">
                                  <div className="truncate text-sm">{item.name}</div>
                                  <div className="mt-0.5 text-xs text-muted-foreground">
                                    {visibilityLabel[item.visibility]} · {item.as_of_date}{item.note ? ` · ${item.note}` : ''}
                                  </div>
                                  </div>
                                </ListRowLeading>
                                <ListRowTrailing className="sm:justify-end">
                                  <div className="flex items-center gap-2 sm:justify-end">
                                  <div className={cn('text-sm font-semibold', item.kind === 'liability' ? 'text-amber-600' : 'text-emerald-600')}>
                                    {formatMoney(Number(item.amount))}
                                  </div>
                                  <Button variant="secondary" size="sm" onClick={() => onEdit(item)}><Pencil className="h-4 w-4" /></Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={isDeleting}
                                    onClick={async () => {
                                      const ok = await openConfirm({ title: '确认删除', message: '确认删除该条目？', confirmText: '删除', tone: 'danger' });
                                      if (!ok) return;
                                      deleteItem(item.id);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                  </div>
                                </ListRowTrailing>
                              </ListRow>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>3层基金概览</CardTitle>
          <CardDescription>来自 3层基金模块的余额汇总（仅统计启用的基金）。</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="default">安全垫 {formatMoney(fundByKind.get('safety') ?? 0)}</Badge>
            <Badge variant="default">目标 {formatMoney(fundByKind.get('goal') ?? 0)}</Badge>
            <Badge variant="default">梦想 {formatMoney(fundByKind.get('dream') ?? 0)}</Badge>
          </div>
          {(fundAccounts?.length ?? 0) === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">暂无基金账户</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {fundAccounts?.map((f) => (
                <div key={f.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{f.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{f.kind === 'safety' ? '安全垫' : f.kind === 'goal' ? '目标基金' : '梦想基金'}</div>
                    </div>
                    <Badge variant="default">{formatMoney(Number(f.current_amount))}</Badge>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    目标 {formatMoney(Number(f.target_amount))}{f.target_date ? ` · ${f.target_date}` : ''}
                  </div>
                  <div className="mt-3 h-2 w-full rounded-full bg-muted/60">
                    <div
                      className="h-2 rounded-full bg-emerald-500"
                      style={{ width: `${Math.min(100, Number(f.target_amount) > 0 ? (Number(f.current_amount) / Number(f.target_amount)) * 100 : 0)}%` }}
                    />
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
