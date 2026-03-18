export type BillCsvMapping = {
  dateKey: string;
  amountKey: string;
  descriptionKey: string | null;
  typeKey: string | null;
};

export type BillImportDraftTransaction = {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  description: string | null;
  visibility: 'family' | 'private';
  date: string;
  sourceMeta?: {
    rowIndex: number;
    raw: Record<string, string>;
    duplicateOfId?: string;
  };
};

function normalizeHeader(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '');
}

const DATE_HINTS = ['日期', '时间', 'date', '交易日期', '交易时间', '记账日期'];
const AMOUNT_HINTS = ['金额', '发生额', '发生金额', 'amount', '交易金额', '交易额', '入账金额'];
const DESC_HINTS = ['摘要', '备注', '说明', 'description', '商户', '对方', '对方户名', '交易摘要', '用途'];
const TYPE_HINTS = ['收支', '借贷', '类型', '交易类型', '贷方', '借方', 'income', 'expense'];

function scoreHeader(h: string, hints: string[]): number {
  const n = normalizeHeader(h);
  return hints.reduce((acc, hint) => (n.includes(normalizeHeader(hint)) ? acc + 1 : acc), 0);
}

export function inferBillCsvMapping(headers: string[]): Partial<BillCsvMapping> {
  const pickBest = (hints: string[]) => {
    const scored = headers
      .map((h) => ({ h, score: scoreHeader(h, hints) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored[0]?.h ?? null;
  };

  const dateKey = pickBest(DATE_HINTS);
  const amountKey = pickBest(AMOUNT_HINTS);
  const descriptionKey = pickBest(DESC_HINTS);
  const typeKey = pickBest(TYPE_HINTS);

  return {
    dateKey: dateKey ?? undefined,
    amountKey: amountKey ?? undefined,
    descriptionKey: descriptionKey ?? null,
    typeKey: typeKey ?? null,
  };
}

function parseMoney(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/[￥¥$,\s]/g, '')
    .replace(/^(?:\+|收入[:：]?)/, '')
    .replace(/^(?:-|支出[:：]?)/, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseDateYmd(input: string): { y: number; m: number; d: number } | null {
  const raw = input.trim();
  if (!raw) return null;

  const m1 = raw.match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
  if (m1) {
    const y = Number(m1[1]);
    const m = Number(m1[2]);
    const d = Number(m1[3]);
    if (y >= 1970 && m >= 1 && m <= 12 && d >= 1 && d <= 31) return { y, m, d };
  }

  const m2 = raw.match(/(\d{4})(\d{2})(\d{2})/);
  if (m2) {
    const y = Number(m2[1]);
    const m = Number(m2[2]);
    const d = Number(m2[3]);
    if (y >= 1970 && m >= 1 && m <= 12 && d >= 1 && d <= 31) return { y, m, d };
  }

  return null;
}

function ymdToIso(ymd: { y: number; m: number; d: number }): string {
  const yyyy = String(ymd.y);
  const mm = String(ymd.m).padStart(2, '0');
  const dd = String(ymd.d).padStart(2, '0');
  return new Date(`${yyyy}-${mm}-${dd}T12:00:00`).toISOString();
}

function inferTypeFromTypeCell(cell: string): 'income' | 'expense' | null {
  const n = cell.trim().toLowerCase();
  if (!n) return null;
  if (n.includes('收入') || n.includes('入账') || n.includes('贷') || n.includes('credit') || n.includes('income')) return 'income';
  if (n.includes('支出') || n.includes('出账') || n.includes('借') || n.includes('debit') || n.includes('expense')) return 'expense';
  return null;
}

function makeLocalId(rowIndex: number): string {
  return `import_row_${rowIndex}_${Math.random().toString(16).slice(2)}`;
}

function normalizeDuplicateKey(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[，。,.]/g, '');
}

export function buildDraftTransactionsFromCsvRows(args: {
  rows: Record<string, string>[];
  mapping: BillCsvMapping;
  defaultVisibility?: 'family' | 'private';
  guessCategory?: (description: string | null, type: 'income' | 'expense') => string;
}): { items: BillImportDraftTransaction[]; rejected: number } {
  const items: BillImportDraftTransaction[] = [];
  let rejected = 0;
  const defaultVisibility = args.defaultVisibility ?? 'family';

  args.rows.forEach((row, idx) => {
    const dateRaw = row[args.mapping.dateKey] ?? '';
    const amountRaw = row[args.mapping.amountKey] ?? '';
    const descRaw = args.mapping.descriptionKey ? row[args.mapping.descriptionKey] ?? '' : '';
    const typeRaw = args.mapping.typeKey ? row[args.mapping.typeKey] ?? '' : '';

    const ymd = parseDateYmd(dateRaw);
    const amountMaybe = parseMoney(amountRaw);

    if (!ymd || amountMaybe == null) {
      rejected += 1;
      return;
    }

    const typed = inferTypeFromTypeCell(typeRaw);
    const type: 'income' | 'expense' =
      typed ??
      (amountMaybe < 0 ? 'expense' : 'income');

    const amount = Math.abs(amountMaybe);
    const description = descRaw.trim() ? descRaw.trim() : null;
    const category = args.guessCategory ? args.guessCategory(description, type) : '';

    items.push({
      id: makeLocalId(idx),
      type,
      amount,
      category: category ?? '',
      description,
      visibility: defaultVisibility,
      date: ymdToIso(ymd),
      sourceMeta: { rowIndex: idx + 1, raw: row },
    });
  });

  const byKey = new Map<string, string>();
  items.forEach((it) => {
    const ymd = it.date.slice(0, 10);
    const desc = normalizeDuplicateKey(it.description ?? it.category);
    const key = `${it.type}|${ymd}|${it.amount}|${desc}`;
    const firstId = byKey.get(key);
    if (!firstId) {
      byKey.set(key, it.id);
      return;
    }
    it.sourceMeta = { ...(it.sourceMeta ?? { rowIndex: 0, raw: {} }), duplicateOfId: firstId };
  });

  return { items, rejected };
}

