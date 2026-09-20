import { z } from 'zod';
import { AiUpstreamError, callLow } from '../../_lib/aiOpenAiCompat.js';
import { canManageRow, canViewRow } from '../_lib/adminGuard.js';
import { decryptApiKey, ProviderSecretError } from '../_lib/providerSecret.js';
import { adminClient, skeleton } from '../_lib/endpointKit.js';

const TEST_TIMEOUT_MS = 15_000;

// 与路由层 providerCall 对齐的单次上游调用预算：超时视为 status=0（网络不可达或超时）
function callWithBudget(args: Parameters<typeof callLow>[0]): Promise<{ content: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    callLow(args),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AiUpstreamError('AI 响应超时，请稍后再试。', 0)), TEST_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

// 单次上游调用预算 15s；maxDuration 需显著大于该值（+鉴权/查库开销），否则慢 provider 会被平台先杀掉、管理员看不到真实测试结果。
export const config = { maxDuration: 30 };

export default async function handler(req: any, res: any) {
  await skeleton('ai.providers.test', req, res, { method: 'POST', write: true }, async (ctx, t) => {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: '参数不合法。', traceId: t });
    const client = await adminClient();
    const { data, error } = await client.from('ai_providers').select('*').eq('id', parsed.data.id).maybeSingle();
    if (error) {
      console.error('[api/ai.providers.test]', { traceId: t, db: error.message });
      throw new Error('读取模型条目失败。');
    }
    if (!data) return res.status(400).json({ message: '模型不存在。', traceId: t });
    // v2：对可见行（共享或自己私有）才可测试；他人私有行按不存在处理
    if (!canViewRow(ctx, data)) return res.status(400).json({ message: '模型不存在。', traceId: t });

    const started = Date.now();
    let status: 'ok' | 'error' = 'ok';
    let detail: string | null = null;
    try {
      await callWithBudget({
        baseUrl: data.base_url, apiKey: decryptApiKey(data.api_key_encrypted), model: data.model,
        temperature: 0,
        messages: [{ role: 'user', content: '仅回复 ok 两个字符，不要输出其他内容。' }],
      });
    } catch (err) {
      status = 'error';
      if (err instanceof ProviderSecretError) {
        detail = '密钥解密失败，请重新录入 API Key';
      } else {
        const st = err instanceof AiUpstreamError ? err.status : 0;
        detail = st === 401 || st === 403 ? 'API Key 无效或已过期' : st === 429 ? '触发限流（429）' : st === 0 ? '网络不可达或超时' : `上游返回 ${st}`;
      }
    }
    const latencyMs = Date.now() - started;
    // 写 test_* 同受归属限制：普通用户不能写共享行的测试态（仅影响他人展示的元数据）
    if (canManageRow(ctx, data)) {
      const { error: writeErr } = await client.from('ai_providers').update({ test_status: status, test_detail: detail ? `${detail}（${latencyMs}ms）` : `${latencyMs}ms`, tested_at: new Date().toISOString() }).eq('id', parsed.data.id);
      if (writeErr) console.error('[api/ai.providers.test]', { traceId: t, db: writeErr.message });
    }
    res.status(200).json({ status, latencyMs, detail: detail ?? undefined });
  });
}
