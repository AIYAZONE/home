import { useMemo, useState } from 'react';
import { useCategories } from '@/hooks/useCategories';
import { Loader2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ListRow, ListRowLeading, ListRowTrailing } from '@/components/ui/list-row';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { useNavigate } from 'react-router-dom';
import { CategoryGuideCard } from '@/components/finance/CategoryGuideCard';
import { useConfirm } from '@/hooks/useConfirm';

export default function FinanceCategories() {
  const { categories, isLoading, createCategory, deleteCategory, isCreating, isDeleting } = useCategories();
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryKind, setNewCategoryKind] = useState<'expense' | 'income' | 'both'>('expense');
  const navigate = useNavigate();
  const { openConfirm, dialog } = useConfirm();

  const hasFallbackCategory = useMemo(() => {
    return (categories ?? []).some((c) => c.name.trim() === '其他' && (c.kind === 'expense' || c.kind === 'both'));
  }, [categories]);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <Page className="space-y-6 lg:space-y-5">
      <PageHeader>
        <PageTitle>分类管理</PageTitle>
        <PageDescription>分类库用于快捷选择与推荐；预算/固定支出会尽量匹配分类库，历史记录仍以分类文本为准。</PageDescription>
      </PageHeader>

      <CategoryGuideCard
        totalCategories={(categories ?? []).length}
        hasFallbackCategory={hasFallbackCategory}
        isAddingFallback={isCreating}
        onAddFallbackCategory={() => {
          if (hasFallbackCategory) return;
          createCategory({ name: '其他', kind: 'expense' });
        }}
        onGoBudgets={() => navigate('/finance/budgets')}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="overflow-hidden lg:col-span-4 lg:sticky lg:top-4 lg:self-start">
          <CardHeader className="pb-3"><CardTitle>添加分类</CardTitle></CardHeader>
          <CardContent className="pt-0 sm:px-4 sm:pb-4">
            <form
              className="grid grid-cols-1 gap-3 md:grid-cols-5"
              onSubmit={(e) => {
                e.preventDefault();
                const name = newCategoryName.trim();
                if (!name) return;
                createCategory({ name, kind: newCategoryKind });
                setNewCategoryName('');
              }}
            >
              <div className="space-y-1.5 md:col-span-3">
                <label className="text-sm font-medium">分类名称</label>
                <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="例如：餐饮、交通、房租" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium">适用类型</label>
                <select value={newCategoryKind} onChange={(e) => setNewCategoryKind(e.target.value as any)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                  <option value="expense">支出</option>
                  <option value="income">收入</option>
                  <option value="both">通用</option>
                </select>
              </div>
              <div className="flex md:col-span-5">
                <Button type="submit" className="w-full" disabled={!newCategoryName.trim() || isCreating}>
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  添加
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="overflow-hidden lg:col-span-8">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle>已有分类</CardTitle>
                <CardDescription>共 {(categories ?? []).length} 个分类</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 sm:px-4 sm:pb-4">
            {(categories?.length ?? 0) === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">暂无分类</div> : (
              <div className="divide-y divide-border rounded-xl border border-border">
                {categories?.map((c) => (
                  <ListRow
                    key={c.id}
                    className="py-4 lg:grid lg:grid-cols-[minmax(0,1fr)_120px_44px] lg:items-center lg:gap-3 lg:px-3 lg:py-2"
                  >
                    <ListRowLeading>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{c.name}</div>
                        <div className="mt-1 lg:hidden">
                          <Badge variant={c.kind === 'income' ? 'success' : c.kind === 'expense' ? 'danger' : 'default'}>
                            {c.kind === 'income' ? '收入' : c.kind === 'expense' ? '支出' : '通用'}
                          </Badge>
                        </div>
                      </div>
                    </ListRowLeading>

                    <div className="hidden lg:block">
                      <Badge variant={c.kind === 'income' ? 'success' : c.kind === 'expense' ? 'danger' : 'default'}>
                        {c.kind === 'income' ? '收入' : c.kind === 'expense' ? '支出' : '通用'}
                      </Badge>
                    </div>

                    <ListRowTrailing className="sm:justify-end lg:flex-row lg:items-center lg:justify-end lg:gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isDeleting}
                        onClick={async () => {
                          const ok = await openConfirm({
                            title: '确认删除',
                            message: `确认删除分类「${c.name}」吗？`,
                            confirmText: '删除',
                            tone: 'danger',
                          });
                          if (!ok) return;
                          deleteCategory(c.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </ListRowTrailing>
                  </ListRow>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {dialog}
    </Page>
  );
}
