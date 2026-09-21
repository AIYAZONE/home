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
    let keyMaterial: { api_key_encrypted: string; api_key_mask: string };
    if (parsed.data.reuse_key_from) {
      // 可见域查询（共享行 + 自己私有行）——查不到统一 400，防探测（gone 语义）
      const { data: src, error: srcErr } = await client
        .from('ai_providers')
        .select('api_key_encrypted,api_key_mask')
        .eq('id', parsed.data.reuse_key_from)
        .or(`owner_user_id.is.null,owner_user_id.eq.${ctx.userId}`)
        .maybeSingle();
      if (srcErr || !src) {
        if (srcErr) console.error('[api/ai.providers.create]', { traceId: t, db: srcErr.message }); // 对外仍是防探测 400
        return res.status(400).json({ message: '引用的模型不存在或已被删除，请刷新后重试。', traceId: t });
      }
      keyMaterial = { api_key_encrypted: src.api_key_encrypted, api_key_mask: src.api_key_mask };
    } else {
      keyMaterial = { api_key_encrypted: encryptApiKey(parsed.data.api_key!), api_key_mask: maskApiKey(parsed.data.api_key!) };
    }
    const payload = {
      owner_user_id: ownerUserId,
      name: parsed.data.name, base_url: parsed.data.base_url, model: parsed.data.model,
      ...keyMaterial,
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
