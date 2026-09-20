import type { Dish, MealSlot, RawPlan, RemovedDish } from './mealSchemas';

export function dishText(dish: Dish): string {
  // steps 参与扫描：过敏原可能只出现在做法里（菜名/理由干净但步骤加虾仁），红线不容绕过
  return `${dish.name} ${dish.why} ${(dish.steps ?? []).join(' ')}`.toLowerCase();
}

function matchAllergen(dish: Dish, allergens: string[]): string | null {
  const text = dishText(dish);
  for (const a of allergens) {
    if (a && text.includes(a.toLowerCase())) return a;
  }
  return null;
}

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

export function guardAllergens(plan: RawPlan, allergens: string[]): { plan: RawPlan; removed: RemovedDish[] } {
  const removed: RemovedDish[] = [];
  const out: RawPlan = { breakfast: [], lunch: [], dinner: [], shopping_hint: plan.shopping_hint, notes: plan.notes };

  for (const slot of SLOTS) {
    for (const dish of plan[slot] ?? []) {
      const hit = matchAllergen(dish, allergens);
      if (hit) removed.push({ meal: slot, name: dish.name, reason: `含过敏原：${hit}` });
      else out[slot].push(dish);
    }
  }
  return { plan: out, removed };
}
