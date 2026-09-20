import { z } from 'zod';
import { encryptApiKey, maskApiKey } from '../_lib/providerSecret.js';
import { clearInstanceCache } from '../_lib/aiProviderRouter.js';
import { adminClient, skeleton } from '../_lib/endpointKit.js';
import { ProviderPatchSchema, toPublicRow } from '../_lib/providersSchema.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.update', req, res, { method: 'PATCH', write: true }, async (_userId, t) => {
    const parsed = z.object({ id: z.string().uuid(), patch: ProviderPatchSchema }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '参数不合法。', traceId: t });
    const { id, patch } = parsed.data;
    const update: Record<string, unknown> = { ...patch };
    if (patch.api_key) {
      update.api_key_encrypted = encryptApiKey(patch.api_key);
      update.api_key_mask = maskApiKey(patch.api_key);
    }
    delete update.api_key;
    const client = await adminClient();
    const { data, error } = await client.from('ai_providers').update(update).eq('id', id).select('*').maybeSingle();
    if (error || !data) return res.status(400).json({ message: '更新失败，模型可能已被删除。', traceId: t });
    clearInstanceCache();
    res.status(200).json({ provider: toPublicRow(data) });
  });
}
