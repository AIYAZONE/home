import { clearInstanceCache } from '../_lib/aiProviderRouter.js';
import { canViewRow } from '../_lib/adminGuard.js';
import { SetDefaultSchema } from '../_lib/providersSchema.js';
import { adminClient, skeleton } from '../_lib/endpointKit.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.setdefault', req, res, { method: 'POST', write: true }, async (ctx, t) => {
    const parsed = SetDefaultSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '参数不合法。', traceId: t });
    const client = await adminClient();
    // 只能把「对自己可见」的行（共享或自己私有）设为默认；他人私有行按不存在处理
    const { data: row } = await client.from('ai_providers')
      .select('owner_user_id, capability, enabled')
      .eq('id', parsed.data.provider_id).maybeSingle();
    if (!row || !canViewRow(ctx, row)) return res.status(400).json({ message: '模型不存在或已被删除。', traceId: t });
    if (!row.enabled) return res.status(400).json({ message: '该模型已停用，请先启用后再设为默认。', traceId: t });
    if (row.capability !== parsed.data.capability)
      return res.status(400).json({ message: '模型能力与默认类型不匹配。', traceId: t });
    const { error } = await client.from('user_model_prefs').upsert(
      { user_id: ctx.userId, capability: parsed.data.capability, provider_id: parsed.data.provider_id, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,capability' },
    );
    if (error) {
      console.error('[api/ai.providers.setdefault]', { traceId: t, db: error.message });
      return res.status(400).json({ message: '设置默认模型失败，请重试。', traceId: t });
    }
    clearInstanceCache(); // 默认选择影响链首，清本实例路由缓存
    res.status(200).json({ ok: true });
  });
}
