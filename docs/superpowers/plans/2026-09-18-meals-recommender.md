# 「今天吃什么」菜谱推荐器 MVP 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个"打开就给出今天这一桌全家吃啥"的 AI 三餐推荐器（MVP），复用现有健康数据做约束、以纯 AI 生成为引擎、并对过敏原做服务端硬拦截。

**Architecture:** 后端新增 Vercel Serverless 接口 `api/meals/recommend.ts`（薄 I/O 层：鉴权→读家庭约束→调 DeepSeek→**纯函数引擎**做解析/换菜合并/过敏原拦截）。把安全关键逻辑全部下沉为可脱离网络单测的纯函数。前端新增 `/meals` 页面 + 设置中心口味页 + 仪表板今日卡片。数据层新增 `meal_preferences`、`meal_plans` 两张表（RLS 复用 `health_profiles` 范式）。

**Tech Stack:** React 18 + TypeScript 5.8 + Vite 6 + Tailwind 3；Supabase（Auth/RLS）；Vercel Serverless Functions；zod v4；TanStack Query v5；测试用 Vitest（本计划 Task 2 引入）。

**Spec:** docs/superpowers/specs/2026-09-18-meals-recommender-design.md

## Global Constraints

- 运行时：Node `>=20`，包管理 `pnpm@10.6.1`；路径别名 `@/` → `src/`。
- 依赖：zod `^4.3.6`、@supabase/supabase-js `^2.95.0`、@tanstack/react-query `^5`；不新增 UI/状态库。
- AI：默认 DeepSeek，经 `AI_LLM_PROVIDER` env 切换；**只复用** `api/_lib/aiOpenAiCompat.ts` 的 `callOpenAiCompatChatJson`，不引新提供方、不写死 baseUrl。
- 迁移命名：`supabase/migrations/YYYYMMDDHHMMSS_snake_case.sql`；RLS 策略镜像 `health_profiles`（`has_family_role(family_id, array['admin','parent'])` 或 `subject_user_id = auth.uid()`）。
- 安全红线：**命中任一家庭成员过敏原的菜品绝不返回**——拦截 + 在响应 `removed[]` 中显式报告，不静默。
- 隐私：家庭健康/口味数据仅在**一次性同意**后发送 AI，且只发必要字段（过敏原/约束/口味），不发病历原文与身份标识。
- 代码内不得出现任何密钥；密钥仅经 `process.env` 读取。
- 验证命令（每个改动任务后至少跑相关项）：`pnpm check`（tsc noEmit）、`pnpm lint`、`pnpm test`（vitest）、`pnpm build`。

---

## 文件结构（File Structure）

**后端**
- `api/meals/_lib/mealSchemas.ts` — zod 请求/响应/菜品 schema（单一契约来源）
- `api/meals/_lib/constraints.ts` — 纯函数：把成员健康+口味聚合成 `ConstraintSet`
- `api/meals/_lib/allergenGuard.ts` — 纯函数：过敏原扫描与剔除（核心安全）
- `api/meals/_lib/swap.ts` — 纯函数：换菜时只替换目标那一餐
- `api/meals/_lib/prompt.ts` — 纯函数：由 `ConstraintSet` 生成 system/user prompt
- `api/meals/_lib/engine.ts` — 纯函数：`assembleResponse()` 串起 Zod 解析→过敏原拦截→换菜合并
- `api/meals/recommend.ts` — 薄 I/O handler（鉴权/取数/调 AI/组装）

**数据层**
- `supabase/migrations/20260918000000_meal_preferences.sql`
- `supabase/migrations/20260918000001_meal_plans.sql`

**前端**
- `src/types/index.ts`（修改：新增膳食相关类型）
- `src/hooks/useMealPreferences.ts` / `src/hooks/useMealPlan.ts` / `src/hooks/useRecommendMeals.ts`
- `src/pages/meals/Today.tsx`
- `src/pages/settings/Taste.tsx`
- `src/components/meals/TodayPlanCard.tsx`
- `src/config/navigation.ts`（修改）/ `src/App.tsx`（修改：路由）

---

## 测试脚手架决策

仓库当前无测试运行器。Task 2 引入 **Vitest**（与 Vite 同源、零额外配置概念负担），仅对**纯函数**（constraints / allergenGuard / swap / engine / schemas）写单测——它们覆盖本模块最关键的过敏原安全兜底与换菜正确性。DB / serverless handler / React 页面用 `pnpm check` + `pnpm build` + 手动验收清单验证，不强行 mock 浏览器与 Supabase 网络层。

---

## Task 1: 数据层迁移（meal_preferences + meal_plans）

