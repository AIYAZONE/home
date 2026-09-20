import { z } from 'zod';
import { authAdminCreateUser, authAdminDeleteUser, authGetUser } from '../_lib/supabaseAuthCompat.js';

type RequestLike = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: unknown };
type ResponseLike = { status: (code: number) => ResponseLike; setHeader: (k: string, v: string) => void; json: (p: unknown) => void };

function pickHeader(h: RequestLike['headers'], k: string): string | undefined {
  const v = h?.[k] ?? h?.[k.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}
function bearer(h: RequestLike['headers']): string | null {
  const a = pickHeader(h, 'authorization');
  const m = a?.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}
function makeTraceId(): string {
  try {
    return `memcreate_${(globalThis as any)?.crypto?.randomUUID?.() ?? `${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`}`;
  } catch {
    return `memcreate_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }
}

/** 与 src/lib/member.ts 的 MEMBER_ACCOUNT_EMAIL_DOMAIN 保持一致，修改需同步两处 */
const MEMBER_ACCOUNT_EMAIL_DOMAIN = 'members.family.local';

const CreateMemberSchema = z.object({
  name: z.string().trim().min(1).max(30),
  account: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,19}$/, 'invalid account'),
  role: z.enum(['child', 'parent']), // 不允许经接口创建 admin，防提权
  password: z.string().min(6).max(72),
});

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader('Cache-Control', 'no-store');
  const traceId = makeTraceId();
  res.setHeader('x-trace-id', traceId);
  try {
    if (req.method !== 'POST') return res.status(405).json({ message: '不支持的请求方法。', traceId });
    const token = bearer(req.headers);
    if (!token) return res.status(401).json({ message: '未登录或登录已过期，请重新登录。', traceId });

    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceRoleKey) {
      return res.status(500).json({ message: '服务配置缺失，请联系管理员。', traceId });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: u, error: ue } = await authGetUser(anon, token);
    if (ue || !u.user) return res.status(401).json({ message: '未登录或登录已过期，请重新登录。', traceId });

    const user = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: me, error: meErr } = await user.from('users').select('family_id, role').eq('id', u.user.id).single();
    if (meErr || !me?.family_id) return res.status(400).json({ message: '缺少家庭信息，请先完成家庭设置。', traceId });
    // 仅 admin/parent 可创建成员（与餐食推荐同口径：需为全家录入约束）
    if (me.role !== 'admin' && me.role !== 'parent') {
      return res.status(403).json({ message: '需要家长或管理员账号才能添加成员。', traceId });
    }

    const parsed = CreateMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: '信息不完整或格式不正确：账号需为 2-20 位小写字母、数字、- 或 _，密码至少 6 位。', traceId });
    }
    const { name, account, role, password } = parsed.data;
    const accountEmail = `${account}@${MEMBER_ACCOUNT_EMAIL_DOMAIN}`;

    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: created, error: createErr } = await authAdminCreateUser(admin, {
      email: accountEmail,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (createErr) {
      const msg = String(createErr.message ?? '').toLowerCase();
      if (msg.includes('already exists') || (createErr as any)?.code === 'user_already_exists') {
        return res.status(409).json({ message: `账号「${account}」已被占用，请换一个。`, traceId });
      }
      console.error('[api/members/create] auth createUser failed', { traceId, message: String(createErr.message ?? createErr) });
      return res.status(500).json({ message: '创建成员失败，请稍后再试。', traceId });
    }
    const newUserId: string | undefined = created?.user?.id;
    if (!newUserId) return res.status(500).json({ message: '创建成员失败，请稍后再试。', traceId });

    // on_auth_user_created 触发器已插入 users 行（role 默认 parent、family 为空），这里补齐家庭归属
    const { error: upErr } = await admin
      .from('users')
      .upsert({ id: newUserId, family_id: me.family_id, role, name, email: accountEmail }, { onConflict: 'id' });
    if (upErr) {
      console.error('[api/members/create] users upsert failed', { traceId, message: upErr.message });
      // 回滚 auth 用户，避免留下无家庭归属的孤儿账号
      await authAdminDeleteUser(admin, newUserId).catch(() => undefined);
      return res.status(500).json({ message: '创建成员失败，请稍后再试。', traceId });
    }

    return res.status(200).json({ ok: true, userId: newUserId, account, email: accountEmail });
  } catch (err: unknown) {
    console.error('[api/members/create] unhandled', { traceId, message: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: '请求失败，请稍后再试。', traceId });
  }
}
