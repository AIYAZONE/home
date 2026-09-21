import { describe, expect, it } from 'vitest';
import { ProviderCreateSchema, SetDefaultSchema, toPublicRow, type AdminRow } from './providersSchema.js';

// 故意塞入密钥的三种形态，守住"响应永不含密钥"红线（评审 I-3）
const rowWithSecrets = {
  id: '11111111-1111-1111-1111-111111111111',
  name: '智谱免费', base_url: 'https://x.test/v4', model: 'glm-4.5-air',
  api_key_mask: 'sk-***abc', capability: 'text', cost_tier: 'free',
  priority: 1, enabled: true,
  owner_user_id: null, // v2：NULL=平台共享行
  test_status: null, test_detail: null, tested_at: null,
  // 以下两列不应出现在白名单输出中
  api_key_encrypted: 'ivVvVv:tttt:cccciphertext', api_key: 'sk-plain-secret',
} as unknown as AdminRow;

describe('toPublicRow', () => {
  it('白名单固定 13 字段（含 owner_user_id），绝不含 api_key / api_key_encrypted', () => {
    const out = toPublicRow(rowWithSecrets);
    expect(Object.keys(out).sort()).toEqual([
      'api_key_mask', 'base_url', 'capability', 'cost_tier', 'enabled', 'id',
      'model', 'name', 'owner_user_id', 'priority', 'test_detail', 'test_status', 'tested_at',
    ]);
  });

  it('序列化后不泄露密文或明文密钥', () => {
    const json = JSON.stringify(toPublicRow(rowWithSecrets));
    expect(json).not.toContain('ivVvVv');
    expect(json).not.toContain('sk-plain-secret');
    expect(json).toContain('sk-***abc'); // 掩码是允许且期望透出的
  });
});

describe('ProviderCreateSchema（v2 scope）', () => {
  const base = {
    name: '智谱免费', base_url: 'https://x.test/v4', model: 'glm-4.5-air',
    api_key: 'sk-abc', capability: 'text', cost_tier: 'free',
  };

  it('缺省 scope → personal', () => {
    expect(ProviderCreateSchema.parse(base).scope).toBe('personal');
  });

  it('scope 只接受 personal/shared', () => {
    expect(ProviderCreateSchema.safeParse({ ...base, scope: 'family' }).success).toBe(false);
    expect(ProviderCreateSchema.safeParse({ ...base, scope: 'shared' }).success).toBe(true);
  });

  it('api_key 与 reuse_key_from 二选一（免费模型发现 spec §4.3）', () => {
    const noKey = { name: 'n', base_url: 'https://x.test/v4', model: 'm', capability: 'text', cost_tier: 'free' };
    expect(ProviderCreateSchema.safeParse(noKey).success).toBe(false);
    expect(ProviderCreateSchema.safeParse({ ...noKey, api_key: 'sk-a', reuse_key_from: '11111111-1111-4111-a111-111111111111' }).success).toBe(false);
    expect(ProviderCreateSchema.safeParse({ ...noKey, reuse_key_from: '11111111-1111-4111-a111-111111111111' }).success).toBe(true);
    expect(ProviderCreateSchema.safeParse({ ...noKey, reuse_key_from: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('SetDefaultSchema', () => {
  const uuid = '11111111-1111-4111-a111-111111111111';
  it('要求 capability + uuid 型 provider_id', () => {
    expect(SetDefaultSchema.safeParse({ capability: 'text', provider_id: uuid }).success).toBe(true);
    expect(SetDefaultSchema.safeParse({ capability: 'ocr', provider_id: uuid }).success).toBe(false);
    expect(SetDefaultSchema.safeParse({ capability: 'text', provider_id: 'not-a-uuid' }).success).toBe(false);
  });
});
