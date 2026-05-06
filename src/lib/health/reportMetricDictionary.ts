export type HealthMetricDictionaryItem = {
  code: string;
  name: string;
  unit: string;
  aliases: string[];
};

export const CORE_HEALTH_METRIC_DICTIONARY: HealthMetricDictionaryItem[] = [
  { code: 'hgb', name: '血红蛋白', unit: 'g/L', aliases: ['血红蛋白', 'hemoglobin', 'hgb', 'hb'] },
  { code: 'wbc', name: '白细胞计数', unit: '10^9/L', aliases: ['白细胞', '白细胞计数', 'wbc'] },
  { code: 'plt', name: '血小板计数', unit: '10^9/L', aliases: ['血小板', '血小板计数', 'plt'] },
  { code: 'rbc', name: '红细胞计数', unit: '10^12/L', aliases: ['红细胞', '红细胞计数', 'rbc'] },
  { code: 'alt', name: '丙氨酸氨基转移酶', unit: 'U/L', aliases: ['谷丙转氨酶', '丙氨酸氨基转移酶', 'alt'] },
  { code: 'ast', name: '天门冬氨酸氨基转移酶', unit: 'U/L', aliases: ['谷草转氨酶', '天门冬氨酸氨基转移酶', 'ast'] },
  { code: 'ggt', name: '谷氨酰转肽酶', unit: 'U/L', aliases: ['谷氨酰转肽酶', 'γ-谷氨酰转肽酶', 'ggt'] },
  { code: 'tp', name: '总蛋白', unit: 'g/L', aliases: ['总蛋白', 'tp'] },
  { code: 'alb', name: '白蛋白', unit: 'g/L', aliases: ['白蛋白', 'alb', 'albumin'] },
  { code: 'bun', name: '尿素氮', unit: 'mmol/L', aliases: ['尿素氮', 'bun', 'urea'] },
  { code: 'cre', name: '肌酐', unit: 'umol/L', aliases: ['肌酐', 'cre', 'cr'] },
  { code: 'ua', name: '尿酸', unit: 'umol/L', aliases: ['尿酸', 'ua'] },
  { code: 'glu', name: '空腹血糖', unit: 'mmol/L', aliases: ['血糖', '空腹血糖', 'glu', 'glucose'] },
  { code: 'hba1c', name: '糖化血红蛋白', unit: '%', aliases: ['糖化血红蛋白', 'hba1c', 'ghb'] },
  { code: 'tc', name: '总胆固醇', unit: 'mmol/L', aliases: ['总胆固醇', 'tc', 'cholesterol'] },
  { code: 'tg', name: '甘油三酯', unit: 'mmol/L', aliases: ['甘油三酯', 'tg', 'triglyceride'] },
  { code: 'hdl', name: '高密度脂蛋白胆固醇', unit: 'mmol/L', aliases: ['高密度脂蛋白', 'hdl', 'hdl-c'] },
  { code: 'ldl', name: '低密度脂蛋白胆固醇', unit: 'mmol/L', aliases: ['低密度脂蛋白', 'ldl', 'ldl-c'] },
  { code: 'u_protein', name: '尿蛋白', unit: '', aliases: ['尿蛋白', '尿蛋白定性', 'protein urine'] },
  { code: 'u_glucose', name: '尿糖', unit: '', aliases: ['尿糖', '尿葡萄糖', 'urine glucose'] },
];

function normalize(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[（(].*?[)）]/g, '');
}

export function resolveMetricFromDictionary(metricName: string): HealthMetricDictionaryItem | null {
  const normalized = normalize(metricName);
  if (!normalized) return null;
  for (const item of CORE_HEALTH_METRIC_DICTIONARY) {
    if (item.aliases.some((alias) => normalize(alias) === normalized)) return item;
    if (item.aliases.some((alias) => normalized.includes(normalize(alias)))) return item;
  }
  return null;
}
