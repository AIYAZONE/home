import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import type { ConstraintSet } from './constraints';

const c: ConstraintSet = { allergens: ['花生'], healthRedlines: ['控糖'], disliked: ['香菜'], likes: [], spicyMax: 'mil', adhocIngredients: '番茄 鸡蛋', direction: '清淡' };

describe('prompt', () => {
  it('system encodes allergen as absolute redline', () => {
    const s = buildSystemPrompt(c);
    expect(s).toContain('花生');
    expect(s).toContain('绝不');
    expect(s).toContain('控糖');
    expect(s).toContain('JSON');
  });
  it('user prompt mentions adhoc ingredients and date', () => {
    const u = buildUserPrompt({ c, date: '2026-09-18' });
    expect(u).toContain('2026-09-18');
    expect(u).toContain('番茄 鸡蛋');
  });
  it('swap prompt restricts to one meal and excludes dish', () => {
    const u = buildUserPrompt({ c, date: '2026-09-18', mealOnly: 'lunch', exclude: ['面'] });
    expect(u).toContain('lunch');
    expect(u).toContain('面');
  });
});
