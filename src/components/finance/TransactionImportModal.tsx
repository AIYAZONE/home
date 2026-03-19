import { useEffect, useMemo, useState } from 'react';
import { X, Upload, Trash2, Copy, Sparkles, Ban, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { toUserMessage } from '@/lib/error';
import { useToastStore } from '@/stores/toast';
import { Category, Transaction } from '@/types';
import { parseCsv } from '@/lib/billImport/csv';
import { BillCsvMapping, BillImportDraftTransaction, buildDraftTransactionsFromCsvRows, inferBillCsvMapping } from '@/lib/billImport/mapping';
import { guessCategoryFromHistory } from '@/lib/billImport/categorize';
import { useTransactionImport } from '@/hooks/useTransactionImport';
import { supabase } from '@/lib/supabase';

type Step = 'upload' | 'mapping' | 'preview';

type MappingDraft = {
  dateKey: string;
  amountKey: string;
  descriptionKey: string | null;
  typeKey: string | null;
};

async function ocrImageToText(file: File): Promise<string> {
  const Tesseract: any = await import('tesseract.js');
  const result = await Tesseract.recognize(file, 'chi_sim+eng');
  const text = String(result?.data?.text ?? '').trim();
  return text;
}

function isoToYmd(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function ymdToIso(ymd: string): string {
  return new Date(`${ymd}T12:00:00`).toISOString();
}

function isValidDraft(it: BillImportDraftTransaction): boolean {
  if (!it.category.trim()) return false;
  if (!(it.amount > 0)) return false;
  if (!it.date) return false;
  if (Number.isNaN(new Date(it.date).getTime())) return false;
  return true;
}

function normalizeDuplicateKey(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[，。,.]/g, '');
}

function markDuplicates(items: BillImportDraftTransaction[]): BillImportDraftTransaction[] {
  const byKey = new Map<string, string>();
  return items.map((it) => {
    const ymd = it.date.slice(0, 10);
    const desc = normalizeDuplicateKey(it.description ?? it.category);
    const key = `${it.type}|${ymd}|${it.amount}|${desc}`;
    const firstId = byKey.get(key);
    if (!firstId) {
      byKey.set(key, it.id);
      return it;
    }
    return { ...it, sourceMeta: { ...(it.sourceMeta ?? { rowIndex: 0, raw: {} }), duplicateOfId: firstId } };
  });
}

export function TransactionImportModal(props: {
  open: boolean;
  onClose: () => void;
  transactions?: Transaction[] | null;
  categories?: Category[] | null;
}) {
  const pushToast = useToastStore((s) => s.push);
  const { importAsync, isImporting } = useTransactionImport();

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mappingDraft, setMappingDraft] = useState<MappingDraft>({
    dateKey: '',
    amountKey: '',
    descriptionKey: null,
    typeKey: null,
  });
  const [drafts, setDrafts] = useState<BillImportDraftTransaction[]>([]);
  const [rejected, setRejected] = useState<number>(0);
  const [visibilityAll, setVisibilityAll] = useState<'family' | 'private'>('family');
  const [bulkCategory, setBulkCategory] = useState<string>('');
  const [isParsingImage, setIsParsingImage] = useState(false);

  const invalidCount = useMemo(() => drafts.filter((d) => !isValidDraft(d)).length, [drafts]);
  const duplicateCount = useMemo(() => drafts.filter((d) => !!d.sourceMeta?.duplicateOfId).length, [drafts]);

  const categoryOptions = useMemo(() => (props.categories ?? []).map((c) => c.name), [props.categories]);

  useEffect(() => {
    if (!props.open) return;
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setRawRows([]);
    setMappingDraft({ dateKey: '', amountKey: '', descriptionKey: null, typeKey: null });
    setDrafts([]);
    setRejected(0);
    setVisibilityAll('family');
    setBulkCategory('');
    setIsParsingImage(false);
  }, [props.open]);

  if (!props.open) return null;

  const buildDrafts = (mapping: BillCsvMapping) => {
    const history = props.transactions ?? [];
    const { items, rejected: rej } = buildDraftTransactionsFromCsvRows({
      rows: rawRows,
      mapping,
      defaultVisibility: visibilityAll,
      guessCategory: (desc, type) => guessCategoryFromHistory({ description: desc, type, history }),
    });
    setDrafts(items);
    setRejected(rej);
    setStep('preview');
  };

  const onPickFile = async (file: File) => {
    setFileName(file.name);
    try {
      if (file.type.startsWith('image/')) {
        if (file.size > 6 * 1024 * 1024) {
          pushToast({ variant: 'warning', title: '图片过大', message: '请压缩到 6MB 以内后重试。' });
          return;
        }
        setIsParsingImage(true);
        const text = await ocrImageToText(file);
        if (text.length < 20) throw new Error('未识别到足够文本，请更换更清晰的截图后重试。');

        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;
        if (!token) throw new Error('未登录或登录已过期，请重新登录。');

        const resp = await fetch('/api/bills/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text, filename: file.name }),
        });
        const raw = await resp.text().catch(() => '');
        const payload = (() => {
          try {
            return raw ? JSON.parse(raw) : {};
          } catch {
            return {};
          }
        })();
        if (!resp.ok) {
          const msg =
            typeof payload?.message === 'string'
              ? payload.message
              : resp.status === 404
                ? '识别接口不可用：本地开发需启动本地 /api 服务或使用已部署环境。'
                : '识别失败，请稍后再试。';
          throw new Error(msg);
        }

        const history = props.transactions ?? [];
        const items = Array.isArray(payload?.items) ? payload.items : [];
        if (items.length === 0) throw new Error('未识别到有效交易，请更换更清晰的截图后重试。');
        const mapped: BillImportDraftTransaction[] = items.map((it: any, idx: number) => {
          const ymd = typeof it?.date === 'string' ? it.date : new Date().toISOString().slice(0, 10);
          const type: 'income' | 'expense' = it?.type === 'income' ? 'income' : 'expense';
          const amount = Number(it?.amount);
          const description = typeof it?.description === 'string' && it.description.trim() ? it.description.trim() : null;
          const catFromAi = typeof it?.category === 'string' && it.category.trim() ? it.category.trim() : '';
          const category = catFromAi || guessCategoryFromHistory({ description, type, history });
          return {
            id: `import_img_${idx}_${Math.random().toString(16).slice(2)}`,
            type,
            amount: Number.isFinite(amount) ? Math.abs(amount) : 0,
            category,
            description,
            visibility: visibilityAll,
            date: ymdToIso(ymd),
            sourceMeta: { rowIndex: idx + 1, raw: { __source: 'image' } },
          };
        });
        setHeaders([]);
        setRawRows([]);
        setMappingDraft({ dateKey: '', amountKey: '', descriptionKey: null, typeKey: null });
        setRejected(0);
        setDrafts(markDuplicates(mapped));
        setStep('preview');
        return;
      }

      const text = await file.text();
      const { headers: hs, rows } = parseCsv(text);
      if (hs.length === 0 || rows.length === 0) {
        pushToast({ variant: 'warning', title: '无法解析', message: '未识别到有效的表头或数据行。请确认导出的文件是 CSV 明细。' });
        return;
      }
      setHeaders(hs);
      setRawRows(rows);

      const inferred = inferBillCsvMapping(hs);
      const dateKey = inferred.dateKey ?? '';
      const amountKey = inferred.amountKey ?? '';
      const descriptionKey = inferred.descriptionKey ?? null;
      const typeKey = inferred.typeKey ?? null;
      setMappingDraft({ dateKey, amountKey, descriptionKey, typeKey });

      if (dateKey && amountKey) {
        buildDrafts({ dateKey, amountKey, descriptionKey, typeKey });
        return;
      }
      setStep('mapping');
    } catch (err) {
      pushToast({ variant: 'danger', title: '读取失败', message: toUserMessage(err) });
    } finally {
      setIsParsingImage(false);
    }
  };

  const applyBulkCategory = () => {
    const v = bulkCategory.trim();
    if (!v) return;
    setDrafts((prev) => prev.map((d) => (d.category.trim() ? d : { ...d, category: v })));
  };

  const applyVisibilityAll = (v: 'family' | 'private') => {
    setVisibilityAll(v);
    setDrafts((prev) => prev.map((d) => ({ ...d, visibility: v })));
  };

  const removeDuplicates = () => {
    const duplicated = new Set<string>();
    return setDrafts((prev) =>
      prev.filter((d) => {
        const dupeOf = d.sourceMeta?.duplicateOfId;
        if (!dupeOf) return true;
        if (duplicated.has(d.id)) return false;
        duplicated.add(d.id);
        return false;
      }),
    );
  };

  const canSubmit = drafts.length > 0 && invalidCount === 0 && !isImporting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={props.onClose}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData?.files ?? []);
        const image = files.find((f) => f.type.startsWith('image/'));
        if (!image) return;
        e.preventDefault();
        onPickFile(image);
      }}
    >
      <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle>导入账单</CardTitle>
                <CardDescription>上传银行账单（CSV），识别交易并批量入账。</CardDescription>
              </div>
              <button
                className="grid h-10 w-10 place-items-center rounded-2xl p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={props.onClose}
                type="button"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <div className={cn('rounded-full border px-3 py-1', step === 'upload' ? 'border-primary/30 bg-primary/10 text-foreground' : 'border-border')}>
                1. 上传
              </div>
              <div className={cn('rounded-full border px-3 py-1', step === 'mapping' ? 'border-primary/30 bg-primary/10 text-foreground' : 'border-border')}>
                2. 字段匹配
              </div>
              <div className={cn('rounded-full border px-3 py-1', step === 'preview' ? 'border-primary/30 bg-primary/10 text-foreground' : 'border-border')}>
                3. 预览导入
              </div>
            </div>

            {step === 'upload' && (
              <div className="space-y-3">
                <Alert>
                  <div className="space-y-1">
                    <div className="font-medium">支持格式：CSV / 图片（截图）</div>
                    <div className="text-sm text-muted-foreground">
                      CSV：本地解析并生成预览；图片：本地 OCR 提取文字后再进行识别。你也可以直接粘贴截图到此弹窗。
                    </div>
                  </div>
                </Alert>

                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">选择文件</label>
                    <Input
                      type="file"
                      accept=".csv,text/csv,image/*"
                      onPasteFiles={(files) => {
                        const image = files.find((f) => f.type.startsWith('image/'));
                        if (image) onPickFile(image);
                      }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        onPickFile(f);
                      }}
                    />
                    {fileName ? <div className="text-xs text-muted-foreground">已选择：{fileName}</div> : null}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ImageIcon className="h-4 w-4" />
                      可直接按 ⌘+V 粘贴截图
                    </div>
                  </div>
                  <Button type="button" variant="secondary" onClick={props.onClose}>
                    取消
                  </Button>
                </div>

                {isParsingImage ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在识别图片账单…
                  </div>
                ) : null}
              </div>
            )}

            {step === 'mapping' && (
              <div className="space-y-4">
                <Alert variant="warning" className="space-y-1">
                  <div className="font-medium">未能自动识别关键字段</div>
                  <div className="text-sm text-muted-foreground">请选择“日期”和“金额”所在列。其他列可选填。</div>
                </Alert>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">日期列（必选）</label>
                    <Select value={mappingDraft.dateKey} onChange={(e) => setMappingDraft((s) => ({ ...s, dateKey: e.target.value }))}>
                      <option value="">请选择</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">金额列（必选）</label>
                    <Select value={mappingDraft.amountKey} onChange={(e) => setMappingDraft((s) => ({ ...s, amountKey: e.target.value }))}>
                      <option value="">请选择</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">备注/摘要列（选填）</label>
                    <Select
                      value={mappingDraft.descriptionKey ?? ''}
                      onChange={(e) => setMappingDraft((s) => ({ ...s, descriptionKey: e.target.value ? e.target.value : null }))}
                    >
                      <option value="">不使用</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">收支/类型列（选填）</label>
                    <Select value={mappingDraft.typeKey ?? ''} onChange={(e) => setMappingDraft((s) => ({ ...s, typeKey: e.target.value ? e.target.value : null }))}>
                      <option value="">不使用（按金额正负判断）</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="secondary" onClick={() => setStep('upload')} className="w-full sm:w-auto">
                    返回
                  </Button>
                  <Button
                    type="button"
                    disabled={!mappingDraft.dateKey || !mappingDraft.amountKey}
                    onClick={() =>
                      buildDrafts({
                        dateKey: mappingDraft.dateKey,
                        amountKey: mappingDraft.amountKey,
                        descriptionKey: mappingDraft.descriptionKey,
                        typeKey: mappingDraft.typeKey,
                      })
                    }
                    className="w-full sm:w-auto"
                  >
                    继续
                  </Button>
                </div>
              </div>
            )}

            {step === 'preview' && (
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm">
                    共识别 <span className="font-semibold">{drafts.length}</span> 条
                    {rejected > 0 ? <span className="text-muted-foreground">（忽略 {rejected} 行无法解析）</span> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => applyVisibilityAll(visibilityAll === 'family' ? 'private' : 'family')}>
                      <Sparkles className="h-4 w-4" />
                      {visibilityAll === 'family' ? '全部设为私密' : '全部设为家庭可见'}
                    </Button>
                    <Button type="button" size="sm" variant="secondary" disabled={duplicateCount === 0} onClick={removeDuplicates}>
                      <Ban className="h-4 w-4" />
                      排除重复（{duplicateCount}）
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">批量补齐分类（仅填充空分类）</label>
                    <Input value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} list="bill-import-category-options" placeholder="例如：餐饮、交通" />
                    <datalist id="bill-import-category-options">{categoryOptions.map((name) => <option key={name} value={name} />)}</datalist>
                  </div>
                  <Button type="button" variant="secondary" onClick={applyBulkCategory}>
                    <Copy className="h-4 w-4" />
                    应用
                  </Button>
                </div>

                {invalidCount > 0 ? (
                  <Alert variant="warning">
                    <div className="space-y-1">
                      <div className="font-medium">还有 {invalidCount} 条未完成</div>
                      <div className="text-sm text-muted-foreground">请补齐分类、金额与日期后再导入。</div>
                    </div>
                  </Alert>
                ) : null}

                <div className="max-h-[52vh] overflow-auto rounded-xl border border-border">
                  <div className="divide-y divide-border">
                    {drafts.map((d) => {
                      const invalid = !isValidDraft(d);
                      const dupe = !!d.sourceMeta?.duplicateOfId;
                      return (
                        <div key={d.id} className={cn('px-3 py-3', invalid ? 'bg-amber-500/10' : dupe ? 'bg-surface-2' : '')}>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-[120px_140px_140px_1fr_auto] md:items-center">
                            <Select
                              value={d.type}
                              onChange={(e) => setDrafts((prev) => prev.map((x) => (x.id === d.id ? { ...x, type: e.target.value === 'income' ? 'income' : 'expense' } : x)))}
                            >
                              <option value="expense">支出</option>
                              <option value="income">收入</option>
                            </Select>

                            <Input
                              type="date"
                              value={isoToYmd(d.date)}
                              onChange={(e) => setDrafts((prev) => prev.map((x) => (x.id === d.id ? { ...x, date: ymdToIso(e.target.value) } : x)))}
                            />

                            <Input
                              type="number"
                              value={String(d.amount)}
                              onChange={(e) =>
                                setDrafts((prev) =>
                                  prev.map((x) => (x.id === d.id ? { ...x, amount: Number(e.target.value) } : x)),
                                )
                              }
                            />

                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                              <Input
                                value={d.category}
                                onChange={(e) => setDrafts((prev) => prev.map((x) => (x.id === d.id ? { ...x, category: e.target.value } : x)))}
                                list="bill-import-category-options"
                                placeholder="分类"
                              />
                              <Input
                                value={d.description ?? ''}
                                onChange={(e) => setDrafts((prev) => prev.map((x) => (x.id === d.id ? { ...x, description: e.target.value.trim() ? e.target.value : null } : x)))}
                                placeholder="备注（可选）"
                              />
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setDrafts((prev) => prev.filter((x) => x.id !== d.id))}
                              className="justify-center"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="secondary" onClick={props.onClose} className="w-full sm:w-auto">
                    取消
                  </Button>
                  <Button
                    type="button"
                    disabled={!canSubmit}
                    onClick={async () => {
                      try {
                        await importAsync(drafts);
                        props.onClose();
                      } catch {
                        return;
                      }
                    }}
                    className="w-full sm:w-auto"
                  >
                    {isImporting ? (
                      <>
                        <Upload className="h-4 w-4" />
                        导入中…
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        确认导入
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
