import type { MealSlot, RawPlan } from './mealSchemas';

export function mergeSwap(base: RawPlan, regenerated: RawPlan, meal: MealSlot): RawPlan {
  return {
    breakfast: meal === 'breakfast' ? regenerated.breakfast : base.breakfast,
    lunch: meal === 'lunch' ? regenerated.lunch : base.lunch,
    dinner: meal === 'dinner' ? regenerated.dinner : base.dinner,
    shopping_hint: regenerated.shopping_hint?.trim() || base.shopping_hint,
    notes: regenerated.notes?.trim() || base.notes,
  };
}
