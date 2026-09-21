import { z } from 'zod';
import { clearInstanceCache } from '../aiProviderRouter.js';
import { decideManage } from '../adminGuard.js';
import { adminClient, skeleton } from '../endpointKit.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.delete', req, res, { method: 'POST', write: true }, async (ctx, t) => {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '参数不合法。', traceId: t });
    const client = await adminClient();
    // v2 行级归属三态：他人私有行按「不存在」回应；共享行非白名单 → 403
    const { data: existing } = await client.from('ai_providers').select('owner_user_id').eq('id', parsed.data.id).maybeSingle();
    const decision = decideManage(ctx, existing as { owner_user_id: string | null } | null);
    if (decision === 'gone') return res.status(400).json({ message: '模型不存在或已被删除。', traceId: t });
    if (decision === 'forbidden') return res.status(403).json({ message: '无权删除该模型。', traceId: t });
    const { error } = await client.from('ai_providers').delete().eq('id', parsed.data.id);
    if (error) {
      console.error('[api/ai.providers.delete]', { traceId: t, db: error.message });
      return res.status(400).json({ message: '删除失败，请重试。', traceId: t });
    }
    clearInstanceCache();
    res.status(200).json({ ok: true });
  });
}
