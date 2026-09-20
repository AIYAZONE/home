import { z } from 'zod';
import { clearInstanceCache } from '../_lib/aiProviderRouter.js';
import { adminClient, skeleton } from '../_lib/endpointKit.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.reorder', req, res, { method: 'POST', write: true }, async (_userId, t) => {
    const parsed = z.object({ ids: z.array(z.string().uuid()).min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '参数不合法。', traceId: t });
    const client = await adminClient();
    for (let i = 0; i < parsed.data.ids.length; i += 1) {
      const { error } = await client.from('ai_providers').update({ priority: i + 1 }).eq('id', parsed.data.ids[i]);
      if (error) return res.status(400).json({ message: '调整顺序失败，请刷新后重试。', traceId: t });
    }
    clearInstanceCache();
    res.status(200).json({ ok: true });
  });
}
