# 免费模型自动发现（Free Model Discovery）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「设置 → 我的 AI 模型」页新增免费模型发现区：实时拉取 models.dev 目录过滤零单价模型，支持同厂商密钥一键启用（服务端复制密文）与预填添加。

**Architecture:** 方案 A（实时发现，零新表）——catch-all 端点新增 `discover` 分支 + 纯函数核心 `providerDiscovery.ts`（60s 实例缓存）；create 端点扩展 `reuse_key_from` 服务端复制 `api_key_encrypted`；前端新增 hook 与折叠区。无迁移、无 cron、无新 Serverless Function。

**Tech Stack:** Vercel Serverless（api/ ESM）+ zod + Supabase service-role；React 18 + TS + TanStack Query v5 + Tailwind；Vitest。

**Spec:** `docs/superpowers/specs/2026-09-21-free-model-discovery-design.md`（数据源实测事实见其 §2，决策记录见 §8）

## Global Constraints

- 密钥红线：明文 key 永不出服务端；`reuse_key_from` 只复制密文列；discover 响应不含任何 key 信息（仅 reuse_provider_id/name）。
- `api/` 目录为 ESM，相对 import 必须带 `.js` 后缀（tsserver 报"找不到模块"为已知假阳性，以 vitest/build 为准）。
- 所有用户可见错误文案为中文并附 `traceId`（沿用 `skeleton` 的 `{ message, traceId }` 形态）。
- Vercel Hobby 12 函数限制：discover 必须挂在现有 catch-all（`api/ai/providers/[...action].ts`），禁止新建顶层端点文件。
- Vite 本地开发代理：新端点必须在 `vite.config.ts` 手动注册 `localApiPlugin`（历史踩坑）。
- 提交规范 Conventional Commits；git 身份用仓库 local 配置（AIYAZONE / aiyazone@163.com）。
- 验证命令（每批末尾全跑）：`npx vitest run`、`npx tsc --noEmit`、`npx eslint . --quiet`（存量 16 warnings 可忽略，0 errors）、`pnpm build`。

---

### Task 1: providerDiscovery 纯函数核心（解析/过滤/归一化/复用比对）

**Files:**
- Create: `api/ai/_lib/providerDiscovery.ts`
- Test: `api/ai/_lib/providerDiscovery.test.ts`

**Interfaces:**
- Consumes: 无（纯函数，仅依赖 zod）
- Produces（Task 3 消费）:
  - `type DiscoveredModel = { provider_id: string; provider_label: string; model_id: string; name: string; base_url: string; capability: 'text' | 'vision'; context_window: number | null; supports_reasoning: boolean }`
  - `type DiscoveredSuggestion = DiscoveredModel & { key_reusable: boolean; reuse_provider_id: string | null; reuse_provider_name: string | null }`
  - `parseCatalog(json: unknown): DiscoveredModel[]`
  - `normalizeBaseUrl(u: string): string`
  - `annotateReuse(models: DiscoveredModel[], existingRows: Pick<PublicProvider, 'id' | 'name' | 'base_url' | 'enabled' | 'priority'>[]): DiscoveredSuggestion[]`
  - `CATALOG_PROVIDER_IDS: readonly string[]`

- [ ] **Step 1: 写失败测试**