**Files:**
- Create: `supabase/migrations/20260918000000_meal_preferences.sql`
- Create: `supabase/migrations/20260918000001_meal_plans.sql`
- 参考（不修改）: `supabase/migrations/20260308000001_health_tables.sql`

**Interfaces:**
- Produces: 表 `public.meal_preferences(family_id, subject_user_id, disliked, liked, spicy_level, notes, ...)`、`public.meal_plans(family_id, plan_date, plan_json jsonb, constraints_snapshot jsonb, created_by_user_id, ...)`

- [ ] **Step 1: 写 meal_preferences 迁移**

```sql
-- supabase/migrations/20260918000000_meal_preferences.sql
create table if not exists public.meal_preferences (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  subject_user_id uuid references public.users(id) on delete cascade not null,
  created_by_user_id uuid references public.users(id) on delete set null,
  disliked text,
  liked text,
  spicy_level text check (spicy_level in ('none','mil','med','hot')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists uniq_meal_preferences_family_subject
  on public.meal_preferences(family_id, subject_user_id);
create index if not exists idx_meal_preferences_family on public.meal_preferences(family_id);

alter table public.meal_preferences enable row level security;

create policy "Users can view meal preferences"
  on public.meal_preferences for select
  using (public.has_family_role(family_id, array['admin','parent']::text[]) or subject_user_id = auth.uid());

create policy "Users can insert meal preferences"
  on public.meal_preferences for insert
  with check (
    family_id in (select family_id from public.users where users.id = auth.uid())
    and (public.has_family_role(family_id, array['admin','parent']::text[]) or subject_user_id = auth.uid())
  );

create policy "Users can update meal preferences"
  on public.meal_preferences for update
  using (public.has_family_role(family_id, array['admin','parent']::text[]) or subject_user_id = auth.uid())
  with check (public.has_family_role(family_id, array['admin','parent']::text[]) or subject_user_id = auth.uid());

create policy "Users can delete meal preferences"
  on public.meal_preferences for delete
  using (public.has_family_role(family_id, array['admin','parent']::text[]) or subject_user_id = auth.uid());
```

- [ ] **Step 2: 写 meal_plans 迁移**

```sql
-- supabase/migrations/20260918000001_meal_plans.sql
create table if not exists public.meal_plans (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references public.families(id) on delete cascade not null,
  plan_date date not null,
  plan_json jsonb not null,
  constraints_snapshot jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists uniq_meal_plans_family_date
  on public.meal_plans(family_id, plan_date);
create index if not exists idx_meal_plans_family on public.meal_plans(family_id);

alter table public.meal_plans enable row level security;

create policy "Users can view meal plans"
  on public.meal_plans for select
  using (public.has_family_role(family_id, array['admin','parent','child']::text[])
         or exists (select 1 from public.users u where u.id = auth.uid() and u.family_id = meal_plans.family_id));

create policy "Users can upsert meal plans"
  on public.meal_plans for insert
  with check (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can update meal plans"
  on public.meal_plans for update
  using (family_id in (select family_id from public.users where users.id = auth.uid()))
  with check (family_id in (select family_id from public.users where users.id = auth.uid()));

create policy "Users can delete meal plans"
  on public.meal_plans for delete
  using (family_id in (select family_id from public.users where users.id = auth.uid()));
```

- [ ] **Step 3: 人工核对 RLS 与命名与参考文件一致**

对照 `20260308000001_health_tables.sql` 确认：`families`/`users` 外键列名、`has_family_role` 可用、`uuid_generate_v4()` 可用（init schema 已启用）。

- [ ] **Step 4: 应用迁移并验证（本地/远端 Supabase）**

Run: `supabase db push`（或项目既有的迁移应用方式）
Expected: 两张表创建成功，无 RLS 语法错误。若本地无 CLI，标注"迁移待部署时应用"并保留 SQL 供 review。

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260918000000_meal_preferences.sql supabase/migrations/20260918000001_meal_plans.sql
git commit -m "feat(meals): 新增 meal_preferences 与 meal_plans 迁移及 RLS"
```

---

## Task 2: Zod 契约 + 引入 Vitest

**Files:**
- Create: `api/meals/_lib/mealSchemas.ts`
- Create: `api/meals/_lib/mealSchemas.test.ts`
- Modify: `package.json`（加 `vitest` devDep + `test` 脚本）

**Interfaces:**
- Produces: `MealSlot`、`DishSchema`、`RawPlanSchema`、`RecommendRequestSchema`、`RecommendResponseSchema`、`RemovedDishSchema` 及类型 `MealSlot/Dish/RawPlan/RecommendRequest/RecommendResponse/RemovedDish`

- [ ] **Step 1: 安装 Vitest**

Run: `pnpm add -D vitest`
Expected: 安装成功，`package.json` devDependencies 出现 vitest。

- [ ] **Step 2: 加 test 脚本**

`package.json` 的 `scripts` 增加：
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: 写失败测试**

```ts
// api/meals/_lib/mealSchemas.test.ts
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
```

- [ ] **Step 4: 运行确认失败**

Run: `pnpm test api/meals/_lib/mealSchemas.test.ts`
Expected: FAIL（Cannot find module './mealSchemas'）

- [ ] **Step 5: 写实现**

```ts
// api/meals/_lib/mealSchemas.ts
import { z } from 'zod';

