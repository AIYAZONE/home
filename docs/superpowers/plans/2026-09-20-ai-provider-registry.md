# AI 模型清单管理（免费算力优先）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把大模型 provider 配置从 `.env` 硬编码迁移为 DB 驱动的平台级模型清单：管理界面自由增删改（免费/收费均可绑定），运行时按优先级路由、429/失败自动降级、付费兜底。

**Architecture:** 新增 `ai_providers`/`platform_admins` 两张 service-role-only 表；`api/_lib/aiProviderRouter` 沿 DB 清单链调用（60s 缓存 + 进程内冷却表），空表回落旧 `.env` 行为；`api/ai/providers/*` 六个管理端点由 `platform_admins` 守卫；设置页新增「AI 模型管理」界面。API Key 以 AES-256-GCM 加密存库、界面只写不读。

**Tech Stack:** React 18 + TypeScript + Vite + TanStack Query + Tailwind（shadcn 风格 ui 组件）；Vercel Serverless（`api/`，RequestLike/ResponseLike 兼容层）；Supabase（Postgres + RLS + service role）；Vitest。

**Spec:** `docs/superpowers/specs/2026-09-20-ai-provider-registry-design.md`（本计划逐节实现该设计稿，冷却 10min/缓存 60s/仅日志观测等参数以 spec 为准）

## Global Constraints

- 包管理器只用 `pnpm`（禁止 npm/yarn）；测试命令 `pnpm test`（= `vitest run`）。
- 服务端代码在 `api/`（ESM，`"type": "module"`），import 相对路径带 `.js` 后缀（如 `from './providerSecret.js'`），与现有 `api/ai/chat.ts` 一致。
- 所有对用户可见的错误信息为中文安全文案，经 `toSafeMessage` 兜底并附 `traceId`（分层提示规范）。
- API Key 明文与密文均不进日志；日志只记 provider 名 + 掩码。
- 新表 RLS 开启且**不建任何用户策略**（仅 service role 可达）。
- 每次调用记录 `{provider, model, costTier, traceId}` 仅到日志（不做用量表）。
- 无新增 npm 依赖（crypto 用 node 内置，UI 用现有 `src/components/ui/`）。
- 现有 `.env` 变量 `AI_LLM_PROVIDER`/`DEEPSEEK_*`/`OPENAI_*` 在清单为空时保持现行为（过渡兜底）。

## 对 spec 的两处实现期修正（已在计划中固化）

1. spec §7 的「新增/编辑弹窗」：项目 ui 无 Dialog/Modal 组件，改用**页面内嵌表单卡片**（列表下方展开/收起），不新增依赖。
2. `vite.config.ts` 的本地中间件目前强制 POST-only：泛化为每端点声明允许的 HTTP 方法（GET/PATCH/DELETE 管理端点需要），并同步注册 6 个管理端点 + 保持 5 个旧端点行为。

---

### Task 1: 数据库迁移（ai_providers + platform_admins）

**Files:**
- Create: `supabase/migrations/20260920000000_ai_provider_registry.sql`

**Interfaces:**
- Consumes: 现有 `users` 表、`set_updated_at()` 触发器函数（见 `20260210000004_updated_at_triggers.sql`）
- Produces: 表 `public.ai_providers`（列见下）、`public.platform_admins(user_id, added_by, created_at)`

- [ ] **Step 1: 写迁移 SQL**

```sql
-- supabase/migrations/20260920000000_ai_provider_registry.sql
-- AI 模型清单（平台级）+ 平台管理员表。仅 service role 访问，不开通任何用户策略。

create table if not exists public.ai_providers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  base_url text not null,
  model text not null,
  api_key_encrypted text not null,
  api_key_mask text not null,
  capability text not null default 'text' check (capability in ('text','vision')),
  cost_tier text not null default 'free' check (cost_tier in ('free','paid')),
  priority int not null,
  enabled boolean not null default true,
  test_status text check (test_status in ('ok','error')),
  test_detail text,
  tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_providers_enabled_priority on public.ai_providers(enabled, priority asc);

create table if not exists public.platform_admins (
  user_id uuid primary key references public.users(id) on delete cascade,
  added_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.ai_providers enable row level security;
alter table public.platform_admins enable row level security;

drop trigger if exists trg_ai_providers_updated_at on public.ai_providers;
create trigger trg_ai_providers_updated_at before update on public.ai_providers
  for each row execute function public.set_updated_at();

-- 首位平台管理员入驻（部署后手动执行一次，执行时取消注释并替换 id）：
-- insert into public.platform_admins (user_id) values ('<你的 users.id>');
```

- [ ] **Step 2: 本地语法自检**

Run: `grep -c "create table" supabase/migrations/20260920000000_ai_provider_registry.sql`
Expected: `2`（人工复核检查约束/触发器与既有迁移范式一致）

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260920000000_ai_provider_registry.sql
git commit -m "feat(ai): ai_providers 与 platform_admins 迁移（service-role-only）"
```

---

### Task 2: API Key 加密模块 `providerSecret.ts`

**Files:**
- Create: `api/ai/_lib/providerSecret.ts`
- Test: `api/ai/_lib/providerSecret.test.ts`

**Interfaces:**
- Consumes: `process.env.AI_PROVIDER_ENC_KEY`（string，任意长度口令）
- Produces:
  - `class ProviderSecretError extends Error`
  - `encryptApiKey(plaintext: string): string` → `iv:tag:ciphertext`（base64 三段）
  - `decryptApiKey(payload: string): string`（GCM 完整性校验失败抛 `ProviderSecretError`）
  - `maskApiKey(plaintext: string): string`（`sk-***a9f` 形态：`sk-` + `***` + 末 3 位；总长 < 8 时只留末 2 位）

- [ ] **Step 1: 写失败测试**

```ts
// api/ai/_lib/providerSecret.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { decryptApiKey, encryptApiKey, maskApiKey, ProviderSecretError } from './providerSecret.js';

beforeEach(() => {
  process.env.AI_PROVIDER_ENC_KEY = 'test-master-key';
});

