import { adminClient, skeleton } from '../_lib/endpointKit.js';
import { toPublicRow, type AdminRow } from '../_lib/providersSchema.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.list', req, res, { method: 'GET' }, async (_userId, t) => {
    const client = await adminClient();
    const { data, error } = await client.from('ai_providers').select('*').order('priority', { ascending: true });
    if (error) {
      console.error('[api/ai.providers.list]', { traceId: t, db: error.message });
      throw new Error('读取模型清单失败。');
    }
    res.status(200).json({ providers: (data ?? []).map((r: AdminRow) => toPublicRow(r)) });
  });
}