export const MealSlot = z.enum(['breakfast', 'lunch', 'dinner']);
export type MealSlot = z.infer<typeof MealSlot>;

export const DishSchema = z.object({
  name: z.string().min(1),
  why: z.string().default(''),
});
export type Dish = z.infer<typeof DishSchema>;

// AI 直接返回的结构（未经拦截）
export const RawPlanSchema = z.object({
  breakfast: z.array(DishSchema).default([]),
  lunch: z.array(DishSchema).default([]),
  dinner: z.array(DishSchema).default([]),
  shopping_hint: z.string().optional(),
  notes: z.string().optional(),
});
export type RawPlan = z.infer<typeof RawPlanSchema>;

export const RecommendRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  servingUserIds: z.array(z.string()).optional(),
  adhocIngredients: z.string().max(500).optional(),
  direction: z.string().max(200).optional(),
  swap: z.object({ meal: MealSlot, dish: z.string().min(1) }).optional(),
  basePlan: RawPlanSchema.optional(), // 换菜时前端回传当前方案，服务端只重算目标餐
});
export type RecommendRequest = z.infer<typeof RecommendRequestSchema>;

export const RemovedDishSchema = z.object({
  meal: MealSlot,
  name: z.string(),
  reason: z.string(),
});
export type RemovedDish = z.infer<typeof RemovedDishSchema>;

export const RecommendResponseSchema = z.object({
  plan: RawPlanSchema,
  removed: z.array(RemovedDishSchema).default([]),
  notes: z.string().optional(),
});
export type RecommendResponse = z.infer<typeof RecommendResponseSchema>;
```

- [ ] **Step 6: 运行确认通过**

Run: `pnpm test api/meals/_lib/mealSchemas.test.ts`
Expected: PASS（3 passed）

- [ ] **Step 7: Commit**

```bash
git add api/meals/_lib/mealSchemas.ts api/meals/_lib/mealSchemas.test.ts package.json
git commit -m "test(meals): 引入 Vitest 并新增膳食推荐 Zod 契约"
```

---

## Task 3: 约束聚合纯函数（constraints.ts）

**Files:**
- Create: `api/meals/_lib/constraints.ts`
- Create: `api/meals/_lib/constraints.test.ts`

**Interfaces:**
- Consumes: 无（输入为普通对象，来自 handler 读取的 DB 行）
- Produces: `splitCsv(text) => string[]`、`spicyCap(levels) => 'none'|'mil'|'med'|'hot'`、`buildConstraints(members, opts) => ConstraintSet`；类型 `ConstraintSet`、`MemberConstraintsInput`

- [ ] **Step 1: 写失败测试**

```ts
// api/meals/_lib/constraints.test.ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test api/meals/_lib/constraints.test.ts`
Expected: FAIL（module not found）

- [ ] **Step 3: 写实现**

```ts
// api/meals/_lib/constraints.ts
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
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test api/meals/_lib/constraints.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/meals/_lib/constraints.ts api/meals/_lib/constraints.test.ts
git commit -m "feat(meals): 约束聚合纯函数（全家过敏/健康/口味并集）"
```

---

## Task 4: 过敏原拦截纯函数（allergenGuard.ts）— 核心安全

**Files:**
- Create: `api/meals/_lib/allergenGuard.ts`
- Create: `api/meals/_lib/allergenGuard.test.ts`

**Interfaces:**
- Consumes: 类型 `RawPlan`、`RemovedDish`、`MealSlot`（Task 2）
- Produces: `dishText(dish) => string`、`guardAllergens(plan, allergens) => { plan: RawPlan; removed: RemovedDish[] }`

- [ ] **Step 1: 写失败测试**

```ts
// api/meals/_lib/allergenGuard.test.ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test api/meals/_lib/allergenGuard.test.ts`
Expected: FAIL（module not found）

- [ ] **Step 3: 写实现**

