import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callRoutedChat, getProviderChain, resetRouterStateForTests, type ProviderRow } from './aiProviderRouter.js';

const row = (over: Partial<ProviderRow> = {}): ProviderRow => ({
  id: 'r1', name: '智谱免费', base_url: 'https://x.test/v4', model: 'glm-4.5-air',
  api_key_encrypted: '', capability: 'text', cost_tier: 'free',
  ...over,
});

beforeEach(() => {
  process.env.AI_PROVIDER_ENC_KEY = 'test-master-key';
  delete process.env.AI_LLM_PROVIDER;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.OPENAI_API_KEY;
  resetRouterStateForTests();
});

describe('getProviderChain', () => {
  it('空表且无 env 配置 → 空链', async () => {
    expect(await getProviderChain('text', { loadRows: async () => [] })).toEqual([]);
  });

  it('DB 行按 capability 过滤并解密 key', async () => {
    const { encryptApiKey } = await import('./providerSecret.js');
    const rows = [row({ api_key_encrypted: encryptApiKey('sk-real') }), row({ id: 'r2', capability: 'vision', name: '视觉项' })];
    const chain = await getProviderChain('text', { loadRows: async () => rows });
    expect(chain).toHaveLength(1);
    expect(chain[0]).toMatchObject({ id: 'r1', name: '智谱免费', apiKey: 'sk-real', costTier: 'free' });
  });

  it('解密失败的行被跳过而不炸整链', async () => {
    const { encryptApiKey } = await import('./providerSecret.js');
    const rows = [row({ api_key_encrypted: 'bad:payload:here' }), row({ id: 'ok', api_key_encrypted: encryptApiKey('sk-2') })];
    const chain = await getProviderChain('text', { loadRows: async () => rows });
    expect(chain.map((c) => c.id)).toEqual(['ok']);
  });

  it('60s 内命中缓存不重复查库', async () => {
    const { encryptApiKey } = await import('./providerSecret.js');
    const loadRows = vi.fn().mockResolvedValue([row({ api_key_encrypted: encryptApiKey('sk') })]);
    await getProviderChain('text', { loadRows });
    await getProviderChain('text', { loadRows });
    expect(loadRows).toHaveBeenCalledTimes(1);
  });
});

describe('callRoutedChat', () => {
  it('表为空时回落 env 单元素链', async () => {
    process.env.DEEPSEEK_API_KEY = 'ds-env-key';
    const call = vi.fn().mockResolvedValue({ content: 'ok' });
    const r = await callRoutedChat('text', { system: 's', user: 'u' }, { loadRows: async () => [], call });
    expect(r.provider.id).toBe('env:deepseek');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('沿链降级并在日志记录命中 provider（仅日志观测）', async () => {
    const { encryptApiKey } = await import('./providerSecret.js');
    const rows = [
      row({ id: 'f1', name: '免费一', api_key_encrypted: encryptApiKey('k1') }),
      row({ id: 'p1', name: '付费兜底', api_key_encrypted: encryptApiKey('k2'), cost_tier: 'paid' }),
    ];
    const call = vi.fn().mockRejectedValueOnce(Object.assign(new Error('rate'), { name: 'AiUpstreamError', status: 429 })).mockResolvedValueOnce({ content: 'fallback' });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = await callRoutedChat('text', { system: 's', user: 'u' }, { loadRows: async () => rows, call, now: () => 0 });
    expect(r.content).toBe('fallback');
    expect(r.provider.costTier).toBe('paid');
    const logged = logSpy.mock.calls.filter((c) => c[0] === '[aiRouter] call');
    expect(logged).toHaveLength(2);
    expect(logged[1][1]).toMatchObject({ provider: '付费兜底', costTier: 'paid', ok: true });
    logSpy.mockRestore();
  });
});