创建 `api/ai/_lib/providerDiscovery.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { annotateReuse, normalizeBaseUrl, parseCatalog } from './providerDiscovery.js';

const fixture = {
  zhipuai: {
    name: 'Zhipu AI',
    api: 'https://open.bigmodel.cn/api/paas/v4',
    models: {
      'glm-4.7-flash': {
        id: 'glm-4.7-flash', name: 'GLM-4.7-Flash',
        cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
        modalities: { input: ['text'], output: ['text'] },
        limit: { context: 200000, output: 131072 }, reasoning: true,
      },
      'glm-paid': {
        id: 'glm-paid', name: 'GLM Paid',
        cost: { input: 1, output: 2 }, modalities: { input: ['text'], output: ['text'] },
      },
    },
  },
  openrouter: {
    name: 'OpenRouter', api: { url: 'https://openrouter.ai/api/v1' },
    models: {
      'qwen/qwen3.8-27b:free': {
        id: 'qwen/qwen3.8-27b:free', name: 'Qwen3.8 27B',
        cost: { input: 0, output: 0 },
        modalities: { input: ['text', 'image', 'video'], output: ['text'] },
        limit: { context: 262144 },
      },
    },
  },
  nvidia: { name: 'NVIDIA', models: { 'x/y': { id: 'x/y', name: 'Y', cost: { input: 0, output: 0 }, modalities: { input: ['text'], output: ['text'] } } } }, // 无 api → 跳过
  'not-whitelisted': { name: 'Other', api: 'https://o.test/v1', models: { m: { id: 'm', name: 'M', cost: { input: 0, output: 0 }, modalities: { input: ['text'], output: ['text'] } } } },
};

describe('parseCatalog', () => {
  it('只保留白名单 ∩ 零单价 ∩ 可解析 URL；兼容 api string 与 {url} 两形态', () => {
    const out = parseCatalog(fixture);
    expect(out.map((m) => `${m.provider_id}/${m.model_id}`)).toEqual([
      'zhipuai/glm-4.7-flash', 'openrouter/qwen/qwen3.8-27b:free',
    ]);
  });
  it('capability：输入含 image/video → vision，否则 text；context 0/缺失 → null', () => {
    const out = parseCatalog(fixture);
    expect(out[0]).toMatchObject({ capability: 'text', context_window: 200000, supports_reasoning: true });
    expect(out[1]).toMatchObject({ capability: 'vision', base_url: 'https://openrouter.ai/api/v1' });
  });
  it('坏条目跳过不崩整表（缺 cost / 缺 name / 非对象）', () => {
    const out = parseCatalog({ zhipuai: { name: 'Z', api: 'https://x.test/v4', models: { bad: 'not-an-object', bad2: { id: 'bad2' } } }, garbage: 42 });
    expect(out).toEqual([]);
  });
});

describe('normalizeBaseUrl', () => {
  it('尾斜杠/大小写 host/默认端口无关，路径大小写保留', () => {
    expect(normalizeBaseUrl('https://Open.BigModel.cn/api/paas/v4/')).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(normalizeBaseUrl('http://x.test:80/v1')).toBe('http://x.test/v1');
    expect(normalizeBaseUrl('不是 URL')).toBe('');
  });
});

describe('annotateReuse', () => {
  const models = parseCatalog(fixture);
  it('同厂商命中：enabled 优先、priority 小者优先', () => {
    const rows = [
      { id: 'r1', name: '智谱备用', base_url: 'https://open.bigmodel.cn/api/paas/v4', enabled: true, priority: 5 },
      { id: 'r2', name: '智谱停用', base_url: 'https://open.bigmodel.cn/api/paas/v4/', enabled: false, priority: 1 },
      { id: 'r3', name: '智谱主用', base_url: 'https://open.bigmodel.cn/api/paas/v4', enabled: true, priority: 2 },
    ];
    const [glm] = annotateReuse([models[0]], rows);
    expect(glm).toMatchObject({ key_reusable: true, reuse_provider_id: 'r3', reuse_provider_name: '智谱主用' });
  });
  it('无匹配 → key_reusable false 且 reuse 字段为 null', () => {
    const [or] = annotateReuse([models[1]], []);
    expect(or).toMatchObject({ key_reusable: false, reuse_provider_id: null, reuse_provider_name: null });
    expect(or.capability).toBe('vision'); // 复用行不影响 capability 映射结果
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run api/ai/_lib/providerDiscovery.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

创建 `api/ai/_lib/providerDiscovery.ts`：

```ts
// 免费模型发现核心（spec: 2026-09-21-free-model-discovery §4.1）：
// 纯函数——解析 models.dev 目录、过滤零单价、与用户可见行比对密钥复用可能。
import { z } from 'zod';
import type { PublicProvider } from './providersSchema.js';

export const CATALOG_URL = 'https://models.dev/api.json';

// provider 白名单：家庭场景相关的国产直连 + 两大免充值网关（spec §8 决策 5）
export const CATALOG_PROVIDER_IDS = [
  'alibaba', 'alibaba-cn', 'zhipuai', 'moonshotai', 'moonshotai-cn',
  'deepseek', 'volcengine', 'minimax-cn', 'siliconflow-cn',
  'openrouter', 'nvidia',
] as const;

const CatalogModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cost: z.object({ input: z.number(), output: z.number() }),
  modalities: z.object({ input: z.array(z.string()) }).optional(),
  limit: z.object({ context: z.number().optional() }).optional(),
  reasoning: z.boolean().optional(),
});

const CatalogProviderSchema = z.object({
  name: z.string().min(1),
  api: z.union([z.string().url(), z.object({ url: z.string().url() })]).optional(),
  models: z.record(z.unknown()),
});

export type DiscoveredModel = {
  provider_id: string; provider_label: string; model_id: string; name: string;
  base_url: string; capability: 'text' | 'vision';
  context_window: number | null; supports_reasoning: boolean;
};

export type DiscoveredSuggestion = DiscoveredModel & {
  key_reusable: boolean; reuse_provider_id: string | null; reuse_provider_name: string | null;
};

export function normalizeBaseUrl(u: string): string {
  try {
    const url = new URL(u);
    const defaultPort = url.protocol === 'https:' ? ':443' : ':80';
    const host = url.host.replace(defaultPort, '').toLowerCase();
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.protocol.toLowerCase()}//${host}${path}`;
  } catch {
    return '';
  }
}