```ts
// api/meals/_lib/allergenGuard.ts
import type { Dish, MealSlot, RawPlan, RemovedDish } from './mealSchemas';

export function dishText(dish: Dish): string {
  return `${dish.name} ${dish.why}`.toLowerCase();
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
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test api/meals/_lib/allergenGuard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/meals/_lib/allergenGuard.ts api/meals/_lib/allergenGuard.test.ts
git commit -m "feat(meals): 过敏原服务端拦截纯函数（命中即剔除并报告）"
```

---

## Task 5: 换菜合并纯函数（swap.ts）

**Files:**
- Create: `api/meals/_lib/swap.ts`
- Create: `api/meals/_lib/swap.test.ts`

**Interfaces:**
- Consumes: `RawPlan`、`MealSlot`（Task 2）
- Produces: `mergeSwap(base: RawPlan, regenerated: RawPlan, meal: MealSlot) => RawPlan`

- [ ] **Step 1: 写失败测试**

```ts
// api/meals/_lib/swap.test.ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test api/meals/_lib/swap.test.ts`
Expected: FAIL（module not found）

- [ ] **Step 3: 写实现**

```ts
// api/meals/_lib/swap.ts
import type { MealSlot, RawPlan } from './mealSchemas';

export function mergeSwap(base: RawPlan, regenerated: RawPlan, meal: MealSlot): RawPlan {
  return {
    breakfast: meal === 'breakfast' ? regenerated.breakfast : base.breakfast,
    lunch: meal === 'lunch' ? regenerated.lunch : base.lunch,
    dinner: meal === 'dinner' ? regenerated.dinner : base.dinner,
    shopping_hint: regenerated.shopping_hint ?? base.shopping_hint,
    notes: regenerated.notes ?? base.notes,
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test api/meals/_lib/swap.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/meals/_lib/swap.ts api/meals/_lib/swap.test.ts
git commit -m "feat(meals): 换菜单餐合并纯函数"
```

---

## Task 6: Prompt 构建纯函数（prompt.ts）

**Files:**
- Create: `api/meals/_lib/prompt.ts`
- Create: `api/meals/_lib/prompt.test.ts`

**Interfaces:**
- Consumes: `ConstraintSet`（Task 3）、`MealSlot`（Task 2）
- Produces: `buildSystemPrompt(c: ConstraintSet) => string`、`buildUserPrompt(args: { c: ConstraintSet; date: string; mealOnly?: MealSlot; exclude?: string[] }) => string`

- [ ] **Step 1: 写失败测试**

```ts
// api/meals/_lib/prompt.test.ts
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
    expect(s).toContain('json');
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
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test api/meals/_lib/prompt.test.ts`
Expected: FAIL（module not found）

- [ ] **Step 3: 写实现**

```ts
// api/meals/_lib/prompt.ts
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
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test api/meals/_lib/prompt.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/meals/_lib/prompt.ts api/meals/_lib/prompt.test.ts
git commit -m "feat(meals): 约束驱动的 prompt 构建纯函数"
```

---

## Task 7: 响应组装引擎（engine.ts）

**Files:**
- Create: `api/meals/_lib/engine.ts`
- Create: `api/meals/_lib/engine.test.ts`

**Interfaces:**
- Consumes: `RawPlanSchema`、`RecommendResponse`（Task 2）、`ConstraintSet`（Task 3）、`guardAllergens`（Task 4）、`mergeSwap`（Task 5）
- Produces: `assembleResponse(args: { jsonText: string; constraints: ConstraintSet; swap?: { meal: MealSlot; dish: string }; basePlan?: RawPlan }) => RecommendResponse`

- [ ] **Step 1: 写失败测试**

```ts
// api/meals/_lib/engine.test.ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test api/meals/_lib/engine.test.ts`
Expected: FAIL（module not found）

- [ ] **Step 3: 写实现**

```ts
// api/meals/_lib/engine.ts
import { RawPlanSchema } from './mealSchemas';
import type { MealSlot, RawPlan, RecommendResponse } from './mealSchemas';
import type { ConstraintSet } from './constraints';
import { guardAllergens } from './allergenGuard';
import { mergeSwap } from './swap';

export function assembleResponse(args: {
  jsonText: string;
  constraints: ConstraintSet;
  swap?: { meal: MealSlot; dish: string };
  basePlan?: RawPlan;
}): RecommendResponse {
  const parsed = RawPlanSchema.parse(JSON.parse(args.jsonText)); // 解析失败向上抛，handler 捕获后重试

  if (args.swap && args.basePlan) {
    const merged = mergeSwap(args.basePlan, parsed, args.swap.meal);
    const { plan, removed } = guardAllergens(merged, args.constraints.allergens);
    return { plan, removed, notes: plan.notes };
  }

  const { plan, removed } = guardAllergens(parsed, args.constraints.allergens);
  return { plan, removed, notes: plan.notes };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test api/meals/_lib/engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/meals/_lib/engine.ts api/meals/_lib/engine.test.ts
git commit -m "feat(meals): 响应组装引擎（解析→换菜合并→过敏原拦截）"
```

