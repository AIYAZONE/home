import { beforeEach, describe, expect, it, vi } from 'vitest';

const insert = vi.fn();
const maybeSingle = vi.fn();
const clientChain: Record<string, any> = {};
function makeChain(target: Record<string, any>) {
  const chain: any = new Proxy({}, {
    get: (_t, k: string) => {
      if (k === 'maybeSingle') return maybeSingle;
      // 真实链路是 .insert(payload).select('*').single()——select 在 single 之前
      if (k === 'insert') return (payload: any) => { target.insertPayload = payload; return { select: () => ({ single: insert }) }; };
      return (..._a: any[]) => chain;
    },
  });
  return chain;
}

vi.mock('./endpointKit.js', () => ({
  skeleton: async (_p: string, _req: any, res: any, _o: any, handler: any) => {
    await handler({ userId: 'u1', email: 'a@b.test' }, 'aip_test');
    return res;
  },
  adminClient: async () => ({ from: () => makeChain(clientChain) }),
}));
vi.mock('./aiProviderRouter.js', () => ({ clearInstanceCache: vi.fn() }));
vi.mock('./adminGuard.js', () => ({ isSharedPoolAdmin: () => false }));

import createHandler from './providers/create.js';

type Res = { code: number; body: any };
function makeRes(): Res & { status: (n: number) => any; setHeader: (k: string, v: string) => void; json: (p: unknown) => void } {
  const res: any = { code: 0, body: null };
  res.status = (n: number) => { res.code = n; return res; };
  res.setHeader = () => {};
  res.json = (p: unknown) => { res.body = p; };
  return res;
}

beforeEach(() => {
  insert.mockReset(); maybeSingle.mockReset(); delete clientChain.insertPayload;
  // priority 查询（create.ts L20-22）也走 maybeSingle——默认给空行，避免解构 undefined 抛错；
  // reuse 分支用例再覆盖此默认值
  maybeSingle.mockResolvedValue({ data: null, error: null });
});

const srcRow = { api_key_encrypted: 'iv:cipher-SRC', api_key_mask: 'sk-***src' };

describe('create reuse_key_from（spec 2026-09-21 §4.3）', () => {
  it('引用可见行 → 复制密文列入库，不经过 encryptApiKey', async () => {
    maybeSingle.mockResolvedValue({ data: srcRow, error: null });
    insert.mockResolvedValue({ data: { id: 'new1', owner_user_id: 'u1' }, error: null });
    const res = makeRes();
    await createHandler({ method: 'POST', headers: {}, body: { name: '智谱新免费', base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7-flash', capability: 'text', cost_tier: 'free', reuse_key_from: '11111111-1111-4111-a111-111111111111' } }, res);
    expect(res.code).toBe(200);
    expect(clientChain.insertPayload).toMatchObject({ api_key_encrypted: 'iv:cipher-SRC', api_key_mask: 'sk-***src' });
  });
  it('引用查不到（含他人私有行，查询已限可见域）→ 400 防探测文案', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = makeRes();
    await createHandler({ method: 'POST', headers: {}, body: { name: 'n', base_url: 'https://x.test/v4', model: 'm', capability: 'text', cost_tier: 'free', reuse_key_from: '11111111-1111-4111-a111-111111111111' } }, res);
    expect(res.code).toBe(400);
    expect(res.body.message).toContain('引用的模型不存在');
    expect(res.body.traceId).toBe('aip_test');
  });
  it('带 api_key 明文路径不受影响（encryptApiKey 正常调用）', async () => {
    insert.mockResolvedValue({ data: { id: 'new2', owner_user_id: 'u1' }, error: null });
    const res = makeRes();
    await createHandler({ method: 'POST', headers: {}, body: { name: 'n', base_url: 'https://x.test/v4', model: 'm', api_key: 'sk-plain', capability: 'text', cost_tier: 'free' } }, res);
    expect(res.code).toBe(200);
    expect(clientChain.insertPayload.api_key_mask).toContain('sk-');
    expect(clientChain.insertPayload.api_key_encrypted).not.toBe('sk-plain'); // 入库必须密文
  });
});
