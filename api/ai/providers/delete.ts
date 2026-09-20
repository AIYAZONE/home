import { z } from 'zod';
import { clearInstanceCache } from '../_lib/aiProviderRouter.js';
import { adminClient, skeleton } from '../_lib/endpointKit.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.delete', req, res, { method: 'POST', write: true }, async (_userId, t) => {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '参数不合法。', traceId: t });
    const client = await adminClient();
    const { error } = await client.from('ai_providers').delete().eq('id', parsed.data.id);
    if (error) return res.status(400).json({ message: '删除失败，请重试。', traceId: t });
    clearInstanceCache();
    res.status(200).json({ ok: true });
  });
}
