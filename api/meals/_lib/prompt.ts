import type { ConstraintSet } from './constraints';
import type { MealSlot } from './mealSchemas';

export function buildSystemPrompt(c: ConstraintSet): string {
  const lines = [
    '你是家庭膳食推荐助手。为一桌全家共餐推荐一日三餐家常菜，输出严格 JSON，不含多余文本。',
    'JSON 结构：{"breakfast":[{"name":"","why":""}],"lunch":[...],"dinner":[...],"notes":""}。每餐 2-4 道菜。',
    c.allergens.length ? `【绝对红线·过敏原】菜名与理由中绝不出现：${c.allergens.join('、')}。` : '【过敏原】无。',
    c.healthRedlines.length ? `【健康约束】需照顾：${c.healthRedlines.join('、')}。` : '',
    c.disliked.length ? `【口味·尽量回避】${c.disliked.join('、')}。` : '',
    `【辣度上限】全家可接受最高辣度=${c.spicyMax}（none/mil/med/hot）。`,
    c.likes.length ? `【偏好】可多用：${c.likes.join('、')}。` : '',
    'why 用一句话说明这道菜如何贴合这个家庭的情况；不给医疗/营养诊断结论。',
  ];
  return lines.filter(Boolean).join('\n');
}

export function buildUserPrompt(args: { c: ConstraintSet; date: string; mealOnly?: MealSlot; exclude?: string[] }): string {
  const { c, date, mealOnly, exclude } = args;
  const parts: string[] = [`日期：${date}`];
  if (c.direction) parts.push(`用餐倾向：${c.direction}`);
  if (c.adhocIngredients) parts.push(`家里现有的食材（优先利用）：${c.adhocIngredients}`);
  if (mealOnly) parts.push(`只推荐 ${mealOnly} 这一餐，其它两餐不要输出。`);
  if (exclude?.length) parts.push(`不要重复这些菜：${exclude.join('、')}。`);
  return parts.join('\n');
}