---

## Task 8: 推荐接口 handler（api/meals/recommend.ts）

**Files:**
- Create: `api/meals/recommend.ts`
- 参考（不修改）: `api/ai/chat.ts`

**Interfaces:**
- Consumes: `authGetUser`（`api/_lib/supabaseAuthCompat.js`）、`callOpenAiCompatChatJson`（Task 前置）、`buildConstraints`/`buildSystemPrompt`/`buildUserPrompt`/`assembleResponse`、`RecommendRequestSchema`
- Produces: HTTP `POST /api/meals/recommend` → `RecommendResponse`

- [ ] **Step 1: 写 handler（薄 I/O，逻辑全走已测纯函数）**

```ts
// api/meals/recommend.ts
import { authGetUser } from '../_lib/supabaseAuthCompat.js';
import { callOpenAiCompatChatJson, toSafeMessage } from '../_lib/aiOpenAiCompat.js';
import { RecommendRequestSchema } from './_lib/mealSchemas.js';
import type { RawPlan } from './_lib/mealSchemas.js';
import { buildConstraints } from './_lib/constraints.js';
import { buildSystemPrompt, buildUserPrompt } from './_lib/prompt.js';
import { assembleResponse } from './_lib/engine.js';

type RequestLike = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type ResponseLike = { status: (code: number) => ResponseLike; setHeader: (k: string, v: string) => void; json: (p: unknown) => void };

function pickHeader(h: RequestLike['headers'], k: string) { const v = h?.[k] ?? h?.[k.toLowerCase()]; return Array.isArray(v) ? v[0] : v; }
function bearer(h: RequestLike['headers']) { const a = pickHeader(h, 'authorization'); const m = a?.match(/^Bearer\s+(.+)$/i); return m?.[1]?.trim() || null; }
function ip(h: RequestLike['headers']) { return (pickHeader(h, 'x-forwarded-for')?.split(',')[0]?.trim()) || pickHeader(h, 'x-real-ip') || 'unknown'; }

const rate = new Map<string, { s: number; n: number }>();
function limit(key: string, cap: number, win: number) {
  const now = Date.now(); const cur = rate.get(key);
  if (!cur || now - cur.s >= win) { rate.set(key, { s: now, n: 1 }); return true; }
  if (cur.n >= cap) return false; cur.n += 1; return true;
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') return res.status(405).json({ message: '不支持的请求方法。' });
    const token = bearer(req.headers);
    if (!token) return res.status(401).json({ message: '未登录或登录已过期，请重新登录。' });
    if (!limit(`meals:${ip(req.headers)}`, 30, 60_000)) return res.status(429).json({ message: '请求过于频繁，请稍后再试。' });

    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return res.status(500).json({ message: '服务配置缺失。' });

    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: u, error: ue } = await authGetUser(anon, token);
    if (ue || !u.user) return res.status(401).json({ message: '未登录或登录已过期，请重新登录。' });

    const user = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: me, error: meErr } = await user.from('users').select('family_id').eq('id', u.user.id).single();
    if (meErr || !me?.family_id) return res.status(400).json({ message: '缺少家庭信息。' });

    const parsed = RecommendRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '请求参数不合法。' });
    const { date, servingUserIds, adhocIngredients, direction, swap, basePlan } = parsed.data;

    // 取家庭成员
    let memberIds = servingUserIds;
    if (!memberIds?.length) {
      const { data: members } = await user.from('users').select('id').eq('family_id', me.family_id);
      memberIds = (members ?? []).map((m: { id: string }) => m.id);
    }

    // 读健康 + 口味（只读）
    const [{ data: profiles }, { data: prefs }] = await Promise.all([
      user.from('health_profiles').select('subject_user_id, allergies, conditions, notes').in('subject_user_id', memberIds),
      user.from('meal_preferences').select('subject_user_id, disliked, liked, spicy_level').in('subject_user_id', memberIds),
    ]);
    const byUser = new Map<string, { health: any; pref: any }>();
    (profiles ?? []).forEach((p: any) => byUser.set(p.subject_user_id, { health: p, pref: byUser.get(p.subject_user_id)?.pref ?? null }));
    (prefs ?? []).forEach((p: any) => byUser.set(p.subject_user_id, { health: byUser.get(p.subject_user_id)?.health ?? null, pref: p }));
    const members = (memberIds ?? []).map((id: string) => byUser.get(id) ?? { health: null, pref: null });

    const constraints = buildConstraints(members, { adhocIngredients, direction });

    const provider = ((process.env.AI_LLM_PROVIDER ?? 'deepseek') as string).toLowerCase() === 'openai' ? 'openai' : 'deepseek';
    const cfg = provider === 'openai'
      ? { baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY ?? '', model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini' }
      : { baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY ?? '', model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat' };

    const system = buildSystemPrompt(constraints);
    const exclude = swap ? [swap.dish] : undefined;
    const makeUser = (retry: boolean) =>
      buildUserPrompt({ c: constraints, date, mealOnly: swap?.meal, exclude: retry ? [...(exclude ?? []), ...(basePlan ? [] : [])] : exclude }) +
      (retry ? '\n注意：上一次结果包含过敏原，务必更换相关菜品。' : '');

    let removedFromFirst: { name: string }[] = [];
    let resp;
    try {
      const first = await callOpenAiCompatChatJson({ ...cfg, system, user: makeUser(false) });
      resp = assembleResponse({ jsonText: first.jsonText, constraints, swap, basePlan });
    } catch (e) {
      // 解析失败或异常：重试一次
      const second = await callOpenAiCompatChatJson({ ...cfg, system, user: makeUser(true) });
      resp = assembleResponse({ jsonText: second.jsonText, constraints, swap, basePlan });
    }

    // 若仍有被拦截菜，重生成一次补菜
    if (resp.removed.length > 0) {
      const retryUser = buildUserPrompt({ c: constraints, date, mealOnly: swap?.meal ?? 'dinner', exclude: resp.removed.map((r) => r.name) });
      try {
        const regen = await callOpenAiCompatChatJson({ ...cfg, system, user: retryUser });
        const extra = assembleResponse({ jsonText: regen.jsonText, constraints });
        // 把补菜合并进对应餐（此处简化：追加到被清空的餐），保留 removed 记录
        (['breakfast', 'lunch', 'dinner'] as const).forEach((m) => {
          if (resp!.plan[m].length === 0 && extra.plan[m].length > 0) resp!.plan[m] = extra.plan[m];
        });
      } catch {
        /* 补菜失败：保留剔除结果，前端会显示被移除提示 */
      }
    }

    return res.status(200).json(resp);
  } catch (err: unknown) {
    return res.status(400).json({ message: toSafeMessage(err) });
  }
}
```

