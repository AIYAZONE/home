import { describe, it, expect } from 'vitest';
import { assembleResponse } from './engine';
import type { ConstraintSet } from './constraints';

const c: ConstraintSet = { allergens: ['海鲜'], healthRedlines: [], disliked: [], likes: [], spicyMax: 'hot' };

describe('assembleResponse', () => {
  it('parses AI json and strips allergen dishes', () => {
    const jsonText = JSON.stringify({ breakfast: [{ name: '海鲜粥' }], lunch: [{ name: '番茄鸡蛋' }], dinner: [{ name: '米饭' }] });
    const r = assembleResponse({ jsonText, constraints: c });
    expect(r.plan.breakfast).toHaveLength(0);
    expect(r.removed[0].name).toBe('海鲜粥');
  });
  it('throws on invalid json', () => {
    expect(() => assembleResponse({ jsonText: '{not json', constraints: c })).toThrow();
  });
  it('swap merges only target meal', () => {
    const base = { breakfast: [{ name: '粥', why: '' }], lunch: [{ name: '面', why: '' }], dinner: [{ name: '饭', why: '' }] };
    const jsonText = JSON.stringify({ lunch: [{ name: '沙拉', why: '换' }] });
    const r = assembleResponse({ jsonText, constraints: c, swap: { meal: 'lunch', dish: '面' }, basePlan: base });
    expect(r.plan.breakfast).toEqual(base.breakfast);
    expect(r.plan.lunch).toEqual([{ name: '沙拉', why: '换' }]);
  });
});
