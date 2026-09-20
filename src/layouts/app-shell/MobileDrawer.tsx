import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppModule, ModuleQuickAction, NavLinkNode, NavNode } from '@/config/navigation';
import { Button } from '@/components/ui/button';
import { useAiProviders } from '@/hooks/useAiProviders';

type Section = { heading?: string; links: NavLinkNode[] };

function isHeading(node: NavNode): node is Extract<NavNode, { kind: 'heading' }> {
  return node.kind === 'heading';
}

function isLink(node: NavNode): node is NavLinkNode {
  return 'href' in node;
}

function buildSections(children: NavNode[], isAdmin: boolean): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const child of children) {
    if (isHeading(child)) {
      current = { heading: child.name, links: [] };
      sections.push(current);
      continue;
    }
    if (!isLink(child)) continue;
    if (child.adminOnly && !isAdmin) continue;
    if (!current) {
      current = { links: [] };
      sections.push(current);
    }
    current.links.push(child);
  }
  return sections.filter((s) => s.links.length > 0);
}

function matchHref(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileDrawer(props: {
  open: boolean;
  modules: AppModule[];
  activeModuleId: string;
  pathname: string;
  quickActions: ModuleQuickAction[];
  onClose: () => void;
}) {
  const activeModule = props.modules.find((m) => m.id === props.activeModuleId) ?? props.modules[0];
  const group = activeModule?.node.kind === 'group' ? activeModule.node : null;
  const { isAdmin } = useAiProviders();
  const sections = group ? buildSections(group.children, isAdmin) : [];

  return (
    <>
      {props.open ? (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden" onClick={props.onClose} />
      ) : null}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[88vw] max-w-[360px] border-r border-border/60 bg-surface transition-transform duration-200 ease-out lg:hidden',
          props.open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Mobile menu"
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between border-b border-border/40 px-4">
            <Link to="/advisor" onClick={props.onClose} className="flex items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                <img src="/brand-mark.svg" alt="Family Inc. OS" className="h-6 w-6" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-foreground">Family Inc. OS</div>
                <div className="text-xs text-muted-foreground">AI 工作台</div>
              </div>
            </Link>
            <Button type="button" variant="ghost" size="sm" onClick={props.onClose} aria-label="关闭">
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="text-xs font-medium text-muted-foreground">模块</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {props.modules.map((m) => {
                const active = m.id === props.activeModuleId;
                const Icon = m.icon;
                return (
                  <Link key={m.id} to={m.href} onClick={props.onClose}>
                    <div
                      className={cn(
                        'flex items-center gap-2 rounded-2xl border border-border/60 px-3 py-2 text-sm font-medium transition-colors',
                        active ? 'bg-primary/10 text-foreground' : 'bg-background/40 text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                      )}
                    >
                      <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="truncate">{m.name}</span>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="mt-6 text-xs font-medium text-muted-foreground">当前模块</div>
            <div className="mt-2 rounded-2xl border border-border/60 bg-background/40 p-3">
              <div className="text-sm font-semibold text-foreground">{activeModule?.name}</div>
              <div className="mt-3 space-y-1">
                {sections.length > 0 ? (
                  sections.map((s, idx) => (
                    <div key={`${s.heading ?? 'default'}-${idx}`} className="space-y-1.5">
                      {s.heading ? (
                        <div className="mt-2 text-[11px] font-semibold tracking-wide text-muted-foreground/70 first:mt-0">{s.heading}</div>
                      ) : null}
                      {s.links.map((link) => {
                        const active = matchHref(link.href, props.pathname);
                        const Icon = link.icon;
                        return (
                          <Link
                            key={link.href}
                            to={link.href}
                            onClick={props.onClose}
                            className={cn(
                              'flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium transition-colors',
                              active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                            )}
                          >
                            <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
                            <span className="truncate">{link.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ))
                ) : (
                  <div className="space-y-2">
                    {props.quickActions.map((a) => {
                      const href = a.action ? `${a.href}?action=${encodeURIComponent(a.action)}` : a.href;
                      const Icon = a.icon;
                      return (
                        <Link key={a.id} to={href} onClick={props.onClose}>
                          <div className="flex items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2">
                            <div className="mt-0.5 grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-foreground">{a.name}</div>
                              {a.description ? <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{a.description}</div> : null}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