- [ ] **Step 2: 类型检查通过**

Run: `pnpm check`
Expected: 无 TS 错误（若 `any` 触发 eslint，改为窄类型，但保持 handler 薄）。

- [ ] **Step 3: Lint 通过**

Run: `pnpm lint`
Expected: 无 error（`no-explicit-any` 若报错，为 handler 局部行内禁用并加注释说明为 Supabase 行边界）。

- [ ] **Step 4: 手动冒烟（dev）**

Run: `pnpm dev` + 前端登录后在 Network 直接 `POST /api/meals/recommend`（或用 curl 带 token）。
Expected: 返回 `{ plan: { breakfast/lunch/dinner }, removed: [] }`；有过敏原成员时对应菜被剔除并出现在 `removed`。

- [ ] **Step 5: Commit**

```bash
git add api/meals/recommend.ts
git commit -m "feat(meals): 推荐接口 handler（鉴权→取约束→调 AI→组装）"
```

---

## Task 9: 前端类型 + hooks

**Files:**
- Modify: `src/types/index.ts`（新增类型）
- Create: `src/hooks/useMealPreferences.ts`
- Create: `src/hooks/useMealPlan.ts`
- Create: `src/hooks/useRecommendMeals.ts`
- 参考（不修改）: `src/hooks/useHealthProfile.ts`、`src/components/ai/copilot-panel.tsx`（取 access token 调 api 的方式）

**Interfaces:**
- Produces: `useMealPreferences(subjectUserId)` → `{ prefs, savePref }`；`useMealPlan(date)` → `{ plan, savePlan }`；`useRecommendMeals()` → `{ recommend, isPending, error }`，其中 `recommend(input) => Promise<RecommendResponse>`

- [ ] **Step 1: 加前端类型**