export function parseCatalog(json: unknown): DiscoveredModel[] {
  const out: DiscoveredModel[] = [];
  if (typeof json !== 'object' || json === null) return out;
  for (const pid of CATALOG_PROVIDER_IDS) {
    const p = (json as Record<string, unknown>)[pid];
    const pp = CatalogProviderSchema.safeParse(p);
    if (!pp.success) continue;
    const baseUrl = normalizeBaseUrl(typeof pp.data.api === 'string' ? pp.data.api : pp.data.api?.url ?? '');
    if (!baseUrl) continue; // 解析不出端点的 provider 跳过（spec §2）
    for (const raw of Object.values(pp.data.models)) {
      const mm = CatalogModelSchema.safeParse(raw);
      if (!mm.success) continue; // schema 漂移：坏条目跳过不崩整表
      if (mm.data.cost.input !== 0 || mm.data.cost.output !== 0) continue;
      const inputs = mm.data.modalities?.input ?? [];
      out.push({
        provider_id: pid,
        provider_label: pp.data.name,
        model_id: mm.data.id,
        name: mm.data.name.slice(0, 40), // 对齐 ai_providers.name 列上限
        base_url: baseUrl,
        capability: inputs.some((m) => m === 'image' || m === 'video') ? 'vision' : 'text',
        context_window: mm.data.limit?.context || null,
        supports_reasoning: Boolean(mm.data.reasoning),
      });
    }
  }
  return out;
}

export function annotateReuse(
  models: DiscoveredModel[],
  existingRows: Array<Pick<PublicProvider, 'id' | 'name' | 'base_url' | 'enabled' | 'priority'>>,
): DiscoveredSuggestion[] {
  const byUrl = new Map<string, typeof existingRows[number][]>();
  for (const row of existingRows) {
    const key = normalizeBaseUrl(row.base_url);
    if (!key) continue;
    (byUrl.get(key) ?? byUrl.set(key, []).get(key)!).push(row);
  }
  return models.map((m) => {
    const cands = (byUrl.get(normalizeBaseUrl(m.base_url)) ?? [])
      .slice()
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.priority - b.priority);
    const hit = cands[0];
    return {
      ...m,
      key_reusable: Boolean(hit),
      reuse_provider_id: hit?.id ?? null,
      reuse_provider_name: hit?.name ?? null,
    };
  });
}
```

注：`annotateReuse` 入参用 `Pick<PublicProvider, ...>` 结构类型（`PublicProvider` 已由 providersSchema.ts 导出，providersSchema 不反向依赖本文件，无循环）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run api/ai/_lib/providerDiscovery.test.ts`
Expected: PASS（7 用例）

- [ ] **Step 5: 全量验证 + 提交**

```bash
npx vitest run && npx tsc --noEmit && npx eslint api/ai/_lib/providerDiscovery.ts api/ai/_lib/providerDiscovery.test.ts --quiet
git add api/ai/_lib/providerDiscovery.ts api/ai/_lib/providerDiscovery.test.ts
git commit -m "feat(ai): 免费模型发现核心——models.dev 目录解析/零单价过滤/密钥复用比对"
```

---

### Task 2: create 端点扩展 `reuse_key_from`（服务端复制密文）

**Files:**
- Modify: `api/ai/_lib/providersSchema.ts`（ProviderCreateSchema）
- Modify: `api/ai/_lib/providers/create.ts`
- Modify: `api/ai/_lib/providersSchema.test.ts`（追加用例）
- Test: `api/ai/_lib/providersCreate.test.ts`

**Interfaces:**
- Consumes: 现有 `encryptApiKey/maskApiKey`（providerSecret.ts）、`adminClient`
- Produces（Task 4/5 消费）: create 请求体新增可选 `reuse_key_from?: string`（uuid）；`api_key` 变为条件必填（与 reuse_key_from 二选一）

- [ ] **Step 1: 写失败测试（schema）**

在 `api/ai/_lib/providersSchema.test.ts` 的 `ProviderCreateSchema（v2 scope）` describe 内追加：

```ts
  it('api_key 与 reuse_key_from 二选一（免费模型发现 spec §4.3）', () => {
    const noKey = { name: 'n', base_url: 'https://x.test/v4', model: 'm', capability: 'text', cost_tier: 'free' };
    expect(ProviderCreateSchema.safeParse(noKey).success).toBe(false);
    expect(ProviderCreateSchema.safeParse({ ...noKey, api_key: 'sk-a', reuse_key_from: '11111111-1111-4111-a111-111111111111' }).success).toBe(false);
    expect(ProviderCreateSchema.safeParse({ ...noKey, reuse_key_from: '11111111-1111-4111-a111-111111111111' }).success).toBe(true);
    expect(ProviderCreateSchema.safeParse({ ...noKey, reuse_key_from: 'not-a-uuid' }).success).toBe(false);
  });
```

- [ ] **Step 2: 写失败测试（create 行为）**

