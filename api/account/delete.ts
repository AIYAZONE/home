import { authAdminDeleteUser, authGetUser } from '../_lib/supabaseAuthCompat.js';

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

function getClientIp(headers: RequestLike['headers']): string | null {
  const xff = pickHeader(headers, 'x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  const realIp = pickHeader(headers, 'x-real-ip');
  return realIp?.trim() || null;
}

function toSafeMessage(input: unknown): string {
  const message = input instanceof Error ? input.message : typeof input === 'string' ? input : '';
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(message)) return message;
  return '请求失败，请稍后再试。';
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  let traceId = '';
  try {
    traceId = `accdel_${(globalThis as any)?.crypto?.randomUUID?.() ?? `${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`}`;
  } catch {
    traceId = `accdel_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: '不支持的请求方法。' });
    }

    const token = getBearerToken(req.headers);
    if (!token) {
      return res.status(401).json({ message: '未登录或登录已过期，请重新登录。' });
    }

    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey || !serviceRoleKey) {
      return res.status(500).json({ message: '服务配置缺失，请联系管理员。', traceId });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const anonClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: userData, error: userError } = await authGetUser(anonClient, token);
    if (userError || !userData.user) {
      return res.status(401).json({ message: '未登录或登录已过期，请重新登录。', traceId });
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const ip = getClientIp(req.headers);
    const ua = pickHeader(req.headers, 'user-agent') ?? pickHeader(req.headers, 'User-Agent');

    const { error: rpcError } = await userClient.rpc('delete_my_account', {
      p_ip: ip,
      p_user_agent: ua ?? null,
    });

    if (rpcError) {
      return res.status(400).json({ message: toSafeMessage(rpcError), traceId });
    }

    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { error: deleteError } = await authAdminDeleteUser(adminClient, userData.user.id);
    if (deleteError) {
      return res.status(500).json({ message: '注销失败，请稍后再试。', traceId });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/account/delete]', { traceId, message: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: '请求失败，请稍后再试。', traceId });
  }
}
