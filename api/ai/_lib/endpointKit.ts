import { toSafeMessage } from '../../_lib/aiOpenAiCompat.js';
import { requireUser, type AuthContext } from './adminGuard.js';

type Headers = Record<string, string | string[] | undefined>;
type RequestLike = { method?: string; headers?: Headers; body?: unknown };
type ResponseLike = { status: (code: number) => ResponseLike; setHeader: (k: string, v: string) => void; json: (p: unknown) => void };

function pickHeader(headers: Headers | undefined, key: string): string | undefined {
  // 与 adminGuard 保持一致：先取原键，再取首字母大写变体（Node 入站头通常已小写，本地中间件/测试可能传入其它形态）
  const value = headers?.[key] ?? headers?.[key.charAt(0).toUpperCase() + key.slice(1)];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
}

function clientIp(headers: Headers | undefined): string {
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

/** 仅测试使用：清空限流窗口，避免用例间串扰 */
export function resetRateLimitsForTests() {
  rate.clear();
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
  handler: (ctx: AuthContext, t: string) => Promise<void>,
): Promise<void> {
  const t = makeTraceId();
  res.setHeader('Cache-Control', 'no-store');
  try {
    if ((req.method ?? 'GET').toUpperCase() !== opts.method) {
      return res.status(405).json({ message: '不支持的请求方法。', traceId: t });
    }
    // 先鉴权后限流（终审 #2，对齐 spec §6「每 user 限流」）：v2 全体登录用户可写，
    // 若按 IP 计数，同一家庭出口 IP 的多用户会互相打满 429；键改用 userId，IP 仅作伪造滥用兜底（宽阈值）。
    const guard = await requireUser({ headers: req.headers ?? {} });
    if (guard.error) return res.status(guard.error.status).json({ message: guard.error.message, traceId: t });
    if (opts.write && (!limit(`${tracePrefix}:u:${guard.ctx.userId}`, 30, 60_000) || !limit(`${tracePrefix}:ip:${clientIp(req.headers)}`, 120, 60_000))) {
      return res.status(429).json({ message: '操作过于频繁，请稍后再试。', traceId: t });
    }
    await handler(guard.ctx, t);
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
