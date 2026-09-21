import { z } from 'zod';
import { clearInstanceCache } from '../aiProviderRouter.js';
import { decideManage } from '../adminGuard.js';
import { adminClient, skeleton } from '../endpointKit.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.reorder', req, res, { method: 'POST', write: true }, async (ctx, t) => {
    const parsed = z.object({ ids: z.array(z.string().uuid()).min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '参数不合法。', traceId: t });
    // 重复 id 会静默产生重复 priority（无唯一约束），先拦截（评审 M-6）
    if (new Set(parsed.data.ids).size !== parsed.data.ids.length)
      return res.status(400).json({ message: '排序列表含重复项。', traceId: t });
    const client = await adminClient();
    // v2 行级归属：一次载入全部目标行，逐行校验可管理；并要求同一归属域（priority 是域内序号，跨域混排会污染数据）
    const { data: rows, error: loadErr } = await client.from('ai_providers').select('id, owner_user_id').in('id', parsed.data.ids);
    if (loadErr) {
      console.error('[api/ai.providers.reorder]', { traceId: t, db: loadErr.message });
      return res.status(400).json({ message: '调整顺序失败，请刷新后重试。', traceId: t });
    }
    if (!rows || rows.length !== parsed.data.ids.length)
      return res.status(400).json({ message: '部分模型不存在或已被删除。', traceId: t });
    const owners = new Map(rows.map((r: { id: string; owner_user_id: string | null }) => [r.id, r.owner_user_id]));
    // 三态语义与 update/delete 对齐：他人私有行按「部分模型不存在」回应，共享行非白名单才 403
    let forbidden = false;
    for (const id of parsed.data.ids) {
      const decision = decideManage(ctx, { owner_user_id: owners.get(id) ?? null });
      if (decision === 'gone')
        return res.status(400).json({ message: '部分模型不存在或已被删除。', traceId: t });
      if (decision === 'forbidden') forbidden = true;
    }
    if (forbidden) return res.status(403).json({ message: '无权调整部分模型的顺序。', traceId: t });
    if (new Set(rows.map((r: { owner_user_id: string | null }) => (r.owner_user_id === null ? 'shared' : 'own'))).size > 1)
      return res.status(400).json({ message: '不能跨分区调整顺序。', traceId: t });
    for (let i = 0; i < parsed.data.ids.length; i += 1) {
      const { error } = await client.from('ai_providers').update({ priority: i + 1 }).eq('id', parsed.data.ids[i]);
      if (error) {
        console.error('[api/ai.providers.reorder]', { traceId: t, db: error.message });
        return res.status(400).json({ message: '调整顺序失败，请刷新后重试。', traceId: t });
      }
    }
    clearInstanceCache();
    res.status(200).json({ ok: true });
  });
}
