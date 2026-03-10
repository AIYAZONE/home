import type { FundAccount } from '@/types';

export function isFundReachedTarget(fund: Pick<FundAccount, 'target_amount' | 'current_amount'>): boolean {
  const target = Number(fund.target_amount) || 0;
  if (!Number.isFinite(target) || target <= 0) return false;
  const current = Number(fund.current_amount) || 0;
  if (!Number.isFinite(current)) return false;
  return current >= target;
}

export function getFundTargetGap(fund: Pick<FundAccount, 'target_amount' | 'current_amount'>): number {
  const target = Number(fund.target_amount) || 0;
  if (!Number.isFinite(target) || target <= 0) return 0;
  const current = Number(fund.current_amount) || 0;
  if (!Number.isFinite(current)) return target;
  return Math.max(0, target - current);
}

