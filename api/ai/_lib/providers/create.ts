import { encryptApiKey, maskApiKey } from '../providerSecret.js';
import { clearInstanceCache } from '../aiProviderRouter.js';
import { adminClient, skeleton } from '../endpointKit.js';
import { isSharedPoolAdmin } from '../adminGuard.js';
import { ProviderCreateSchema, toPublicRow } from '../providersSchema.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.create', req, res, { method: 'POST', write: true }, async (ctx, t) => {
    const parsed = ProviderCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '参数不合法，请检查名称、端点与模型。', traceId: t });
    const { scope } = parsed.data;
    if (scope === 'shared' && !isSharedPoolAdmin(ctx.email)) {
      return res.status(403).json({ message: '无权管理平台共享模型。', traceId: t });
    }
    const ownerUserId = scope === 'shared' ? null : ctx.userId;
    const client = await adminClient();
    let priority = parsed.data.priority;
    if (priority === undefined) {
      // 优先级在各自归属域内独立排序：共享池一套序，每个用户各一套序
      let q = client.from('ai_providers').select('priority').order('priority', { ascending: false }).limit(1);
      q = scope === 'shared' ? q.is('owner_user_id', null) : q.eq('owner_user_id', ctx.userId);
      const { data: maxRow } = await q.maybeSingle();
      priority = Number(maxRow?.priority ?? 0) + 1;
    }
    const payload = {
      owner_user_id: ownerUserId,
      name: parsed.data.name, base_url: parsed.data.base_url, model: parsed.data.model,
      api_key_encrypted: encryptApiKey(parsed.data.api_key),
      api_key_mask: maskApiKey(parsed.data.api_key),
      capability: parsed.data.capability, cost_tier: parsed.data.cost_tier,
      priority, enabled: parsed.data.enabled,
    };
    const { data, error } = await client.from('ai_providers').insert(payload).select('*').single();
    if (error) {
      console.error('[api/ai.providers.create]', { traceId: t, db: error.message });
      return res.status(400).json({ message: '保存失败，请重试。', traceId: t });
    }
    clearInstanceCache();
    res.status(200).json({ provider: toPublicRow(data) });
  });
}
