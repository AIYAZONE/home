import { authGetUser } from '../../_lib/supabaseAuthCompat.js';

type Headers = Record<string, string | string[] | undefined>;

function pickHeader(headers: Headers, key: string): string | undefined {
  // 先取原键再取首字母大写的变体（Node 入站头通常已小写，但本地中间件/测试可能传入 camel 形态）
  const value = headers?.[key] ?? headers?.[key.charAt(0).toUpperCase() + key.slice(1)];
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

export type AdminGuardResult =
  | { userId: string; error?: never }
  | { userId?: never; error: { status: number; message: string } };

export async function requirePlatformAdmin(args: {
  headers: Headers;
  verifyToken?: (token: string) => Promise<string | null>;
  isAdmin?: (userId: string) => Promise<boolean>;
}): Promise<AdminGuardResult> {
  const token = bearerToken(args.headers);
  if (!token) return { error: { status: 401, message: '未登录或登录已过期，请重新登录。' } };
  const userId = await (args.verifyToken ?? defaultVerifyToken)(token);
  if (!userId) return { error: { status: 401, message: '未登录或登录已过期，请重新登录。' } };
  const ok = await (args.isAdmin ?? defaultIsAdmin)(userId);
  if (!ok) return { error: { status: 403, message: '无权限访问模型管理。' } };
  return { userId };
}
