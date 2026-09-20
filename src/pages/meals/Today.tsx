import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Moon, RefreshCw, Save, Sun, Sunset, Sparkles, Utensils, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Page, PageDescription, PageHeader, PageTitle } from '@/components/ui/page';
import { useRecommendMeals, type RecommendMealsInput } from '@/hooks/useRecommendMeals';
import { useMealPlan } from '@/hooks/useMealPlan';
import { useProfile } from '@/hooks/useProfile';
import { useFamilyMealConstraints, spicyLabel, type MemberMealSummary } from '@/hooks/useFamilyMealConstraints';
import { toUserMessage } from '@/lib/error';
import type { MealPlanData, MealRemoved, MealSlot } from '@/types';

const CONSENT_KEY = 'meals_consent_v1';

const SLOTS: { key: MealSlot; label: string; icon: typeof Sun }[] = [
  { key: 'breakfast', label: '早餐', icon: Sun },
  { key: 'lunch', label: '午餐', icon: Sunset },
  { key: 'dinner', label: '晚餐', icon: Moon },
];

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function MemberConstraintRow({ member }: { member: MemberMealSummary }) {
  const hasAnything = member.allergies || member.disliked || member.liked || member.spicyLevel;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-sm">
      <span className="font-medium text-foreground">{member.displayName}</span>
      {member.allergies && (
        <Badge variant="danger">过敏：{member.allergies}</Badge>
      )}
      {member.disliked && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">忌口：{member.disliked}</span>}
      {member.liked && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">爱吃：{member.liked}</span>}
      {spicyLabel(member.spicyLevel) && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">辣度：{spicyLabel(member.spicyLevel)}</span>
      )}
      {!hasAnything && (
        <span className="text-xs text-muted-foreground">还没设置口味与健康约束</span>
      )}
    </div>
  );
}

