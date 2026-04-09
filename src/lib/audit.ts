import { supabase } from './supabase';

/**
 * 审计日志操作类型
 */
export type AuditAction = 
  | 'user.login'
  | 'user.logout'
  | 'user.register'
  | 'user.password_change'
  | 'user.profile_update'
  | 'family.create'
  | 'family.join'
  | 'family.invite'
  | 'family.member_role_update'
  | 'transaction.create'
  | 'transaction.update'
  | 'transaction.delete'
  | 'budget.create'
  | 'budget.update'
  | 'category.create'
  | 'category.update'
  | 'recurring.create'
  | 'recurring.update'
  | 'data.export'
  | 'data.delete'
  | 'privacy.consent'
  | 'security.password_change'
  | 'security.two_factor_enable'
  | 'security.two_factor_disable';

/**
 * 审计日志实体类型
 */
export type AuditEntityType = 
  | 'user'
  | 'family'
  | 'transaction'
  | 'budget'
  | 'category'
  | 'recurring_transaction'
  | 'data_export'
  | 'privacy_policy'
  | 'security_setting';

/**
 * 审计日志记录选项
 */
export interface AuditLogOptions {
  familyId?: string;
  action: AuditAction;
  entityType?: AuditEntityType;
  entityId?: string;
  metadata?: Record<string, any>;
  ip?: string;
  userAgent?: string;
}

/**
 * 记录审计日志
 * @param options 审计日志选项
 */
export async function logAudit(options: AuditLogOptions): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('无法记录审计日志：用户未登录');
      return;
    }

    const logData = {
      family_id: options.familyId,
      actor_id: user.id,
      action: options.action,
      entity_type: options.entityType,
      entity_id: options.entityId,
      metadata: options.metadata || {},
      ip: options.ip || getClientIP(),
      user_agent: options.userAgent || navigator.userAgent,
    };

    const { error } = await supabase.from('audit_logs').insert(logData);
    if (error) {
      console.error('记录审计日志失败:', error);
    }
  } catch (error) {
    console.error('记录审计日志出错:', error);
  }
}

/**
 * 获取客户端IP地址
 * 注意：这只是一个简单的实现，实际应用中可能需要从服务器获取
 */
function getClientIP(): string | undefined {
  // 实际应用中，可能需要从服务器端获取IP地址
  // 这里返回undefined，让服务器端处理
  return undefined;
}

/**
 * 批量记录审计日志
 * @param logs 审计日志选项数组
 */
export async function logAuditBatch(logs: AuditLogOptions[]): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('无法记录审计日志：用户未登录');
      return;
    }

    const logData = logs.map(log => ({
      family_id: log.familyId,
      actor_id: user.id,
      action: log.action,
      entity_type: log.entityType,
      entity_id: log.entityId,
      metadata: log.metadata || {},
      ip: log.ip || getClientIP(),
      user_agent: log.userAgent || navigator.userAgent,
    }));

    const { error } = await supabase.from('audit_logs').insert(logData);
    if (error) {
      console.error('批量记录审计日志失败:', error);
    }
  } catch (error) {
    console.error('批量记录审计日志出错:', error);
  }
}

/**
 * 获取审计日志
 * @param options 查询选项
 */
