import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const SCRYPT_SALT = 'family-inc-ai-provider';

export class ProviderSecretError extends Error {
  constructor(message = '密钥处理失败') {
    super(message);
    this.name = 'ProviderSecretError';
  }
}

function masterKey(): Buffer {
  const secret = process.env.AI_PROVIDER_ENC_KEY;
  if (!secret) throw new ProviderSecretError('加密主密钥未配置（缺少 AI_PROVIDER_ENC_KEY）。');
  return scryptSync(secret, SCRYPT_SALT, KEY_LENGTH);
}

export function encryptApiKey(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey(), iv);
  let enc = cipher.update(plaintext, 'utf8', 'base64');
  enc += cipher.final('base64');
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc}`;
}

export function decryptApiKey(payload: string): string {
  const [ivB64, tagB64, dataB64] = String(payload ?? '').split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new ProviderSecretError();
  const key = masterKey();
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    let dec = decipher.update(dataB64, 'base64', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch {
    throw new ProviderSecretError();
  }
}

export function maskApiKey(plaintext: string): string {
  const s = String(plaintext ?? '');
  const tail = s.length >= 8 ? s.slice(-3) : s.slice(-2);
  return `sk-***${tail}`;
}
