import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Upload, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { useToastStore } from '@/stores/toast';
import { toUserMessage } from '@/lib/error';
import { extractTextFromImage } from '@/lib/health/imageOcr';
import { extractTextFromPdf } from '@/lib/health/pdfExtract';
import { normalizeParsedHealthItems, NormalizedHealthReportItem } from '@/lib/health/reportNormalizer';
import { useHealthReportFiles } from '@/hooks/useHealthReportFiles';
import { useHealthReportImport } from '@/hooks/useHealthReportImport';
import { HealthReportFile } from '@/types';
import { HealthReportPreviewTable } from '@/components/health/HealthReportPreviewTable';
import { supabase } from '@/lib/supabase';
import { TimeoutError, withTimeout } from '@/lib/async/withTimeout';

type Step = 'upload' | 'preview';

type ParseResponse = {
  items: any[];
  warnings?: string[];
  confidence_summary?: Record<string, unknown>;
  traceId?: string;
};

type UploadPhase = 'idle' | 'uploading' | 'extracting' | 'parsing' | 'finalizing' | 'done' | 'failed';

const PHASE_PROGRESS: Record<UploadPhase, number> = {
  idle: 0,
  uploading: 25,
  extracting: 50,
  parsing: 75,
  finalizing: 90,
  done: 100,
  failed: 0,
};

const PHASE_MESSAGE: Record<UploadPhase, string> = {
  idle: '',
  uploading: '正在上传文件…',
  extracting: '正在提取报告文本…',
  parsing: '正在云端解析指标…',
  finalizing: '正在保存解析结果…',
  done: '解析完成，可预览确认导入。',
  failed: '解析失败，请重试或更换文件。',
};

