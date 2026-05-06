import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NormalizedHealthReportItem } from '@/lib/health/reportNormalizer';

export function HealthReportPreviewTable(props: {
  items: NormalizedHealthReportItem[];
  onChange: (items: NormalizedHealthReportItem[]) => void;
}) {
  const { items, onChange } = props;

  return (
    <div className="max-h-[52vh] overflow-auto rounded-xl border border-border">
      <div className="divide-y divide-border">
        {items.map((it, index) => (
          <div key={`${it.metric_code}_${index}`} className="grid grid-cols-1 gap-2 px-3 py-3 md:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.8fr_auto] md:items-center">
            <Input
              value={it.metric_name}
              onChange={(e) =>
                onChange(
                  items.map((x, idx) =>
                    idx === index ? { ...x, metric_name: e.target.value } : x,
                  ),
                )
              }
              placeholder="指标名"
            />
            <Input
              type="number"
              value={it.value_num ?? ''}
              onChange={(e) =>
                onChange(
                  items.map((x, idx) =>
                    idx === index
                      ? {
                          ...x,
                          value_num: e.target.value.trim() ? Number(e.target.value) : null,
                        }
                      : x,
                  ),
                )
              }
              placeholder="数值"
            />
            <Input
              value={it.unit ?? ''}
              onChange={(e) =>
                onChange(
                  items.map((x, idx) => (idx === index ? { ...x, unit: e.target.value || null } : x)),
                )
              }
              placeholder="单位"
            />
            <Input
              type="number"
              value={it.reference_low ?? ''}
              onChange={(e) =>
                onChange(
                  items.map((x, idx) =>
                    idx === index
                      ? {
                          ...x,
                          reference_low: e.target.value.trim() ? Number(e.target.value) : null,
                        }
                      : x,
                  ),
                )
              }
              placeholder="参考低值"
            />
            <Input
              type="number"
              value={it.reference_high ?? ''}
              onChange={(e) =>
                onChange(
                  items.map((x, idx) =>
                    idx === index
                      ? {
                          ...x,
                          reference_high: e.target.value.trim() ? Number(e.target.value) : null,
                        }
                      : x,
                  ),
                )
              }
              placeholder="参考高值"
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange(items.filter((_, idx) => idx !== index))}
            >
              删除
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
