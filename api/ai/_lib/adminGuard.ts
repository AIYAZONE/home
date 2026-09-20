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

/** v2：认证上下文。个人级模型管理只需「已登录 + 身份」，不再有平台超管表。 */
export type AuthContext = { userId: string; email: string | null };

async function defaultVerifyToken(token: string): Promise<AuthContext | null> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await authGetUser(client, token);
  if (error || !data.user?.id) return null;
  return { userId: data.user.id as string, email: (data.user.email as string | undefined) ?? null };
}

export type UserGuardResult =
  | { ctx: AuthContext; error?: never }
  | { ctx?: never; error: { status: number; message: string } };

/** 仅校验登录态（不再判超管）；返回 userId + email 供上层做行级归属与共享池白名单判断。 */
export async function requireUser(args: {
  headers: Headers;
  verifyToken?: (token: string) => Promise<AuthContext | null>;
}): Promise<UserGuardResult> {
  const token = bearerToken(args.headers);
  if (!token) return { error: { status: 401, message: '未登录或登录已过期，请重新登录。' } };
  const ctx = await (args.verifyToken ?? defaultVerifyToken)(token);
  if (!ctx) return { error: { status: 401, message: '未登录或登录已过期，请重新登录。' } };
  return { ctx };
}

/** 共享池（owner_user_id IS NULL）写权限：邮箱在 AI_SHARED_POOL_EMAILS 白名单内（逗号分隔、大小写不敏感）。 */
export function isSharedPoolAdmin(email: string | null, allowCsv?: string): boolean {
  if (!email) return false;
  const raw = allowCsv ?? process.env.AI_SHARED_POOL_EMAILS ?? '';
  const allow = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return allow.includes(email.toLowerCase());
}

/** 当前用户能否管理某条模型行：自己的私有行，或（白名单邮箱下的）共享行。 */
export function canManageRow(ctx: AuthContext, row: { owner_user_id: string | null }): boolean {
  if (row.owner_user_id === ctx.userId) return true;
  if (row.owner_user_id === null) return isSharedPoolAdmin(ctx.email);
  return false;
}

/** 某行对当前用户是否可见：共享行或自己私有行。 */
export function canViewRow(ctx: AuthContext, row: { owner_user_id: string | null }): boolean {
  return row.owner_user_id === null || row.owner_user_id === ctx.userId;
}
