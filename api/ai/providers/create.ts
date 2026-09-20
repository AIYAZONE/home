import { encryptApiKey, maskApiKey } from '../_lib/providerSecret.js';
import { clearInstanceCache } from '../_lib/aiProviderRouter.js';
import { adminClient, skeleton } from '../_lib/endpointKit.js';
import { ProviderCreateSchema, toPublicRow } from '../_lib/providersSchema.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.create', req, res, { method: 'POST', write: true }, async (_userId, t) => {
    const parsed = ProviderCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '参数不合法，请检查名称、端点与模型。', traceId: t });
    const client = await adminClient();
    let priority = parsed.data.priority;
    if (priority === undefined) {
      const { data: maxRow } = await client.from('ai_providers').select('priority').order('priority', { ascending: false }).limit(1).maybeSingle();
      priority = Number(maxRow?.priority ?? 0) + 1;
    }
    const payload = {
      name: parsed.data.name, base_url: parsed.data.base_url, model: parsed.data.model,
      api_key_encrypted: encryptApiKey(parsed.data.api_key),
      api_key_mask: maskApiKey(parsed.data.api_key),
      capability: parsed.data.capability, cost_tier: parsed.data.cost_tier,
      priority, enabled: parsed.data.enabled,
    };
    const { data, error } = await client.from('ai_providers').insert(payload).select('*').single();
    if (error) return res.status(400).json({ message: '保存失败，请重试。', traceId: t });
    clearInstanceCache();
    res.status(200).json({ provider: toPublicRow(data) });
  });
}