创建 `api/ai/_lib/providersCreate.test.ts`（mock skeleton 直通 + adminClient 查询链）：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const insert = vi.fn();
const maybeSingle = vi.fn();
const clientChain: Record<string, any> = {};
function makeChain(target: Record<string, any>) {
  const chain: any = new Proxy({}, {
    get: (_t, k: string) => {
      if (k === 'maybeSingle') return maybeSingle;
      // 真实链路是 .insert(payload).select('*').single()——select 在 single 之前
      if (k === 'insert') return (payload: any) => { target.insertPayload = payload; return { select: () => ({ single: insert }) }; };
      return (..._a: any[]) => chain;
    },
  });
  return chain;
}

vi.mock('./endpointKit.js', () => ({
  skeleton: async (_p: string, _req: any, res: any, _o: any, handler: any) => {
    await handler({ userId: 'u1', email: 'a@b.test' }, 'aip_test');
    return res;
  },
  adminClient: async () => ({ from: () => makeChain(clientChain) }),
}));
vi.mock('./aiProviderRouter.js', () => ({ clearInstanceCache: vi.fn() }));
vi.mock('./adminGuard.js', () => ({ isSharedPoolAdmin: () => false }));

import createHandler from './providers/create.js';

type Res = { code: number; body: any };
function makeRes(): Res & { status: (n: number) => any; setHeader: (k: string, v: string) => void; json: (p: unknown) => void } {
  const res: any = { code: 0, body: null };
  res.status = (n: number) => { res.code = n; return res; };
  res.setHeader = () => {};
  res.json = (p: unknown) => { res.body = p; };
  return res;
}

beforeEach(() => {
  insert.mockReset(); maybeSingle.mockReset(); delete clientChain.insertPayload;
  // priority 查询（create.ts L20-22）也走 maybeSingle——默认给空行，避免解构 undefined 抛错；
  // reuse 分支用例再覆盖此默认值
  maybeSingle.mockResolvedValue({ data: null, error: null });
});

const srcRow = { api_key_encrypted: 'iv:cipher-SRC', api_key_mask: 'sk-***src' };

describe('create reuse_key_from（spec 2026-09-21 §4.3）', () => {
  it('引用可见行 → 复制密文列入库，不经过 encryptApiKey', async () => {
    maybeSingle.mockResolvedValue({ data: srcRow, error: null });
    insert.mockResolvedValue({ data: { id: 'new1', owner_user_id: 'u1' }, error: null });
    const res = makeRes();
    await createHandler({ method: 'POST', headers: {}, body: { name: '智谱新免费', base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7-flash', capability: 'text', cost_tier: 'free', reuse_key_from: '11111111-1111-4111-a111-111111111111' } }, res);
    expect(res.code).toBe(200);
    expect(clientChain.insertPayload).toMatchObject({ api_key_encrypted: 'iv:cipher-SRC', api_key_mask: 'sk-***src' });
  });
  it('引用查不到（含他人私有行，查询已限可见域）→ 400 防探测文案', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = makeRes();
    await createHandler({ method: 'POST', headers: {}, body: { name: 'n', base_url: 'https://x.test/v4', model: 'm', capability: 'text', cost_tier: 'free', reuse_key_from: '11111111-1111-4111-a111-111111111111' } }, res);
    expect(res.code).toBe(400);
    expect(res.body.message).toContain('引用的模型不存在');
    expect(res.body.traceId).toBe('aip_test');
  });
  it('带 api_key 明文路径不受影响（encryptApiKey 正常调用）', async () => {
    insert.mockResolvedValue({ data: { id: 'new2', owner_user_id: 'u1' }, error: null });
    const res = makeRes();
    await createHandler({ method: 'POST', headers: {}, body: { name: 'n', base_url: 'https://x.test/v4', model: 'm', api_key: 'sk-plain', capability: 'text', cost_tier: 'free' } }, res);
    expect(res.code).toBe(200);
    expect(clientChain.insertPayload.api_key_mask).toContain('sk-');
    expect(clientChain.insertPayload.api_key_encrypted).not.toBe('sk-plain'); // 入库必须密文
  });
});
```

- [ ] **Step 3: 跑两个测试确认失败**

Run: `npx vitest run api/ai/_lib/providersSchema.test.ts api/ai/_lib/providersCreate.test.ts`
Expected: FAIL（schema 接受缺 api_key；create 无 reuse 分支）

- [ ] **Step 4: 实现 schema**

`providersSchema.ts` 中 `ProviderCreateSchema` 改为：

```ts
export const ProviderCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  base_url: z.string().trim().url(),
  model: z.string().trim().min(1).max(80),
  api_key: z.string().trim().min(1).max(300).optional(),
  reuse_key_from: z.string().uuid().optional(), // v3：免费模型发现——服务端复制该行密文（spec §4.3）
  capability: z.enum(['text', 'vision']),
  cost_tier: z.enum(['free', 'paid']),
  enabled: z.boolean().optional().default(true),
  priority: z.number().int().optional(),
  scope: z.enum(['personal', 'shared']).optional().default('personal'),
}).superRefine((d, ctx) => {
  if (!d.api_key && !d.reuse_key_from) ctx.addIssue({ code: 'custom', message: 'api_key 与 reuse_key_from 需二选一' });
  if (d.api_key && d.reuse_key_from) ctx.addIssue({ code: 'custom', message: 'api_key 与 reuse_key_from 只能提供其一' });
});
```

- [ ] **Step 5: 实现 create 分支**

`providers/create.ts`：`payload` 构造段替换为（其余不动）：

```ts
    let keyMaterial: { api_key_encrypted: string; api_key_mask: string };
    if (parsed.data.reuse_key_from) {
      // 可见域查询（共享行 + 自己私有行）——查不到统一 400，防探测（gone 语义）
      const { data: src, error: srcErr } = await client
        .from('ai_providers')
        .select('api_key_encrypted,api_key_mask')
        .eq('id', parsed.data.reuse_key_from)
        .or(`owner_user_id.is.null,owner_user_id.eq.${ctx.userId}`)
        .maybeSingle();
      if (srcErr || !src) {
        return res.status(400).json({ message: '引用的模型不存在或已被删除，请刷新后重试。', traceId: t });
      }
      keyMaterial = { api_key_encrypted: src.api_key_encrypted, api_key_mask: src.api_key_mask };
    } else {
      keyMaterial = { api_key_encrypted: encryptApiKey(parsed.data.api_key!), api_key_mask: maskApiKey(parsed.data.api_key!) };
    }
    const payload = {
      owner_user_id: ownerUserId,
      name: parsed.data.name, base_url: parsed.data.base_url, model: parsed.data.model,
      ...keyMaterial,
      capability: parsed.data.capability, cost_tier: parsed.data.cost_tier,
      priority, enabled: parsed.data.enabled,
    };
