import { useMemo } from 'react';
import { ChevronDown, Lightbulb, Tags } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function CategoryGuideCard(props: {
  totalCategories: number;
  hasFallbackCategory: boolean;
  onAddFallbackCategory: () => void;
  onGoBudgets: () => void;
  isAddingFallback: boolean;
}) {
  const stateBadge = useMemo(() => {
    if (props.totalCategories === 0) return { variant: 'warning' as const, label: '先建 8–12 个' };
    if (props.totalCategories < 6) return { variant: 'warning' as const, label: '偏少' };
    if (props.totalCategories > 30) return { variant: 'danger' as const, label: '偏多' };
    return { variant: 'success' as const, label: '合适' };
  }, [props.totalCategories]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2"><Lightbulb className="h-4 w-4" />行动建议</CardTitle>
            <CardDescription>分类要“少而稳定”，保证预算、趋势统计、家庭协作都能长期一致。</CardDescription>
          </div>
          <Badge variant={stateBadge.variant} className="whitespace-nowrap">{stateBadge.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-sm font-medium"><Tags className="h-4 w-4" />快速开始</div>
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            <div>1) 先建家庭必需支出：餐饮/交通/房租/教育/医疗/保险/水电网。</div>
            <div>2) 留 1 个“其他”兜底，避免出现大量零散命名。</div>
            <div>3) 不建议频繁删除分类，历史对比会失真；优先新增更合适的分类承接新支出。</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={props.hasFallbackCategory || props.isAddingFallback}
              onClick={props.onAddFallbackCategory}
            >
              添加“其他（支出）”
            </Button>
            <Button variant="secondary" size="sm" onClick={props.onGoBudgets}>去设置预算</Button>
          </div>
          {props.hasFallbackCategory ? <div className="mt-2 text-xs text-muted-foreground">已存在“其他”分类。</div> : null}
        </div>

        <details className="rounded-xl border border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
            <span>分类怎么设计（3 条原则）</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
              展开
              <ChevronDown className="h-4 w-4" />
            </span>
          </summary>
          <div className="px-4 pb-4 text-sm text-muted-foreground space-y-1">
            <div>1) 少而稳定：控制在 8–20 个，方便长期对比。</div>
            <div>2) 名称统一：避免“餐饮/吃饭/外卖”混用，建议固定用一个称呼。</div>
            <div>3) 先大类后细分：先跑通预算，再按需要拆分（例如“餐饮 → 外卖/聚餐”）。</div>
          </div>
        </details>

        <details className="rounded-xl border border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
            <span>类型说明（收入/支出/通用）</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
              展开
              <ChevronDown className="h-4 w-4" />
            </span>
          </summary>
          <div className="px-4 pb-4 text-sm text-muted-foreground space-y-1">
            <div>收入：工资、奖金、副业等。</div>
            <div>支出：日常开销与账单。</div>
            <div>通用：适用于两边的分类（例如“其他”、或你们希望统一口径的类目）。</div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

