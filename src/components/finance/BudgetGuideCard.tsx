import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Lightbulb, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney, formatPercent } from '@/lib/format';
import type { BudgetMetrics } from '@/lib/budget';

export function BudgetGuideCard(props: {
  monthLabel: string;
  metrics: BudgetMetrics;
  topUnbudgeted: Array<[string, number]>;
  onPickCategory: (categoryName: string) => void;
}) {
  const executionBadge = useMemo(() => {
    const r = props.metrics.executionRatio;
    if (r >= 1) return 'danger';
    if (r >= 0.8) return 'warning';
    return 'success';
  }, [props.metrics.executionRatio]);

  const coverageBadge = useMemo(() => {
    const r = props.metrics.coverageRatio;
    if (r >= 0.8) return 'success';
    if (r >= 0.5) return 'warning';
    return 'danger';
  }, [props.metrics.coverageRatio]);

  const topUnbudgetedTotal = useMemo(() => props.topUnbudgeted.reduce((acc, [, v]) => acc + v, 0), [props.topUnbudgeted]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2"><Lightbulb className="h-4 w-4" />行动建议</CardTitle>
            <CardDescription>优先把“未预算分类”纳入预算，再看超支分类。</CardDescription>
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <Badge variant={executionBadge} className="whitespace-nowrap">执行率 {formatPercent(props.metrics.executionRatio * 100, 0)}</Badge>
            <Badge variant={coverageBadge} className="whitespace-nowrap">覆盖率 {formatPercent(props.metrics.coverageRatio * 100, 0)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            {props.metrics.unbudgetedSpent > 0 ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            本月未预算支出
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {props.metrics.unbudgetedSpent > 0 ? (
              <span>未预算支出合计 {formatMoney(props.metrics.unbudgetedSpent)}，先把支出最多的分类纳入预算。</span>
            ) : (
              <span>支出覆盖良好：你的支出大多已纳入预算。下一步看是否有分类超支。</span>
            )}
          </div>
          {props.topUnbudgeted.length > 0 ? (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-muted-foreground">支出较多的未预算分类（合计 {formatMoney(topUnbudgetedTotal)}）：</div>
              <div className="flex flex-wrap gap-2">
                {props.topUnbudgeted.map(([name, amount]) => (
                  <Button key={name} size="sm" variant="secondary" onClick={() => props.onPickCategory(name)}>
                    {name} {formatMoney(amount)}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <details className="rounded-xl border border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
            <span className="flex items-center gap-2"><Target className="h-4 w-4" />3 分钟上手</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
              展开
              <ChevronDown className="h-4 w-4" />
            </span>
          </summary>
          <div className="px-4 pb-4 text-sm text-muted-foreground space-y-1">
            <div>1) 回看过去 2–3 个月实际支出，从最常超支的分类开始。</div>
            <div>2) 必要支出先锁定，再给购物/娱乐等弹性支出设上限。</div>
            <div>3) 年费/保险/旅游等非月度支出，按年额/12 分摊到每月。</div>
            <div>4) 每月复盘：超支则上调预算或压缩开支。</div>
          </div>
        </details>

        <details className="rounded-xl border border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
            <span>推荐方法</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
              展开
              <ChevronDown className="h-4 w-4" />
            </span>
          </summary>
          <div className="px-4 pb-4 space-y-3">
            <div className="rounded-lg border border-border px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">50 / 30 / 20</div>
                <Badge variant="default" className="whitespace-nowrap">入门</Badge>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">50% 必要支出，30% 弹性支出，20% 储蓄/投资。适合先建立“花钱边界”。</div>
            </div>
            <div className="rounded-lg border border-border px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">零基预算 / 信封法</div>
                <Badge variant="default" className="whitespace-nowrap">强控制</Badge>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">每一笔钱都“先分配再花”，每个分类像信封，花完就停。适合支出波动大或想快速控费。</div>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
