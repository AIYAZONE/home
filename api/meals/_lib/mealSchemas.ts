import { z } from 'zod';

export const MealSlot = z.enum(['breakfast', 'lunch', 'dinner']);
export type MealSlot = z.infer<typeof MealSlot>;

export const DishSchema = z.object({
  name: z.string().min(1),
  why: z.string().default(''),
  // 做法步骤（可选，兼容存量方案）；过敏原拦截会一并扫描
  steps: z.array(z.string().min(1)).max(8).optional(),
});
export type Dish = z.infer<typeof DishSchema>;

// AI 直接返回的结构（未经拦截）
export const RawPlanSchema = z.object({
  breakfast: z.array(DishSchema).default([]),
  lunch: z.array(DishSchema).default([]),
  dinner: z.array(DishSchema).default([]),
  shopping_hint: z.string().optional(),
  notes: z.string().optional(),
});
export type RawPlan = z.infer<typeof RawPlanSchema>;

export const RecommendRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  servingUserIds: z.array(z.string().uuid()).max(50).optional(),
  adhocIngredients: z.string().max(500).optional(),
  direction: z.string().max(200).optional(),
  swap: z.object({ meal: MealSlot, dish: z.string().min(1) }).optional(),
  basePlan: RawPlanSchema.optional(), // 换菜时前端回传当前方案，服务端只重算目标餐
});
export type RecommendRequest = z.infer<typeof RecommendRequestSchema>;

export const RemovedDishSchema = z.object({
  meal: MealSlot,
  name: z.string(),
  reason: z.string(),
});
export type RemovedDish = z.infer<typeof RemovedDishSchema>;

export const RecommendResponseSchema = z.object({
  plan: RawPlanSchema,
  removed: z.array(RemovedDishSchema).default([]),
  notes: z.string().optional(),
});
export type RecommendResponse = z.infer<typeof RecommendResponseSchema>;
