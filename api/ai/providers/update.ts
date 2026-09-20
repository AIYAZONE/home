import { z } from 'zod';
import { encryptApiKey, maskApiKey } from '../_lib/providerSecret.js';
import { clearInstanceCache } from '../_lib/aiProviderRouter.js';
import { adminClient, skeleton } from '../_lib/endpointKit.js';
import { canManageRow } from '../_lib/adminGuard.js';
import { ProviderPatchSchema, toPublicRow, type AdminRow } from '../_lib/providersSchema.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.update', req, res, { method: 'PATCH', write: true }, async (ctx, t) => {
    const parsed = z.object({ id: z.string().uuid(), patch: ProviderPatchSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '参数不合法。', traceId: t });
    const { id, patch } = parsed.data;
    const client = await adminClient();
    // 行级归属：只能改自己私有行；共享行需白名单邮箱
    const { data: existing } = await client.from('ai_providers').select('owner_user_id').eq('id', id).maybeSingle();
    if (!existing) return res.status(400).json({ message: '模型不存在或已被删除。', traceId: t });
    if (!canManageRow(ctx, existing as { owner_user_id: string | null })) {
      return res.status(403).json({ message: '无权修改该模型。', traceId: t });
    }
    const update: Record<string, unknown> = { ...patch };
    if (patch.api_key) {
      update.api_key_encrypted = encryptApiKey(patch.api_key);
      update.api_key_mask = maskApiKey(patch.api_key);
    }
    delete update.api_key;
    // 关键链路字段变更时清空测试徽标，避免陈旧“✓”误导（评审 M-1）
    if (patch.api_key || patch.base_url || patch.model) {
      update.test_status = null;
      update.test_detail = null;
      update.tested_at = null;
    }
    const { data, error } = await client.from('ai_providers').update(update).eq('id', id).select('*').maybeSingle();
    if (error) console.error('[api/ai.providers.update]', { traceId: t, db: error.message });
    if (error || !data) return res.status(400).json({ message: '更新失败，模型可能已被删除。', traceId: t });
    clearInstanceCache();
    res.status(200).json({ provider: toPublicRow(data as AdminRow) });
  });
}