```

注意：`client` 在 reuse 分支前已声明（现有代码 L16），查询在其后。

- [ ] **Step 6: 跑测试确认通过 + 全量验证 + 提交**

```bash
npx vitest run && npx tsc --noEmit && npx eslint api/ai --quiet
git add api/ai/_lib/providersSchema.ts api/ai/_lib/providers/create.ts api/ai/_lib/providersSchema.test.ts api/ai/_lib/providersCreate.test.ts
git commit -m "feat(ai): create 支持 reuse_key_from——服务端复制密文实现密钥复用"
```

---

### Task 3: discover 端点 + catch-all 注册 + vite 代理

**Files:**
- Create: `api/ai/_lib/providers/discover.ts`
- Modify: `api/ai/providers/[...action].ts`（routes 表 + 头注）
- Modify: `vite.config.ts`（localApiPlugin 注册）
- Test: `api/ai/_lib/providersDiscover.test.ts`

**Interfaces:**
- Consumes: Task 1 `parseCatalog/annotateReuse/CATALOG_URL`；Task 2 无；`adminClient`
- Produces（Task 4 消费）: `GET /api/ai/providers/discover` → `{ models: DiscoveredSuggestion[]; fetched_at: string }`（≤60 条，key_reusable 降序 → provider_id → model_id）

- [ ] **Step 1: 写失败测试**

创建 `api/ai/_lib/providersDiscover.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const select = vi.fn();
const clientChain: any = {};
vi.mock('./endpointKit.js', () => ({
  skeleton: async (_p: string, _req: any, res: any, _o: any, handler: any) => { await handler({ userId: 'u1', email: 'a@b.test' }, 'aip_test'); return res; },
  adminClient: async () => ({ from: () => clientChain }),
}));
vi.mock('./providerDiscovery.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./providerDiscovery.js')>();
  return { ...orig, CATALOG_URL: 'https://catalog.test/api.json' };
});

import discoverHandler, { resetDiscoveryCacheForTests } from './providers/discover.js';
import { annotateReuse, parseCatalog } from './providerDiscovery.js';

type Res = { code: number; body: any };
function makeRes(): Res & { status: (n: number) => any; setHeader: () => void; json: (p: unknown) => void } {
  const res: any = { code: 0, body: null };
  res.status = (n: number) => { res.code = n; return res; };
  res.setHeader = () => {};
  res.json = (p: unknown) => { res.body = p; };
  return res;
}

const catalogJson = { zhipuai: { name: 'Zhipu AI', api: 'https://open.bigmodel.cn/api/paas/v4', models: { 'glm-4.7-flash': { id: 'glm-4.7-flash', name: 'GLM-4.7-Flash', cost: { input: 0, output: 0 }, modalities: { input: ['text'], output: ['text'] }, limit: { context: 200000 } } } } };

beforeEach(() => {
  resetDiscoveryCacheForTests();
  vi.restoreAllMocks();
  select.mockReset();
  clientChain.select = () => clientChain;
  clientChain.or = () => clientChain;
  clientChain.order = () => clientChain;
  clientChain.then = (r: any) => Promise.resolve({ data: [{ id: 'r1', name: '智谱主用', base_url: 'https://open.bigmodel.cn/api/paas/v4', enabled: true, priority: 1 }], error: null }).then(r);
});

