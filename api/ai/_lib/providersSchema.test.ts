import { describe, expect, it } from 'vitest';
import { toPublicRow, type AdminRow } from './providersSchema.js';

// 故意塞入密钥的三种形态，守住"响应永不含密钥"红线（评审 I-3）
const rowWithSecrets = {
  id: '11111111-1111-1111-1111-111111111111',
  name: '智谱免费', base_url: 'https://x.test/v4', model: 'glm-4.5-air',
  api_key_mask: 'sk-***abc', capability: 'text', cost_tier: 'free',
  priority: 1, enabled: true,
  test_status: null, test_detail: null, tested_at: null,
  // 以下两列不应出现在白名单输出中
  api_key_encrypted: 'ivVvVv:tttt:cccciphertext', api_key: 'sk-plain-secret',
} as unknown as AdminRow;

describe('toPublicRow', () => {
  it('白名单固定 12 字段，绝不含 api_key / api_key_encrypted', () => {
    const out = toPublicRow(rowWithSecrets);
    expect(Object.keys(out).sort()).toEqual([
      'api_key_mask', 'base_url', 'capability', 'cost_tier', 'enabled', 'id',
      'model', 'name', 'priority', 'test_detail', 'test_status', 'tested_at',
    ]);
  });

  it('序列化后不泄露密文或明文密钥', () => {
    const json = JSON.stringify(toPublicRow(rowWithSecrets));
    expect(json).not.toContain('ivVvVv');
    expect(json).not.toContain('sk-plain-secret');
    expect(json).toContain('sk-***abc'); // 掩码是允许且期望透出的
  });
});
