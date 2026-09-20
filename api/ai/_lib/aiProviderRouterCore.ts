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

// 冷却语义对齐 spec §0「429 / 5xx / 超时」：
// 0 = callLow 对网络错/超时的归一化状态码；429 = 限流；5xx（500–599）= 上游过载/内部错误（含 500，国内模型过载常见）。
// 401/403（密钥失效）不冷却：本轮 for 循环仍会降级下一项，但不写冷却表（密钥不会自愈，冷却无意义且会掩盖配置错误）。
export function shouldCooldown(status: number): boolean {
  return status === 0 || status === 429 || (status >= 500 && status <= 599);
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
  // 不传 cooldownMap 时为本轮局部表（不跨轮持久化）；生产路由层传入模块级共享表。
  const cooldown = opts.cooldownMap ?? new Map<string, number>();
  const now = opts.now();
  for (const provider of opts.chain) {
    if (isCoolingDown(cooldown, provider.id, now)) continue;
    try {
      const { content } = await opts.call(provider, opts.request);
      // 注：不清除既有冷却记录——本轮失败的其它 provider 必须保持冷却（过期由 isCoolingDown 时间比对自然失效），
      // 成功项自身若无记录则 delete 为无效操作，若有记录则说明已过期，保留与否等价。
      opts.onResult?.(provider, true, 200);
      return { content, provider };
    } catch (err: unknown) {
      const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 0;
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
    return [{
      id: 'env:openai', name: 'env-openai',
      baseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      apiKey, model: env.OPENAI_MODEL ?? 'gpt-4o-mini',
      capability: 'text', costTier: 'paid',
    }];
  }
  const apiKey = env.DEEPSEEK_API_KEY ?? '';
  if (!apiKey) return [];
  return [{
    id: 'env:deepseek', name: 'env-deepseek',
    baseUrl: env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    apiKey, model: env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    capability: 'text', costTier: 'paid',
  }];
}
