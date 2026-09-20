import { authGetUser } from '../_lib/supabaseAuthCompat.js';
import { ChatRequestSchema, CopilotResponseSchema } from '../_lib/aiSchemas.js';
import { pickToolId, runTool } from '../_lib/aiTools.js';
import { toSafeMessage, trimJsonEnvelope } from '../_lib/aiOpenAiCompat.js';
import { callRoutedChat } from './_lib/aiProviderRouter.js';

type RequestLike = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  setHeader: (key: string, value: string) => void;
  json: (payload: unknown) => void;
};

function pickHeader(headers: RequestLike['headers'], key: string): string | undefined {
  const value = headers?.[key];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
}

function getBearerToken(headers: RequestLike['headers']): string | null {
  const auth = pickHeader(headers, 'authorization') ?? pickHeader(headers, 'Authorization');
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

type RateKey = string;
type RateState = { windowStart: number; count: number };
const rateState = new Map<RateKey, RateState>();

function getClientIp(headers: RequestLike['headers']): string | null {
  const xff = pickHeader(headers, 'x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  const realIp = pickHeader(headers, 'x-real-ip');
  return realIp?.trim() || null;
}

function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = rateState.get(key);
  if (!current || now - current.windowStart >= windowMs) {
    rateState.set(key, { windowStart: now, count: 1 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function traceId(): string {
  const anyCrypto: any = globalThis as any;
  const v = anyCrypto?.crypto?.randomUUID ? anyCrypto.crypto.randomUUID() : `${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  return `ai_${v}`;
}

// AI 端点需为「provider 降级链」留足时间预算：单 provider 超时 15s（见 aiProviderRouter），
// maxDuration 须显著大于该值，才能在平台杀死函数前完成「降级下一家 / 抛友好错误」，而非静默截断链。
// 60s ≈ 容 3–4 次降级尝试；Hobby 计划上限 10s 会被钳制并告警，生产需 Pro/fluid compute。
export const config = { maxDuration: 60 };

export default async function handler(req: RequestLike, res: ResponseLike) {
  const t = traceId();
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: '不支持的请求方法。' });
    }

    const token = getBearerToken(req.headers);
    if (!token) {
      return res.status(401).json({ message: '未登录或登录已过期，请重新登录。' });
    }

    const ip = getClientIp(req.headers) ?? 'unknown';
    if (!rateLimit(`ai_chat:${ip}`, 30, 60_000)) {
      return res.status(429).json({ message: '请求过于频繁，请稍后再试。' });
    }

    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return res.status(500).json({ message: '服务配置缺失，请联系管理员。', traceId: t });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const anonClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: userData, error: userError } = await authGetUser(anonClient, token);
    if (userError || !userData.user) {
      return res.status(401).json({ message: '未登录或登录已过期，请重新登录。', traceId: t });
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: profileRow, error: profileError } = await userClient
      .from('users')
      .select('family_id, role')
      .eq('id', userData.user.id)
      .single();

    if (profileError || !profileRow?.family_id) {
      return res.status(400).json({ message: '缺少家庭信息，请先完成家庭设置。', traceId: t });
    }

    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: '请求参数不合法。', traceId: t });
    }

    let routedProvider = '';
    const { toolId, confidence } = await pickToolId({
      message: parsed.data.message,
      module: parsed.data.module,
      provider: 'deepseek', // 兼容旧必填字段；实际调用走 callJson 注入的路由层
      callJson: async ({ system, user, temperature }) => {
        const { content, provider } = await callRoutedChat('text', { system, user, temperature, responseFormatJson: true });
        routedProvider = provider.name;
        console.log('[api/ai/chat] ai-call', { traceId: t, provider: provider.name, model: provider.model, costTier: provider.costTier });
        return trimJsonEnvelope(content);
      },
      traceId: t,
    });
    console.log('[api/ai/chat] route', { traceId: t, toolId, confidence });

    const result = await runTool({
      toolId,
      ctx: {
        traceId: t,
        userId: userData.user.id,
        familyId: profileRow.family_id,
        role: profileRow.role === 'admin' || profileRow.role === 'parent' || profileRow.role === 'child' ? profileRow.role : 'parent',
        userClient,
        now: new Date(),
      },
      input: { message: parsed.data.message, module: parsed.data.module, page: parsed.data.page, context: parsed.data.context },
    });

    const safe = CopilotResponseSchema.parse({
      ...result,
      meta: { ...(result.meta ?? {}), toolId, confidence, provider: routedProvider, traceId: t },
    });

    return res.status(200).json(safe);
  } catch (err: unknown) {
    console.error('[api/ai/chat]', { traceId: t, message: err instanceof Error ? err.message : String(err) });
    return res.status(400).json({ message: toSafeMessage(err), traceId: t });
  }
}