describe('providerSecret', () => {
  it('加密解密可往返', () => {
    const enc = encryptApiKey('sk-abcdef123456789');
    expect(enc).not.toContain('sk-abcdef123456789');
    expect(decryptApiKey(enc)).toBe('sk-abcdef123456789');
  });

  it('密文被篡改时抛 ProviderSecretError', () => {
    const enc = encryptApiKey('sk-abcdef123456789');
    const [iv, tag, data] = enc.split(':');
    const tampered = [iv, tag, Buffer.from('x').toString('base64')].join(':') === enc ? enc + 'A' : `${iv}:${tag}:${data.slice(0, -2)}AA`;
    expect(() => decryptApiKey(tampered)).toThrow(ProviderSecretError);
  });

  it('主密钥缺失时抛 ProviderSecretError', () => {
    delete process.env.AI_PROVIDER_ENC_KEY;
    expect(() => encryptApiKey('sk-x')).toThrow(ProviderSecretError);
  });

  it('掩码不泄漏中间位', () => {
    expect(maskApiKey('sk-abcdef123456789a9f')).toBe('sk-***a9f');
    expect(maskApiKey('short')).toBe('***rt');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test api/ai/_lib/providerSecret.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// api/ai/_lib/providerSecret.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const SCRYPT_SALT = 'family-inc-ai-provider';

export class ProviderSecretError extends Error {
  constructor(message = '密钥处理失败') {
    super(message);
    this.name = 'ProviderSecretError';
  }
}

function masterKey(): Buffer {
  const secret = process.env.AI_PROVIDER_ENC_KEY;
  if (!secret) throw new ProviderSecretError('加密主密钥未配置（缺少 AI_PROVIDER_ENC_KEY）。');
  return scryptSync(secret, SCRYPT_SALT, KEY_LENGTH);
}

export function encryptApiKey(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey(), iv);
  let enc = cipher.update(plaintext, 'utf8', 'base64');
  enc += cipher.final('base64');
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc}`;
}

export function decryptApiKey(payload: string): string {
  const [ivB64, tagB64, dataB64] = String(payload ?? '').split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new ProviderSecretError();
  try {
    const decipher = createDecipheriv(ALGORITHM, masterKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    let dec = decipher.update(dataB64, 'base64', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch {
    throw new ProviderSecretError();
  }
}

export function maskApiKey(plaintext: string): string {
  const s = String(plaintext ?? '');
  const tail = s.length >= 8 ? s.slice(-3) : s.slice(-2);
  return `sk-***${tail}`;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test api/ai/_lib/providerSecret.test.ts`
Expected: PASS ×4

- [ ] **Step 5: Commit**

```bash
git add api/ai/_lib/providerSecret.ts api/ai/_lib/providerSecret.test.ts
git commit -m "feat(ai): provider key AES-256-GCM 加密与掩码"
```

---

### Task 3: `aiOpenAiCompat` 增加底层调用（状态码 + 多模态）

**Files:**
- Modify: `api/_lib/aiOpenAiCompat.ts`（现 52 行，重构 `callOpenAiCompatChatJson` 内部为调用新增 `callLow`）
- Test: `api/_lib/aiOpenAiCompat.test.ts`（新建）

**Interfaces:**
- Consumes: 无新依赖，`fetch` 全局
- Produces:
  - `class AiUpstreamError extends Error { status: number }`（status=0 表示网络/超时）
  - `callLow(args: { baseUrl: string; apiKey: string; model: string; temperature?: number; responseFormatJson?: boolean; messages: Array<{ role: string; content: unknown }> }): Promise<{ content: string }>`（非 2xx 抛 `AiUpstreamError`）
  - `callOpenAiCompatChatJson`（既有签名不变，内部改走 `callLow`，仍返回 `{ jsonText }`）

- [ ] **Step 1: 写失败测试**

```ts
// api/_lib/aiOpenAiCompat.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiUpstreamError, callLow } from './aiOpenAiCompat.js';

afterEach(() => vi.unstubAllGlobals());

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

describe('callLow', () => {
  it('2xx 返回 choices content', async () => {
    mockFetch(200, { choices: [{ message: { content: ' hello ' } }] });
    const r = await callLow({ baseUrl: 'https://x.test/v1', apiKey: 'k', model: 'm', messages: [{ role: 'user', content: 'hi' }] });
    expect(r.content).toBe('hello');
  });

  it('429 抛 AiUpstreamError 且携带状态码', async () => {
    mockFetch(429, { error: { message: 'rate limited' } });
    await expect(callLow({ baseUrl: 'https://x.test/v1', apiKey: 'k', model: 'm', messages: [] })).rejects.toMatchObject({ status: 429, name: 'AiUpstreamError' });
  });

  it('非 JSON 响应体也按状态码抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('bad'); } }));
    const p = callLow({ baseUrl: 'https://x.test/v1', apiKey: 'k', model: 'm', messages: [] });
    await expect(p).rejects.toBeInstanceOf(AiUpstreamError);
  });

  it('responseFormatJson 时请求体带 json_object', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{}' } }] }) });
    vi.stubGlobal('fetch', f);
    await callLow({ baseUrl: 'https://x.test/v1/', apiKey: 'k', model: 'm', responseFormatJson: true, messages: [{ role: 'user', content: 'hi' }] });
    const body = JSON.parse((f.mock.calls[0] as any)[1].body);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect((f.mock.calls[0] as any)[0]).toBe('https://x.test/v1/chat/completions');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test api/_lib/aiOpenAiCompat.test.ts`
Expected: FAIL（`callLow`/`AiUpstreamError` 未导出）

- [ ] **Step 3: 实现（整文件替换）**

```ts
// api/_lib/aiOpenAiCompat.ts
export class AiUpstreamError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AiUpstreamError';
    this.status = status;
  }
}

function trimJsonEnvelope(text: string): string {
  const s = text.trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) return s.slice(start, end + 1);
  return s;
}

export function toSafeMessage(input: unknown): string {
  const message = input instanceof Error ? input.message : typeof input === 'string' ? input : '';
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(message)) return message;
  return '请求失败，请稍后再试。';
}

export async function callLow(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  responseFormatJson?: boolean;
  messages: Array<{ role: string; content: unknown }>;
}): Promise<{ content: string }> {
  const base = args.baseUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${args.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: args.model,
      temperature: typeof args.temperature === 'number' ? args.temperature : 0,
      ...(args.responseFormatJson ? { response_format: { type: 'json_object' } } : {}),
      messages: args.messages,
    }),
  }).catch(() => {
    throw new AiUpstreamError('AI 服务暂时不可用，请稍后再试。', 0);
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = typeof json?.error?.message === 'string' ? json.error.message : '';
    throw new AiUpstreamError(msg || 'AI 服务暂时不可用，请稍后再试。', res.status);
  }
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new AiUpstreamError('AI 响应为空，请稍后再试。', 502);
  return { content: content.trim() };
}

export async function callOpenAiCompatChatJson(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
}): Promise<{ jsonText: string }> {
  const { content } = await callLow({
    baseUrl: args.baseUrl,
    apiKey: args.apiKey,
    model: args.model,
    temperature: args.temperature,
    responseFormatJson: true,
    messages: [
      { role: 'system', content: args.system },
      { role: 'user', content: args.user },
    ],
  });
  return { jsonText: trimJsonEnvelope(content) };
}
```

- [ ] **Step 4: 运行新测试 + 全量回归**

Run: `pnpm test`
Expected: 新 PASS ×4；既有 meals 测试全绿（`callOpenAiCompatChatJson` 签名未变）

- [ ] **Step 5: Commit**

```bash
git add api/_lib/aiOpenAiCompat.ts api/_lib/aiOpenAiCompat.test.ts
git commit -m "feat(ai): callLow 底层调用（状态码透传 + 多模态 messages）"
```

---

### Task 4: 路由核心 `aiProviderRouterCore.ts`（纯函数，零依赖）

**Files:**
- Create: `api/ai/_lib/aiProviderRouterCore.ts`

**Interfaces:**
- Consumes: 无（纯函数 + 类型）
- Produces:
  - `type Capability = 'text' | 'vision'`、`type CostTier = 'free' | 'paid'`
  - `type ResolvedProvider = { id: string; name: string; baseUrl: string; model: string; apiKey: string; capability: Capability; costTier: CostTier }`
  - `type RoutedRequest = { system: string; user: string; temperature?: number; responseFormatJson?: boolean; imageDataUrl?: string }`
  - `type ProviderCall = (p: ResolvedProvider, req: RoutedRequest) => Promise<{ content: string }>`
  - `shouldCooldown(status: number): boolean`（429/502/503/504/0 → true；其余 false）
  - `class AllProvidersUnavailableError extends Error`（message=「AI 服务繁忙，请稍后再试。」）
  - `runChain(opts: { chain: ResolvedProvider[]; request: RoutedRequest; call: ProviderCall; now: () => number; cooldownMs: number; onResult?: (p: ResolvedProvider, ok: boolean, status: number) => void }): Promise<{ content: string; provider: ResolvedProvider }>`（跳过冷却中项；429/5xx/0 冷却并继续；401/403 跳过不冷却；全败抛 AllProvidersUnavailableError）
  - `isCoolingDown(map: Map<string, number>, id: string, now: number): boolean`
  - `buildEnvFallbackChain(env: Record<string, string | undefined>): ResolvedProvider[]`（复刻现 `AI_LLM_PROVIDER` 逻辑，id 前缀 `env:`）

- [ ] **Step 1: 写失败测试**

```ts
// api/ai/_lib/aiProviderRouterCore.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
  AllProvidersUnavailableError,
  buildEnvFallbackChain,
  isCoolingDown,
  runChain,
  shouldCooldown,
  type ResolvedProvider,
} from './aiProviderRouterCore.js';

const p = (id: string, over: Partial<ResolvedProvider> = {}): ResolvedProvider => ({
  id, name: id, baseUrl: 'https://x.test/v1', model: 'm', apiKey: 'k', capability: 'text', costTier: 'free', ...over,
});
const up = (status: number) => Object.assign(new Error('upstream'), { name: 'AiUpstreamError', status });

describe('shouldCooldown', () => {
  it('429/5xx/0 冷却；400/401/403 不冷却', () => {
    expect([429, 502, 503, 504, 0].every(shouldCooldown)).toBe(true);
    expect([400, 401, 403].some(shouldCooldown)).toBe(false);
  });
});

describe('runChain', () => {
  it('首个 429 后降级到第二个并成功', async () => {
    const call = vi.fn().mockRejectedValueOnce(up(429)).mockResolvedValueOnce({ content: 'ok2' });
    const r = await runChain({ chain: [p('a'), p('b')], request: { system: 's', user: 'u' }, call, now: () => 1000, cooldownMs: 10 * 60_000 });
    expect(r.content).toBe('ok2');
    expect(r.provider.id).toBe('b');
  });

  it('429 的 provider 进入冷却，下次调用直接跳过；窗口过期后恢复', async () => {
    const cooldownMap = new Map<string, number>();
    const call = vi.fn(async (pp: ResolvedProvider) => { if (pp.id === 'a') throw up(429); return { content: pp.id }; });
    const chain = [p('a'), p('b')];
    const base = { chain, request: { system: 's', user: 'u' }, call, cooldownMs: 10 * 60_000, cooldownMap };
    await runChain({ ...base, now: () => 1000 });
    expect(call).toHaveBeenNthCalledWith(1, chain[0], expect.anything());
    await runChain({ ...base, now: () => 2000 }); // a 仍在冷却 → 被跳过
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[1][0].id).toBe('b');
    await runChain({ ...base, now: () => 1000 + 10 * 60_000 + 1 }); // 冷却过期 → a 重新尝试
    expect(call.mock.calls[2][0].id).toBe('a');
  });

  it('401 跳过但不冷却', async () => {
    const cooldownMap = new Map<string, number>();
    const call = vi.fn().mockRejectedValueOnce(up(401)).mockResolvedValueOnce({ content: 'b' });
    const chain = [p('a'), p('b')];
    const r = await runChain({ chain, request: { system: 's', user: 'u' }, call, now: () => 0, cooldownMs: 1, cooldownMap });
    expect(r.content).toBe('b');
    expect(cooldownMap.size).toBe(0); // 401 不进冷却表
  });

  it('链耗尽抛 AllProvidersUnavailableError', async () => {
    const call = vi.fn().mockRejectedValue(up(429));
    await expect(runChain({ chain: [p('a')], request: { system: 's', user: 'u' }, call, now: () => 0, cooldownMs: 1 })).rejects.toBeInstanceOf(AllProvidersUnavailableError);
  });

  it('整链全部处于冷却时也抛链耗尽错误', async () => {
    const call = vi.fn().mockRejectedValue(up(429));
    const opts = { chain: [p('a')], request: { system: 's', user: 'u' }, call, now: () => 0, cooldownMs: 10 };
    await expect(runChain(opts)).rejects.toBeInstanceOf(AllProvidersUnavailableError);
  });
});

describe('buildEnvFallbackChain', () => {
  it('默认 deepseek', () => {
    const chain = buildEnvFallbackChain({ DEEPSEEK_API_KEY: 'ds-key' });
    expect(chain).toHaveLength(1);
    expect(chain[0]).toMatchObject({ id: 'env:deepseek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com', apiKey: 'ds-key' });
  });
  it('openai 选择与空 key 返回空链', () => {
    expect(buildEnvFallbackChain({ AI_LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'oa' })[0]).toMatchObject({ id: 'env:openai', baseUrl: 'https://api.openai.com/v1' });
    expect(buildEnvFallbackChain({})).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test api/ai/_lib/aiProviderRouterCore.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// api/ai/_lib/aiProviderRouterCore.ts
export type Capability = 'text' | 'vision';
export type CostTier = 'free' | 'paid';

export type ResolvedProvider = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  capability: Capability;
  costTier: CostTier;
};

export type RoutedRequest = {
  system: string;
  user: string;
  temperature?: number;
  responseFormatJson?: boolean;
  imageDataUrl?: string; // 存在时 user content 组装为 [text, image_url] 多模态
};

export type ProviderCall = (p: ResolvedProvider, req: RoutedRequest) => Promise<{ content: string }>;

export class AllProvidersUnavailableError extends Error {
  constructor() {
    super('AI 服务繁忙，请稍后再试。');
    this.name = 'AllProvidersUnavailableError';
  }
}

const ERROR_STATUSES = new Set([0, 429, 502, 503, 504]);

export function shouldCooldown(status: number): boolean {
  return ERROR_STATUSES.has(status);
}

export function isCoolingDown(map: Map<string, number>, id: string, now: number): boolean {
  const until = map.get(id);
  return typeof until === 'number' && until > now;
}

export async function runChain(opts: {
  chain: ResolvedProvider[];
  request: RoutedRequest;
  call: ProviderCall;
  now: () => number;
  cooldownMs: number;
  cooldownMap?: Map<string, number>;
  onResult?: (p: ResolvedProvider, ok: boolean, status: number) => void;
}): Promise<{ content: string; provider: ResolvedProvider }> {
  const cooldown = opts.cooldownMap ?? new Map<string, number>();
  const now = opts.now();
  for (const provider of opts.chain) {
    if (isCoolingDown(cooldown, provider.id, now)) continue;
    try {
      const { content } = await opts.call(provider, opts.request);
      cooldown.delete(provider.id);
      opts.onResult?.(provider, true, 200);
      return { content, provider };
    } catch (err: any) {
      const status: number = typeof err?.status === 'number' ? err.status : 0;
      if (shouldCooldown(status)) cooldown.set(provider.id, now + opts.cooldownMs);
      opts.onResult?.(provider, false, status);
    }
  }
  throw new AllProvidersUnavailableError();
}

export function buildEnvFallbackChain(env: Record<string, string | undefined>): ResolvedProvider[] {
  const provider = String(env.AI_LLM_PROVIDER ?? 'deepseek').toLowerCase() === 'openai' ? 'openai' : 'deepseek';
  if (provider === 'openai') {
    const apiKey = env.OPENAI_API_KEY ?? '';
    if (!apiKey) return [];
    return [{ id: 'env:openai', name: 'env-openai', baseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1', apiKey, model: env.OPENAI_MODEL ?? 'gpt-4o-mini', capability: 'text', costTier: 'paid' }];
  }
  const apiKey = env.DEEPSEEK_API_KEY ?? '';
  if (!apiKey) return [];
  return [{ id: 'env:deepseek', name: 'env-deepseek', baseUrl: env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com', apiKey, model: env.DEEPSEEK_MODEL ?? 'deepseek-chat', capability: 'text', costTier: 'paid' }];
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test api/ai/_lib/aiProviderRouterCore.test.ts`
Expected: PASS ×7

- [ ] **Step 5: Commit**

```bash
git add api/ai/_lib/aiProviderRouterCore.ts api/ai/_lib/aiProviderRouterCore.test.ts
git commit -m "feat(ai): 路由链核心（冷却状态机 + env 兜底链）"
```

---

### Task 5: 路由装配 `aiProviderRouter.ts`（DB 链加载 + 缓存 + callRoutedChat）

**Files:**
- Create: `api/ai/_lib/aiProviderRouter.ts`

**Interfaces:**
- Consumes: Task 1 表结构、Task 2 `decryptApiKey`、Task 3 `callLow`/`AiUpstreamError`、Task 4 core 全部导出
- Produces:
  - `getProviderChain(capability: Capability, deps?: { loadRows?: () => Promise<ProviderRow[]> }): Promise<ResolvedProvider[]>`（60s 进程内缓存按 capability 分份；DB 空表/查询失败回落 `buildEnvFallbackChain(process.env)`——env 回落链不参与缓存）
  - `callRoutedChat(capability: Capability, request: RoutedRequest, deps?: { loadChain?, call?, now? }): Promise<{ content: string; provider: ResolvedProvider }>`
  - `resetRouterCacheForTests(): void`
  - `providerCall(p, req): ProviderCall`（默认实现：callLow + 多模态 + 15s 单 provider 超时 `AbortSignal.timeout`）

- [ ] **Step 1: 实现**（组装层以注入点覆盖测试于 Task 4；此处补一个缓存命中集成测试）

```ts
// api/ai/_lib/aiProviderRouter.ts
import { callLow, AiUpstreamError } from '../../_lib/aiOpenAiCompat.js';
import { decryptApiKey } from './providerSecret.js';
import {
  buildEnvFallbackChain, runChain,
  type Capability, type ProviderCall, type ResolvedProvider, type RoutedRequest,
} from './aiProviderRouterCore.js';

export type ProviderRow = {
  id: string; name: string; base_url: string; model: string;
  api_key_encrypted: string; capability: Capability; cost_tier: 'free' | 'paid';
};

const CACHE_TTL_MS = 60_000;
const PER_PROVIDER_TIMEOUT_MS = 15_000;
const COOLDOWN_MS = 10 * 60_000;

const cache = new Map<Capability, { until: number; chain: ResolvedProvider[] }>();
const cooldownMap = new Map<string, number>();

export function resetRouterCacheForTests() {
  cache.clear();
  cooldownMap.clear();
}

function adminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('服务配置缺失，请联系管理员。');
  return import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }));
}

async function defaultLoadRows(): Promise<ProviderRow[]> {
  const client = await adminClient();
  const { data, error } = await client.from('ai_providers')
    .select('id,name,base_url,model,api_key_encrypted,capability,cost_tier')
    .eq('enabled', true)
    .order('priority', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProviderRow[];
}

function toChain(rows: ProviderRow[], capability: Capability): ResolvedProvider[] {
  const out: ResolvedProvider[] = [];
  for (const row of rows) {
    if (row.capability !== capability) continue;
    try {
      out.push({
        id: row.id, name: row.name, baseUrl: row.base_url, model: row.model,
        apiKey: decryptApiKey(row.api_key_encrypted), capability: row.capability, costTier: row.cost_tier,
      });
    } catch {
      // 单条解密失败（如主密钥轮换后未重录 key）：跳过该项，日志留痕，不炸整链
      console.warn('[aiRouter] decrypt skipped', { provider: row.name });
    }
  }
  return out;
}

export async function getProviderChain(capability: Capability, deps?: { loadRows?: () => Promise<ProviderRow[]> }): Promise<ResolvedProvider[]> {
  const hit = cache.get(capability);
  const now = Date.now();
  if (hit && hit.until > now) return hit.chain;
  try {
    const rows = await (deps?.loadRows ?? defaultLoadRows)();
    const chain = toChain(rows, capability);
    if (chain.length > 0) {
      cache.set(capability, { until: now + CACHE_TTL_MS, chain });
      return chain;
    }
  } catch (err) {
    console.warn('[aiRouter] load failed, fallback to env', { message: err instanceof Error ? err.message : String(err) });
  }
  return buildEnvFallbackChain(process.env); // 空表/查询失败 → env 兜底（不缓存，表就绪后自动接管）
}

export function providerCall(p: ResolvedProvider, req: RoutedRequest): Promise<{ content: string }> {
  const messages: Array<{ role: string; content: unknown }> = [
    { role: 'system', content: req.system },
    req.imageDataUrl
      ? { role: 'user', content: [{ type: 'text', text: req.user }, { type: 'image_url', image_url: { url: req.imageDataUrl } }] }
      : { role: 'user', content: req.user },
  ];
  return Promise.race([
    callLow({ baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model, temperature: req.temperature, responseFormatJson: req.responseFormatJson, messages }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new AiUpstreamError('AI 响应超时，请稍后再试。', 0)), PER_PROVIDER_TIMEOUT_MS).unref?.()),
  ]);
}

export async function callRoutedChat(
  capability: Capability,
  request: RoutedRequest,
  deps?: { loadRows?: () => Promise<ProviderRow[]>; call?: ProviderCall; now?: () => number },
): Promise<{ content: string; provider: ResolvedProvider }> {
  const chain = await getProviderChain(capability, deps);
  const result = await runChain({
    chain,
    request,
    call: deps?.call ?? providerCall,
    now: deps?.now ?? (() => Date.now()),
    cooldownMs: COOLDOWN_MS,
    cooldownMap,
    onResult: (p, ok, status) => console.log('[aiRouter] call', { provider: p.name, model: p.model, costTier: p.costTier, ok, status }),
  });
  return result;
}
```

- [ ] **Step 2: 类型与编译检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无新增错误（api/ 若不在 tsconfig include 内，以 `pnpm test` 全绿 + `pnpm build` 为准）

- [ ] **Step 3: 回归测试**

Run: `pnpm test`
Expected: 全绿

- [ ] **Step 4: Commit**

```bash
git add api/ai/_lib/aiProviderRouter.ts
git commit -m "feat(ai): 路由装配层（DB 链 + 60s 缓存 + env 兜底 + callRoutedChat）"
```

---

### Task 6: 管理员守卫 `requirePlatformAdmin`

**Files:**
- Create: `api/ai/_lib/adminGuard.ts`
- Test: `api/ai/_lib/adminGuard.test.ts`

**Interfaces:**
- Consumes: `authGetUser`（`api/_lib/supabaseAuthCompat.js`）、service role client、Task 1 `platform_admins`
- Produces: `requirePlatformAdmin(args: { headers: Record<string, string | string[] | undefined>, verifyToken?: (token: string) => Promise<string | null>, isAdmin?: (userId: string) => Promise<boolean> }): Promise<{ userId: string; error?: never } | { userId?: never; error: { status: number; message: string } }>`；另导出 `bearerToken(headers)`（Task 8+ 端点可复用）

- [ ] **Step 1: 写失败测试**

```ts
// api/ai/_lib/adminGuard.test.ts
import { describe, expect, it, vi } from 'vitest';
import { requirePlatformAdmin } from './adminGuard.js';

describe('requirePlatformAdmin', () => {
  it('无 token → 401', async () => {
    const r = await requirePlatformAdmin({ headers: {} });
    expect(r.error).toMatchObject({ status: 401 });
  });

  it('非管理员 → 403', async () => {
    const verifyToken = vi.fn().mockResolvedValue('u1');
    const isAdmin = vi.fn().mockResolvedValue(false);
    const r = await requirePlatformAdmin({ headers: { authorization: 'Bearer t' }, verifyToken, isAdmin });
    expect(r.error).toMatchObject({ status: 403 });
  });

  it('管理员 → 返回 userId', async () => {
    const r = await requirePlatformAdmin({
      headers: { authorization: 'Bearer t' },
      verifyToken: async () => 'u1',
      isAdmin: async () => true,
    });
    expect(r).toMatchObject({ userId: 'u1' });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test api/ai/_lib/adminGuard.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// api/ai/_lib/adminGuard.ts
import { authGetUser } from '../../_lib/supabaseAuthCompat.js';

type Headers = Record<string, string | string[] | undefined>;

function pickHeader(headers: Headers, key: string): string | undefined {
  const value = headers?.[key] ?? headers?.[key.toLowerCase()];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
}

export function bearerToken(headers: Headers): string | null {
  const auth = pickHeader(headers, 'authorization');
  const m = auth?.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

async function defaultVerifyToken(token: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await authGetUser(client, token);
  return error ? null : (data.user?.id ?? null);
}

async function defaultIsAdmin(userId: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return false;
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data } = await client.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
  return Boolean(data);
}

export async function requirePlatformAdmin(args: {
  headers: Headers;
  verifyToken?: (token: string) => Promise<string | null>;
  isAdmin?: (userId: string) => Promise<boolean>;
}): Promise<{ userId: string; error?: never } | { userId?: never; error: { status: number; message: string } }> {
  const token = bearerToken(args.headers);
  if (!token) return { error: { status: 401, message: '未登录或登录已过期，请重新登录。' } };
  const userId = await (args.verifyToken ?? defaultVerifyToken)(token);
  if (!userId) return { error: { status: 401, message: '未登录或登录已过期，请重新登录。' } };
  const ok = await (args.isAdmin ?? defaultIsAdmin)(userId);
  if (!ok) return { error: { status: 403, message: '无权限访问模型管理。' } };
  return { userId };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test api/ai/_lib/adminGuard.test.ts`
Expected: PASS ×3

- [ ] **Step 5: Commit**

```bash
git add api/ai/_lib/adminGuard.ts api/ai/_lib/adminGuard.test.ts
git commit -m "feat(ai): platform_admins 管理端点守卫"
```

---

### Task 7: 管理端点共享层（schema + 行映射 + 端点骨架助手）

**Files:**
- Create: `api/ai/_lib/providersSchema.ts`
- Create: `api/ai/_lib/endpointKit.ts`

**Interfaces:**
- Consumes: zod（既有依赖）、Task 2 `encryptApiKey`/`maskApiKey`、Task 6 `requirePlatformAdmin`
- Produces:
  - `ProviderCreateSchema`（name/base_url/model/api_key/capability/cost_tier/enabled?/priority?）、`ProviderPatchSchema`（api_key 可缺省 = 不修改）
  - `toPublicRow(row: AdminRow): PublicProvider`（剥离密文，保留掩码与元数据）
  - `skeleton(tracePrefix: string, req, res, opts: { method: 'GET'|'POST'|'PATCH'|'DELETE', write?: boolean }, handler: (userId: string) => Promise<void>): Promise<void>` —— 统一完成：no-store、方法校验（405）、Bearer→管理员校验、写操作限流（30 次/60s/IP）、try/catch → `{ message, traceId }` 安全错误出口

- [ ] **Step 1: 实现两个文件**

```ts
// api/ai/_lib/providersSchema.ts
import { z } from 'zod';

export const ProviderCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  base_url: z.string().trim().url(),
  model: z.string().trim().min(1).max(80),
  api_key: z.string().trim().min(1).max(300),
  capability: z.enum(['text', 'vision']),
  cost_tier: z.enum(['free', 'paid']),
  enabled: z.boolean().optional().default(true),
  priority: z.number().int().optional(),
});

export const ProviderPatchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  base_url: z.string().trim().url().optional(),
  model: z.string().trim().min(1).max(80).optional(),
  api_key: z.string().trim().min(1).max(300).optional(),
  capability: z.enum(['text', 'vision']).optional(),
  cost_tier: z.enum(['free', 'paid']).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
});

export type AdminRow = {
  id: string; name: string; base_url: string; model: string;
  api_key_mask: string; capability: 'text' | 'vision'; cost_tier: 'free' | 'paid';
  priority: number; enabled: boolean;
  test_status: string | null; test_detail: string | null; tested_at: string | null;
  created_at?: string; updated_at?: string;
};

export function toPublicRow(row: AdminRow) {
  return {
    id: row.id, name: row.name, base_url: row.base_url, model: row.model,
    api_key_mask: row.api_key_mask, capability: row.capability, cost_tier: row.cost_tier,
    priority: row.priority, enabled: row.enabled,
    test_status: row.test_status, test_detail: row.test_detail, tested_at: row.tested_at,
  };
}
```

```ts
// api/ai/_lib/endpointKit.ts
import { toSafeMessage } from '../../_lib/aiOpenAiCompat.js';
import { requirePlatformAdmin } from './adminGuard.js';

type RequestLike = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type ResponseLike = { status: (code: number) => ResponseLike; setHeader: (k: string, v: string) => void; json: (p: unknown) => void };

function pickHeader(headers: RequestLike['headers'], key: string): string | undefined {
  const value = headers?.[key] ?? headers?.[key.toLowerCase()];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
}

function clientIp(headers: RequestLike['headers']): string {
  return pickHeader(headers, 'x-forwarded-for')?.split(',')[0]?.trim() || pickHeader(headers, 'x-real-ip') || 'unknown';
}

type RateState = { s: number; n: number };
const rate = new Map<string, RateState>();
function limit(key: string, cap: number, winMs: number): boolean {
  const now = Date.now();
  const cur = rate.get(key);
  if (!cur || now - cur.s >= winMs) { rate.set(key, { s: now, n: 1 }); return true; }
  if (cur.n >= cap) return false;
  cur.n += 1;
  return true;
}

export function makeTraceId(): string {
  const c: any = globalThis as any;
  return `aip_${c?.crypto?.randomUUID?.() ?? `${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`}`;
}

export async function skeleton(
  tracePrefix: string,
  req: RequestLike,
  res: ResponseLike,
  opts: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; write?: boolean },
  handler: (userId: string, t: string) => Promise<void>,
): Promise<void> {
  const t = makeTraceId();
  res.setHeader('Cache-Control', 'no-store');
  try {
    if ((req.method ?? 'GET').toUpperCase() !== opts.method) {
      return res.status(405).json({ message: '不支持的请求方法。', traceId: t });
    }
    if (opts.write && !limit(`${tracePrefix}:${clientIp(req.headers)}`, 30, 60_000)) {
      return res.status(429).json({ message: '操作过于频繁，请稍后再试。', traceId: t });
    }
    const guard = await requirePlatformAdmin({ headers: req.headers ?? {} });
    if (guard.error) return res.status(guard.error.status).json({ message: guard.error.message, traceId: t });
    await handler(guard.userId, t);
  } catch (err: unknown) {
    console.error(`[api/${tracePrefix}]`, { traceId: t, message: err instanceof Error ? err.message : String(err) });
    return res.status(400).json({ message: toSafeMessage(err), traceId: t });
  }
}

export async function adminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('服务配置缺失，请联系管理员。');
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
```

- [ ] **Step 2: 回归 + Commit**

Run: `pnpm test` → 全绿
```bash
git add api/ai/_lib/providersSchema.ts api/ai/_lib/endpointKit.ts
git commit -m "feat(ai): 管理端点共享 schema 与骨架助手"
```

---

### Task 8: 管理端点 list / create / update

**Files:**
- Create: `api/ai/providers/list.ts`、`api/ai/providers/create.ts`、`api/ai/providers/update.ts`

**Interfaces:**
- Consumes: Task 7 `skeleton`/`adminClient`/schema、Task 2 加密、Task 5 `resetRouterCacheForTests`（写后清本实例缓存经 `aiProviderRouter.clearInstanceCache()` —— **需在 Task 5 文件中追加导出 `clearInstanceCache()`，本任务 Step 0 先补**）
- Produces: `GET/POST/PATCH /api/ai/providers/*`，响应 `PublicProvider`（无 api_key 任何形态）

- [ ] **Step 0: 在 `api/ai/_lib/aiProviderRouter.ts` 追加**

```ts
export function clearInstanceCache() {
  cache.clear();
}
```

- [ ] **Step 1: 实现三端点**

```ts
// api/ai/providers/list.ts
import { adminClient, skeleton } from '../_lib/endpointKit.js';
import { toPublicRow, type AdminRow } from '../_lib/providersSchema.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.list', req, res, { method: 'GET' }, async () => {
    const client = await adminClient();
    const { data, error } = await client.from('ai_providers').select('*').order('priority', { ascending: true });
    if (error) throw new Error('读取模型清单失败。');
    res.status(200).json({ providers: (data ?? []).map((r: AdminRow) => toPublicRow(r)) });
  });
}
```

```ts
// api/ai/providers/create.ts
import { encryptApiKey, maskApiKey } from '../_lib/providerSecret.js';
import { clearInstanceCache } from '../_lib/aiProviderRouter.js';
import { adminClient, skeleton } from '../_lib/endpointKit.js';
import { ProviderCreateSchema, toPublicRow } from '../_lib/providersSchema.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.create', req, res, { method: 'POST', write: true }, async (_userId, t) => {
    const parsed = ProviderCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '参数不合法，请检查名称、端点与模型。', traceId: t });
    const client = await adminClient();
    let priority = parsed.data.priority;
    if (priority === undefined) {
      const { data: maxRow } = await client.from('ai_providers').select('priority').order('priority', { ascending: false }).limit(1).maybeSingle();
      priority = Number(maxRow?.priority ?? 0) + 1;
    }
    const payload = {
      name: parsed.data.name, base_url: parsed.data.base_url, model: parsed.data.model,
      api_key_encrypted: encryptApiKey(parsed.data.api_key),
      api_key_mask: maskApiKey(parsed.data.api_key),
      capability: parsed.data.capability, cost_tier: parsed.data.cost_tier,
      priority, enabled: parsed.data.enabled,
    };
    const { data, error } = await client.from('ai_providers').insert(payload).select('*').single();
    if (error) return res.status(400).json({ message: '保存失败，请重试。', traceId: t });
    clearInstanceCache();
    res.status(200).json({ provider: toPublicRow(data) });
  });
}
```

```ts
// api/ai/providers/update.ts
import { z } from 'zod';
import { encryptApiKey, maskApiKey } from '../_lib/providerSecret.js';
import { clearInstanceCache } from '../_lib/aiProviderRouter.js';
import { adminClient, skeleton } from '../_lib/endpointKit.js';
import { ProviderPatchSchema, toPublicRow } from '../_lib/providersSchema.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.update', req, res, { method: 'PATCH', write: true }, async (_userId, t) => {
    const parsed = z.object({ id: z.string().uuid(), patch: ProviderPatchSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '参数不合法。', traceId: t });
    const { id, patch } = parsed.data;
    const update: Record<string, unknown> = { ...patch };
    if (patch.api_key) {
      update.api_key_encrypted = encryptApiKey(patch.api_key);
      update.api_key_mask = maskApiKey(patch.api_key);
    }
    delete update.api_key;
    const client = await adminClient();
    const { data, error } = await client.from('ai_providers').update(update).eq('id', id).select('*').maybeSingle();
    if (error || !data) return res.status(400).json({ message: '更新失败，模型可能已被删除。', traceId: t });
    clearInstanceCache();
    res.status(200).json({ provider: toPublicRow(data) });
  });
}
```

- [ ] **Step 2: 验证响应不含密钥**

Run: `grep -n "api_key" api/ai/providers/list.ts`
Expected: 仅出现 `api_key_mask`（经 `toPublicRow`），无 `api_key_encrypted` 透出路径（`toPublicRow` 白名单字段已保证）

- [ ] **Step 3: Commit**

```bash
git add api/ai/providers api/ai/_lib/aiProviderRouter.ts
git commit -m "feat(ai): 管理端点 list/create/update"
```

---

### Task 9: 管理端点 delete / reorder / test

**Files:**
- Create: `api/ai/providers/delete.ts`、`api/ai/providers/reorder.ts`、`api/ai/providers/test.ts`

**Interfaces:**
- Consumes: Task 7 共享层、Task 5 `getProviderChain`（test 复用行解密逻辑经 `decryptApiKey`）、`AiUpstreamError`
- Produces: `DELETE/POST /api/ai/providers/delete|reorder|test`；test 响应 `{ status: 'ok'|'error', latencyMs: number, detail?: string }`

- [ ] **Step 1: 实现三端点**

```ts
// api/ai/providers/delete.ts
import { z } from 'zod';
import { clearInstanceCache } from '../_lib/aiProviderRouter.js';
import { adminClient, skeleton } from '../_lib/endpointKit.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.delete', req, res, { method: 'POST', write: true }, async (_userId, t) => {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '参数不合法。', traceId: t });
    const client = await adminClient();
    const { error } = await client.from('ai_providers').delete().eq('id', parsed.data.id);
    if (error) return res.status(400).json({ message: '删除失败，请重试。', traceId: t });
    clearInstanceCache();
    res.status(200).json({ ok: true });
  });
}
```

```ts
// api/ai/providers/reorder.ts
import { z } from 'zod';
import { clearInstanceCache } from '../_lib/aiProviderRouter.js';
import { adminClient, skeleton } from '../_lib/endpointKit.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.reorder', req, res, { method: 'POST', write: true }, async (_userId, t) => {
    const parsed = z.object({ ids: z.array(z.string().uuid()).min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '参数不合法。', traceId: t });
    const client = await adminClient();
    for (let i = 0; i < parsed.data.ids.length; i += 1) {
      const { error } = await client.from('ai_providers').update({ priority: i + 1 }).eq('id', parsed.data.ids[i]);
      if (error) return res.status(400).json({ message: '调整顺序失败，请刷新后重试。', traceId: t });
    }
    clearInstanceCache();
    res.status(200).json({ ok: true });
  });
}
```

```ts
// api/ai/providers/test.ts
import { z } from 'zod';
import { AiUpstreamError } from '../../_lib/aiOpenAiCompat.js';
import { callLow } from '../../_lib/aiOpenAiCompat.js';
import { decryptApiKey } from '../_lib/providerSecret.js';
import { adminClient, skeleton } from '../_lib/endpointKit.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.test', req, res, { method: 'POST', write: true }, async (_userId, t) => {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '参数不合法。', traceId: t });
    const client = await adminClient();
    const { data } = await client.from('ai_providers').select('*').eq('id', parsed.data.id).maybeSingle();
    if (!data) return res.status(400).json({ message: '模型不存在。', traceId: t });

    const started = Date.now();
    let status: 'ok' | 'error' = 'ok';
    let detail: string | null = null;
    try {
      await callLow({
        baseUrl: data.base_url, apiKey: decryptApiKey(data.api_key_encrypted), model: data.model,
        temperature: 0,
        messages: [{ role: 'user', content: '仅回复 ok 两个字符，不要输出其他内容。' }],
      });
    } catch (err) {
      status = 'error';
      const st = err instanceof AiUpstreamError ? err.status : 0;
      detail = st === 401 || st === 403 ? 'API Key 无效或已过期' : st === 429 ? '触发限流（429）' : st === 0 ? '网络不可达或超时' : `上游返回 ${st}`;
    }
    const latencyMs = Date.now() - started;
    await client.from('ai_providers').update({ test_status: status, test_detail: detail ? `${detail}（${latencyMs}ms）` : `${latencyMs}ms`, tested_at: new Date().toISOString() }).eq('id', parsed.data.id);
    res.status(200).json({ status, latencyMs, detail: detail ?? undefined });
  });
}
```

- [ ] **Step 2: 类型检查 + 回归**

Run: `pnpm test && npx tsc --noEmit -p tsconfig.json`
Expected: 全绿、无新增类型错误

- [ ] **Step 3: Commit**

```bash
git add api/ai/providers
git commit -m "feat(ai): 管理端点 delete/reorder/test"
```

---

### Task 10: Vite 本地中间件泛化 + 注册管理端点

**Files:**
- Modify: `vite.config.ts:14-17`（POST-only 校验 → 声明式方法白名单）、`vite.config.ts:65-81`（注册 6 个 providers 端点）

**Interfaces:**
- Consumes: `api/ai/providers/*.ts` 各 handler
- Produces: dev server 下 `/api/ai/providers/{list,create,update,delete,reorder,test}` 可达；旧端点行为不变

- [ ] **Step 1: 泛化 `localApiPlugin`**

签名改为 `localApiPlugin(name, path, loadHandler, fallbackMessage, methods: string[] = ['POST'])`；将现有校验：

```ts
if ((req.method ?? 'GET').toUpperCase() !== 'POST') {
```

替换为：

```ts
if (!methods.includes((req.method ?? 'GET').toUpperCase())) {
```

- [ ] **Step 2: 更新既有注册并新增 6 个**

既有 6 个插件调用追加 `['POST']`（含 `/api/account/delete`、`/api/members/create` 等，行为不变）。新增：

```ts
const providersEndpoint = (action: 'list' | 'create' | 'update' | 'delete' | 'reorder' | 'test', method: string) =>
  localApiPlugin(`local-ai-providers-${action}`, `/api/ai/providers/${action}`, async () => (await import(`./api/ai/providers/${action}`)).default, '模型管理操作失败，请稍后再试。', [method]);

// 数组项本身是合法静态路径，Vite 插件数组支持嵌套，直接展开注册：
...[
  providersEndpoint('list', 'GET'),
  providersEndpoint('create', 'POST'),
  providersEndpoint('update', 'PATCH'),
  providersEndpoint('delete', 'POST'),
  providersEndpoint('reorder', 'POST'),
  providersEndpoint('test', 'POST'),
],
```

- [ ] **Step 3: 冒烟验证**

Run: `pnpm build`（确认 vite.config 类型无误）；再 `pnpm dev` 后：
```bash
curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/api/ai/providers/list        # 期望 401（无 token，证明路由可达且守卫生效）
curl -s -o /dev/null -w '%{http_code}' -X PUT http://localhost:5173/api/ai/providers/list # 期望 405
```

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "feat(ai): 本地中间件支持多方法并注册模型管理端点"
```

---

### Task 11: 5 个消费端点切换到路由层（含 chat.ts 注入点）

**Files:**
- Modify: `api/_lib/aiTools.ts:374-426`（`pickToolId` 增加 `callJson?` 注入点）
- Modify: `api/ai/chat.ts:115-133`
- Modify: `api/meals/recommend.ts:45-49,112-119`
- Modify: `api/bills/parse.ts`（文本路径 L233-248、env 检查 L234/L250-251、vision 路径 L281-285）
- Modify: `api/health-reports/parse.ts:222-260`

**Interfaces:**
- Consumes: Task 5 `callRoutedChat`、Task 3 `callOpenAiCompatChatJson`（env 回落用）
- Produces: 各端点响应 meta 追加 `provider: string`；日志 `[端点] ai-call { provider, model, costTier, traceId }`；表空时行为与今日完全一致

- [ ] **Step 1: `aiTools.ts` 注入点（保持向后兼容）**

`pickToolId` args 增加 `callJson?: (a: { system: string; user: string; temperature: number }) => Promise<string>`；`const llm = async () => { ... }` 体首行插入：

```ts
if (args.callJson) return await args.callJson({ system, user, temperature: 0 });
```

既有 `provider/deepseek/openai` 分支保留（供直调方与既有测试），签名不破坏。

- [ ] **Step 2: `api/ai/chat.ts`**

L115-133 替换为：

```ts
const { toolId, confidence } = await pickToolId({
  message: parsed.data.message,
  module: parsed.data.module,
  provider: 'deepseek', // 兼容旧字段；实际调用走 callJson 注入
  callJson: async ({ system, user, temperature }) => {
    const { content } = await callRoutedChat('text', { system, user, temperature, responseFormatJson: true });
    return content;
  },
  traceId: t,
});
```

并在成功响应前日志：`console.log('[api/ai/chat] ai-call', { traceId: t, toolId })`（pickToolId 内部吞错保持现有降级行为）。顶部 import `callRoutedChat`。

- [ ] **Step 3: `api/meals/recommend.ts`**

`callAI` 替换为：

```ts
async function callAI(system: string, user: string, traceId: string): Promise<string> {
  const { content, provider } = await callRoutedChat('text', { system, user, temperature: 0.6, responseFormatJson: true });
  console.log('[api/meals/recommend] ai-call', { traceId, provider: provider.name, model: provider.model, costTier: provider.costTier });
  return content;
}
```

删除 L112-119 的 provider 组装与 L117-119 的缺 key 检查（路由层错误信息已友好），更新调用点签名传 `traceId`。

- [ ] **Step 4: `api/bills/parse.ts`**

- 文本路径（provider==='deepseek' 与 else 两分支合并）：`content = (await callRoutedChat('text', { system: '', user: prompt })).content;`（保留原 maxChars 校验；删除 `DEEPSEEK_API_KEY`/`OPENAI_API_KEY` 的 500 检查）
- 图片路径：`content = (await callRoutedChat('vision', { system: '', user: prompt, imageDataUrl: `data:${mime};base64,${base64}` })).content;`；当 `getProviderChain('vision')` 结果为空（含 env 回落也不支持 vision——env 链 capability 为 text）时，保留 L281 现有「DeepSeek 不支持图片直传」错误文案改为「尚未配置视觉模型，请在 设置 → AI 模型管理 中添加 vision 模型。」
- 顶部 import `callRoutedChat`。

- [ ] **Step 5: `api/health-reports/parse.ts`**

L222-260 的 deepseek/openai 双分支合并为：`content = (await callRoutedChat('text', { system, user })).content;`；删除两分支的 key 500 检查与 `withServerTimeout(callOpenAiCompatChat(...))` 局部调用（超时已由路由层 15s/provider 接管；`withServerTimeout` 若仍被别处引用则保留函数本体）。

- [ ] **Step 6: 回归 + 手工冒烟**

Run: `pnpm test`
Expected: 全绿（meals 纯函数测试不经网络）。dev server 冒烟留待 Task 13 统一执行（需真实表/密钥）。

- [ ] **Step 7: Commit**

```bash
git add api/_lib/aiTools.ts api/ai/chat.ts api/meals/recommend.ts api/bills/parse.ts api/health-reports/parse.ts
git commit -m "feat(ai): 消费端点切换至统一 provider 路由"
```

---

### Task 12: 前端数据层（类型 + API 客户端 + hooks）

**Files:**
- Create: `src/lib/aiProviders.ts`
- Create: `src/hooks/useAiProviders.ts`

**Interfaces:**
- Consumes: `supabase`（`@/lib/supabase`）、Task 8/9 端点契约（`PublicProvider` 字段 = `toPublicRow` 输出）
- Produces:
  - `type PublicProvider`、`type ProviderDraft`
  - `providersApi.list/create/update/remove/reorder/test(token)`（403 → `throw new ApiError(403)`）
  - `useAiProviders()` → `{ providers, isLoading, isAdmin, isError, refetch, create, update, remove, reorder, test, isMutating }`（TanStack Query；`isAdmin = !isError && 非 403`）

- [ ] **Step 1: 实现客户端与 hooks**

```ts
// src/lib/aiProviders.ts
import { supabase } from './supabase';

export type PublicProvider = {
  id: string; name: string; base_url: string; model: string;
  api_key_mask: string; capability: 'text' | 'vision'; cost_tier: 'free' | 'paid';
  priority: number; enabled: boolean;
  test_status: 'ok' | 'error' | null; test_detail: string | null; tested_at: string | null;
};

export type ProviderDraft = {
  name: string; base_url: string; model: string; api_key?: string;
  capability: 'text' | 'vision'; cost_tier: 'free' | 'paid'; enabled?: boolean;
};

export class ApiError extends Error {
  status: number;
  traceId?: string;
  constructor(status: number, message: string, traceId?: string) {
    super(message);
    this.status = status;
    this.traceId = traceId;
  }
}

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.message ?? '请求失败，请稍后再试。', json?.traceId);
  return json as T;
}

export const providersApi = {
  list: () => request<{ providers: PublicProvider[] }>('ai/providers/list', 'GET'),
  create: (draft: ProviderDraft) => request<{ provider: PublicProvider }>('ai/providers/create', 'POST', draft),
  update: (id: string, patch: Partial<ProviderDraft>) => request<{ provider: PublicProvider }>('ai/providers/update', 'PATCH', { id, patch }),
  remove: (id: string) => request<{ ok: true }>('ai/providers/delete', 'POST', { id }),
  reorder: (ids: string[]) => request<{ ok: true }>('ai/providers/reorder', 'POST', { ids }),
  test: (id: string) => request<{ status: 'ok' | 'error'; latencyMs: number; detail?: string }>('ai/providers/test', 'POST', { id }),
};
```

```ts
// src/hooks/useAiProviders.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, providersApi, type ProviderDraft, type PublicProvider } from '@/lib/aiProviders';

export function useAiProviders() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['ai-providers'],
    queryFn: () => providersApi.list().then((r) => r.providers),
    retry: (count, err) => !(err instanceof ApiError && (err.status === 401 || err.status === 403)) && count < 2,
  });
  const isAdmin = !query.isError || !(query.error instanceof ApiError && query.error.status === 403);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['ai-providers'] });
  const create = useMutation({ mutationFn: (draft: ProviderDraft) => providersApi.create(draft), onSuccess: invalidate });
  const update = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<ProviderDraft> }) => providersApi.update(id, patch), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => providersApi.remove(id), onSuccess: invalidate });
  const reorder = useMutation({ mutationFn: (ids: string[]) => providersApi.reorder(ids), onSuccess: invalidate });
  const test = useMutation({ mutationFn: (id: string) => providersApi.test(id), onSuccess: invalidate });

  return { providers: query.data ?? [], isLoading: query.isLoading, isAdmin, refetch: query.refetch, create, update, remove, reorder, test };
}
```

- [ ] **Step 2: 构建验证 + Commit**

Run: `pnpm build`
Expected: tsc + vite 构建通过
```bash
git add src/lib/aiProviders.ts src/hooks/useAiProviders.ts
git commit -m "feat(ai): 模型清单前端数据层"
```

---

### Task 13: 管理界面 `/settings/ai-providers` + 导航入口 + 路由守卫

**Files:**
- Create: `src/pages/settings/AiProviders.tsx`
- Modify: `src/App.tsx:33,81`（import + Route）
- Modify: `src/config/navigation.ts`（`NavLinkNode` 增 `adminOnly?: boolean`；设置分组「信任中心」后追加 `{ name: 'AI 模型管理', href: '/settings/ai-providers', icon: Bot, adminOnly: true }`）
- Modify: `src/layouts/app-shell/Panel.tsx`、`src/layouts/app-shell/MobileDrawer.tsx`（渲染 group.children / 顶层 link 处按 `adminOnly && !isAdmin` 过滤）

**Interfaces:**
- Consumes: Task 12 `useAiProviders`、ui 组件（Card/Badge/Button/Input/Select/Inline/Page/useConfirm/toast）
- Produces: 完整管理界面；非管理员直达 URL 显示「无权限」空态

- [ ] **Step 1: 页面实现（要点骨架，字段与交互按 spec §7）**

```tsx
// src/pages/settings/AiProviders.tsx（核心结构）
export default function SettingsAiProviders() {
  const { providers, isLoading, isAdmin, create, update, remove, reorder, test } = useAiProviders();
  const pushToast = useToastStore((s) => s.push);
  const confirm = useConfirm();
  const [editing, setEditing] = useState<PublicProvider | 'new' | null>(null);

  if (!isAdmin) return <Page><PageHeader><PageTitle>AI 模型管理</PageTitle></PageHeader><Inline tone="muted">仅平台管理员可访问此页面。</Inline></Page>;

  const move = (index: number, dir: -1 | 1) => {
    const ids = providers.map((x) => x.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    reorder.mutate(ids);
  };

  const runTest = async (id: string) => {
    const r = await test.mutateAsync(id).catch(() => null);
    if (!r) return pushToast({ variant: 'danger', title: '测试失败', message: '请检查网络或密钥。' });
    pushToast({ variant: r.status === 'ok' ? 'success' : 'danger', title: r.status === 'ok' ? `连通 ✓ ${r.latencyMs}ms` : '连通 ✗', message: r.detail ?? '' });
  };

  // 列表：每行 name + base_url/model + capability Badge + 免费(green)/收费(amber) Badge + 上移/下移 + enabled Switch（Button 变体模拟）
  // + 测试按钮（isPending 时 Skeleton）+ 编辑（setEditing(row)）+ 删除（confirm 后 remove.mutate）
  // editing 非空时渲染表单卡片（内嵌于列表下方）：模板下拉（PROVIDER_TEMPLATES）→ 自动填 base_url/model/name；
  //   api_key 用 <Input type="password">，编辑态 placeholder = row.api_key_mask + 提示「留空则不修改」
  // 空态：providers.length === 0 → 引导卡片「尚未配置任何模型，当前使用 .env 兜底配置」+ 新增主按钮
  // 所有 mutation onError → pushToast({ variant: 'danger', title: '保存失败', message: err.message + (err.traceId ? `（${err.traceId}）` : '') })
}

const PROVIDER_TEMPLATES = [
  { label: '智谱 GLM（免费）', base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.5-air', capability: 'text', cost_tier: 'free' },
  { label: '阿里云百炼 Qwen（免费）', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', capability: 'text', cost_tier: 'free' },
  { label: 'Kimi（免费）', base_url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', capability: 'text', cost_tier: 'free' },
  { label: '火山方舟 豆包（免费）', base_url: 'https://ark.cn-beijing.volces.com/api/v3', model: '', capability: 'text', cost_tier: 'free' },
  { label: 'DeepSeek（付费）', base_url: 'https://api.deepseek.com', model: 'deepseek-chat', capability: 'text', cost_tier: 'paid' },
  { label: 'OpenAI（付费 · 视觉）', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini', capability: 'vision', cost_tier: 'paid' },
] as const;
```

实现时完整写出上述注释标注的 JSX（沿用 `SettingsOverview` 的 Page/Card 结构与 Tailwind 类），禁止留 TODO。

- [ ] **Step 2: 路由与导航**

`src/App.tsx`：`import SettingsAiProviders from '@/pages/settings/AiProviders';`，settings 路由组内追加 `<Route path="settings/ai-providers" element={<SettingsAiProviders />} />`。
`navigation.ts`：类型加 `adminOnly?: boolean`；`settingsGroup.children` 追加导航项（icon 用已导入的 `Bot`）。`Panel.tsx`/`MobileDrawer.tsx` 遍历 children 处：`if (node.kind === 'link' && node.adminOnly && !isAdmin) continue;`，`isAdmin` 由组件内 `useAiProviders().isAdmin` 提供（query 已在页面级缓存，不会重复请求）。

- [ ] **Step 3: 构建 + 类型检查**

Run: `pnpm build && pnpm lint`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add src/pages/settings/AiProviders.tsx src/App.tsx src/config/navigation.ts src/layouts/app-shell
git commit -m "feat(ui): AI 模型管理设置页与管理员导航入口"
```

---

### Task 14: 文档更新与端到端验收

**Files:**
- Modify: `.env.example`
- Modify: `docs/privacy/data-map.md`（追加两张平台级表说明）
- Modify: spec 文档状态行（`状态：待用户审阅` → `已批准并实施`）

**Interfaces:**
- Consumes: 全部前序任务
- Produces: 可交付验收

- [ ] **Step 1: 更新 `.env.example`**

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AI 模型清单主密钥（必需）：加密 DB 中 API Key 的唯一环境变量，Vercel 与本地 .env.local 各配一份
AI_PROVIDER_ENC_KEY=change_me_to_a_long_random_string

# —— 以下 provider 变量已废弃：改在「设置 → AI 模型管理」界面配置；仅当 ai_providers 表为空时作为过渡兜底 ——
# AI_LLM_PROVIDER / DEEPSEEK_* / OPENAI_* 填法不变，存量部署可直接沿用：
AI_LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
OPENAI_API_KEY=your_openai_api_key

MEALS_DAILY_CAP=30
```

- [ ] **Step 2: data-map 追加**

在 `docs/privacy/data-map.md` 末尾追加小节：「平台配置数据（非个人数据）」——`ai_providers`（平台级模型清单，API Key 加密存储仅服务端可解密）、`platform_admins`（平台管理员名单），均 RLS service-role-only，家庭成员数据不受影响。

- [ ] **Step 3: 部署侧手工步骤（提示用户执行，非代码任务）**

1. Supabase SQL 编辑器执行 Task 1 迁移 → 取消注释执行首位管理员 `INSERT`；
2. Vercel 配置 `AI_PROVIDER_ENC_KEY`；本地写入 `.env.local` 并重启 dev 进程（既有约定）。

- [ ] **Step 4: 手工验收剧本（spec §9.2 全量）**

- [ ] 空表启动 → `/meals` 推荐成功且日志 `provider=env-deepseek`（兜底不炸）；
- [ ] 界面录入智谱免费项（真实 key）→ 推荐成功且日志命中 `provider=智谱免费`；
- [ ] 故意填错 key → 测试按钮 ✗「API Key 无效或已过期」，调用链自动跳过降级下一家；
- [ ] `curl` 管理端点（非管理员 token）→ 403；无 token → 401；
- [ ] 非管理员账号登录 → 设置导航无「AI 模型管理」、直达 URL 显示无权限空态；
- [ ] 列表/日志/网络响应全局检索 api_key 明文 → 仅掩码可见；
- [ ] 上移/下移后 60s 内新请求按新优先级命中（日志验证）。

Run: `pnpm test && pnpm build && pnpm lint`
Expected: 三项全绿

- [ ] **Step 5: 更新 spec 状态 + Commit**

```bash
git add .env.example docs/privacy/data-map.md docs/superpowers/specs/2026-09-20-ai-provider-registry-design.md
git commit -m "docs(ai): 模型清单文档、环境变量模板与验收留痕"
```

---

## 自审记录（writing-plans §Self-Review）

1. **Spec 覆盖**：§3 数据模型→Task 1；§4 加密→Task 2；§5 路由→Task 3/4/5 + Task 11 端点切换；§6 管理 API→Task 6/7/8/9（含 Vite 注册 Task 10）；§7 界面→Task 12/13；§8 隐私/错误→Task 14 + endpointKit 统一 traceId 出口；§9 验收→Task 4/2/6 单测 + Task 14 剧本。无遗漏。
2. **占位符扫描**：Task 13 Step 1 为「核心骨架 + 完整模板常量」，JSX 明细以注释规格给出——执行者须按规格写全，不得残留注释占位（已在该步显式声明）。
3. **类型一致性**：`ResolvedProvider`/`RoutedRequest`/`ProviderCall` 定义于 Task 4、消费于 Task 5/11；`toPublicRow` 字段 = Task 12 `PublicProvider`；`clearInstanceCache` 在 Task 5 定义、Task 8 Step 0 显式补导出；`AiUpstreamError.status` 语义（0=网络/超时）Task 3 与 Task 4/9 一致。
