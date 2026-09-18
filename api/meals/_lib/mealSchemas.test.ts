import { describe, it, expect } from 'vitest';
import { RawPlanSchema, RecommendRequestSchema } from './mealSchemas';

describe('mealSchemas', () => {
  it('accepts a well-formed raw plan', () => {
    const ok = RawPlanSchema.safeParse({
      breakfast: [{ name: '小米粥', why: '清淡' }],
      lunch: [{ name: '番茄鸡蛋' }],
      dinner: [{ name: '清蒸鱼', why: '' }],
    });
    expect(ok.success).toBe(true);
  });
  it('rejects request with bad date', () => {
    const bad = RecommendRequestSchema.safeParse({ date: '2026/09/18' });
    expect(bad.success).toBe(false);
  });
  it('defaults dish why to empty string', () => {
    const p = RawPlanSchema.parse({ breakfast: [{ name: 'a' }], lunch: [], dinner: [] });
    expect(p.breakfast[0].why).toBe('');
  });
});
