import { describe, it, expect } from 'vitest';
import { splitCsv, spicyCap, buildConstraints } from './constraints';

describe('constraints', () => {
  it('splits on comma/、/space', () => {
    expect(splitCsv('花生, 海鲜、虾')).toEqual(['花生', '海鲜', '虾']);
  });
  it('spicyCap takes mildest', () => {
    expect(spicyCap(['hot', 'mil', 'med'])).toBe('mil');
    expect(spicyCap([])).toBe('hot');
  });
  it('unions allergens & dislikes across members', () => {
    const c = buildConstraints(
      [
        { health: { allergies: '花生', conditions: '控糖', notes: null }, pref: { disliked: '香菜', spicy_level: 'none', liked: null } },
        { health: { allergies: '海鲜', conditions: null, notes: '低盐' }, pref: { disliked: null, spicy_level: 'med', liked: '汤面' } },
      ],
      { adhocIngredients: '番茄 鸡蛋', direction: '清淡' },
    );
    expect(c.allergens.sort()).toEqual(['花生', '海鲜'].sort());
    expect(c.healthRedlines).toEqual(expect.arrayContaining(['控糖', '低盐']));
    expect(c.disliked).toEqual(['香菜']);
    expect(c.spicyMax).toBe('none');
    expect(c.adhocIngredients).toBe('番茄 鸡蛋');
  });
});
