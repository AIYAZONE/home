import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageActions, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  return (
    <Page>
      <PageHeader>
        <div className="space-y-1">
          <PageTitle>家庭概览</PageTitle>
          <PageDescription>快速掌握家庭经营状况，聚焦关键指标与行动。</PageDescription>
        </div>
        <PageActions>
          <Button variant="secondary">添加待办</Button>
          <Button>快速记账</Button>
        </PageActions>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { title: '总资产', value: '¥1,234,567', trend: +12 },
          { title: '本月支出', value: '¥23,456', trend: -5 },
          { title: '家庭健康分', value: '85', trend: +2 },
          { title: '待办事项', value: '3', trend: 0, tag: '紧急' },
        ].map((stat) => {
          const positive = stat.trend > 0;
          const negative = stat.trend < 0;
          return (
            <Card key={stat.title} className="bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                  {stat.tag ? <Badge variant="warning">{stat.tag}</Badge> : null}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-end justify-between gap-3">
                  <div className="text-2xl font-semibold tracking-tight">{stat.value}</div>
                  {stat.tag ? null : (
                    <div
                      className={cn(
                        'inline-flex items-center gap-1 text-sm font-medium',
                        positive && 'text-emerald-600',
                        negative && 'text-rose-600',
                        !positive && !negative && 'text-muted-foreground',
                      )}
                    >
                      {positive && <TrendingUp className="h-4 w-4" />}
                      {negative && <TrendingDown className="h-4 w-4" />}
                      {positive ? `+${stat.trend}%` : negative ? `${stat.trend}%` : '—'}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>趋势</CardTitle>
            <CardDescription>这里将接入 Recharts，展示收支与余额趋势。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56 rounded-xl border border-border bg-muted/40" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>下一步行动</CardTitle>
            <CardDescription>把洞察落到可执行的任务上。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { title: '设置家庭预算', badge: '建议' },
              { title: '邀请家庭成员加入', badge: '关键' },
              { title: '完善分类与规则', badge: '可选' },
            ].map((item) => (
              <div key={item.title} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <div className="min-w-0 truncate text-sm font-medium">{item.title}</div>
                <Badge variant={item.badge === '关键' ? 'warning' : 'default'}>{item.badge}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
