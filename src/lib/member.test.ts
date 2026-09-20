import { describe, it, expect } from 'vitest';
import {
  normalizeMemberAccount,
  validateMemberAccount,
  memberAccountToEmail,
  isPlaceholderMemberEmail,
  MEMBER_ACCOUNT_EMAIL_DOMAIN,
} from './member';

describe('member account helpers', () => {
  it('normalizes account to lowercase trimmed', () => {
    expect(normalizeMemberAccount('  Son_01 ')).toBe('son_01');
  });
  it('accepts valid short accounts', () => {
    expect(validateMemberAccount('son')).toBeNull();
    expect(validateMemberAccount('li-ming_2')).toBeNull();
    expect(validateMemberAccount('a1')).toBeNull();
  });
  it('rejects accounts that are too short, uppercase, or start with symbol', () => {
    expect(validateMemberAccount('a')).not.toBeNull();
    expect(validateMemberAccount('Son')).not.toBeNull();
    expect(validateMemberAccount('-son')).not.toBeNull();
    expect(validateMemberAccount('儿子')).not.toBeNull();
    expect(validateMemberAccount('a'.repeat(21))).not.toBeNull();
  });
  it('maps account to placeholder email', () => {
    expect(memberAccountToEmail('Son')).toBe(`son@${MEMBER_ACCOUNT_EMAIL_DOMAIN}`);
  });
  it('detects placeholder member emails', () => {
    expect(isPlaceholderMemberEmail(`son@${MEMBER_ACCOUNT_EMAIL_DOMAIN}`)).toBe(true);
    expect(isPlaceholderMemberEmail('real@gmail.com')).toBe(false);
    expect(isPlaceholderMemberEmail(null)).toBe(false);
    expect(isPlaceholderMemberEmail(undefined)).toBe(false);
  });
});