`src/types/index.ts` 追加：
```ts
export type MealSlot = 'breakfast' | 'lunch' | 'dinner';
export interface MealDish { name: string; why: string; }
export interface MealPlanData { breakfast: MealDish[]; lunch: MealDish[]; dinner: MealDish[]; shopping_hint?: string; notes?: string; }
export interface MealRemoved { meal: MealSlot; name: string; reason: string; }
export interface MealRecommendResponse { plan: MealPlanData; removed: MealRemoved[]; notes?: string; }
export interface MealPreference { id: string; family_id: string; subject_user_id: string; disliked?: string | null; liked?: string | null; spicy_level?: 'none'|'mil'|'med'|'hot' | null; notes?: string | null; }
```

- [ ] **Step 2: useMealPreferences（镜像 useHealthProfile 读写 meal_preferences）**

参照 `src/hooks/useHealthProfile.ts` 结构：`useQuery` 按 `family_id + subject_user_id` 取一条；`useMutation` upsert（`onConflict: 'family_id,subject_user_id'`）；成功后 invalidate `['meal_preferences']`；toast 文案"口味偏好已更新"。类型用 `MealPreference`。

- [ ] **Step 3: useMealPlan（读写 meal_plans）**

`useQuery` 按 `family_id + plan_date` 取 `plan_json`（`MealPlanData`）；`useMutation` upsert `{ family_id, plan_date, plan_json, constraints_snapshot, created_by_user_id }`（`onConflict: 'family_id,plan_date'`）；invalidate `['meal_plans']`。

- [ ] **Step 4: useRecommendMeals（mutation 打接口，复用 copilot 的 bearer 方式）**

打开 `src/components/ai/copilot-panel.tsx` 确认取 `supabase.auth.getSession()` 的 `access_token` 与 `fetch('/api/meals/recommend')` 的调用姿势，`useMutation` 内：
```ts
const { data } = await supabase.auth.getSession();
const res = await fetch('/api/meals/recommend', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
  body: JSON.stringify(input),
});
if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message ?? '推荐失败');
return (await res.json()) as MealRecommendResponse;
```

- [ ] **Step 5: 类型检查**