export function HealthReportImportModal(props: {
  open: boolean;
  onClose: () => void;
  subjectUserId: string | null;
}) {
  const { open, onClose, subjectUserId } = props;
  const pushToast = useToastStore((s) => s.push);
  const { createReportFileAsync, updateReportStatusAsync } = useHealthReportFiles(subjectUserId);
  const { importReportItemsAsync, isImporting } = useHealthReportImport(subjectUserId);
  const [step, setStep] = useState<Step>('upload');
  const [reportType, setReportType] = useState<HealthReportFile['report_type']>('checkup');
  const [capturedAt, setCapturedAt] = useState(new Date().toISOString().slice(0, 10));
  const [warnings, setWarnings] = useState<string[]>([]);
  const [items, setItems] = useState<NormalizedHealthReportItem[]>([]);
  const [reportFile, setReportFile] = useState<HealthReportFile | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [traceId, setTraceId] = useState('');

  const phaseProgress = PHASE_PROGRESS[phase];
  const phaseMessage = PHASE_MESSAGE[phase];

  useEffect(() => {
    const shouldTick = ['uploading', 'extracting', 'parsing', 'finalizing'].includes(phase);
    if (!shouldTick) return;
    setElapsedSeconds(0);
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (!open) return;
    setStep('upload');
    setReportType('checkup');
    setCapturedAt(new Date().toISOString().slice(0, 10));
    setWarnings([]);
    setItems([]);
    setReportFile(null);
    setIsParsing(false);
    setPhase('idle');
    setElapsedSeconds(0);
    setErrorMessage('');
    setTraceId('');
  }, [open]);

  const invalidCount = useMemo(
    () => items.filter((it) => !it.metric_code || !it.metric_name).length,
    [items],
  );

  if (!open) return null;

  const onPickFile = async (file: File) => {
    if (!subjectUserId) return;
    if (!file) return;
    const sourceType: HealthReportFile['source_type'] = file.type.startsWith('image/') ? 'image' : 'pdf';
    if (sourceType === 'pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      pushToast({ variant: 'warning', title: '格式不支持', message: '第一期仅支持 PDF 与图片。' });
      return;
    }
    if (sourceType === 'image' && file.size > 6 * 1024 * 1024) {
      pushToast({ variant: 'warning', title: '图片过大', message: '请压缩到 6MB 以内后重试。' });
      return;
    }
    if (sourceType === 'pdf' && file.size > 20 * 1024 * 1024) {
      pushToast({ variant: 'warning', title: 'PDF过大', message: '请压缩到 20MB 以内后重试。' });
      return;
    }
    if (sourceType === 'pdf' && file.size > 8 * 1024 * 1024) {
      pushToast({ variant: 'warning', title: 'PDF较大', message: '建议先压缩或拆分报告页，可明显提升解析速度。' });
    }

    setIsParsing(true);
    setErrorMessage('');
    setTraceId('');
    setPhase('uploading');
    let createdFile: HealthReportFile | null = null;
    let parseTraceId = '';
    try {
      const created = await withTimeout(
        createReportFileAsync({
          file,
          reportType,
          sourceType,
          capturedAt,
        }),
        60_000,
        '上传超时，请检查网络后重试。',
      );
      createdFile = created;
      setReportFile(created);

      setPhase('extracting');
      const text = await withTimeout(
        sourceType === 'image' ? extractTextFromImage(file) : extractTextFromPdf(file),
        90_000,
        '文本提取超时，请尝试压缩或更换更清晰的文件。',
      );
      if (text.trim().length < 20) throw new Error('未识别到有效文本，请更换更清晰的报告。');

      setPhase('parsing');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error('未登录或登录已过期，请重新登录。');
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 90_000);
      const resp = await fetch('/api/health-reports/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          text,
          filename: file.name,
          reportType,
          sourceType,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(abortTimer));
      const raw = await resp.text().catch(() => '');
      const payload: ParseResponse = (() => {
        try {
          return raw ? JSON.parse(raw) : { items: [] };
        } catch {
          return { items: [] };
        }
      })();
      parseTraceId = typeof payload.traceId === 'string' ? payload.traceId : '';
      if (!resp.ok) throw new Error(typeof (payload as any)?.message === 'string' ? (payload as any).message : '解析失败');

      const normalized = normalizeParsedHealthItems(Array.isArray(payload.items) ? payload.items : []);
      if (normalized.length === 0) throw new Error('未识别到核心指标，请尝试更清晰的报告。');
      setItems(normalized);
      setWarnings(Array.isArray(payload.warnings) ? payload.warnings.slice(0, 8) : []);
      setPhase('finalizing');
      await withTimeout(
        updateReportStatusAsync({
          id: created.id,
          parse_status: 'parsed',
          confidence_summary: payload.confidence_summary ?? {},
        }),
        10_000,
        '状态更新超时，请稍后刷新查看。',
      ).catch(() => undefined);
      if (parseTraceId) setTraceId(parseTraceId);
      setPhase('done');
      setStep('preview');
      setIsParsing(false);
    } catch (err: any) {
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      const msg = isAbort
        ? '解析超时，请压缩文件后重试；无需分批协议，但建议按报告页分次上传。'
        : err instanceof TimeoutError
          ? err.message
          : toUserMessage(err);
      setErrorMessage(msg);
      if (parseTraceId) setTraceId(parseTraceId);
      setPhase('failed');
      setIsParsing(false);
      if (createdFile?.id) {
        updateReportStatusAsync({
          id: createdFile.id,
          parse_status: 'failed',
          parse_error: msg,
        }).catch(() => undefined);
      }
      pushToast({ variant: 'danger', title: '解析失败', message: parseTraceId ? `${msg}（追踪ID: ${parseTraceId}）` : msg });
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle>体检报告导入</CardTitle>
                <CardDescription>支持 PDF / 图片，识别后可预览修正并确认入库。</CardDescription>
              </div>
              <button
                className="grid h-10 w-10 place-items-center rounded-2xl p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                onClick={onClose}
                type="button"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 'upload' ? (
              <div className="space-y-3">
                <Alert>
                  <div className="space-y-1 text-sm">
                    <div className="font-medium">第一期支持 PDF + 图片</div>
                    <div className="text-muted-foreground">Word 导入将在后续版本开放。</div>
                  </div>
                </Alert>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">报告类型</label>
                    <Select value={reportType} onChange={(e) => setReportType(e.target.value as HealthReportFile['report_type'])}>
                      <option value="checkup">体检</option>
                      <option value="lab">化验</option>
                      <option value="prescription">处方</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">报告日期</label>
                    <Input type="date" value={capturedAt} onChange={(e) => setCapturedAt(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">选择文件</label>
                    <Input
                      type="file"
                      accept="application/pdf,image/*"
                      onPasteFiles={(files) => {
                        const image = files.find((f) => f.type.startsWith('image/'));
                        if (image) onPickFile(image);
                      }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        onPickFile(file);
                      }}
                    />
                  </div>
                </div>

                {phase !== 'idle' ? (
                  <div className="space-y-2 rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {['uploading', 'extracting', 'parsing', 'finalizing'].includes(phase) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        <span>{phaseMessage}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        阶段进度 {phaseProgress}%
                        {isParsing ? ` · 已耗时 ${elapsedSeconds}s` : ''}
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${phaseProgress}%` }} />
                    </div>
                    {phase === 'failed' ? (
                      <div className="space-y-2">
                        <div className="text-sm text-destructive">{errorMessage || '解析失败，请重试。'}</div>
                        {traceId ? <div className="text-xs text-muted-foreground">追踪ID：{traceId}</div> : null}
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setPhase('idle');
                              setIsParsing(false);
                              setErrorMessage('');
                              setTraceId('');
                            }}
                          >
                            更换文件
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm">
                  已识别 <span className="font-semibold">{items.length}</span> 条核心指标
                  {invalidCount > 0 ? <span className="text-muted-foreground">（{invalidCount} 条待修正）</span> : null}
                </div>
                {warnings.length > 0 ? (
                  <Alert>
                    <div className="space-y-1">
                      <div className="font-medium">识别提示</div>
                      <div className="text-sm text-muted-foreground">{warnings.join('；')}</div>
                    </div>
                  </Alert>
                ) : null}

                <HealthReportPreviewTable items={items} onChange={setItems} />

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">
                    取消
                  </Button>
                  <Button
                    type="button"
                    disabled={!reportFile || invalidCount > 0 || items.length === 0 || isImporting}
                    onClick={async () => {
                      if (!reportFile) return;
                      await importReportItemsAsync({
                        reportFile,
                        items,
                        recordedAt: capturedAt,
                      });
                      onClose();
                    }}
                    className="w-full sm:w-auto"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
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
    </div>,
    document.body,
  );
}
