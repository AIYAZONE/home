import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { AppModule } from '@/config/navigation';

export function Rail(props: { modules: AppModule[]; activeId: string; className?: string }) {
  const [tooltip, setTooltip] = useState<null | { label: string; top: number; left: number }>(null);
  const anchorRef = useRef<HTMLElement | null>(null);

  const syncTooltip = (label?: string) => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTooltip((prev) => {
      const nextLabel = label ?? prev?.label;
      if (!nextLabel) return null;
      return { label: nextLabel, top: rect.top + rect.height / 2, left: rect.right + 12 };
    });
  };

  const openTooltip = (el: HTMLElement, label: string) => {
    anchorRef.current = el;
    syncTooltip(label);
  };

  const closeTooltip = () => {
    anchorRef.current = null;
    setTooltip(null);
  };

  useEffect(() => {
    if (!tooltip) return;
    const onReposition = () => syncTooltip();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [tooltip]);

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 hidden w-16 flex-col border-r border-border/60 bg-surface lg:flex',
        props.className,
      )}
      aria-label="Modules"
    >
      {tooltip
        ? createPortal(
            <div
              className="fixed z-[9999] -translate-y-1/2 whitespace-nowrap rounded-xl border border-border/60 bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-lg before:content-[''] before:absolute before:-left-2 before:top-1/2 before:-translate-y-1/2 before:border-y-8 before:border-y-transparent before:border-r-8 before:border-r-border/60 after:content-[''] after:absolute after:-left-[7px] after:top-1/2 after:-translate-y-1/2 after:border-y-[7px] after:border-y-transparent after:border-r-[7px] after:border-r-popover"
              style={{ top: tooltip.top, left: tooltip.left }}
              role="tooltip"
            >
              {tooltip.label}
            </div>,
            document.body,
          )
        : null}
      <div className="flex h-16 items-center justify-center border-b border-border/40">
        <Link to="/advisor" className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary" title="工作台">
          <img src="/brand-mark.svg" alt="Family Inc. OS" className="h-6 w-6" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        <div className="flex flex-col items-center gap-1.5">
          {props.modules.map((m) => {
            const Icon = m.icon;
            const active = m.id === props.activeId;
            return (
              <Link
                key={m.id}
                to={m.href}
                aria-label={m.name}
                className={cn(
                  'group relative grid h-11 w-11 place-items-center rounded-2xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                  active ? 'bg-primary/10 text-foreground shadow-glow' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                )}
                aria-current={active ? 'page' : undefined}
                onMouseEnter={(e) => openTooltip(e.currentTarget, m.name)}
                onMouseLeave={closeTooltip}
                onFocus={(e) => openTooltip(e.currentTarget, m.name)}
                onBlur={closeTooltip}
              >
                <Icon className={cn('h-5 w-5', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                {active ? (
                  <span className="absolute right-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background/80 shadow-sm" />
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