describe('GET discover', () => {
  it('拉目录 + 比对可见行 → 200 带 key_reusable，失败结果不缓存（下次重试成功）', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => catalogJson });
    vi.stubGlobal('fetch', fetchMock);
    const fail = makeRes();
    await discoverHandler({ method: 'GET', headers: {} }, fail);
    expect(fail.code).toBe(502);
    expect(fail.body.traceId).toBe('aip_test');
    const ok = makeRes();
    await discoverHandler({ method: 'GET', headers: {} }, ok);
    expect(ok.code).toBe(200);
    expect(ok.body.models[0]).toMatchObject({ model_id: 'glm-4.7-flash', key_reusable: true, reuse_provider_id: 'r1' });
    expect(JSON.stringify(ok.body)).not.toMatch(/api_key/); // 红线：响应不含任何 key 字段
  });
  it('60s 缓存：第二次请求不再打目录源', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => catalogJson });
    vi.stubGlobal('fetch', fetchMock);
    await discoverHandler({ method: 'GET', headers: {} }, makeRes());
    await discoverHandler({ method: 'GET', headers: {} }, makeRes());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run api/ai/_lib/providersDiscover.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现端点**

创建 `api/ai/_lib/providers/discover.ts`：

```ts
// 免费模型发现（spec 2026-09-21 §4.2）：只读、requireUser、无 write 限流；
// 目录 60s 实例内存缓存，失败不缓存（下次请求重试）。
import { adminClient, skeleton } from '../endpointKit.js';
import { annotateReuse, CATALOG_URL, parseCatalog, type DiscoveredModel } from '../providerDiscovery.js';

let cache: { until: number; models: DiscoveredModel[] } | null = null;
export const DISCOVER_TTL_MS = 60_000;

/** 仅测试使用 */
export function resetDiscoveryCacheForTests() { cache = null; }

async function fetchCatalogModels(): Promise<DiscoveredModel[]> {
  if (cache && Date.now() < cache.until) return cache.models;
  const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  const models = parseCatalog(await res.json());
  cache = { until: Date.now() + DISCOVER_TTL_MS, models };
  return models;
}

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.discover', req, res, { method: 'GET' }, async (ctx, t) => {
    let models: DiscoveredModel[];
    try {
      models = await fetchCatalogModels();
    } catch (err) {
      console.error('[api/ai.providers.discover]', { traceId: t, catalog: err instanceof Error ? err.message : String(err) });
      return res.status(502).json({ message: '发现服务暂不可用，请稍后重试。', traceId: t });
    }
    const client = await adminClient();
    const { data, error } = await client
      .from('ai_providers')
      .select('id,name,base_url,enabled,priority')
      .or(`owner_user_id.is.null,owner_user_id.eq.${ctx.userId}`)
      .order('priority', { ascending: true });
    if (error) {
      console.error('[api/ai.providers.discover]', { traceId: t, db: error.message });
      throw new Error('读取模型清单失败。');
    }
    const suggestions = annotateReuse(models, (data ?? []) as Array<{ id: string; name: string; base_url: string; enabled: boolean; priority: number }>)
      .sort((a, b) => Number(b.key_reusable) - Number(a.key_reusable) || a.provider_id.localeCompare(b.provider_id) || a.model_id.localeCompare(b.model_id))
      .slice(0, 60);
    res.status(200).json({ models: suggestions, fetched_at: new Date().toISOString() });
  });
}
```

- [ ] **Step 4: 注册 catch-all 路由**

`api/ai/providers/[...action].ts`：import 区加 `import { default as discoverHandler } from '../_lib/providers/discover.js';`，routes 表加 `discover: discoverHandler,`，头注第 3 行路径列表补 `|discover`。

- [ ] **Step 5: 注册 vite 代理（历史踩坑，必做）**

`vite.config.ts` 在 `local-ai-providers-set-default` 行后追加：

```ts
  localApiPlugin('local-ai-providers-discover', '/api/ai/providers/discover', async () => (await import('./api/ai/_lib/providers/discover')).default, providersFallback, ['GET']),
```

- [ ] **Step 6: 跑测试确认通过 + 全量验证 + 提交**

```bash
npx vitest run api/ai/_lib/providersDiscover.test.ts   # 先本文件
npx vitest run && npx tsc --noEmit && npx eslint api/ai vite.config.ts --quiet && pnpm build
git add api/ai/_lib/providers/discover.ts api/ai/providers/\[...action\].ts vite.config.ts api/ai/_lib/providersDiscover.test.ts
git commit -m "feat(ai): discover 端点——免费模型建议列表（catch-all + vite 代理注册）"
```

---

### Task 4: 前端数据层（类型 + API + hook）

**Files:**
- Modify: `src/lib/aiProviders.ts`
- Create: `src/hooks/useDiscoverFreeModels.ts`

