import { z } from 'zod';

export const ProviderCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  base_url: z.string().trim().url(),
  model: z.string().trim().min(1).max(80),
  api_key: z.string().trim().min(1).max(300),
  capability: z.enum(['text', 'vision']),
  cost_tier: z.enum(['free', 'paid']),
  enabled: z.boolean().optional().default(true),
  priority: z.number().int().optional(),
});

export const ProviderPatchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  base_url: z.string().trim().url().optional(),
  model: z.string().trim().min(1).max(80).optional(),
  api_key: z.string().trim().min(1).max(300).optional(),
  capability: z.enum(['text', 'vision']).optional(),
  cost_tier: z.enum(['free', 'paid']).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
});

export type AdminRow = {
  id: string; name: string; base_url: string; model: string;
  api_key_mask: string; capability: 'text' | 'vision'; cost_tier: 'free' | 'paid';
  priority: number; enabled: boolean;
  test_status: string | null; test_detail: string | null; tested_at: string | null;
  created_at?: string; updated_at?: string;
};

export function toPublicRow(row: AdminRow) {
  return {
    id: row.id, name: row.name, base_url: row.base_url, model: row.model,
    api_key_mask: row.api_key_mask, capability: row.capability, cost_tier: row.cost_tier,
    priority: row.priority, enabled: row.enabled,
    test_status: row.test_status, test_detail: row.test_detail, tested_at: row.tested_at,
  };
}

/** 对外可消费的管理端行类型（Task 12 前端数据层依赖） */
export type PublicProvider = ReturnType<typeof toPublicRow>;
