import { resolveMetricFromDictionary } from '@/lib/health/reportMetricDictionary';

export type ParsedHealthReportItem = {
  metric_name: string;
  metric_code?: string | null;
  value_text?: string | null;
  value_num?: number | null;
  unit?: string | null;
  reference_low?: number | null;
  reference_high?: number | null;
  reference_text?: string | null;
  abnormal_flag?: 'high' | 'low' | 'normal' | 'unknown' | null;
  confidence?: number | null;
  source_page?: number | null;
  raw_line?: string | null;
};

export type NormalizedHealthReportItem = {
  metric_code: string;
  metric_name: string;
  value_text: string | null;
  value_num: number | null;
  unit: string | null;
  reference_low: number | null;
  reference_high: number | null;
  reference_text: string | null;
  abnormal_flag: 'high' | 'low' | 'normal' | 'unknown';
  confidence: number | null;
  source_page: number | null;
  raw_line: string | null;
};

function normalizeUnit(input: string | null | undefined): string | null {
  if (!input) return null;
  const unit = input.trim();
  if (!unit) return null;
  return unit
    .replace(/μ/g, 'u')
    .replace(/μl/gi, 'uL')
    .replace(/μmol/gi, 'umol')
    .replace(/\/l/gi, '/L');
}

function normalizeFlag(input: string | null | undefined): 'high' | 'low' | 'normal' | 'unknown' {
  if (!input) return 'unknown';
  const v = input.trim().toLowerCase();
  if (!v) return 'unknown';
  if (['high', 'h', '偏高', '升高', '↑'].includes(v)) return 'high';
  if (['low', 'l', '偏低', '降低', '↓'].includes(v)) return 'low';
  if (['normal', 'n', '正常'].includes(v)) return 'normal';
  return 'unknown';
}

function inferFlagByRange(args: { valueNum: number | null; low: number | null; high: number | null }): 'high' | 'low' | 'normal' | 'unknown' {
  const { valueNum, low, high } = args;
  if (valueNum == null) return 'unknown';
  if (low != null && valueNum < low) return 'low';
  if (high != null && valueNum > high) return 'high';
  if (low != null || high != null) return 'normal';
  return 'unknown';
}

export function normalizeParsedHealthItems(items: ParsedHealthReportItem[]): NormalizedHealthReportItem[] {
  return items
    .map((it) => {
      const metricName = String(it.metric_name ?? '').trim();
      if (!metricName) return null;
      const resolved = resolveMetricFromDictionary(metricName);
      const metricCode = String(it.metric_code ?? resolved?.code ?? '').trim();
      if (!metricCode) return null;
      const low = Number.isFinite(Number(it.reference_low)) ? Number(it.reference_low) : null;
      const high = Number.isFinite(Number(it.reference_high)) ? Number(it.reference_high) : null;
      const valueNum = Number.isFinite(Number(it.value_num)) ? Number(it.value_num) : null;
      const abnormalFlag = normalizeFlag(it.abnormal_flag) === 'unknown'
        ? inferFlagByRange({ valueNum, low, high })
        : normalizeFlag(it.abnormal_flag);
      return {
        metric_code: metricCode,
        metric_name: resolved?.name ?? metricName,
        value_text: it.value_text ? String(it.value_text).trim() : null,
        value_num: valueNum,
        unit: normalizeUnit(it.unit ?? resolved?.unit ?? null),
        reference_low: low,
        reference_high: high,
        reference_text: it.reference_text ? String(it.reference_text).trim() : null,
        abnormal_flag: abnormalFlag,
        confidence: Number.isFinite(Number(it.confidence)) ? Number(it.confidence) : null,
        source_page: Number.isFinite(Number(it.source_page)) ? Number(it.source_page) : null,
        raw_line: it.raw_line ? String(it.raw_line).trim() : null,
      } satisfies NormalizedHealthReportItem;
    })
    .filter((x): x is NormalizedHealthReportItem => !!x);
}
