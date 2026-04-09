import { supabase } from './supabase';
import {
  encryptSensitiveFields,
  decryptSensitiveFields,
  SENSITIVE_FIELDS,
  deriveEncryptionKey
} from './encryption';

/**
 * 创建加密的交易记录
 * @param transactionData 交易数据
 * @param userPassword 用户密码
 */
export async function createEncryptedTransaction(transactionData: any, userPassword: string) {
  try {
    // 生成加密密钥
    const encryptionKey = deriveEncryptionKey(userPassword);
    
    // 加密敏感字段
    const encryptedTransaction = encryptSensitiveFields(
      transactionData,
      encryptionKey,
      SENSITIVE_FIELDS.transactions
    );
    
    // 保存到数据库
    const { data, error } = await supabase
      .from('transactions')
      .insert(encryptedTransaction)
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('创建加密交易失败:', error);
    throw error;
  }
}

/**
 * 获取并解密交易记录
 * @param familyId 家庭ID
 * @param userPassword 用户密码
 */
export async function getDecryptedTransactions(familyId: string, userPassword: string) {
  try {
    // 从数据库获取交易记录
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('family_id', familyId)
      .order('date', { ascending: false });
    
    if (error) {
      throw error;
    }
    
    // 生成解密密钥
    const encryptionKey = deriveEncryptionKey(userPassword);
    
    // 解密敏感字段
    const decryptedTransactions = transactions.map(transaction =>
      decryptSensitiveFields(
        transaction,
        encryptionKey,
        SENSITIVE_FIELDS.transactions
      )
    );
    
    return decryptedTransactions;
  } catch (error) {
    console.error('获取解密交易失败:', error);
    throw error;
  }
}

/**
 * 更新加密的交易记录
 * @param transactionId 交易ID
 * @param updateData 更新数据
 * @param userPassword 用户密码
 */
export async function updateEncryptedTransaction(transactionId: string, updateData: any, userPassword: string) {
  try {
    // 生成加密密钥
    const encryptionKey = deriveEncryptionKey(userPassword);
    
    // 加密敏感字段
    const encryptedUpdate = encryptSensitiveFields(
      updateData,
      encryptionKey,
      SENSITIVE_FIELDS.transactions
    );
    
    // 更新数据库
    const { data, error } = await supabase
      .from('transactions')
      .update(encryptedUpdate)
      .eq('id', transactionId)
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('更新加密交易失败:', error);
    throw error;
  }
}

/**
 * 处理健康数据的加密和解密
 * @param healthData 健康数据
 * @param userPassword 用户密码
 */
export async function handleHealthData(healthData: any, userPassword: string) {
  try {
    // 生成加密密钥
    const encryptionKey = deriveEncryptionKey(userPassword);
    
    // 加密敏感字段
    const encryptedHealthData = encryptSensitiveFields(
      healthData,
      encryptionKey,
      SENSITIVE_FIELDS.health_profiles
    );
    
    // 保存到数据库
    const { data, error } = await supabase
      .from('health_profiles')
      .insert(encryptedHealthData)
      .select()
      .single();
    
    if (error) {
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('处理健康数据失败:', error);
    throw error;
  }
}

/**
 * 示例：在组件中使用加密功能
 */
export function ExampleComponent() {
  // 示例代码，实际使用时需要根据具体组件结构调整
  /*
  const [userPassword, setUserPassword] = useState('');
  const [transactionData, setTransactionData] = useState({
    family_id: 'family-id',
    amount: '100',
    category: '餐饮',
    description: '午餐',
    type: 'expense',
    date: new Date().toISOString(),
    visibility: 'private'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createEncryptedTransaction(transactionData, userPassword);
      // 处理成功
    } catch (error) {
      // 处理错误
    }
  };
  */
}

/**
 * 注意事项
 * 1. 密钥管理：用户密码应该安全存储，建议使用浏览器的密码管理器或安全的状态管理
 * 2. 性能考虑：加密和解密操作可能会影响性能，建议在适当的时候进行缓存
 * 3. 错误处理：应该妥善处理加密和解密过程中的错误
 * 4. 密钥变更：当用户密码变更时，需要重新加密所有数据
 * 5. 备份和恢复：确保用户可以在忘记密码时恢复数据（例如使用密钥提示或其他恢复机制）
 */