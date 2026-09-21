import { beforeEach, describe, expect, it, vi } from 'vitest';

const clientChain: any = {};
const orSpy = vi.fn((_f: string) => clientChain);
vi.mock('./endpointKit.js', () => ({
  skeleton: async (_p: string, _req: any, res: any, _o: any, handler: any) => { await handler({ userId: 'u1', email: 'a@b.test' }, 'aip_test'); return res; },
  adminClient: async () => ({ from: () => clientChain }),
}));
vi.mock('./providerDiscovery.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./providerDiscovery.js')>();
  return { ...orig, CATALOG_URL: 'https://catalog.test/api.json' };
});

import discoverHandler, { resetDiscoveryCacheForTests } from './providers/discover.js';

type Res = { code: number; body: any };
function makeRes(): Res & { status: (n: number) => any; setHeader: () => void; json: (p: unknown) => void } {
  const res: any = { code: 0, body: null };
  res.status = (n: number) => { res.code = n; return res; };
  res.setHeader = () => {};
  res.json = (p: unknown) => { res.body = p; };
  return res;
}

const catalogJson = { zhipuai: { name: 'Zhipu AI', api: 'https://open.bigmodel.cn/api/paas/v4', models: { 'glm-4.7-flash': { id: 'glm-4.7-flash', name: 'GLM-4.7-Flash', cost: { input: 0, output: 0 }, modalities: { input: ['text'], output: ['text'] }, limit: { context: 200000 } } } } };

beforeEach(() => {
  resetDiscoveryCacheForTests();
  vi.restoreAllMocks();
  orSpy.mockClear();
  clientChain.select = () => clientChain;
  clientChain.or = orSpy;
  clientChain.order = () => clientChain;
  clientChain.then = (r: any) => Promise.resolve({ data: [{ id: 'r1', name: '智谱主用', base_url: 'https://open.bigmodel.cn/api/paas/v4', enabled: true, priority: 1 }], error: null }).then(r);
});

describe('GET discover', () => {
  it('拉目录 + 比对可见行 → 200 带 key_reusable，失败结果不缓存（下次重试成功）', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => catalogJson });
    vi.stubGlobal('fetch', fetchMock);
    const fail = makeRes();
    await discoverHandler({ method: 'GET', headers: {} }, fail);
    expect(fail.code).toBe(502);
    expect(fail.body.traceId).toBe('aip_test');
    const ok = makeRes();
    await discoverHandler({ method: 'GET', headers: {} }, ok);
    expect(ok.code).toBe(200);
    expect(ok.body.models[0]).toMatchObject({ model_id: 'glm-4.7-flash', key_reusable: true, reuse_provider_id: 'r1' });
    expect(JSON.stringify(ok.body)).not.toMatch(/api_key/); // 红线：响应不含任何 key 字段
    // 可见域回归锁（Task 2 评审 M1 携带）：比对查询必须限「共享行 + 本用户私有行」
    expect(orSpy).toHaveBeenCalledWith(expect.stringContaining('owner_user_id.is.null'));
    expect(String(orSpy.mock.calls[0][0])).toContain('owner_user_id.eq.u1');
  });
  it('60s 缓存：第二次请求不再打目录源', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => catalogJson });
    vi.stubGlobal('fetch', fetchMock);
    await discoverHandler({ method: 'GET', headers: {} }, makeRes());
    await discoverHandler({ method: 'GET', headers: {} }, makeRes());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