**Interfaces:**
- Consumes: Task 3 的 `GET ai/providers/discover` 响应；Task 2 的 create `reuse_key_from`
- Produces（Task 5 消费）:
  - `DiscoveredSuggestion` 前端类型（与后端字段一致）
  - `providersApi.discover(): Promise<{ models: DiscoveredSuggestion[]; fetched_at: string }>`
  - `ProviderDraft.reuse_key_from?: string`（`api_key` 已是可选，无需改）
  - `useDiscoverFreeModels(enabled: boolean)` → TanStack Query 结果（`data/isLoading/isError/refetch`）

- [ ] **Step 1: 扩展 lib 类型与 API**

`src/lib/aiProviders.ts`：

`ProviderDraft` 的 `api_key?: string;` 行后加：

```ts
  reuse_key_from?: string; // 免费模型发现：服务端复制该行密文（与 api_key 二选一）
```

`ProviderDefaults` 类型定义后加：

```ts
export type DiscoveredSuggestion = {
  provider_id: string; provider_label: string; model_id: string; name: string;
  base_url: string; capability: 'text' | 'vision';
  context_window: number | null; supports_reasoning: boolean;
  key_reusable: boolean; reuse_provider_id: string | null; reuse_provider_name: string | null;
};
```

`providersApi` 对象内 `list` 后加：

```ts
  discover: () =>
    request<{ models: DiscoveredSuggestion[]; fetched_at: string }>('ai/providers/discover', 'GET'),
```

- [ ] **Step 2: 新建 hook**

创建 `src/hooks/useDiscoverFreeModels.ts`（import 风格对齐 `useAiProviders.ts`，`useAuth` 从其同源 import）：

```ts
import { useQuery } from '@tanstack/react-query';
import { providersApi } from '@/lib/aiProviders';
import { useAuth } from '@/contexts/AuthContext';

/** 免费模型发现：折叠区首次展开（enabled=true）才请求；queryKey 带 userId 防串户 */
export function useDiscoverFreeModels(enabled: boolean) {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: ['ai-providers-discover', userId],
    queryFn: () => providersApi.discover(),
    enabled: Boolean(userId) && enabled,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
```

（`useAuth` 的实际 import 路径以 `useAiProviders.ts` 首行为准，若不同则改正。）

- [ ] **Step 3: 验证 + 提交**

```bash
npx tsc --noEmit && npx eslint src/lib/aiProviders.ts src/hooks/useDiscoverFreeModels.ts --quiet
git add src/lib/aiProviders.ts src/hooks/useDiscoverFreeModels.ts
git commit -m "feat(ai): 前端发现层——discover API 类型与 useDiscoverFreeModels hook"
```

---

### Task 5: 「发现免费模型」折叠区 UI + 文档收尾

**Files:**
- Modify: `src/pages/settings/AiProviders.tsx`
- Modify: `docs/privacy/data-map.md`（§7 补一行）

**Interfaces:**
- Consumes: Task 4 `useDiscoverFreeModels`/`DiscoveredSuggestion`；现有 `create` mutation、新增表单（`setForm`/`setEditing`）
- Produces: 无（终端交付）

- [ ] **Step 1: 页面新增折叠区**

`AiProviders.tsx` import 区加：`import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';`（合并进现有 lucide import）、`import { useDiscoverFreeModels } from '@/hooks/useDiscoverFreeModels';`、type import 补 `DiscoveredSuggestion`。

组件内（`renderRow` 定义后）加发现区状态与逻辑：

```tsx
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const discover = useDiscoverFreeModels(discoverOpen);
  const [enabling, setEnabling] = useState<DiscoveredSuggestion | null>(null);
  const [enableName, setEnableName] = useState('');
  const [enableScope, setEnableScope] = useState<'personal' | 'shared'>('personal');

  const openEnable = (s: DiscoveredSuggestion) => { setEnabling(s); setEnableName(s.name); setEnableScope('personal'); };
  const closeEnable = () => setEnabling(null);
  const submitEnable = async () => {
    if (!enabling) return;
    try {
      await create.mutateAsync({
        name: enableName.trim() || enabling.name, base_url: enabling.base_url, model: enabling.model_id,
        reuse_key_from: enabling.reuse_provider_id ?? undefined,
        capability: enabling.capability, cost_tier: 'free', scope: enableScope,
      });
      pushToast({ variant: 'success', title: '已启用', message: `${enableName || enabling.name}（复用了同厂商密钥）` });
      closeEnable();
    } catch (err) { fail('启用失败')(err); }
  };
  const openPrefillAdd = (s: DiscoveredSuggestion) => {
    setForm({ ...EMPTY_FORM, name: s.name, base_url: s.base_url, model: s.model_id, capability: s.capability, cost_tier: 'free', scope: 'personal' });
    setEditing('new');
  };
```

平台共享池 `</Card>` 之后（`</>` 收尾前）加折叠区 JSX：

