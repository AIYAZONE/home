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
