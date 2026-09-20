import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callRoutedChat, getProviderChain, resetRouterStateForTests, type ProviderRow } from './aiProviderRouter.js';

const row = (over: Partial<ProviderRow> = {}): ProviderRow => ({
  id: 'r1', name: '智谱免费', base_url: 'https://x.test/v4', model: 'glm-4.5-air',
  api_key_encrypted: '', capability: 'text', cost_tier: 'free',
  owner_user_id: null, // 默认共享行
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
    expect(await getProviderChain('text', null, { loadRows: async () => [] })).toEqual([]);
  });

  it('DB 行按 capability 过滤并解密 key', async () => {
    const { encryptApiKey } = await import('./providerSecret.js');
    const rows = [row({ api_key_encrypted: encryptApiKey('sk-real') }), row({ id: 'r2', capability: 'vision', name: '视觉项' })];
    const chain = await getProviderChain('text', null, { loadRows: async () => rows });
    expect(chain).toHaveLength(1);
    expect(chain[0]).toMatchObject({ id: 'r1', name: '智谱免费', apiKey: 'sk-real', costTier: 'free' });
  });

  it('解密失败的行被跳过而不炸整链', async () => {
    const { encryptApiKey } = await import('./providerSecret.js');
    const rows = [row({ api_key_encrypted: 'bad:payload:here' }), row({ id: 'ok', api_key_encrypted: encryptApiKey('sk-2') })];
    const chain = await getProviderChain('text', null, { loadRows: async () => rows });
    expect(chain.map((c) => c.id)).toEqual(['ok']);
  });

  it('60s 内命中缓存不重复查库；不同用户各自查库（v2：缓存按 能力×用户）', async () => {
    const { encryptApiKey } = await import('./providerSecret.js');
    const loadRows = vi.fn().mockResolvedValue([row({ api_key_encrypted: encryptApiKey('sk') })]);
    await getProviderChain('text', 'u1', { loadRows });
    await getProviderChain('text', 'u1', { loadRows });
    expect(loadRows).toHaveBeenCalledTimes(1);
    await getProviderChain('text', 'u2', { loadRows });
    expect(loadRows).toHaveBeenCalledTimes(2);
    expect(loadRows.mock.calls[1][0]).toBe('u2');
  });

  it('个人行排在共享行之前（个人优先降级域序，域内保持 priority 升序）', async () => {
    const { encryptApiKey } = await import('./providerSecret.js');
    const enc = encryptApiKey('sk');
    // loadRows 模拟 DB 返回：priority 升序交错两域（priority 是域内序号，跨域相对序无意义）
    const rows = [row({ id: 's1', api_key_encrypted: enc }), row({ id: 'p1', owner_user_id: 'u1', api_key_encrypted: enc }), row({ id: 's2', api_key_encrypted: enc })];
    const chain = await getProviderChain('text', 'u1', { loadRows: async () => rows });
    expect(chain.map((c) => c.id)).toEqual(['p1', 's1', 's2']);
  });

  it('用户默认模型置顶；默认行被删/能力不符时静默忽略（v2 user_model_prefs）', async () => {
    const { encryptApiKey } = await import('./providerSecret.js');
    const enc = encryptApiKey('sk');
    const rows = [row({ id: 's1', api_key_encrypted: enc }), row({ id: 'p1', owner_user_id: 'u1', api_key_encrypted: enc })];
    const chain = await getProviderChain('text', 'u1', { loadRows: async () => rows, loadDefaultId: async () => 's1' });
    expect(chain.map((c) => c.id)).toEqual(['s1', 'p1']);
    const chainMissing = await getProviderChain('vision', 'u1', {
      loadRows: async () => [row({ id: 'v1', capability: 'vision', api_key_encrypted: enc })],
      loadDefaultId: async () => 'deleted-row',
    });
    expect(chainMissing.map((c) => c.id)).toEqual(['v1']);
  });

  it('无 userId（未登录路径）只解析共享行且不做默认置顶', async () => {
    const loadDefaultId = vi.fn().mockResolvedValue('x');
    await getProviderChain('text', null, { loadRows: async () => [], loadDefaultId });
    expect(loadDefaultId).toHaveBeenCalledWith(null, 'text');
  });

  it('空表时 env 兜底链按 capability 精确匹配：vision 请求不吞入 text env 链', async () => {
    process.env.DEEPSEEK_API_KEY = 'ds-env-key';
    // env 兜底链只会构造 capability:'text' 的 provider
    expect(await getProviderChain('text', null, { loadRows: async () => [] })).toHaveLength(1);
    // vision 请求在空表下应得到空链（而非把纯文本模型塞进视觉路由）
    expect(await getProviderChain('vision', null, { loadRows: async () => [] })).toEqual([]);
  });
});

describe('callRoutedChat', () => {
  it('表为空时回落 env 单元素链', async () => {
    process.env.DEEPSEEK_API_KEY = 'ds-env-key';
    const call = vi.fn().mockResolvedValue({ content: 'ok' });
    const r = await callRoutedChat('text', { system: 's', user: 'u' }, null, { loadRows: async () => [], call });
    expect(r.provider.id).toBe('env:deepseek');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('ctx.userId 透传给链解析（v2）', async () => {
    const { encryptApiKey } = await import('./providerSecret.js');
    const loadRows = vi.fn().mockResolvedValue([row({ api_key_encrypted: encryptApiKey('sk') })]);
    const call = vi.fn().mockResolvedValue({ content: 'ok' });
    await callRoutedChat('text', { system: 's', user: 'u' }, { userId: 'u42' }, { loadRows, call, loadDefaultId: async () => null });
    expect(loadRows).toHaveBeenCalledWith('u42');
  });

  it('沿链降级并在日志记录命中 provider（仅日志观测）', async () => {
    const { encryptApiKey } = await import('./providerSecret.js');
    const rows = [
      row({ id: 'f1', name: '免费一', api_key_encrypted: encryptApiKey('k1') }),
      row({ id: 'p1', name: '付费兜底', api_key_encrypted: encryptApiKey('k2'), cost_tier: 'paid' }),
    ];
    const call = vi.fn().mockRejectedValueOnce(Object.assign(new Error('rate'), { name: 'AiUpstreamError', status: 429 })).mockResolvedValueOnce({ content: 'fallback' });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = await callRoutedChat('text', { system: 's', user: 'u' }, null, { loadRows: async () => rows, call, now: () => 0 });
    expect(r.content).toBe('fallback');
    expect(r.provider.costTier).toBe('paid');
    const logged = logSpy.mock.calls.filter((c) => c[0] === '[aiRouter] call');
    expect(logged).toHaveLength(2);
    expect(logged[1][1]).toMatchObject({ provider: '付费兜底', costTier: 'paid', ok: true });
    logSpy.mockRestore();
  });
});
