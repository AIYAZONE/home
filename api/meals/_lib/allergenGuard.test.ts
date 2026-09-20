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
  it('removes dishes whose steps mention an allergen even if name/why are clean', () => {
    const { plan: out, removed } = guardAllergens(
      { ...plan, lunch: [{ name: '溜椒芽', why: '下饭', steps: ['青椒去籽切块', '锅中放油，加入虾仁炒熟', '倒入青椒翻炛10秒'] }] },
      ['虾'],
    );
    expect(out.lunch).toHaveLength(0);
    expect(removed).toContainEqual({ meal: 'lunch', name: '溜椒芽', reason: '含过敏原：虾' });
  });
  it('keeps dishes with safe steps', () => {
    const withSteps = { ...plan, lunch: [{ name: '番茄鸡蛋', why: '', steps: ['番茄切块', '鸡蛋打散炒熟'] }] };
    const { plan: out, removed } = guardAllergens(withSteps, ['海鲜']);
    expect(out.lunch[0].steps).toHaveLength(2);
    expect(removed.map((r) => r.name)).not.toContain('番茄鸡蛋');
  });
});
