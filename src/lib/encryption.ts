import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// 加密算法配置
const ALGORITHM = 'aes-256-cbc';
const SALT_LENGTH = 16;
const IV_LENGTH = 16;

/**
 * 生成加密密钥
 * @param password 用户密码或密钥
 * @param salt 盐值
 * @returns 派生的密钥
 */
export function generateKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32); // 32 bytes for AES-256
}

/**
 * 加密敏感字段
 * @param data 要加密的数据
 * @param password 加密密钥
 * @returns 加密后的数据，包含盐值和初始化向量
 */
export function encrypt(data: string, password: string): string {
  try {
    // 生成随机盐值
    const salt = randomBytes(SALT_LENGTH);
    // 生成密钥
    const key = generateKey(password, salt);
    // 生成随机初始化向量
    const iv = randomBytes(IV_LENGTH);
    // 创建加密器
    const cipher = createCipheriv(ALGORITHM, key, iv);
    // 加密数据
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    // 返回盐值、初始化向量和加密数据的组合
    return `${salt.toString('base64')}:${iv.toString('base64')}:${encrypted}`;
  } catch (error) {
    console.error('加密失败:', error);
    throw new Error('加密失败');
  }
}

/**
 * 解密敏感字段
 * @param encryptedData 加密后的数据
 * @param password 解密密钥
 * @returns 解密后的数据
 */
export function decrypt(encryptedData: string, password: string): string {
  try {
    // 解析加密数据
    const [saltStr, ivStr, encryptedStr] = encryptedData.split(':');
    if (!saltStr || !ivStr || !encryptedStr) {
      throw new Error('无效的加密数据格式');
    }
    // 解码盐值和初始化向量
    const salt = Buffer.from(saltStr, 'base64');
    const iv = Buffer.from(ivStr, 'base64');
    // 生成密钥
    const key = generateKey(password, salt);
    // 创建解密器
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    // 解密数据
    let decrypted = decipher.update(encryptedStr, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('解密失败:', error);
    throw new Error('解密失败');
  }
}

/**
 * 加密对象中的敏感字段
 * @param obj 要加密的对象
 * @param password 加密密钥
 * @param sensitiveFields 敏感字段列表
 * @returns 加密后的对象
 */
export function encryptSensitiveFields<T extends Record<string, any>>(obj: T, password: string, sensitiveFields: string[]): T {
  const result = { ...obj };
  sensitiveFields.forEach(field => {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = encrypt(String(result[field]), password);
    }
  });
  return result;
}

/**
 * 解密对象中的敏感字段
 * @param obj 要解密的对象
 * @param password 解密密钥
 * @param sensitiveFields 敏感字段列表
 * @returns 解密后的对象
 */
export function decryptSensitiveFields<T extends Record<string, any>>(obj: T, password: string, sensitiveFields: string[]): T {
  const result = { ...obj };
  sensitiveFields.forEach(field => {
    if (result[field] !== undefined && result[field] !== null) {
      try {
        result[field] = decrypt(String(result[field]), password);
      } catch (error) {
        console.error(`解密字段 ${field} 失败:`, error);
        // 解密失败时保持原加密值，以便后续重试
      }
    }
  });
  return result;
}

/**
 * 敏感字段定义
 */
export const SENSITIVE_FIELDS = {
  transactions: ['description', 'amount'],
  health_profiles: ['allergies', 'conditions', 'notes'],
  health_metrics: ['value', 'note'],
  insurance_policies: ['provider', 'product_name', 'coverage_amount', 'premium_amount'],
  relationship_events: ['notes', 'action_items'],
  external_contacts: ['name', 'relation', 'notes'],
  contact_interactions: ['summary', 'next_follow_up_date'],
  family_member_remarks: ['remark_name']
};

/**
 * 生成加密密钥的辅助函数
 * 可以使用用户密码的哈希值或其他安全的密钥派生方法
 */
export function deriveEncryptionKey(userPassword: string): string {
  // 这里可以使用更复杂的密钥派生方法
  // 例如结合用户ID和密码，使用更安全的KDF
  return userPassword;
}

/**
 * 检查数据是否已加密
 * @param data 要检查的数据
 * @returns 是否已加密
 */
export function isEncrypted(data: string): boolean {
  return data.includes(':') && data.split(':').length === 3;
}