import { getDefaultLocale, type Locale } from '@/lib/i18n';

export type CurrencyCode = 'CNY' | 'USD' | 'EUR' | 'GBP' | 'JPY' | 'HKD';

type BaseOptions = {
  locale?: Locale;
};

type MoneyOptions = BaseOptions & {
  currency?: CurrencyCode;
  signDisplay?: Intl.NumberFormatOptions['signDisplay'];
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

type NumberOptions = BaseOptions & {
  signDisplay?: Intl.NumberFormatOptions['signDisplay'];
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

const cache = new Map<string, Intl.NumberFormat>();

function getCachedNumberFormat(locale: string, options: Intl.NumberFormatOptions) {
  const key = `${locale}|${JSON.stringify(options)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const nf = new Intl.NumberFormat(locale, options);
  cache.set(key, nf);
  return nf;
}

function toFiniteNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(value: unknown, options: MoneyOptions = {}) {
  const locale = options.locale ?? getDefaultLocale();
  const currency = options.currency ?? 'CNY';
  const minimumFractionDigits = options.minimumFractionDigits ?? 2;
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;

  const nf = getCachedNumberFormat(locale, {
    style: 'currency',
    currency,
    signDisplay: options.signDisplay ?? 'auto',
    minimumFractionDigits,
    maximumFractionDigits,
  });

  return nf.format(toFiniteNumber(value));
}

export function formatNumber(value: unknown, options: NumberOptions = {}) {
  const locale = options.locale ?? getDefaultLocale();
  const nf = getCachedNumberFormat(locale, {
    style: 'decimal',
    signDisplay: options.signDisplay ?? 'auto',
    minimumFractionDigits: options.minimumFractionDigits,
    maximumFractionDigits: options.maximumFractionDigits,
  });
  return nf.format(toFiniteNumber(value));
}

export function formatPercent(value: unknown, digits = 0) {
  const n = toFiniteNumber(value);
  const safeDigits = Number.isFinite(digits) ? Math.max(0, Math.trunc(digits)) : 0;
  return `${n.toFixed(safeDigits)}%`;
}

export function compareByLocale(a: string, b: string, locale: Locale = getDefaultLocale()) {
  return a.localeCompare(b, locale);
}