export default function MealsToday() {
  const [date, setDate] = useState(today);
  const [direction, setDirection] = useState('');
  const [adhocIngredients, setAdhocIngredients] = useState('');
  const [plan, setPlan] = useState<MealPlanData | null>(null);
  const [removed, setRemoved] = useState<MealRemoved[]>([]);
  const [consented, setConsented] = useState(() => {
    try {
      return localStorage.getItem(CONSENT_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [swapTarget, setSwapTarget] = useState<{ meal: MealSlot; dish: string } | null>(null);

  const { recommend, isPending, error: recommendError } = useRecommendMeals();
  const { plan: savedPlan, savePlan, isSaving } = useMealPlan(date);
  const { data: profile } = useProfile();
  const canGenerate = profile?.role === 'admin' || profile?.role === 'parent';
  const { members: constraintMembers } = useFamilyMealConstraints();

  const mergeRemoved = (prev: MealRemoved[], added: MealRemoved[]): MealRemoved[] => {
    const seen = new Set(prev.map((r) => `${r.meal}-${r.name}`));
    const next = [...prev];
    for (const r of added) {
      const key = `${r.meal}-${r.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(r);
    }
    return next;
  };

  // 进入页面或切换日期时，回填已存档的今日方案
  useEffect(() => {
    if (savedPlan) {
      setPlan(savedPlan);
      setRemoved([]);
    }
  }, [savedPlan]);

  const buildInput = (extra?: Partial<RecommendMealsInput>): RecommendMealsInput => ({
    date,
    direction: direction.trim() || undefined,
    adhocIngredients: adhocIngredients.trim() || undefined,
    ...extra,
  });

  const handleRecommend = async () => {
    setSwapTarget(null);
    try {
      const res = await recommend(buildInput());
      setPlan(res.plan);
      setRemoved(res.removed ?? []);
    } catch {
      // 错误通过 recommendError 内联展示
    }
  };

  const handleSwap = async (meal: MealSlot, dish: string) => {
    if (!plan) return;
    setSwapTarget({ meal, dish });
    try {
      const res = await recommend(buildInput({ swap: { meal, dish }, basePlan: plan }));
      setPlan(res.plan);
      setRemoved((prev) => mergeRemoved(prev, res.removed ?? []));
    } catch {
      // 忽略，内联错误提示已覆盖
    } finally {
      setSwapTarget(null);
    }
  };

  const handleSave = async () => {
    if (!plan) return;
    await savePlan({ plan }).catch(() => undefined);
  };

  const agreeConsent = () => {
    try {
      localStorage.setItem(CONSENT_KEY, '1');
    } catch {
      // 忽略存储失败
    }
    setConsented(true);
  };

  const showError = recommendError ? toUserMessage(recommendError) : null;

  return (
    <Page className="mx-auto max-w-5xl">
      <PageHeader>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Utensils className="h-5 w-5 text-primary" />
            <PageTitle>今天吃什么</PageTitle>
          </div>
          <PageDescription>根据全家的口味、健康约束和手头的食材，一键生成三餐建议。不合适的菜可以单独换。</PageDescription>
        </div>
      </PageHeader>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">日期</span>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">想吃的方向（可选）</span>
              <Input
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                placeholder="例如：清淡点 / 想喝汤"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">手头食材（可选）</span>
              <Input
                value={adhocIngredients}
                onChange={(e) => setAdhocIngredients(e.target.value)}
                placeholder="例如：鸡胸肉、西红柿"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleRecommend} disabled={!consented || !canGenerate || isPending}>
              <Sparkles className="h-4 w-4" />
              {isPending ? '生成中…' : '推荐今日三餐'}
            </Button>
            {plan && (
              <Button variant="secondary" onClick={handleSave} disabled={isSaving}>
                <Save className="h-4 w-4" />
                存为今日方案
              </Button>
            )}
          </div>
          {profile && !canGenerate && (
            <p className="text-xs text-muted-foreground">需要家长或管理员账号才能生成全家的三餐方案。</p>
          )}
        </CardContent>
      </Card>

      {(constraintMembers?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">本次推荐将结合 {constraintMembers.length} 位成员的口味与健康约束</CardTitle>
              </div>
              <Link to="/settings/taste" className="text-xs text-primary hover:underline">
                去设置
              </Link>
            </div>
            <CardDescription>过敏原来自健康档案，忌口与口味来自设置里的「家庭口味偏好」。</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border/60 pt-0">
            {constraintMembers.map((m) => (
              <MemberConstraintRow key={m.userId} member={m} />
            ))}
          </CardContent>
        </Card>
      )}

      {showError && (
        <Alert variant="danger">
          <div className="flex items-center justify-between gap-3">
            <span>{showError}</span>
            <Button size="sm" variant="secondary" onClick={handleRecommend} disabled={!consented || !canGenerate || isPending}>
              <RefreshCw className="h-4 w-4" />
              再试一次
            </Button>
          </div>
        </Alert>
      )}

      {removed.length > 0 && (
        <Alert variant="warning">
          <div className="font-medium">已为你移除 {removed.length} 道含过敏原的菜</div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {removed.map((r, i) => (
              <li key={`${r.meal}-${r.name}-${i}`}>
                {r.name}（{SLOTS.find((s) => s.key === r.meal)?.label}）— {r.reason}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {isPending && !plan ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {SLOTS.map((s) => (
            <Card key={s.key}>
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-16" />
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : plan ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {SLOTS.map((slot) => {
            const Icon = slot.icon;
            const dishes = plan[slot.key] ?? [];
            return (
              <Card key={slot.key}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">{slot.label}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  {dishes.length === 0 ? (
                    <CardDescription>暂无推荐</CardDescription>
                  ) : (
                    dishes.map((dish, i) => {
                      const swapping =
                        isPending && swapTarget?.meal === slot.key && swapTarget?.dish === dish.name;
                      return (
                        <div
                          key={`${dish.name}-${i}`}
                          className="flex items-start justify-between gap-2 rounded-xl border border-border/50 bg-surface-2 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground">{dish.name}</div>
                            {dish.why && <div className="mt-0.5 text-xs text-muted-foreground">{dish.why}</div>}
                          </div>
                          {canGenerate && (
                            <button
                              type="button"
                              onClick={() => handleSwap(slot.key, dish.name)}
                              disabled={isPending}
                              className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground disabled:opacity-50"
                              aria-label={`换掉${dish.name}`}
                              title="换一个"
                            >
                              <RefreshCw className={`h-4 w-4 ${swapping ? 'animate-spin' : ''}`} />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <Badge variant="default">还没开始</Badge>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
              点上面的「推荐今日三餐」，AI 会结合全家健康档案与口味偏好给出早中晚建议。
              哪道菜不合适，可以单独点换一换。
            </p>
          </CardContent>
        </Card>
      )}

      {plan?.shopping_hint && (
        <Alert variant="info">
          <span className="font-medium">备菜提示：</span>
          {plan.shopping_hint}
        </Alert>
      )}

      {plan?.notes && (
        <p className="text-xs text-muted-foreground">{plan.notes}</p>
      )}

      {plan && (
        <p className="text-xs text-muted-foreground">以上为 AI 生成的用餐建议，不替代医生或营养师的专业意见。</p>
      )}

      {!consented && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg">
            <Card className="border border-border/60 bg-popover shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle>开始之前，先了解一下隐私</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>为了生成贴合全家的三餐建议，我们会把以下信息发送给 AI 服务商处理：</p>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>家庭成员的健康约束（过敏原、健康状况）</li>
                    <li>口味偏好（忌口、喜欢的口味、辣度）</li>
                    <li>你临时填写的食材或方向</li>
                  </ul>
                  <p>这些信息仅用于生成建议，不会用于训练模型。你可以随时在设置中修改或清除。</p>
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" onClick={agreeConsent}>
                    我知道了，开始使用
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}
