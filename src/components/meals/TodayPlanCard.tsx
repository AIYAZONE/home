import { Link } from 'react-router-dom';
import { ArrowRight, Utensils } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMealPlan } from '@/hooks/useMealPlan';
import type { MealPlanData, MealSlot } from '@/types';

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function slotSummary(plan: MealPlanData | null, slot: MealSlot): string {
  const dishes = plan?.[slot] ?? [];
  if (dishes.length === 0) return '未定';
  const first = dishes[0]?.name ?? '';
  return dishes.length > 1 ? `${first} 等 ${dishes.length} 道` : first;
}

export function TodayPlanCard() {
  const today = ymd(new Date());
  const yesterday = ymd(new Date(Date.now() - 86400000));
  const { plan: todayPlan, isLoading: loadingToday } = useMealPlan(today);
  const { plan: yesterdayPlan } = useMealPlan(yesterday);

  const hasToday = !!todayPlan;

  return (
    <Card className="bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Utensils className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">今日三餐</CardTitle>
        </div>
        <CardDescription>轻留痕，只给全家一个大致参考。</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {loadingToday ? (
          <div className="text-sm text-muted-foreground">加载中…</div>
        ) : hasToday ? (
          <div className="space-y-1 text-sm">
            <div>
              <span className="text-muted-foreground">早：</span>
              {slotSummary(todayPlan, 'breakfast')}
            </div>
            <div>
              <span className="text-muted-foreground">午：</span>
              {slotSummary(todayPlan, 'lunch')}
            </div>
            <div>
              <span className="text-muted-foreground">晚：</span>
              {slotSummary(todayPlan, 'dinner')}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">还没决定今天吃什么。</div>
        )}

        {!hasToday && (
          <Link
            to="/meals"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            去决定今天吃什么
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}

        {hasToday && yesterdayPlan && (
          <div className="border-t border-border pt-2 text-xs text-muted-foreground">
            昨天：{slotSummary(yesterdayPlan, 'breakfast')} · {slotSummary(yesterdayPlan, 'lunch')} ·{' '}
            {slotSummary(yesterdayPlan, 'dinner')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
