import { supabase } from '@/lib/supabase';
import { toUserMessage } from '@/lib/error';
import type { CopilotChatRequest, CopilotResponse } from '@/lib/ai/types';

async function parseJsonSafe(text: string): Promise<any> {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export async function sendCopilotMessage(req: CopilotChatRequest): Promise<CopilotResponse> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('未登录或登录已过期，请重新登录。');

  const resp = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(req),
  });

  const raw = await resp.text().catch(() => '');
  const payload = await parseJsonSafe(raw);

  if (!resp.ok) {
    const msg = typeof payload?.message === 'string' ? payload.message : 'AI 请求失败，请稍后再试。';
    throw new Error(msg);
  }

  if (!payload || typeof payload !== 'object') throw new Error('AI 响应不合法，请稍后再试。');
  if (typeof payload.summary !== 'string' || !Array.isArray(payload.cards)) throw new Error('AI 响应不完整，请稍后再试。');
  return payload as CopilotResponse;
}

export function toAiUserMessage(input: unknown): string {
  return toUserMessage(input);
}

