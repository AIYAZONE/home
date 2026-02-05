export type AppErrorCode =
  | 'AUTH_REQUIRED'
  | 'RLS_DENIED'
  | 'INVITE_INVALID'
  | 'INVITE_EMAIL_MISMATCH'
  | 'ALREADY_IN_FAMILY'
  | 'UNKNOWN';

export function toUserMessage(input: unknown): string {
  const message =
    typeof input === 'string'
      ? input
      : (input as any)?.message || (input as any)?.error?.message || '发生错误，请重试';

  if (message.includes('Authentication required')) return '请先登录后再继续。';
  if (message.includes('new row violates row-level security policy')) return '权限不足或数据不属于你的家庭范围。';
  if (message.includes('Invitation invalid or expired')) return '邀请链接无效或已过期。';
  if (message.includes('Invitation email mismatch')) return '该邀请链接绑定了邮箱，请使用对应邮箱登录。';
  if (message.includes('User already belongs to a family')) return '你已加入家庭，无法重复加入。';

  return message;
}
