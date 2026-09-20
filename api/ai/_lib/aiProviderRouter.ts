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
};

const CACHE_TTL_MS = 60_000;
const PER_PROVIDER_TIMEOUT_MS = 15_000;
const COOLDOWN_MS = 10 * 60_000;

const cache = new Map<Capability, { until: number; chain: ResolvedProvider[] }>();
const cooldownMap = new Map<string, number>();

export function clearInstanceCache() {
  cache.clear();
}

/** 仅测试使用：同时重置冷却表，避免用例间串扰 */
export function resetRouterStateForTests() {
  cache.clear();
  cooldownMap.clear();
}

async function defaultLoadRows(): Promise<ProviderRow[]> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('服务配置缺失，请联系管理员。');
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client
    .from('ai_providers')
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
  deps?: { loadRows?: () => Promise<ProviderRow[]> },
): Promise<ResolvedProvider[]> {
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
  } catch (err: unknown) {
    console.warn('[aiRouter] load failed, fallback to env', { message: err instanceof Error ? err.message : String(err) });
  }
  // 空表/查询失败 → env 兜底链（不缓存，表就绪后自动接管）
  return buildEnvFallbackChain(process.env);
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
  deps?: { loadRows?: () => Promise<ProviderRow[]>; call?: ProviderCall; now?: () => number },
): Promise<{ content: string; provider: ResolvedProvider }> {
  const chain = await getProviderChain(capability, deps);
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
