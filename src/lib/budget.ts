import type { Budget, Transaction } from '@/types';

export type MonthKey = `${number}-${string}-01`;

export function toMonthStartKey(d: Date): MonthKey {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export function parseMonthStartKey(key: string): Date {
  const d = new Date(`${key}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
}

export function addMonths(base: Date, deltaMonths: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth() + deltaMonths, 1);
  return d;
}

export type BudgetMetrics = {
  totalBudget: number;
  spentAll: number;
  spentBudgeted: number;
  unbudgetedSpent: number;
  executionRatio: number;
  coverageRatio: number;
  spentByCategory: Map<string, number>;
  unbudgetedByCategory: Map<string, number>;
  budgetedCategories: Set<string>;
};

export function computeBudgetMetrics(input: {
  budgets: Budget[];
  transactions: Transaction[];
  monthStart: Date;
}): BudgetMetrics {
  const monthStart = new Date(input.monthStart.getFullYear(), input.monthStart.getMonth(), 1);
  const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);

  const budgetedCategories = new Set<string>(
    (input.budgets ?? []).map((b) => b.category_name.trim()).filter((s) => s.length > 0),
  );

  const spentByCategory = new Map<string, number>();
  const unbudgetedByCategory = new Map<string, number>();

  let spentAll = 0;
  for (const t of input.transactions ?? []) {
    if (t.type !== 'expense') continue;
    const dt = new Date(t.date);
    if (!(dt >= monthStart && dt < nextMonthStart)) continue;
    const key = t.category.trim();
    const amount = Number(t.amount);
    spentAll += amount;
    spentByCategory.set(key, (spentByCategory.get(key) ?? 0) + amount);
    if (!budgetedCategories.has(key)) {
      unbudgetedByCategory.set(key, (unbudgetedByCategory.get(key) ?? 0) + amount);
    }
  }

  const totalBudget = (input.budgets ?? []).reduce((acc, b) => acc + Number(b.amount), 0);
  const spentBudgeted = (input.budgets ?? []).reduce((acc, b) => acc + (spentByCategory.get(b.category_name.trim()) ?? 0), 0);
  const unbudgetedSpent = Math.max(0, spentAll - spentBudgeted);
  const executionRatio = totalBudget > 0 ? spentBudgeted / totalBudget : 0;
  const coverageRatio = spentAll > 0 ? spentBudgeted / spentAll : 0;

  return {
    totalBudget,
    spentAll,
    spentBudgeted,
    unbudgetedSpent,
    executionRatio,
    coverageRatio,
    spentByCategory,
    unbudgetedByCategory,
    budgetedCategories,
  };
}

export function computeAverageMonthlySpentByCategory(input: {
  transactions: Transaction[];
  monthStart: Date;
  months: number;
}): Map<string, number> {
  const months = Number.isFinite(input.months) ? Math.max(1, Math.trunc(input.months)) : 3;
  const monthStart = new Date(input.monthStart.getFullYear(), input.monthStart.getMonth(), 1);
  const from = new Date(monthStart.getFullYear(), monthStart.getMonth() - months, 1);

  const totalByCategory = new Map<string, number>();
  const monthTouched = new Set<string>();

  for (const t of input.transactions ?? []) {
    if (t.type !== 'expense') continue;
    const dt = new Date(t.date);
    if (!(dt >= from && dt < monthStart)) continue;
    const keyMonth = toMonthStartKey(new Date(dt.getFullYear(), dt.getMonth(), 1));
    monthTouched.add(keyMonth);
    const keyCat = t.category.trim();
    totalByCategory.set(keyCat, (totalByCategory.get(keyCat) ?? 0) + Number(t.amount));
  }

  const divisor = monthTouched.size > 0 ? monthTouched.size : months;
  const avg = new Map<string, number>();
  for (const [cat, total] of totalByCategory.entries()) {
    avg.set(cat, total / divisor);
  }
  return avg;
}

export function topEntries(map: Map<string, number>, limit: number) {
  const n = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0;
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}
