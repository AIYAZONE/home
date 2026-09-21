import { adminClient, skeleton } from '../endpointKit.js';
import { isSharedPoolAdmin } from '../adminGuard.js';
import { toPublicRow, type AdminRow } from '../providersSchema.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.list', req, res, { method: 'GET' }, async (ctx, t) => {
    const client = await adminClient();
    // 可见范围：平台共享行（owner_user_id IS NULL）+ 当前用户私有行
    const { data, error } = await client
      .from('ai_providers')
      .select('*')
      .or(`owner_user_id.is.null,owner_user_id.eq.${ctx.userId}`)
      .order('priority', { ascending: true });
    if (error) {
      console.error('[api/ai.providers.list]', { traceId: t, db: error.message });
      throw new Error('读取模型清单失败。');
    }
    const { data: prefs } = await client
      .from('user_model_prefs')
      .select('capability,provider_id')
      .eq('user_id', ctx.userId);
    const defaults: { text: string | null; vision: string | null } = { text: null, vision: null };
    for (const p of (prefs ?? []) as Array<{ capability: 'text' | 'vision'; provider_id: string }>) {
      defaults[p.capability] = p.provider_id;
    }
    res.status(200).json({
      providers: (data ?? []).map((r: AdminRow) => toPublicRow(r)),
      defaults,
      canManageShared: isSharedPoolAdmin(ctx.email),
    });
  });
}