export async function getAuditLogs(options?: {
  familyId?: string;
  limit?: number;
  offset?: number;
  action?: AuditAction;
  entityType?: AuditEntityType;
  startDate?: string;
  endDate?: string;
}) {
  try {
    let query = supabase.from('audit_logs').select('*');

    if (options?.familyId) {
      query = query.eq('family_id', options.familyId);
    }

    if (options?.action) {
      query = query.eq('action', options.action);
    }

    if (options?.entityType) {
      query = query.eq('entity_type', options.entityType);
    }

    if (options?.startDate) {
      query = query.gte('created_at', options.startDate);
    }

    if (options?.endDate) {
      query = query.lte('created_at', options.endDate);
    }

    query = query.order('created_at', { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('获取审计日志失败:', error);
    throw error;
  }
}

/**
 * 审计日志助手函数
 */
export const auditHelpers = {
  /**
   * 记录用户登录
   */
  userLogin: (metadata?: Record<string, any>) => logAudit({
    action: 'user.login',
    entityType: 'user',
    metadata
  }),

  /**
   * 记录用户登出
   */
  userLogout: (metadata?: Record<string, any>) => logAudit({
    action: 'user.logout',
    entityType: 'user',
    metadata
  }),

  /**
   * 记录用户注册
   */
  userRegister: (metadata?: Record<string, any>) => logAudit({
    action: 'user.register',
    entityType: 'user',
    metadata
  }),

  /**
   * 记录用户密码更改
   */
  userPasswordChange: (metadata?: Record<string, any>) => logAudit({
    action: 'user.password_change',
    entityType: 'user',
    metadata
  }),

  /**
   * 记录用户资料更新
   */
  userProfileUpdate: (metadata?: Record<string, any>) => logAudit({
    action: 'user.profile_update',
    entityType: 'user',
    metadata
  }),

  /**
   * 记录家庭创建
   */
  familyCreate: (familyId: string, metadata?: Record<string, any>) => logAudit({
    familyId,
    action: 'family.create',
    entityType: 'family',
    entityId: familyId,
    metadata
  }),

  /**
   * 记录家庭加入
   */
  familyJoin: (familyId: string, metadata?: Record<string, any>) => logAudit({
    familyId,
    action: 'family.join',
    entityType: 'family',
    entityId: familyId,
    metadata
  }),

  /**
   * 记录家庭邀请
   */
  familyInvite: (familyId: string, metadata?: Record<string, any>) => logAudit({
    familyId,
    action: 'family.invite',
    entityType: 'family',
    entityId: familyId,
    metadata
  }),

  /**
   * 记录家庭成员角色更新
   */
  familyMemberRoleUpdate: (familyId: string, metadata?: Record<string, any>) => logAudit({
    familyId,
    action: 'family.member_role_update',
    entityType: 'family',
    entityId: familyId,
    metadata
  }),

  /**
   * 记录交易创建
   */
  transactionCreate: (familyId: string, transactionId: string, metadata?: Record<string, any>) => logAudit({
    familyId,
    action: 'transaction.create',
    entityType: 'transaction',
    entityId: transactionId,
    metadata
  }),

  /**
   * 记录交易更新
   */
  transactionUpdate: (familyId: string, transactionId: string, metadata?: Record<string, any>) => logAudit({
    familyId,
    action: 'transaction.update',
    entityType: 'transaction',
    entityId: transactionId,
    metadata
  }),

  /**
   * 记录交易删除
   */
  transactionDelete: (familyId: string, transactionId: string, metadata?: Record<string, any>) => logAudit({
    familyId,
    action: 'transaction.delete',
    entityType: 'transaction',
    entityId: transactionId,
    metadata
  }),

  /**
   * 记录数据导出
   */
  dataExport: (familyId: string, metadata?: Record<string, any>) => logAudit({
    familyId,
    action: 'data.export',
    entityType: 'data_export',
    metadata
  }),

  /**
   * 记录数据删除
   */
  dataDelete: (familyId: string, metadata?: Record<string, any>) => logAudit({
    familyId,
    action: 'data.delete',
    metadata
  }),

  /**
   * 记录隐私政策同意
   */
  privacyConsent: (metadata?: Record<string, any>) => logAudit({
    action: 'privacy.consent',
    entityType: 'privacy_policy',
    metadata
  }),

  /**
   * 记录安全设置更改
   */
  securitySettingChange: (action: 'security.password_change' | 'security.two_factor_enable' | 'security.two_factor_disable', metadata?: Record<string, any>) => logAudit({
    action,
    entityType: 'security_setting',
    metadata
  })
};

/**
 * 审计日志分析函数
 */
export async function analyzeAuditLogs(familyId: string, days: number = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await getAuditLogs({
      familyId,
      startDate: startDate.toISOString(),
      endDate: new Date().toISOString()
    });

    // 分析登录活动
    const loginActivity = logs.filter(log => log.action === 'user.login');
    const dailyLoginCount = loginActivity.reduce((acc, log) => {
      const date = log.created_at.split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // 分析数据导出活动
    const exportActivity = logs.filter(log => log.action === 'data.export');

    // 分析交易活动
    const transactionActivity = logs.filter(log => 
      log.action.startsWith('transaction.')
    );
    const transactionByType = transactionActivity.reduce((acc, log) => {
      const type = log.action.replace('transaction.', '');
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalLogs: logs.length,
      loginActivity: {
        total: loginActivity.length,
        dailyCount: dailyLoginCount
      },
      exportActivity: {
        total: exportActivity.length,
        details: exportActivity.map(log => ({
          date: log.created_at,
          format: log.metadata?.format,
          filename: log.metadata?.filename
        }))
      },
      transactionActivity: {
        total: transactionActivity.length,
        byType: transactionByType
      }
    };
  } catch (error) {
    console.error('分析审计日志失败:', error);
    throw error;
  }
}