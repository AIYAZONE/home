import { RawPlanSchema } from './mealSchemas';
import type { MealSlot, RawPlan, RecommendResponse } from './mealSchemas';
import type { ConstraintSet } from './constraints';
import { guardAllergens } from './allergenGuard';
import { mergeSwap } from './swap';

export function assembleResponse(args: {
  jsonText: string;
  constraints: ConstraintSet;
  swap?: { meal: MealSlot; dish: string };
  basePlan?: RawPlan;
}): RecommendResponse {
  const parsed = RawPlanSchema.parse(JSON.parse(args.jsonText)); // 解析失败向上抛，handler 捕获后重试

  if (args.swap && args.basePlan) {
    const merged = mergeSwap(args.basePlan, parsed, args.swap.meal);
    const { plan, removed } = guardAllergens(merged, args.constraints.allergens);
    return { plan, removed, notes: plan.notes };
  }

  // 非换菜：三餐全空视为无效响应（通常是 AI 返回了错误信封），抛出以触发重试
  if (parsed.breakfast.length + parsed.lunch.length + parsed.dinner.length === 0) {
    throw new Error('empty plan');
  }

  const { plan, removed } = guardAllergens(parsed, args.constraints.allergens);
  return { plan, removed, notes: plan.notes };
}
