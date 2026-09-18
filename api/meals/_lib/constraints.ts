export type Spicy = 'none' | 'mil' | 'med' | 'hot';
const SPICY_ORDER: Spicy[] = ['none', 'mil', 'med', 'hot'];

export type HealthLike = { allergies?: string | null; conditions?: string | null; notes?: string | null } | null;
export type PrefLike = { disliked?: string | null; liked?: string | null; spicy_level?: string | null } | null;
export type MemberConstraintsInput = { health: HealthLike; pref: PrefLike };

export type ConstraintSet = {
  allergens: string[];      // 红线：绝不出现
  healthRedlines: string[]; // 病症忌口（控糖/低盐…）作为强约束写入 prompt
  disliked: string[];       // 口味红线（不爱吃）尽量回避
  likes: string[];
  spicyMax: Spicy;          // 全家能吃辣的下限
  adhocIngredients?: string;
  direction?: string;
};

export function splitCsv(text?: string | null): string[] {
  return (text ?? '')
    .split(/[,，、;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function spicyCap(levels: (string | null | undefined)[]): Spicy {
  const valid = levels.filter((l): l is Spicy => l === 'none' || l === 'mil' || l === 'med' || l === 'hot');
  if (valid.length === 0) return 'hot';
  return valid.reduce((min, cur) => (SPICY_ORDER.indexOf(cur) < SPICY_ORDER.indexOf(min) ? cur : min), 'hot' as Spicy);
}

export function buildConstraints(
  members: MemberConstraintsInput[],
  opts: { adhocIngredients?: string; direction?: string } = {},
): ConstraintSet {
  const allergens = new Set<string>();
  const healthRedlines = new Set<string>();
  const disliked = new Set<string>();
  const likes = new Set<string>();
  const spicyLevels: (string | null)[] = [];

  for (const m of members) {
    splitCsv(m.health?.allergies).forEach((x) => allergens.add(x));
    splitCsv(m.health?.conditions).forEach((x) => healthRedlines.add(x));
    splitCsv(m.health?.notes).forEach((x) => healthRedlines.add(x));
    splitCsv(m.pref?.disliked).forEach((x) => disliked.add(x));
    splitCsv(m.pref?.liked).forEach((x) => likes.add(x));
    spicyLevels.push(m.pref?.spicy_level ?? null);
  }

  return {
    allergens: [...allergens],
    healthRedlines: [...healthRedlines],
    disliked: [...disliked],
    likes: [...likes],
    spicyMax: spicyCap(spicyLevels),
    adhocIngredients: opts.adhocIngredients?.trim() || undefined,
    direction: opts.direction?.trim() || undefined,
  };
}
