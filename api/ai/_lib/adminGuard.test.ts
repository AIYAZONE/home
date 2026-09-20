import { describe, expect, it, vi } from 'vitest';
import { bearerToken, requirePlatformAdmin } from './adminGuard.js';

describe('bearerToken', () => {
  it('解析 Bearer 头（大小写与数组形态）', () => {
    expect(bearerToken({ authorization: 'Bearer abc' })).toBe('abc');
    expect(bearerToken({ Authorization: ['Bearer xyz'] })).toBe('xyz');
    expect(bearerToken({})).toBeNull();
  });
});

describe('requirePlatformAdmin', () => {
  it('无 token → 401', async () => {
    const r = await requirePlatformAdmin({ headers: {} });
    expect(r.error).toMatchObject({ status: 401 });
  });

  it('token 校验失败 → 401', async () => {
    const r = await requirePlatformAdmin({ headers: { authorization: 'Bearer t' }, verifyToken: async () => null });
    expect(r.error).toMatchObject({ status: 401 });
  });

  it('非管理员 → 403', async () => {
    const verifyToken = vi.fn().mockResolvedValue('u1');
    const isAdmin = vi.fn().mockResolvedValue(false);
    const r = await requirePlatformAdmin({ headers: { authorization: 'Bearer t' }, verifyToken, isAdmin });
    expect(r.error).toMatchObject({ status: 403 });
    expect(isAdmin).toHaveBeenCalledWith('u1');
  });

  it('管理员 → 返回 userId 且无 error', async () => {
    const r = await requirePlatformAdmin({
      headers: { authorization: 'Bearer t' },
      verifyToken: async () => 'u1',
      isAdmin: async () => true,
    });
    expect(r).toMatchObject({ userId: 'u1' });
    expect(r.error).toBeUndefined();
  });
});
