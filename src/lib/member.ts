import type { FamilyMemberRemark, UserProfile } from '@/types';

/**
 * 手动创建成员（无邮箱）的占位邮箱域名：登录账号 `son` 映射为 `son@members.family.local`。
 * 与 api/members/create.ts 中的同名常量保持一致，修改需同步两处。
 */
export const MEMBER_ACCOUNT_EMAIL_DOMAIN = 'members.family.local';

/** 登录账号统一小写去空格 */
export function normalizeMemberAccount(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 返回错误文案；null 表示合法 */
export function validateMemberAccount(account: string): string | null {
  if (!/^[a-z0-9][a-z0-9_-]{1,19}$/.test(account)) {
    return '账号需为 2-20 位小写字母、数字、- 或 _，且以字母或数字开头';
  }
  return null;
}

export function memberAccountToEmail(account: string): string {
  return `${normalizeMemberAccount(account)}@${MEMBER_ACCOUNT_EMAIL_DOMAIN}`;
}

/** 是否手动创建的占位邮箱账号（可后续补绑真实邮箱） */
export function isPlaceholderMemberEmail(email?: string | null): boolean {
  return !!email && email.endsWith(`@${MEMBER_ACCOUNT_EMAIL_DOMAIN}`);
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function getMemberAccountLabel(member: UserProfile) {
  const email = normalizeText(member.email);
  if (email) return email.split('@')[0] || email;
  const name = normalizeText(member.name);
  if (name) return name;
  return member.id.slice(0, 6);
}

export function getMemberPrimaryLabel(
  member: UserProfile,
  remarkByMemberId?: Record<string, FamilyMemberRemark>,
) {
  const remark = normalizeText(remarkByMemberId?.[member.id]?.remark_name);
  if (remark) return remark;
  const name = normalizeText(member.name);
  if (name) return name;
  const email = normalizeText(member.email);
  if (email) return email.split('@')[0] || email;
  return member.id.slice(0, 6);
}

export function formatMemberSelectLabel(
  member: UserProfile,
  remarkByMemberId?: Record<string, FamilyMemberRemark>,
) {
  const primary = getMemberPrimaryLabel(member, remarkByMemberId);
  const account = getMemberAccountLabel(member);
  if (!account || account === primary) return primary;
  return `${primary}（${account}）`;
}
