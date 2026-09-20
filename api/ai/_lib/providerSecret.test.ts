import { beforeEach, describe, expect, it } from 'vitest';
import { decryptApiKey, encryptApiKey, maskApiKey, ProviderSecretError } from './providerSecret.js';

beforeEach(() => {
  process.env.AI_PROVIDER_ENC_KEY = 'test-master-key';
});

describe('providerSecret', () => {
  it('加密解密可往返', () => {
    const enc = encryptApiKey('sk-abcdef123456789');
    expect(enc).not.toContain('sk-abcdef123456789');
    expect(decryptApiKey(enc)).toBe('sk-abcdef123456789');
  });

  it('密文被篡改时抛 ProviderSecretError', () => {
    const enc = encryptApiKey('sk-abcdef123456789');
    const [iv, tag, data] = enc.split(':');
    const flipped = data.slice(0, -2) + (data.slice(-2) === 'AA' ? 'BB' : 'AA');
    expect(() => decryptApiKey(`${iv}:${tag}:${flipped}`)).toThrow(ProviderSecretError);
  });

  it('格式非法时抛 ProviderSecretError', () => {
    expect(() => decryptApiKey('not-a-payload')).toThrow(ProviderSecretError);
  });

  it('主密钥缺失时抛 ProviderSecretError', () => {
    delete process.env.AI_PROVIDER_ENC_KEY;
    expect(() => encryptApiKey('sk-x')).toThrow(ProviderSecretError);
  });

  it('解密时主密钥缺失应透传配置诊断文案', () => {
    const enc = encryptApiKey('sk-abcdef123456789');
    delete process.env.AI_PROVIDER_ENC_KEY;
    expect(() => decryptApiKey(enc)).toThrow(ProviderSecretError);
    expect(() => decryptApiKey(enc)).toThrow(/AI_PROVIDER_ENC_KEY/);
  });

  it('掩码不泄漏中间位', () => {
    expect(maskApiKey('sk-abcdef123456789a9f')).toBe('sk-***a9f');
    expect(maskApiKey('short')).toBe('sk-***rt');
  });
});
