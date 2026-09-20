import { authGetUser } from '../_lib/supabaseAuthCompat.js';
import { callRoutedChat } from '../ai/_lib/aiProviderRouter.js';
import { trimJsonEnvelope } from '../_lib/aiOpenAiCompat.js';
import { RecommendRequestSchema } from './_lib/mealSchemas.js';
import type { MealSlot } from './_lib/mealSchemas.js';
import { buildConstraints } from './_lib/constraints.js';
import type { MemberConstraintsInput } from './_lib/constraints.js';
import { buildSystemPrompt, buildUserPrompt } from './_lib/prompt.js';
import { assembleResponse } from './_lib/engine.js';

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
    return `meals_${(globalThis as any)?.crypto?.randomUUID?.() ?? `${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`}`;
  } catch {
    return `meals_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }
}

type RateState = { s: number; n: number };
const rate = new Map<string, RateState>();
function limit(key: string, cap: number, winMs: number): boolean {
  const now = Date.now();
  const cur = rate.get(key);
  if (!cur || now - cur.s >= winMs) {
    rate.set(key, { s: now, n: 1 });
    return true;
  }
  if (cur.n >= cap) return false;
  cur.n += 1;
  return true;
}

const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

async function callAI(system: string, user: string, traceId: string): Promise<{ content: string; provider: string }> {
  const { content, provider } = await callRoutedChat('text', { system, user, temperature: 0.6, responseFormatJson: true });
  console.log('[api/meals/recommend] ai-call', { traceId, provider: provider.name, model: provider.model, costTier: provider.costTier });
  return { content: trimJsonEnvelope(content), provider: provider.name };
}

// AI 端点需为「provider 降级链」留足时间预算：单 provider 超时 15s（见 aiProviderRouter），
// maxDuration 须显著大于该值，才能在平台杀死函数前完成「降级下一家 / 抛友好错误」，而非静默截断链。
// 60s ≈ 容 3–4 次降级尝试；Hobby 计划上限 10s 会被钳制并告警，生产需 Pro/fluid compute。
export const config = { maxDuration: 60 };

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
    if (!url || !anonKey) return res.status(500).json({ message: '服务配置缺失，请联系管理员。', traceId });

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

    // 过敏原安全：生成全家方案需读取所有成员的健康/口味档案，受 RLS 限制，
    // 故仅 admin/parent 可发起；child 调用会静默丢失他人过敏原，属红线，直接拒绝。
    if (me.role !== 'admin' && me.role !== 'parent') {
      return res.status(403).json({ message: '请在家长账号下生成全家的三餐方案。', traceId });
    }

    const parsed = RecommendRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '请求参数不合法。', traceId });
    const { date, servingUserIds, adhocIngredients, direction, swap, basePlan } = parsed.data;

    // 每家庭每日软上限（键用 family_id + 请求日期，窗口 24h；实例冷启动为松语义）
    const cap = Number(process.env.MEALS_DAILY_CAP ?? 30);
    if (!limit(`meals:${me.family_id}:${date}`, cap, 86_400_000)) {
      return res.status(429).json({ message: '今日推荐次数已达上限，请稍后再试。', traceId });
    }

    // 成员白名单：始终限定为请求者本家庭的成员，servingUserIds 只做交集，杜绝跨家庭/空约束绕过过敏原红线
    const { data: famMembers } = await user.from('users').select('id').eq('family_id', me.family_id);
    const allow = new Set<string>((famMembers ?? []).map((m: { id: string }) => m.id));
    const memberIds = servingUserIds?.length
      ? servingUserIds.filter((id: string) => allow.has(id))
      : [...allow];
    if (memberIds.length === 0) return res.status(400).json({ message: '缺少家庭成员信息。', traceId });

    const [{ data: profiles }, { data: prefs }] = await Promise.all([
      user.from('health_profiles').select('subject_user_id, allergies, conditions, notes').in('subject_user_id', memberIds),
      user.from('meal_preferences').select('subject_user_id, disliked, liked, spicy_level').in('subject_user_id', memberIds),
    ]);

    const byUser = new Map<string, MemberConstraintsInput>();
    (profiles ?? []).forEach((p: any) => byUser.set(p.subject_user_id, { health: p, pref: byUser.get(p.subject_user_id)?.pref ?? null }));
    (prefs ?? []).forEach((p: any) => byUser.set(p.subject_user_id, { health: byUser.get(p.subject_user_id)?.health ?? null, pref: p }));
    const memberInputs: MemberConstraintsInput[] = memberIds.map((id: string) => byUser.get(id) ?? { health: null, pref: null });

    const constraints = buildConstraints(memberInputs, { adhocIngredients, direction });

    const system = buildSystemPrompt(constraints);
    const userPrompt = buildUserPrompt({ c: constraints, date, mealOnly: swap?.meal, exclude: swap ? [swap.dish] : undefined });

    // 调 AI（失败重试一次），组装时对过敏原做服务端拦截
    // 自用阶段：把底层错误摘要透出到 message，便于前端直接定位（不含密钥）
    let jsonText: string;
    let lastAiError = '';
    let usedProvider = '';
    try {
      const r1 = await callAI(system, userPrompt, traceId);
      jsonText = r1.content; usedProvider = r1.provider;
    } catch (e1) {
      lastAiError = e1 instanceof Error ? e1.message : String(e1);
      console.error('[api/meals/recommend] ai attempt 1', { traceId, message: lastAiError });
      try {
        const r2 = await callAI(system, userPrompt + '\n注意：请严格输出规定 JSON 结构。', traceId);
        jsonText = r2.content; usedProvider = r2.provider;
      } catch (e2) {
        const m2 = e2 instanceof Error ? e2.message : String(e2);
        console.error('[api/meals/recommend] ai attempt 2', { traceId, message: m2 });
        return res.status(502).json({ message: `AI 调用失败：${m2 || lastAiError || '未知错误'}`, traceId });
      }
    }

    let result;
    try {
      result = assembleResponse({ jsonText, constraints, swap, basePlan });
    } catch (e3) {
      console.error('[api/meals/recommend] assemble failed', { traceId, message: e3 instanceof Error ? e3.message : String(e3) });
      return res.status(502).json({ message: 'AI 返回异常，请稍后再试。', traceId });
    }

    // 若因过敏原被剔除导致某餐为空，对每个空餐各做一次补菜重生成（把被剔除菜名加入 exclude）
    if (result.removed.length > 0) {
      for (const slot of SLOTS) {
        if (result.plan[slot].length > 0) continue;
        try {
          const retryUser = buildUserPrompt({ c: constraints, date, mealOnly: slot, exclude: result.removed.map((r) => r.name) });
          const regen = await callAI(system, retryUser, traceId);
          usedProvider = regen.provider;
          const extra = assembleResponse({ jsonText: regen.content, constraints });
          if (extra.plan[slot].length > 0) result.plan[slot] = extra.plan[slot];
        } catch {
          /* 补菜失败：保留被剔除结果，前端显示提示 */
        }
      }
    }

    return res.status(200).json({ ...result, provider: usedProvider });
  } catch (err: unknown) {
    console.error('[api/meals/recommend] unhandled', { traceId, message: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ message: '请求失败，请稍后再试。', traceId });
  }
}
