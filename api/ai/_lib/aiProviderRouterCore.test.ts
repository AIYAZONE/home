import { describe, expect, it, vi } from 'vitest';
import {
  AllProvidersUnavailableError,
  buildEnvFallbackChain,
  isCoolingDown,
  runChain,
  shouldCooldown,
  type ResolvedProvider,
} from './aiProviderRouterCore.js';

const p = (id: string, over: Partial<ResolvedProvider> = {}): ResolvedProvider => ({
  id, name: id, baseUrl: 'https://x.test/v1', model: 'm', apiKey: 'k', capability: 'text', costTier: 'free', ...over,
});
const up = (status: number) => Object.assign(new Error('upstream'), { name: 'AiUpstreamError', status });

describe('shouldCooldown', () => {
  it('429/5xx/0 冷却；4xx非429/401/403 不冷却', () => {
    // 回归：5xx 按区间判定（含 500/501 等上游内部错），而非只枚举 502/503/504
    expect([429, 500, 501, 502, 503, 504, 599, 0].every(shouldCooldown)).toBe(true);
    expect([400, 401, 403, 404, 429 - 1].some(shouldCooldown)).toBe(false);
  });
});

describe('isCoolingDown', () => {
  it('窗口内为 true，过期为 false，无记录为 false', () => {
    const map = new Map<string, number>([['a', 11000]]);
    expect(isCoolingDown(map, 'a', 10500)).toBe(true);
    expect(isCoolingDown(map, 'a', 11000)).toBe(false);
    expect(isCoolingDown(map, 'b', 1000)).toBe(false);
  });
});

describe('runChain', () => {
  it('首个 429 后降级到第二个并成功', async () => {
    const cooldownMap = new Map<string, number>();
    const call = vi.fn().mockRejectedValueOnce(up(429)).mockResolvedValueOnce({ content: 'ok2' });
    const r = await runChain({ chain: [p('a'), p('b')], request: { system: 's', user: 'u' }, call, now: () => 1000, cooldownMs: 10 * 60_000, cooldownMap });
    expect(r.content).toBe('ok2');
    expect(r.provider.id).toBe('b');
    expect(cooldownMap.has('a')).toBe(true); // 失败项已进冷却
  });

  it('冷却中的 provider 被跳过；冷却窗口过期后可再次尝试', async () => {
    const cooldownMap = new Map<string, number>([['a', 1500]]);
    const call = vi.fn().mockResolvedValue({ content: 'b' });
    const r = await runChain({ chain: [p('a'), p('b')], request: { system: 's', user: 'u' }, call, now: () => 1000, cooldownMs: 10, cooldownMap });
    expect(r.provider.id).toBe('b'); // a 冷却中被直接跳过，未发起请求
    expect(call).toHaveBeenCalledTimes(1);
    const call2 = vi.fn().mockResolvedValue({ content: 'a' });
    await runChain({ chain: [p('a')], request: { system: 's', user: 'u' }, call: call2, now: () => 9999, cooldownMs: 10, cooldownMap });
    expect(call2).toHaveBeenCalledTimes(1); // 窗口过期 → 重新尝试
  });

  it('429 的 provider 进入冷却，下次调用直接跳过；窗口过期后恢复', async () => {
    const cooldownMap = new Map<string, number>();
    const call = vi.fn(async (pp: ResolvedProvider) => { if (pp.id === 'a') throw up(429); return { content: pp.id }; });
    const chain = [p('a'), p('b')];
    const base = { chain, request: { system: 's', user: 'u' }, call, cooldownMs: 10 * 60_000, cooldownMap };
    await runChain({ ...base, now: () => 1000 });
    expect(cooldownMap.get('a')).toBe(1000 + 10 * 60_000); // 后续成功不得误清 a 的冷却（回归：delete 错 key bug）
    await runChain({ ...base, now: () => 2000 }); // a 仍在冷却 → 被跳过
    expect(call).toHaveBeenCalledTimes(3); // 第 2 轮仅 b 被调（第 1 轮已产生 a、b 两次）
    expect((call.mock.calls[2] as any)[0].id).toBe('b');
    await runChain({ ...base, now: () => 1000 + 10 * 60_000 + 1 }); // 冷却过期 → a 重新尝试
    expect((call.mock.calls[3] as any)[0].id).toBe('a');
  });

  it('401 跳过但不进冷却表', async () => {
    const cooldownMap = new Map<string, number>();
    const call = vi.fn().mockRejectedValueOnce(up(401)).mockResolvedValueOnce({ content: 'b' });
    const r = await runChain({ chain: [p('a'), p('b')], request: { system: 's', user: 'u' }, call, now: () => 0, cooldownMs: 1, cooldownMap });
    expect(r.content).toBe('b');
    expect(cooldownMap.size).toBe(0);
  });

  it('链耗尽抛 AllProvidersUnavailableError', async () => {
    const call = vi.fn().mockRejectedValue(up(429));
    await expect(runChain({ chain: [p('a')], request: { system: 's', user: 'u' }, call, now: () => 0, cooldownMs: 1, cooldownMap: new Map() }))
      .rejects.toBeInstanceOf(AllProvidersUnavailableError);
  });

  it('整链全部处于冷却时同样抛链耗尽错误且不发请求', async () => {
    const cooldownMap = new Map<string, number>([['a', 9999]]);
    const call = vi.fn();
    await expect(runChain({ chain: [p('a')], request: { system: 's', user: 'u' }, call, now: () => 1000, cooldownMs: 1, cooldownMap }))
      .rejects.toBeInstanceOf(AllProvidersUnavailableError);
    expect(call).not.toHaveBeenCalled();
  });

  it('onResult 对成功与失败各回调一次', async () => {
    const events: string[] = [];
    const call = vi.fn().mockRejectedValueOnce(up(429)).mockResolvedValueOnce({ content: 'b' });
    await runChain({
      chain: [p('a'), p('b')], request: { system: 's', user: 'u' }, call, now: () => 0, cooldownMs: 1, cooldownMap: new Map(),
      onResult: (pp, ok, status) => events.push(`${pp.id}:${ok}:${status}`),
    });
    expect(events).toEqual(['a:false:429', 'b:true:200']);
  });
});

describe('buildEnvFallbackChain', () => {
  it('默认 deepseek', () => {
    const chain = buildEnvFallbackChain({ DEEPSEEK_API_KEY: 'ds-key' });
    expect(chain).toHaveLength(1);
    expect(chain[0]).toMatchObject({ id: 'env:deepseek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com', apiKey: 'ds-key', capability: 'text' });
  });

  it('openai 选择与空 key 返回空链', () => {
    expect(buildEnvFallbackChain({ AI_LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'oa' })[0]).toMatchObject({ id: 'env:openai', baseUrl: 'https://api.openai.com/v1' });
    expect(buildEnvFallbackChain({})).toEqual([]);
  });
});
