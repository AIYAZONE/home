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
  models: z.record(z.string(), z.unknown()),
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
    // WHATWG URL 已自动剥离默认端口（:443/:80）；非默认端口必须保留，
    // 否则不同主机会折叠成同一 key，导致跨主机复用 api_key（Task 1 评审修复）
    const host = url.host.toLowerCase();
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
  const byUrl = new Map<string, Array<Pick<PublicProvider, 'id' | 'name' | 'base_url' | 'enabled' | 'priority'>>>();
  for (const row of existingRows) {
    const key = normalizeBaseUrl(row.base_url);
    if (!key) continue;
    const bucket = byUrl.get(key);
    if (bucket) bucket.push(row); else byUrl.set(key, [row]);
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
