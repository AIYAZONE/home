import { createClient } from '@supabase/supabase-js';
import { authGetUser } from '../_lib/supabaseAuthCompat';
import { z } from 'zod';

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

function toSafeMessage(input: unknown): string {
  const message = input instanceof Error ? input.message : typeof input === 'string' ? input : '';
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(message)) return message;
  return '请求失败，请稍后再试。';
}

const BodySchema = z.union([
  z.object({
    text: z.string().min(1),
    filename: z.string().optional(),
  }),
  z.object({
    mime: z.string().min(1),
    base64: z.string().min(1),
    filename: z.string().optional(),
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

async function callOpenAiCompatChat(args: { baseUrl: string; apiKey: string; body: any }) {
  const base = args.baseUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args.body),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = typeof json?.error?.message === 'string' ? json.error.message : '';
    throw new Error(msg || '识别失败，请稍后再试。');
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('识别失败，请稍后再试。');
  return trimJsonEnvelope(content);
}

async function callOpenAiVision(args: { apiKey: string; mime: string; base64: string }) {
  const dataUrl = `data:${args.mime};base64,${args.base64}`;
  return callOpenAiCompatChat({
    baseUrl: 'https://api.openai.com/v1',
    apiKey: args.apiKey,
    body: {
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '你是账单识别引擎。请从用户提供的银行账单截图中提取交易明细，输出严格 JSON 对象，不要输出多余文本。',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                '请识别本月账单中的每一笔交易，输出 JSON：{ "items": [{ "date":"YYYY-MM-DD","type":"income|expense","amount":123.45,"description":string|null,"category":string|null }], "warnings":[string] }。amount 必须为正数；type 用“收入/支出”判断；无法判断则跳过该行并写入 warnings。description 用商户/摘要/对方信息等；category 若无把握就 null。',
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    },
  });
}

async function callDeepseekText(args: { apiKey: string; text: string }) {
  return callOpenAiCompatChat({
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    apiKey: args.apiKey,
    body: {
      model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '你是账单解析引擎。用户会提供银行账单文本，请抽取交易明细并输出严格 JSON 对象，不要输出多余文本。',
        },
        {
          role: 'user',
          content:
            '从下方文本中提取交易明细，输出 JSON：{ "items": [{ "date":"YYYY-MM-DD","type":"income|expense","amount":123.45,"description":string|null,"category":string|null }], "warnings":[string] }。\n' +
            '- amount 必须为正数\n' +
            '- type 用“收入/支出/存入/转入/转出/付款”等语义判断\n' +
            '- 若某行缺日期或金额则跳过，并把原因写入 warnings\n' +
            '- description 用商户/摘要/对方信息\n' +
            '- category 若无把握就 null\n' +
            '\n文本如下：\n' +
            args.text,
        },
      ],
    },
  });
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ message: '不支持的请求方法。' });
  }

  const token = getBearerToken(req.headers);
  if (!token) {
    return res.status(401).json({ message: '未登录或登录已过期，请重新登录。' });
  }

  const ip = getClientIp(req.headers) ?? 'unknown';
  if (!rateLimit(`bills_parse:${ip}`, 10, 60_000)) {
    return res.status(429).json({ message: '请求过于频繁，请稍后再试。' });
  }

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return res.status(500).json({ message: '服务配置缺失，请联系管理员。' });
  }

  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userError } = await authGetUser(anonClient, token);
  if (userError || !userData.user) {
    return res.status(401).json({ message: '未登录或登录已过期，请重新登录。' });
  }

  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: '请求参数不合法。' });
  }

  try {
    const input = parsed.data as any;
    const provider = (process.env.BILL_LLM_PROVIDER ?? 'deepseek').toLowerCase();

    let content = '';
    if (typeof input.text === 'string') {
      if (input.text.length > 200_000) {
        return res.status(413).json({ message: '文本过长，请分段或裁剪后再试。' });
      }
      const deepseekKey = process.env.DEEPSEEK_API_KEY;
      if (provider === 'deepseek') {
        if (!deepseekKey) return res.status(500).json({ message: '识别服务未配置，请联系管理员。' });
        content = await callDeepseekText({ apiKey: deepseekKey, text: input.text });
      } else {
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) return res.status(500).json({ message: '识别服务未配置，请联系管理员。' });
        content = await callOpenAiCompatChat({
          baseUrl: 'https://api.openai.com/v1',
          apiKey: openaiKey,
          body: {
            model: 'gpt-4o-mini',
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: '你是账单解析引擎。请从用户提供的账单文本中提取交易并输出严格 JSON。' },
              { role: 'user', content: input.text },
            ],
          },
        });
      }
    } else {
      const { mime, base64 } = input as { mime: string; base64: string };
      const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
      if (!allowed.has(mime)) {
        return res.status(400).json({ message: '仅支持 PNG/JPEG/WEBP 图片。' });
      }
      if (base64.length > 10_000_000) {
        return res.status(413).json({ message: '图片过大，请压缩后再试。' });
      }
      if (provider === 'deepseek') {
        return res.status(400).json({ message: 'DeepSeek 当前不支持图片直传识别，请先做 OCR 提取文本后再识别。' });
      }
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) return res.status(500).json({ message: '识别服务未配置，请联系管理员。' });
      content = await callOpenAiVision({ apiKey: openaiKey, mime, base64 });
    }

    const jsonText = trimJsonEnvelope(content);
    const json = JSON.parse(jsonText);
    const result = ResultSchema.parse(json);
    return res.status(200).json({ items: result.items, warnings: result.warnings ?? [] });
  } catch (err: any) {
    return res.status(400).json({ message: toSafeMessage(err) });
  }
}
