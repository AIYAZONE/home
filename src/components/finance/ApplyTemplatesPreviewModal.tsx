import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ListRow, ListRowLeading, ListRowTrailing } from '@/components/ui/list-row';
import { formatMoney } from '@/lib/format';

export type ApplyTemplatesPreviewItem = {
  category_name: string;
  amount: number;
  category_id?: string | null;
};

export function ApplyTemplatesPreviewModal(props: {
  open: boolean;
  monthLabel: string;
  adds: ApplyTemplatesPreviewItem[];
  overwrites: Array<ApplyTemplatesPreviewItem & { existingAmount: number }>;
  defaultOverwrite?: boolean;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (overwrite: boolean) => void;
}) {
  const [overwrite, setOverwrite] = useState(!!props.defaultOverwrite);

  useEffect(() => {
    if (!props.open) return;
    setOverwrite(!!props.defaultOverwrite);
  }, [props.open, props.defaultOverwrite]);

  const summary = useMemo(() => {
    const addCount = props.adds.length;
    const overwriteCount = overwrite ? props.overwrites.length : 0;
    return { addCount, overwriteCount };
  }, [props.adds.length, props.overwrites.length, overwrite]);

  if (!props.open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center" onClick={props.onClose}>
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle>应用模板到本月</CardTitle>
                <CardDescription>目标月份：{props.monthLabel}。确认后才会写入预算。</CardDescription>
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
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">将新增 {summary.addCount} 项</Badge>
              <Badge variant={summary.overwriteCount > 0 ? 'warning' : 'default'}>将覆盖 {summary.overwriteCount} 项</Badge>
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                disabled={props.isSubmitting}
              />
              <div className="min-w-0">
                <div className="font-medium">覆盖本月已有预算</div>
                <div className="text-xs text-muted-foreground">默认仅新增缺失分类；开启后会覆盖同分类预算金额。</div>
              </div>
            </label>

            {props.adds.length === 0 && props.overwrites.length === 0 ? (
              <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">没有可应用的模板。</div>
            ) : (
              <div className="space-y-3">
                {props.adds.length > 0 ? (
                  <div className="rounded-xl border border-border">
                    <div className="flex items-center justify-between px-4 py-3 text-sm font-medium">
                      <div>将新增</div>
                      <div className="text-xs text-muted-foreground">{props.adds.length} 项</div>
                    </div>
                    <div className="divide-y divide-border">
                      {props.adds.map((it) => (
                        <ListRow key={`add:${it.category_name}`}>
                          <ListRowLeading>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{it.category_name}</div>
                            </div>
                          </ListRowLeading>
                          <ListRowTrailing className="sm:justify-end">
                            <div className="text-sm font-medium">{formatMoney(it.amount)}</div>
                          </ListRowTrailing>
                        </ListRow>
                      ))}
                    </div>
                  </div>
                ) : null}

                {overwrite && props.overwrites.length > 0 ? (
                  <div className="rounded-xl border border-border">
                    <div className="flex items-center justify-between px-4 py-3 text-sm font-medium">
                      <div>将覆盖</div>
                      <div className="text-xs text-muted-foreground">{props.overwrites.length} 项</div>
                    </div>
                    <div className="divide-y divide-border">
                      {props.overwrites.map((it) => (
                        <ListRow key={`overwrite:${it.category_name}`}>
                          <ListRowLeading>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{it.category_name}</div>
                              <div className="mt-1 text-xs text-muted-foreground">本月 {formatMoney(it.existingAmount)} → 模板 {formatMoney(it.amount)}</div>
                            </div>
                          </ListRowLeading>
                          <ListRowTrailing className="sm:justify-end">
                            <div className="text-sm font-medium">{formatMoney(it.amount)}</div>
                          </ListRowTrailing>
                        </ListRow>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={props.onClose} className="w-full sm:w-auto" disabled={props.isSubmitting}>
                取消
              </Button>
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={props.isSubmitting || (props.adds.length === 0 && (!overwrite || props.overwrites.length === 0))}
                onClick={() => props.onConfirm(overwrite)}
              >
                {props.isSubmitting ? '应用中…' : '确认应用'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>,
    document.body,
  );
}

