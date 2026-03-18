import { Transaction } from '@/types';

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function guessCategoryFromHistory(args: {
  description: string | null;
  type: 'income' | 'expense';
  history: Transaction[];
}): string {
  const q = normalize(args.description ?? '');
  const scored = new Map<string, number>();

  const candidates = q.length >= 2
    ? args.history.filter((t) => normalize(t.description ?? '').includes(q) || q.includes(normalize(t.description ?? '')))
    : args.history.filter((t) => t.type === args.type);

  candidates.forEach((t) => {
    const key = t.category.trim();
    if (!key) return;
    scored.set(key, (scored.get(key) ?? 0) + 1);
  });

  const best = Array.from(scored.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (best) return best;

  const fallback = new Map<string, number>();
  args.history
    .filter((t) => t.type === args.type)
    .forEach((t) => {
      const key = t.category.trim();
      if (!key) return;
      fallback.set(key, (fallback.get(key) ?? 0) + 1);
    });

  return Array.from(fallback.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

