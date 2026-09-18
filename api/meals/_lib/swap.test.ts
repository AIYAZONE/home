import { describe, it, expect } from 'vitest';
import { mergeSwap } from './swap';

describe('mergeSwap', () => {
  it('replaces only the target meal, keeps the other two', () => {
    const base = { breakfast: [{ name: '粥', why: '' }], lunch: [{ name: '面', why: '' }], dinner: [{ name: '饭', why: '' }] };
    const regen = { breakfast: [], lunch: [{ name: '沙拉', why: '换' }], dinner: [] };
    const out = mergeSwap(base, regen, 'lunch');
    expect(out.breakfast).toEqual(base.breakfast);
    expect(out.dinner).toEqual(base.dinner);
    expect(out.lunch).toEqual([{ name: '沙拉', why: '换' }]);
  });
});