```tsx
          <Card>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
              onClick={() => setDiscoverOpen((v) => !v)}
              aria-expanded={discoverOpen}
            >
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">发现免费模型</span>
                <span className="text-xs text-muted-foreground">来自 models.dev 开放目录，零单价模型</span>
              </span>
              {discoverOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
            {discoverOpen ? (
              <CardContent className="pt-0">
                {discover.isLoading ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">正在拉取目录…</div>
                ) : discover.isError ? (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <div className="text-sm text-muted-foreground">{errText(discover.error).message}（{errText(discover.error).traceId ?? '无 traceId'}）</div>
                    <Button size="sm" variant="secondary" onClick={() => discover.refetch()}>重试</Button>
                  </div>
                ) : (discover.data?.models.length ?? 0) === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">暂无可发现的免费模型。</div>
                ) : (
                  <div className="divide-y divide-border rounded-xl border border-border">
                    {discover.data!.models.map((s) => (
                      <ListRow key={`${s.provider_id}/${s.model_id}`}>
                        <ListRowLeading>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{s.name}</span>
                              <Badge>{s.capability === 'vision' ? '视觉' : '文本'}</Badge>
                              {s.key_reusable ? <Badge variant="success">可复用密钥：{s.reuse_provider_name}</Badge> : null}
                              {s.supports_reasoning ? <Badge>推理</Badge> : null}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {s.provider_label} · {s.model_id}
                              {s.context_window ? ` · 上下文 ${(s.context_window / 1000).toFixed(0)}k` : ''}
                            </div>
                          </div>
                        </ListRowLeading>
                        <ListRowTrailing className="sm:justify-end">
                          {s.key_reusable ? (
                            <Button variant="secondary" size="sm" onClick={() => openEnable(s)} disabled={create.isPending}>启用</Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => openPrefillAdd(s)}>添加</Button>
                          )}
                        </ListRowTrailing>
                      </ListRow>
                    ))}
                  </div>
                )}
              </CardContent>
            ) : null}
          </Card>
```

- [ ] **Step 2: 启用确认弹窗（portal，风格对齐现有表单弹窗）**

在现有 `{editing ? createPortal(...) : null}` 之后加：

```tsx
      {enabling
        ? createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm" onClick={closeEnable} role="dialog" aria-modal="true">
              <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                <Card className="border border-border/60 bg-popover shadow-lg">
                  <CardHeader className="pb-3">
                    <CardTitle>启用「{enabling.name}」</CardTitle>
                    <CardDescription>将复用「{enabling.reuse_provider_name}」的密钥（服务端复制密文，不展示明文）。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">名称</label>
                      <Input value={enableName} onChange={(e) => setEnableName(e.target.value)} maxLength={40} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">归属</label>
                      <Select value={enableScope} onChange={(e) => setEnableScope(e.target.value as 'personal' | 'shared')}>
                        <option value="personal">我的私有模型（仅我可见）</option>
                        {canManageShared ? <option value="shared">平台共享模型（所有人可见）</option> : null}
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={closeEnable}>取消</Button>
                      <Button disabled={create.isPending} onClick={submitEnable}>
                        {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        确认启用
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>,
            document.body,
          )
        : null}
```

- [ ] **Step 3: 全量验证**

```bash
npx vitest run && npx tsc --noEmit && npx eslint . --quiet && pnpm build
```

Expected: 全部通过（vitest 用例数 ≥ 96：既有 83 + Task1 7 + Task2 6 + Task3 2，实际以运行输出为准）。

- [ ] **Step 4: 文档 + 提交**

`docs/privacy/data-map.md` §7 末尾追加一行：

```markdown
- 免费模型发现（discover）：服务端定期只读拉取 models.dev 公开目录（不含任何用户数据），建议列表不落库；一键启用通过 `reuse_key_from` 在服务端复制既有密文，明文密钥不经过任何链路。
```

```bash
git add src/pages/settings/AiProviders.tsx docs/privacy/data-map.md
git commit -m "feat(settings): 我的 AI 模型页新增发现免费模型折叠区（一键启用/预填添加）"
```

---

## 验收剧本（部署后人工走查）

1. 打开「设置 → 我的 AI 模型」，展开「发现免费模型」→ 出现列表（含 zhipuai glm-4.7-flash）。
2. 若共享池已有智谱行：glm-4.7-flash 带「可复用密钥」徽标 → 点启用 → 选归属确认 → 出现在对应区，掩码与源行一致，**全程无明文 key**。
3. 找一个 OpenRouter 模型（无 key 时）→ 点添加 → 表单预填 → 粘贴 key 保存 → 测试 ✓。
4. 断网/目录源故障（本地可临时改 CATALOG_URL 模拟）→ 区内 502 文案 + traceId + 重试，页面其余区块正常。
5. 非白名单用户尝试启用 shared → 403 文案（复用 create 现有守卫）。
