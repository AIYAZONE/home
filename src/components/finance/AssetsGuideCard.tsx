import { useMemo } from 'react';
import { ChevronDown, Lightbulb, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';

export function AssetsGuideCard(props: {
  itemsCount: number;
  stats: {
    totalAssets: number;
    totalLiabilities: number;
    netWorth: number;
    fundTotal: number;
    combinedNetWorth: number;
  };
  onPrefillBankDeposit: () => void;
  onPrefillMortgage: () => void;
}) {
  const badge = useMemo(() => {
    if (props.itemsCount === 0) return { variant: 'warning' as const, label: '先录 3 条' };
    const assets = Math.max(0, Number(props.stats.totalAssets));
    const liabilities = Math.max(0, Number(props.stats.totalLiabilities));
    const ratio = assets > 0 ? liabilities / assets : liabilities > 0 ? 1 : 0;
    if (ratio >= 0.7) return { variant: 'danger' as const, label: '负债偏高' };
    if (ratio >= 0.4) return { variant: 'warning' as const, label: '关注负债' };
    return { variant: 'success' as const, label: '结构健康' };
  }, [props.itemsCount, props.stats.totalAssets, props.stats.totalLiabilities]);

  const hint = useMemo(() => {
    if (props.itemsCount === 0) return '从“银行存款、信用卡/房贷、投资”三类开始，先录 3 条就能跑通统计。';
    if (props.stats.totalLiabilities > 0 && props.stats.totalAssets > 0 && props.stats.totalLiabilities / props.stats.totalAssets >= 0.7) {
      return '负债占比较高，建议优先把房贷/信用卡等负债科目补齐并定期更新。';
    }
    return '建议每月固定一天更新一次关键科目，保持趋势可信。';
  }, [props.itemsCount, props.stats.totalAssets, props.stats.totalLiabilities]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2"><Lightbulb className="h-4 w-4" />行动建议</CardTitle>
            <CardDescription>这里记录的是“存量台账”，不会自动从交易推导。用它来管理资产/负债结构与净资产变化。</CardDescription>
          </div>
          <Badge variant={badge.variant} className="whitespace-nowrap">{badge.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            {props.stats.netWorth >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-600" /> : <TrendingDown className="h-4 w-4 text-amber-600" />}
            快速开始
          </div>
          <div className="mt-2 text-sm text-muted-foreground">{hint}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={props.onPrefillBankDeposit}>预填：银行存款</Button>
            <Button variant="secondary" size="sm" onClick={props.onPrefillMortgage}>预填：房贷</Button>
          </div>
        </div>

        <details className="rounded-xl border border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
            <span>指标解释</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
              展开
              <ChevronDown className="h-4 w-4" />
            </span>
          </summary>
          <div className="px-4 pb-4 text-sm text-muted-foreground space-y-2">
            <div>总资产（台账）：你录入的资产合计（例如银行存款、投资、房产估值）。</div>
            <div>总负债（台账）：你录入的负债合计（例如信用卡、房贷）。</div>
            <div>净资产（台账）= 总资产 - 总负债。</div>
            <div>3层基金余额：来自基金模块的余额汇总（不等同于银行存款）。</div>
            <div>综合净资产 = 净资产（台账） + 3层基金余额（用于统一观察）。</div>
          </div>
        </details>

        <details className="rounded-xl border border-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
            <span>更新建议</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
              展开
              <ChevronDown className="h-4 w-4" />
            </span>
          </summary>
          <div className="px-4 pb-4 text-sm text-muted-foreground space-y-2">
            <div>频率：建议每月固定一天（或每季度）更新一次。</div>
            <div>统计日期：用“余额/估值对应的那天”。</div>
            <div>备注：写清估值口径（例如房产来源价/评估价），便于未来对比。</div>
            <div>避免重复：如果你把基金余额也录入台账，综合净资产会重复计入。</div>
            <div className="pt-1 text-xs text-muted-foreground">
              当前综合净资产：{formatMoney(props.stats.combinedNetWorth)}（台账净资产 {formatMoney(props.stats.netWorth)} + 基金 {formatMoney(props.stats.fundTotal)}）
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

