import { z } from 'zod';
import { AiUpstreamError, callLow } from '../../_lib/aiOpenAiCompat.js';
import { decryptApiKey } from '../_lib/providerSecret.js';
import { adminClient, skeleton } from '../_lib/endpointKit.js';

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.test', req, res, { method: 'POST', write: true }, async (_userId, t) => {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '参数不合法。', traceId: t });
    const client = await adminClient();
    const { data } = await client.from('ai_providers').select('*').eq('id', parsed.data.id).maybeSingle();
    if (!data) return res.status(400).json({ message: '模型不存在。', traceId: t });

    const started = Date.now();
    let status: 'ok' | 'error' = 'ok';
    let detail: string | null = null;
    try {
      await callLow({
        baseUrl: data.base_url, apiKey: decryptApiKey(data.api_key_encrypted), model: data.model,
        temperature: 0,
        messages: [{ role: 'user', content: '仅回复 ok 两个字符，不要输出其他内容。' }],
      });
    } catch (err) {
      status = 'error';
      const st = err instanceof AiUpstreamError ? err.status : 0;
      detail = st === 401 || st === 403 ? 'API Key 无效或已过期' : st === 429 ? '触发限流（429）' : st === 0 ? '网络不可达或超时' : `上游返回 ${st}`;
    }
    const latencyMs = Date.now() - started;
    await client.from('ai_providers').update({ test_status: status, test_detail: detail ? `${detail}（${latencyMs}ms）` : `${latencyMs}ms`, tested_at: new Date().toISOString() }).eq('id', parsed.data.id);
    res.status(200).json({ status, latencyMs, detail: detail ?? undefined });
  });
}
