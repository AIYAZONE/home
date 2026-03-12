import type { FamilyMemberRemark, UserProfile } from '@/types';

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
