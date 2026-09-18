import { describe, it, expect } from 'vitest';
import { guardAllergens } from './allergenGuard';

const plan = {
  breakfast: [{ name: '海鲜粥', why: '暖胃' }],
  lunch: [{ name: '番茄鸡蛋', why: '' }],
  dinner: [{ name: '清蒸鱼', why: '补蛋白' }],
};

describe('guardAllergens', () => {
  it('removes dishes containing an allergen and reports them', () => {
    const { plan: out, removed } = guardAllergens(plan, ['海鲜']);
    expect(out.breakfast).toHaveLength(0);
    expect(out.lunch).toHaveLength(1);
    expect(removed).toEqual([{ meal: 'breakfast', name: '海鲜粥', reason: '含过敏原：海鲜' }]);
  });
  it('keeps everything when no allergens', () => {
    const { plan: out, removed } = guardAllergens(plan, []);
    expect(out).toEqual(plan);
    expect(removed).toEqual([]);
  });
  it('matches case-insensitively', () => {
    const { removed } = guardAllergens({ ...plan, dinner: [{ name: 'Shrimp Roll', why: '' }] }, ['shrimp']);
    expect(removed[0].name).toBe('Shrimp Roll');
  });
});
