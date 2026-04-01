import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ComponentType } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export type CommandItem = {
  id: string;
  label: string;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  keywords?: string[];
  group?: string;
  onSelect: () => void;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function matches(item: CommandItem, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const hay = [
    item.label,
    item.description ?? '',
    item.group ?? '',
    ...(item.keywords ?? []),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export function CommandPalette(props: {
  open: boolean;
  title?: string;
  placeholder?: string;
  items: CommandItem[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    return props.items.filter((item) => matches(item, query));
  }, [props.items, query]);

  const activeIndex = useMemo(() => {
    if (!filtered.length) return -1;
    if (!activeId) return 0;
    const idx = filtered.findIndex((x) => x.id === activeId);
    return idx >= 0 ? idx : 0;
  }, [activeId, filtered]);

  useEffect(() => {
    if (!props.open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setQuery('');
    setActiveId(null);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!filtered.length) return;
        const next = Math.min(filtered.length - 1, Math.max(0, activeIndex) + 1);
        setActiveId(filtered[next]?.id ?? null);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!filtered.length) return;
        const next = Math.max(0, Math.max(0, activeIndex) - 1);
        setActiveId(filtered[next]?.id ?? null);
        return;
      }
      if (e.key === 'Enter') {
        if (activeIndex < 0 || activeIndex >= filtered.length) return;
        e.preventDefault();
        const item = filtered[activeIndex];
        item?.onSelect();
        props.onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, filtered, props]);

  if (!props.open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/40 px-4 py-10 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={props.onClose}
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <Card className="border border-border/60 bg-popover shadow-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{props.title ?? '全局搜索 / 命令'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={props.placeholder ?? '搜索页面或输入命令…'}
                className="pl-9"
              />
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-background/40 px-4 py-10 text-center text-sm text-muted-foreground">
                没有匹配结果
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto rounded-xl border border-border/60">
                {filtered.map((item, idx) => {
                  const isActive = idx === activeIndex;
                  const Icon = item.icon;
                  return (
                    <Button
                      key={item.id}
                      type="button"
                      variant="ghost"
                      className={cn(
                        'h-auto w-full justify-start rounded-none px-3 py-3 text-left',
                        isActive && 'bg-surface-2',
                      )}
                      onMouseEnter={() => setActiveId(item.id)}
                      onClick={() => {
                        item.onSelect();
                        props.onClose();
                      }}
                    >
                      <div className="flex w-full items-start gap-3">
                        {Icon ? (
                          <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                            <Icon className="h-4 w-4" />
                          </div>
                        ) : (
                          <div className="mt-0.5 h-8 w-8 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate text-sm font-medium text-foreground">{item.label}</div>
                            {item.group ? (
                              <div className="shrink-0 text-xs text-muted-foreground">{item.group}</div>
                            ) : null}
                          </div>
                          {item.description ? (
                            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</div>
                          ) : null}
                        </div>
                      </div>
                    </Button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>,
    document.body,
  );
}

