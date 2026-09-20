import { AiUpstreamError, callLow } from '../../_lib/aiOpenAiCompat.js';
import { decryptApiKey } from './providerSecret.js';
import {
  buildEnvFallbackChain,
  runChain,
  type Capability,
  type ProviderCall,
  type ResolvedProvider,
  type RoutedRequest,
} from './aiProviderRouterCore.js';

export type ProviderRow = {
  id: string;
  name: string;
  base_url: string;
  model: string;
  api_key_encrypted: string;
  capability: Capability;
  cost_tier: 'free' | 'paid';
  owner_user_id: string | null; // v2：NULL=平台共享，非空=用户私有
};

const CACHE_TTL_MS = 60_000;
const PER_PROVIDER_TIMEOUT_MS = 15_000;
const COOLDOWN_MS = 10 * 60_000;

// v2：链按「能力×用户」缓存（可见行、默认选择、个人优先序都随用户变）
const cache = new Map<string, { until: number; chain: ResolvedProvider[] }>();
const cooldownMap = new Map<string, number>();

export function clearInstanceCache() {
  cache.clear();
}

/** 仅测试使用：同时重置冷却表，避免用例间串扰 */
export function resetRouterStateForTests() {
  cache.clear();
  cooldownMap.clear();
}

async function defaultLoadRows(userId: string | null): Promise<ProviderRow[]> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('服务配置缺失，请联系管理员。');
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  // 可见范围：共享行 + （登录时）该用户私有行；userId 来自 JWT sub（UUID），非用户输入
  let query = client
    .from('ai_providers')
    .select('id,name,base_url,model,api_key_encrypted,capability,cost_tier,owner_user_id')
    .eq('enabled', true);
  query = userId
    ? query.or(`owner_user_id.is.null,owner_user_id.eq.${userId}`)
    : query.is('owner_user_id', null);
  const { data, error } = await query.order('priority', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProviderRow[];
}

/** 该用户在该能力下选定的默认模型 id（无选择/行已删 → null）。 */
async function defaultLoadDefaultId(userId: string | null, capability: Capability): Promise<string | null> {
  if (!userId) return null;
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('服务配置缺失，请联系管理员。');
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client
    .from('user_model_prefs')
    .select('provider_id')
    .eq('user_id', userId)
    .eq('capability', capability)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.provider_id ?? null;
}

function toChain(rows: ProviderRow[], capability: Capability): ResolvedProvider[] {
  const out: ResolvedProvider[] = [];
  for (const row of rows) {
    if (row.capability !== capability) continue;
    try {
      out.push({
        id: row.id,
        name: row.name,
        baseUrl: row.base_url,
        model: row.model,
        apiKey: decryptApiKey(row.api_key_encrypted),
        capability: row.capability,
        costTier: row.cost_tier,
      });
    } catch {
      // 单条解密失败（如主密钥轮换后未重录 key）：跳过该项，日志仅记名称，不炸整链
      console.warn('[aiRouter] decrypt skipped', { provider: row.name });
    }
  }
  return out;
}

export async function getProviderChain(
  capability: Capability,
  userId?: string | null,
  deps?: { loadRows?: (userId: string | null) => Promise<ProviderRow[]>; loadDefaultId?: (userId: string | null, capability: Capability) => Promise<string | null> },
): Promise<ResolvedProvider[]> {
  const key = `${capability}:${userId ?? ''}`;
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.until > now) return hit.chain;
  try {
    const rows = await (deps?.loadRows ?? defaultLoadRows)(userId ?? null);
    // 个人优先降级（spec §5.1）：默认→个人→共享，各域内保持 priority 升序（sort 稳定）
    const ordered = [...rows].sort((a, b) => (a.owner_user_id !== null ? 0 : 1) - (b.owner_user_id !== null ? 0 : 1));
    let chain = toChain(ordered, capability);
    // 默认选择只影响链首顺序，查不到/失败不炸整链（退化为不置顶的常规优先序）
    let defaultId: string | null = null;
    try {
      defaultId = await (deps?.loadDefaultId ?? defaultLoadDefaultId)(userId ?? null, capability);
    } catch (err: unknown) {
      console.warn('[aiRouter] default pref load skipped', { message: err instanceof Error ? err.message : String(err) });
    }
    if (defaultId) {
      const i = chain.findIndex((p) => p.id === defaultId);
      if (i > 0) chain = [chain[i], ...chain.slice(0, i), ...chain.slice(i + 1)];
    }
    if (chain.length > 0) {
      cache.set(key, { until: now + CACHE_TTL_MS, chain });
      return chain;
    }
  } catch (err: unknown) {
    console.warn('[aiRouter] load failed, fallback to env', { message: err instanceof Error ? err.message : String(err) });
  }
  // 空表/查询失败 → env 兜底链（不缓存，表就绪后自动接管）
  // env 兜底链仅构造 text 能力，故按请求 capability 精确过滤：vision 请求在纯 env 配置下返回空链
  return buildEnvFallbackChain(process.env).filter(p => p.capability === capability);
}

export function providerCall(p: ResolvedProvider, req: RoutedRequest): Promise<{ content: string }> {
  const messages: Array<{ role: string; content: unknown }> = [
    { role: 'system', content: req.system },
    req.imageDataUrl
      ? { role: 'user', content: [{ type: 'text', text: req.user }, { type: 'image_url', image_url: { url: req.imageDataUrl } }] }
      : { role: 'user', content: req.user },
  ];
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    callLow({ baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model, temperature: req.temperature, responseFormatJson: req.responseFormatJson, messages }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AiUpstreamError('AI 响应超时，请稍后再试。', 0)), PER_PROVIDER_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function callRoutedChat(
  capability: Capability,
  request: RoutedRequest,
  ctx?: { userId?: string | null },
  deps?: {
    loadRows?: (userId: string | null) => Promise<ProviderRow[]>;
    loadDefaultId?: (userId: string | null, capability: Capability) => Promise<string | null>;
    call?: ProviderCall;
    now?: () => number;
  },
): Promise<{ content: string; provider: ResolvedProvider }> {
  const chain = await getProviderChain(capability, ctx?.userId ?? null, deps);
  return runChain({
    chain,
    request,
    call: deps?.call ?? providerCall,
    now: deps?.now ?? (() => Date.now()),
    cooldownMs: COOLDOWN_MS,
    cooldownMap,
    onResult: (p, ok, status) => console.log('[aiRouter] call', { provider: p.name, model: p.model, costTier: p.costTier, ok, status }),
  });
}