Run: `pnpm check`
Expected: 无 TS 错误。

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/hooks/useMealPreferences.ts src/hooks/useMealPlan.ts src/hooks/useRecommendMeals.ts
git commit -m "feat(meals): 前端膳食类型与 hooks（口味/方案/推荐）"
```

---

## Task 10: 「今天吃什么」页面 + 导航 + 路由

**Files:**
- Create: `src/pages/meals/Today.tsx`
- Modify: `src/config/navigation.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useRecommendMeals`、`useMealPlan`（Task 9）

- [ ] **Step 1: 写 Today.tsx**

要点（复用现有 shadcn/ui 组件与 Tailwind，遵循 `src/components/ui/`）：
- 顶部轻输入区：`direction`、`adhocIngredients`、`date`（默认今天）三个可选输入 + 「推荐今日三餐」按钮（全空也可点）。
- 结果：早/中/晚三张卡（`MealPlanData` 每槽渲染 `Dish[]`：菜名 + `why` 一行）。
- 每道菜「换一个」→ 调 `recommend({ date, servingUserIds?, swap:{ meal, dish }, basePlan: plan, adhocIngredients, direction })`，用返回 `plan` 覆盖。
- `removed.length>0` → 顶部黄条提示"已为你移除 N 道含过敏原的菜"，列 `removed[].name + reason`。
- 「存为今日方案」→ `useMealPlan.savePlan(plan)`。
- 空态：未推荐时展示引导文案；加载态：三张骨架卡；错误态：toast + 「再试一次」。
- 首次进入：`localStorage` 标记 `meals_consent_v1`，未同意时先弹一次性隐私告知对话框（说明健康/口味会发送给 AI 服务商），确认后才可点推荐。

- [ ] **Step 2: 加导航项**

`src/config/navigation.ts`：`import { ..., Utensils } from 'lucide-react';` 在 `navigation` 顶层数组中，`仪表板` 之后插入：
```ts
{ name: '今天吃什么', href: '/meals', icon: Utensils },
```
（mobileTabs 不改，遵循 spec §5.4。）

- [ ] **Step 3: 挂路由**

`src/App.tsx`：在 `ProtectedRoute` 下的路由组里新增 `/meals` → `Today`（对照现有 `/advisor` 等页面注册方式，用同样的 lazy/direct import 与布局包裹）。

- [ ] **Step 4: 构建验证**

Run: `pnpm check && pnpm build`
Expected: 通过，无类型/构建错误。

- [ ] **Step 5: 手动验收（`pnpm dev`）**

- 全空点推荐 → 出三餐；
- 某道点「换一个」→ 只该餐变化；
- 配一个成员 `health_profiles.allergies='花生'` 且推荐含花生 → 该菜进 `removed` 并提示；
- 「存为今日方案」→ 刷新后仍能读到；
- 首次进入弹隐私告知。

- [ ] **Step 6: Commit**

```bash
git add src/pages/meals/Today.tsx src/config/navigation.ts src/App.tsx
git commit -m "feat(meals): 「今天吃什么」页面、导航与路由"
```

---

## Task 11: 设置中心「家庭口味偏好」页

**Files:**
- Create: `src/pages/settings/Taste.tsx`
- Modify: `src/config/navigation.ts`（settings 组内加链接）
- Modify: `src/App.tsx`（`/settings/taste` 路由）
- 参考: `src/pages/settings/Members.tsx`（成员列表来源）、`useFamilyMembers.ts`

**Interfaces:**
- Consumes: `useMealPreferences`、`useFamilyMembers`

- [ ] **Step 1: 写 Taste.tsx**

列出家庭成员（复用 `useFamilyMembers`），每人行内编辑：`disliked`（忌口）、`liked`（偏好）、`spicy_level`（下拉 none/mil/med/hot）；保存调 `useMealPreferences(subjectUserId).savePref`。页面顶部一句说明："口味与忌口在这里设；过敏等健康限制请在健康档案维护。"

- [ ] **Step 2: 导航与路由**

`navigation.ts` 设置中心组内 `数据管理` 附近加 `{ name: '口味偏好', href: '/settings/taste', icon: Utensils }`；`App.tsx` 挂 `/settings/taste`。

- [ ] **Step 3: 验证**

Run: `pnpm check && pnpm build`
Expected: 通过。
手动：改某人辣度/忌口并保存 → 刷新持久化；`/meals` 推荐体现该软约束。

- [ ] **Step 4: Commit**

```bash
git add src/pages/settings/Taste.tsx src/config/navigation.ts src/App.tsx
git commit -m "feat(meals): 设置中心家庭口味偏好页"
```

---

## Task 12: 仪表板「今日方案」轻留痕卡片

**Files:**
- Create: `src/components/meals/TodayPlanCard.tsx`
- Modify: `src/pages/dashboard/*`（在仪表板引用卡片，靠近 `ActionInboxCard`）
- 参考: `src/hooks/useActionItems.ts`、`src/pages/dashboard/` 现有卡片挂载点

**Interfaces:**
- Consumes: `useMealPlan`（今日 + 昨日）

- [ ] **Step 1: 写卡片**

`TodayPlanCard`：读今日 `meal_plans.plan_json`，摘要"今日：早 X · 午 Y · 晚 Z"（各取第一道或菜数）；附"昨天吃了啥"（读昨日）。无今日方案时展示轻引导"去决定今天吃什么 →"（链接 `/meals`）。不显示过敏原明细（隐私）。

- [ ] **Step 2: 挂到仪表板**

在仪表板页面组件树中，于 `ActionInboxCard` 附近引入 `<TodayPlanCard />`。

- [ ] **Step 3: 验证**

Run: `pnpm check && pnpm build`
Expected: 通过。
手动：`/meals` 存方案后，仪表板出现摘要卡；点进去可达 `/meals`。

- [ ] **Step 4: 全量回归**

Run: `pnpm test && pnpm lint && pnpm check && pnpm build`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/components/meals/TodayPlanCard.tsx src/pages/dashboard
git commit -m "feat(meals): 仪表板今日方案轻留痕卡片"
```

---

## Self-Review（计划对 spec 的覆盖）

- spec §3 数据模型 → Task 1（两张表）+ Task 9（前端类型）。
- spec §4 后端接口（约束并集/prompt/输出后校验/换菜单餐/重试/限流）→ Task 3、4、5、6、7、8。
- spec §5 前端（页面/口味设置/仪表板留痕/导航）→ Task 9、10、11、12。
- spec §6 隐私一次性同意 → Task 10 Step 1（首次告知对话框）。
- spec §7 测试要点 → Task 2–7 单测（schemas/constraints/allergenGuard/swap/prompt/engine 覆盖过敏原拦截、换菜单餐、解析失败重试路径）。
- spec §8 待议点默认值 → 命名「今天吃什么」(Task 10)、mobileTabs 不加(Task 10 Step 2)、每日软上限 30/天(Task 8 limit 上限，家庭维度可后续增强，见下)。
- 已知偏差（可接受，记录）：spec §4.1 提"每家庭每日软上限"，Task 8 限流键为 IP（与既有 `chat.ts` 一致），家庭维度配额延后——自用阶段足够，商业化再补 `usage` 计量（spec §9）。
