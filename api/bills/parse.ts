import { authGetUser } from '../_lib/supabaseAuthCompat.js';
import { z } from 'zod';
import { callRoutedChat, getProviderChain } from '../ai/_lib/aiProviderRouter.js';

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

function traceId(): string {
  const anyCrypto: any = globalThis as any;
  const v = anyCrypto?.crypto?.randomUUID ? anyCrypto.crypto.randomUUID() : `${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  return `bill_${v}`;
}

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

function toSafeMessage(input: unknown): string {
  const message = input instanceof Error ? input.message : typeof input === 'string' ? input : '';
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(message)) return message;
  return '请求失败，请稍后再试。';
}

const BodySchema = z.union([
  z.object({
    text: z.string().min(1),
    filename: z.string().optional(),
    categories: z.array(z.string().min(1)).optional(),
    defaultCategory: z.string().min(1).optional(),
  }),
  z.object({
    mime: z.string().min(1),
    base64: z.string().min(1),
    filename: z.string().optional(),
    categories: z.array(z.string().min(1)).optional(),
    defaultCategory: z.string().min(1).optional(),
  }),
]);

const ItemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['income', 'expense']),
  amount: z.number().finite().positive(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
});

const ResultSchema = z.object({
  items: z.array(ItemSchema).min(1),
  warnings: z.array(z.string()).optional(),
});

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

function trimJsonEnvelope(text: string): string {
  const s = text.trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) return s.slice(start, end + 1);
  return s;
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
      return res.status(405).json({ message: '不支持的请求方法。', traceId: t });
    }

    const token = getBearerToken(req.headers);
    if (!token) {
      return res.status(401).json({ message: '未登录或登录已过期，请重新登录。', traceId: t });
    }

    const ip = getClientIp(req.headers) ?? 'unknown';
    if (!rateLimit(`bills_parse:${ip}`, 10, 60_000)) {
      return res.status(429).json({ message: '请求过于频繁，请稍后再试。', traceId: t });
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

    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: '请求参数不合法。', traceId: t });
    }

    const input = parsed.data as any;
    const rawCategories: string[] = Array.isArray(input.categories) ? input.categories : [];
    const categories = Array.from(new Set(rawCategories.map((x) => String(x).trim()).filter(Boolean))).slice(0, 120);
    const defaultCategory = typeof input.defaultCategory === 'string' && input.defaultCategory.trim() ? input.defaultCategory.trim() : null;

    const categoryRules =
      (categories.length > 0
        ? `- category 必须从候选分类中选择一个；没有把握就输出 null\n候选分类：${categories.join('、')}\n`
        : '- category 若无把握就 null\n') +
      (defaultCategory ? `- 若无法判断分类，优先使用默认分类：${defaultCategory}\n` : '');

    let content = '';
    let aiProvider = '';
    if (typeof input.text === 'string') {
      if (input.text.length > 200_000) {
        return res.status(413).json({ message: '文本过长，请分段或裁剪后再试。', traceId: t });
      }
      const prompt =
        '从下方文本中提取交易明细，输出 JSON：{ "items": [{ "date":"YYYY-MM-DD","type":"income|expense","amount":123.45,"description":string|null,"category":string|null }], "warnings":[string] }。\n' +
        '- amount 必须为正数\n' +
        '- type 用“收入/支出/存入/转入/转出/付款”等语义判断\n' +
        '- 若某行缺日期或金额则跳过，并把原因写入 warnings\n' +
        '- description 用商户/摘要/对方信息\n' +
        categoryRules +
        '\n文本如下：\n' +
        input.text;
      const routed = await callRoutedChat('text', {
        system: '你是账单解析引擎。用户会提供银行账单文本，请抽取交易明细并输出严格 JSON 对象，不要输出多余文本。',
        user: prompt,
        responseFormatJson: true,
      }, { userId: userData.user.id });
      aiProvider = routed.provider.name;
      console.log('[api/bills/parse] ai-call', { traceId: t, provider: routed.provider.name, model: routed.provider.model, costTier: routed.provider.costTier });
      content = routed.content;
    } else {
      const { mime, base64 } = input as { mime: string; base64: string };
      const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
      if (!allowed.has(mime)) {
        return res.status(400).json({ message: '仅支持 PNG/JPEG/WEBP 图片。', traceId: t });
      }
      if (base64.length > 10_000_000) {
        return res.status(413).json({ message: '图片过大，请压缩后再试。', traceId: t });
      }
      // 视觉链路：env 兜底链仅 text 能力，故未配 vision 模型时链为空→友好提示（评审批 B vision 精确匹配护栏）
      const visionChain = await getProviderChain('vision', userData.user.id);
      if (visionChain.length === 0) {
        return res.status(400).json({ message: '尚未配置视觉模型，请在 设置 → 我的 AI 模型 中添加 vision 模型。', traceId: t });
      }
      const routed = await callRoutedChat('vision', {
        system: '你是账单识别引擎。请从用户提供的银行账单截图中提取交易明细，输出严格 JSON 对象，不要输出多余文本。',
        user:
          '请识别账单截图中的每一笔交易，输出 JSON：{ "items": [{ "date":"YYYY-MM-DD","type":"income|expense","amount":123.45,"description":string|null,"category":string|null }], "warnings":[string] }。\n' +
          '- amount 必须为正数\n' +
          '- type 用“收入/支出”判断\n' +
          '- 若某行缺日期或金额则跳过，并把原因写入 warnings\n' +
          '- description 用商户/摘要/对方信息\n' +
          categoryRules,
        responseFormatJson: true,
        imageDataUrl: `data:${mime};base64,${base64}`,
      }, { userId: userData.user.id });
      aiProvider = routed.provider.name;
      console.log('[api/bills/parse] ai-call', { traceId: t, provider: routed.provider.name, model: routed.provider.model, costTier: routed.provider.costTier });
      content = routed.content;
    }

    const jsonText = trimJsonEnvelope(content);
    const json = JSON.parse(jsonText);
    const result = ResultSchema.parse(json);
    const warnings = Array.isArray(result.warnings) ? [...result.warnings] : [];
    const allowedSet = new Set(categories);
    const items = result.items.map((it) => {
      const cat = typeof it.category === 'string' ? it.category.trim() : null;
      if (!cat) return it;
      if (categories.length === 0) return it;
      if (allowedSet.has(cat)) return it;
      warnings.push(`分类“${cat}”不在候选分类中，已置空。`);
      return { ...it, category: null };
    });
    return res.status(200).json({ items, warnings, provider: aiProvider, traceId: t });
  } catch (err: any) {
    console.error('[api/bills/parse]', { traceId: t, message: err instanceof Error ? err.message : String(err) });
    return res.status(400).json({ message: toSafeMessage(err), traceId: t });
  }
}
