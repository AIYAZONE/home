import { supabase } from './supabase';

export type PublicProvider = {
  id: string; name: string; base_url: string; model: string;
  api_key_mask: string; capability: 'text' | 'vision'; cost_tier: 'free' | 'paid';
  priority: number; enabled: boolean;
  owner_user_id: string | null; // v2：NULL=平台共享，非空=自己私有（list 只会返回这两类）
  test_status: 'ok' | 'error' | null; test_detail: string | null; tested_at: string | null;
};

export type ProviderDraft = {
  name: string; base_url: string; model: string; api_key?: string;
  reuse_key_from?: string; // 仅 create 有效（服务端复制该行密文，与 api_key 二选一）；update patch 不接收此字段
  capability: 'text' | 'vision'; cost_tier: 'free' | 'paid'; enabled?: boolean;
  scope?: 'personal' | 'shared'; // v2：shared 仅邮箱白名单用户可提
};

export type ProviderDefaults = { text: string | null; vision: string | null };

export type DiscoveredSuggestion = {
  provider_id: string; provider_label: string; model_id: string; name: string;
  base_url: string; capability: 'text' | 'vision';
  context_window: number | null; supports_reasoning: boolean;
  key_reusable: boolean; reuse_provider_id: string | null; reuse_provider_name: string | null;
};

export class ApiError extends Error {
  status: number;
  traceId?: string;
  constructor(status: number, message: string, traceId?: string) {
    super(message);
    this.status = status;
    this.traceId = traceId;
  }
}

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.message ?? '请求失败，请稍后再试。', json?.traceId);
  return json as T;
}

export const providersApi = {
  list: () =>
    request<{ providers: PublicProvider[]; defaults: ProviderDefaults; canManageShared: boolean }>('ai/providers/list', 'GET'),
  discover: () =>
    request<{ models: DiscoveredSuggestion[]; fetched_at: string }>('ai/providers/discover', 'GET'),
  create: (draft: ProviderDraft) => request<{ provider: PublicProvider }>('ai/providers/create', 'POST', draft),
  update: (id: string, patch: Partial<ProviderDraft>) => request<{ provider: PublicProvider }>('ai/providers/update', 'PATCH', { id, patch }),
  remove: (id: string) => request<{ ok: true }>('ai/providers/delete', 'POST', { id }),
  reorder: (ids: string[]) => request<{ ok: true }>('ai/providers/reorder', 'POST', { ids }),
  test: (id: string) => request<{ status: 'ok' | 'error'; latencyMs: number; detail?: string }>('ai/providers/test', 'POST', { id }),
  setDefault: (capability: 'text' | 'vision', providerId: string) => request<{ ok: true }>('ai/providers/set-default', 'POST', { capability, provider_id: providerId }),
};
