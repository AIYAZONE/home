import { authGetUser } from '../_lib/supabaseAuthCompat.js';
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

function traceId(): string {
  const anyCrypto: any = globalThis as any;
  const v = anyCrypto?.crypto?.randomUUID ? anyCrypto.crypto.randomUUID() : `${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  return `health_report_${v}`;
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

function getClientIp(headers: RequestLike['headers']): string | null {
  const xff = pickHeader(headers, 'x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || null;
  const realIp = pickHeader(headers, 'x-real-ip');
  return realIp?.trim() || null;
}

type RateKey = string;
type RateState = { windowStart: number; count: number };
const rateState = new Map<RateKey, RateState>();

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

function toSafeMessage(input: unknown): string {
  const message = input instanceof Error ? input.message : typeof input === 'string' ? input : '';
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(message)) return message;
  return '解析失败，请稍后再试。';
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
    throw new Error(msg || '解析失败，请稍后再试。');
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('解析失败，请稍后再试。');
  return trimJsonEnvelope(content);
}

async function withServerTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const BodySchema = z.object({
  text: z.string().min(1),
  filename: z.string().optional(),
  reportType: z.enum(['checkup', 'lab', 'prescription']).optional(),
  sourceType: z.enum(['pdf', 'image']).optional(),
});

const ItemSchema = z.object({
  metric_name: z.string().min(1),
  metric_code: z.string().nullable().optional(),
  value_text: z.string().nullable().optional(),
  value_num: z.number().finite().nullable().optional(),
  unit: z.string().nullable().optional(),
  reference_low: z.number().finite().nullable().optional(),
  reference_high: z.number().finite().nullable().optional(),
  reference_text: z.string().nullable().optional(),
  abnormal_flag: z.enum(['high', 'low', 'normal', 'unknown']).nullable().optional(),
  confidence: z.number().finite().nullable().optional(),
  source_page: z.number().int().positive().nullable().optional(),
  raw_line: z.string().nullable().optional(),
});

const ParseResultSchema = z.object({
  items: z.array(ItemSchema),
  warnings: z.array(z.string()).optional(),
  confidence_summary: z
    .object({
      high: z.number().int().nonnegative().optional(),
      medium: z.number().int().nonnegative().optional(),
      low: z.number().int().nonnegative().optional(),
    })
    .optional(),
  unmapped_lines: z.array(z.string()).optional(),
});

function buildPrompt(text: string): string {
  return [
    '你是体检报告结构化引擎。请从文本中提取核心20项健康指标（若出现）。',
    '输出严格 JSON 对象，不要输出额外解释。',
    'JSON 格式：',
    '{',
    '  "items": [{',
    '    "metric_name": string,',
    '    "metric_code": string|null,',
    '    "value_text": string|null,',
    '    "value_num": number|null,',
    '    "unit": string|null,',
    '    "reference_low": number|null,',
    '    "reference_high": number|null,',
    '    "reference_text": string|null,',
    '    "abnormal_flag": "high|low|normal|unknown"|null,',
    '    "confidence": 0-1 number|null,',
    '    "source_page": number|null,',
    '    "raw_line": string|null',
    '  }],',
    '  "warnings": [string],',
    '  "confidence_summary": { "high": number, "medium": number, "low": number },',
    '  "unmapped_lines": [string]',
    '}',
    '要求：',
    '- 按报告参考区间优先判定 abnormal_flag；无法判定填 unknown',
    '- 无法确认的值填 null，不要编造',
    '- 单位尽量规范化（如 mmol/L, g/L, U/L, umol/L）',
    '',
    '报告文本如下：',
    text,
  ].join('\n');
}

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
    if (!rateLimit(`health_report_parse:${ip}`, 10, 60_000)) {
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
    if (parsed.data.text.length > 200_000) {
      return res.status(413).json({ message: '文本过长，请分段后再试。', traceId: t });
    }

    const provider = (process.env.BILL_LLM_PROVIDER ?? 'deepseek').toLowerCase();
    const prompt = buildPrompt(parsed.data.text);

    let content = '';
    if (provider === 'deepseek') {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) return res.status(500).json({ message: '识别服务未配置，请联系管理员。', traceId: t });
      content = await withServerTimeout(
        callOpenAiCompatChat({
          baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
          apiKey,
          body: {
            model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: '你是体检报告结构化引擎，只输出严格 JSON。' },
              { role: 'user', content: prompt },
            ],
          },
        }),
        80_000,
        '解析超时，请稍后重试。',
      );
    } else {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return res.status(500).json({ message: '识别服务未配置，请联系管理员。', traceId: t });
      content = await withServerTimeout(
        callOpenAiCompatChat({
          baseUrl: 'https://api.openai.com/v1',
          apiKey,
          body: {
            model: 'gpt-4o-mini',
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: '你是体检报告结构化引擎，只输出严格 JSON。' },
              { role: 'user', content: prompt },
            ],
          },
        }),
        80_000,
        '解析超时，请稍后重试。',
      );
    }

    const result = ParseResultSchema.parse(JSON.parse(trimJsonEnvelope(content)));
    return res.status(200).json({
      items: result.items,
      warnings: result.warnings ?? [],
      confidence_summary: result.confidence_summary ?? {},
      unmapped_lines: result.unmapped_lines ?? [],
      traceId: t,
    });
  } catch (err: unknown) {
    console.error('[api/health-reports/parse]', { traceId: t, message: err instanceof Error ? err.message : String(err) });
    return res.status(400).json({ message: toSafeMessage(err), traceId: t });
  }
}
