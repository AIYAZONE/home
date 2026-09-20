import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitsForTests, skeleton } from './endpointKit.js';

vi.mock('./adminGuard.js', () => ({
  requireUser: vi.fn(),
}));

import { requireUser } from './adminGuard.js';
const guardMock = vi.mocked(requireUser);

type Res = { code: number; body: unknown; headers: Record<string, string> };
function makeRes(): Res & { status: (n: number) => any; setHeader: (k: string, v: string) => void; json: (p: unknown) => void } {
  const res: any = { code: 0, body: null, headers: {} };
  res.setStatus = undefined;
  res.status = (n: number) => { res.code = n; return res; };
  res.setHeader = (k: string, v: string) => { res.headers[k] = v; };
  res.json = (p: unknown) => { res.body = p; return res; };
  return res;
}

beforeEach(() => {
  resetRateLimitsForTests();
  guardMock.mockReset();
});

describe('skeleton', () => {
  it('方法不匹配 → 405，且不查库/不调用 handler', async () => {
    const res = makeRes();
    const handler = vi.fn();
    await skeleton('x', { method: 'GET', headers: {} }, res, { method: 'POST', write: true }, handler);
    expect(res.code).toBe(405);
    expect(res.body).toMatchObject({ message: '不支持的请求方法。' });
    expect((res.body as any).traceId).toMatch(/^aip_/);
    expect(handler).not.toHaveBeenCalled();
  });

  it('无 token → 透传登录守卫的 401', async () => {
    guardMock.mockResolvedValue({ error: { status: 401, message: '未登录或登录已过期，请重新登录。' } } as any);
    const res = makeRes();
    await skeleton('x', { method: 'POST', headers: {} }, res, { method: 'POST', write: true }, vi.fn());
    expect(res.code).toBe(401);
    expect(res.body).toMatchObject({ message: '未登录或登录已过期，请重新登录。' });
  });

  it('写操作超阈值 → 429（首请求放行，第 31 次拒绝）', async () => {
    guardMock.mockResolvedValue({ ctx: { userId: 'u1', email: 'a@b.test' } } as any);
    const req = { method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' } };
    let res = makeRes();
    for (let i = 0; i < 30; i += 1) {
      res = makeRes();
      await skeleton('writeEP', req, res, { method: 'POST', write: true }, vi.fn().mockResolvedValue(undefined));
      expect(res.code).not.toBe(429);
    }
    res = makeRes();
    await skeleton('writeEP', req, res, { method: 'POST', write: true }, vi.fn().mockResolvedValue(undefined));
    expect(res.code).toBe(429);
  });

  it('限流按用户计（终审 #2）：同 IP 下 u1 打满不影响 u2', async () => {
    const req = { method: 'POST', headers: { 'x-forwarded-for': '9.9.9.9' } };
    guardMock.mockResolvedValue({ ctx: { userId: 'u1', email: 'a@b.test' } } as any);
    for (let i = 0; i < 31; i += 1) {
      await skeleton('writeIso', req, makeRes(), { method: 'POST', write: true }, vi.fn().mockResolvedValue(undefined));
    }
    // u1 此时已超阈值；同 IP 的 u2 不应被连坐
    guardMock.mockResolvedValue({ ctx: { userId: 'u2', email: 'c@d.test' } } as any);
    const res = makeRes();
    await skeleton('writeIso', req, res, { method: 'POST', write: true }, vi.fn().mockResolvedValue(undefined));
    expect(res.code).not.toBe(429);
  });

  it('handler 抛技术型错误（无中文）→ 400 安全文案 + traceId，不泄露原始错误', async () => {
    guardMock.mockResolvedValue({ ctx: { userId: 'u1', email: 'a@b.test' } } as any);
    const res = makeRes();
    await skeleton('x', { method: 'GET', headers: {} }, res, { method: 'GET' }, async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.1:5432 postgres://user:pw@host');
    });
    expect(res.code).toBe(400);
    expect((res.body as any).traceId).toMatch(/^aip_/);
    expect((res.body as any).message).toBe('请求失败，请稍后再试。');
    expect(JSON.stringify(res.body)).not.toContain('postgres://');
  });

  it('放行时设置 no-store 且把 AuthContext/traceId 交给 handler', async () => {
    guardMock.mockResolvedValue({ ctx: { userId: 'u1', email: 'a@b.test' } } as any);
    const res = makeRes();
    const handler = vi.fn(async (ctx: { userId: string }, t: string) => { res.status(200).json({ userId: ctx.userId, t }); });
    await skeleton('x', { method: 'GET', headers: {} }, res, { method: 'GET' }, handler);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0]).toEqual({ userId: 'u1', email: 'a@b.test' });
    expect((handler.mock.calls[0][1] as string)).toMatch(/^aip_/);
  });
});
