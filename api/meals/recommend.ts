import { authGetUser } from '../_lib/supabaseAuthCompat.js';
import { callOpenAiCompatChatJson, toSafeMessage } from '../_lib/aiOpenAiCompat.js';
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
function clientIp(h: RequestLike['headers']): string {
  return pickHeader(h, 'x-forwarded-for')?.split(',')[0]?.trim() || pickHeader(h, 'x-real-ip') || 'unknown';
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

async function callAI(cfg: { baseUrl: string; apiKey: string; model: string }, system: string, user: string): Promise<string> {
  const { jsonText } = await callOpenAiCompatChatJson({ ...cfg, system, user, temperature: 0.6 });
  return jsonText;
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') return res.status(405).json({ message: '不支持的请求方法。' });
    const token = bearer(req.headers);
    if (!token) return res.status(401).json({ message: '未登录或登录已过期，请重新登录。' });
    if (!limit(`meals:${clientIp(req.headers)}`, 30, 60_000)) return res.status(429).json({ message: '请求过于频繁，请稍后再试。' });

    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return res.status(500).json({ message: '服务配置缺失，请联系管理员。' });

    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: u, error: ue } = await authGetUser(anon, token);
    if (ue || !u.user) return res.status(401).json({ message: '未登录或登录已过期，请重新登录。' });

    const user = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: me, error: meErr } = await user.from('users').select('family_id').eq('id', u.user.id).single();
    if (meErr || !me?.family_id) return res.status(400).json({ message: '缺少家庭信息，请先完成家庭设置。' });

    const parsed = RecommendRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '请求参数不合法。' });
    const { date, servingUserIds, adhocIngredients, direction, swap, basePlan } = parsed.data;

    let memberIds = servingUserIds;
    if (!memberIds?.length) {
      const { data: members } = await user.from('users').select('id').eq('family_id', me.family_id);
      memberIds = (members ?? []).map((m: { id: string }) => m.id);
    }

    const [{ data: profiles }, { data: prefs }] = await Promise.all([
      user.from('health_profiles').select('subject_user_id, allergies, conditions, notes').in('subject_user_id', memberIds),
      user.from('meal_preferences').select('subject_user_id, disliked, liked, spicy_level').in('subject_user_id', memberIds),
    ]);

    const byUser = new Map<string, MemberConstraintsInput>();
    (profiles ?? []).forEach((p: any) => byUser.set(p.subject_user_id, { health: p, pref: byUser.get(p.subject_user_id)?.pref ?? null }));
    (prefs ?? []).forEach((p: any) => byUser.set(p.subject_user_id, { health: byUser.get(p.subject_user_id)?.health ?? null, pref: p }));
    const memberInputs: MemberConstraintsInput[] = (memberIds ?? []).map((id: string) => byUser.get(id) ?? { health: null, pref: null });

    const constraints = buildConstraints(memberInputs, { adhocIngredients, direction });

    const provider = ((process.env.AI_LLM_PROVIDER ?? 'deepseek') as string).toLowerCase() === 'openai' ? 'openai' : 'deepseek';
    const cfg = provider === 'openai'
      ? { baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY ?? '', model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini' }
      : { baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com', apiKey: process.env.DEEPSEEK_API_KEY ?? '', model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat' };

    const system = buildSystemPrompt(constraints);
    const userPrompt = buildUserPrompt({ c: constraints, date, mealOnly: swap?.meal, exclude: swap ? [swap.dish] : undefined });

    // 调 AI（失败重试一次），组装时对过敏原做服务端拦截
    let jsonText: string;
    try {
      jsonText = await callAI(cfg, system, userPrompt);
    } catch {
      jsonText = await callAI(cfg, system, userPrompt + '\n注意：请严格输出规定 JSON 结构。');
    }
    const result = assembleResponse({ jsonText, constraints, swap, basePlan });

    // 若因过敏原被剔除导致某餐为空，做一次补菜重生成（把被剔除菜名加入 exclude）
    if (result.removed.length > 0) {
      const emptySlot = SLOTS.find((m) => result.plan[m].length === 0);
      if (emptySlot) {
        try {
          const retryUser = buildUserPrompt({ c: constraints, date, mealOnly: emptySlot, exclude: result.removed.map((r) => r.name) });
          const regenText = await callAI(cfg, system, retryUser);
          const extra = assembleResponse({ jsonText: regenText, constraints });
          if (extra.plan[emptySlot].length > 0) result.plan[emptySlot] = extra.plan[emptySlot];
        } catch {
          /* 补菜失败：保留被剔除结果，前端显示提示 */
        }
      }
    }

    return res.status(200).json(result);
  } catch (err: unknown) {
    return res.status(400).json({ message: toSafeMessage(err) });
  }
}
