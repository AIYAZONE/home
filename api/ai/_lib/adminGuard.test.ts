import { describe, expect, it, vi } from 'vitest';
import {
  bearerToken,
  canManageRow,
  canViewRow,
  isSharedPoolAdmin,
  requireUser,
  type AuthContext,
} from './adminGuard.js';

describe('bearerToken', () => {
  it('解析 Bearer 头（大小写与数组形态）', () => {
    expect(bearerToken({ authorization: 'Bearer abc' })).toBe('abc');
    expect(bearerToken({ Authorization: ['Bearer xyz'] })).toBe('xyz');
    expect(bearerToken({})).toBeNull();
  });
});

describe('requireUser（v2：仅校验登录，返回 userId + email）', () => {
  it('无 token → 401', async () => {
    const r = await requireUser({ headers: {} });
    expect(r.error).toMatchObject({ status: 401 });
  });

  it('token 校验失败 → 401', async () => {
    const r = await requireUser({ headers: { authorization: 'Bearer t' }, verifyToken: async () => null });
    expect(r.error).toMatchObject({ status: 401 });
  });

  it('登录成功 → 返回 AuthContext 且无 error', async () => {
    const verifyToken = vi.fn().mockResolvedValue({ userId: 'u1', email: 'a@b.test' });
    const r = await requireUser({ headers: { authorization: 'Bearer t' }, verifyToken });
    expect(r.ctx).toEqual({ userId: 'u1', email: 'a@b.test' });
    expect(r.error).toBeUndefined();
  });
});

describe('isSharedPoolAdmin（邮箱白名单）', () => {
  it('命中白名单（大小写不敏感、容忍空格）', () => {
    expect(isSharedPoolAdmin('Admin@X.test', 'admin@x.test , other@y.test')).toBe(true);
  });

  it('未命中 / 空邮箱 / 空白名单 → false', () => {
    expect(isSharedPoolAdmin('nope@x.test', 'admin@x.test')).toBe(false);
    expect(isSharedPoolAdmin(null, 'admin@x.test')).toBe(false);
    expect(isSharedPoolAdmin('admin@x.test', '')).toBe(false);
  });
});

const me: AuthContext = { userId: 'u1', email: 'me@x.test' };

describe('canManageRow / canViewRow（行级归属）', () => {
  it('自己私有行：可管理、可见', () => {
    expect(canManageRow(me, { owner_user_id: 'u1' })).toBe(true);
    expect(canViewRow(me, { owner_user_id: 'u1' })).toBe(true);
  });

  it('他人私有行：不可管理、不可见', () => {
    expect(canManageRow(me, { owner_user_id: 'u2' })).toBe(false);
    expect(canViewRow(me, { owner_user_id: 'u2' })).toBe(false);
  });

  it('共享行：人人可见；仅白名单邮箱可管理', () => {
    vi.stubEnv('AI_SHARED_POOL_EMAILS', 'pool@x.test');
    expect(canViewRow(me, { owner_user_id: null })).toBe(true);
    expect(canManageRow(me, { owner_user_id: null })).toBe(false);
    expect(canManageRow({ userId: 'u9', email: 'pool@x.test' }, { owner_user_id: null })).toBe(true);
    vi.unstubAllEnvs();
  });
});
