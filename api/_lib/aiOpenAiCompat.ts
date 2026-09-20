export class AiUpstreamError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AiUpstreamError';
    this.status = status;
  }
}

function trimJsonEnvelope(text: string): string {
  const s = text.trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) return s.slice(start, end + 1);
  return s;
}

export function toSafeMessage(input: unknown): string {
  const message = input instanceof Error ? input.message : typeof input === 'string' ? input : '';
  if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(message)) return message;
  return '请求失败，请稍后再试。';
}

export async function callLow(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  responseFormatJson?: boolean;
  messages: Array<{ role: string; content: unknown }>;
}): Promise<{ content: string }> {
  const base = args.baseUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: args.model,
      temperature: typeof args.temperature === 'number' ? args.temperature : 0,
      ...(args.responseFormatJson ? { response_format: { type: 'json_object' } } : {}),
      messages: args.messages,
    }),
  }).catch(() => {
    throw new AiUpstreamError('AI 服务暂时不可用，请稍后再试。', 0);
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = typeof json?.error?.message === 'string' ? json.error.message : '';
    throw new AiUpstreamError(msg || 'AI 服务暂时不可用，请稍后再试。', res.status);
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new AiUpstreamError('AI 响应为空，请稍后再试。', 502);
  return { content: content.trim() };
}

export async function callOpenAiCompatChatJson(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
}): Promise<{ jsonText: string }> {
  const { content } = await callLow({
    baseUrl: args.baseUrl,
    apiKey: args.apiKey,
    model: args.model,
    temperature: args.temperature,
    responseFormatJson: true,
    messages: [
      { role: 'system', content: args.system },
      { role: 'user', content: args.user },
    ],
  });
  return { jsonText: trimJsonEnvelope(content) };
}
