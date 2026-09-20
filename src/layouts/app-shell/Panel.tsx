import { Link } from 'react-router-dom';
import { PanelLeftClose } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppModule, ModuleQuickAction, NavLinkNode, NavNode } from '@/config/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

export function Panel(props: {
  module: AppModule;
  pathname: string;
  collapsed: boolean;
  quickActions: ModuleQuickAction[];
  onToggleCollapsed: () => void;
}) {
  const group = props.module.node.kind === 'group' ? props.module.node : null;
  const { isAdmin } = useAiProviders();
  const sections = group ? buildSections(group.children, isAdmin) : [];

  return (
    <aside
      className={cn(
        'fixed inset-y-0 z-40 hidden border-r border-border/60 bg-surface transition-[width] duration-300 ease-out lg:block',
        props.collapsed ? 'left-0' : 'left-16',
        props.collapsed ? 'w-0 overflow-hidden border-r-0' : 'w-72',
      )}
      aria-label="Module panel"
    >
      <div className={cn('flex h-full flex-col', props.collapsed && 'opacity-0 pointer-events-none')}>
        <div className="flex h-16 items-center justify-between border-b border-border/40 px-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{props.module.name}</div>
            <div className="truncate text-xs text-muted-foreground">用 AI 驱动下一步</div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={props.onToggleCollapsed} aria-label="收起侧栏">
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {sections.length > 0 ? (
            <nav className="space-y-4">
              {sections.map((s, idx) => (
                <div key={`${s.heading ?? 'default'}-${idx}`} className="space-y-1.5">
                  {s.heading ? (
                    <div className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground/70">{s.heading}</div>
                  ) : null}
                  <div className="space-y-1">
                    {s.links.map((link) => {
                      const active = matchHref(link.href, props.pathname);
                      const Icon = link.icon;
                      return (
                        <Link
                          key={link.href}
                          to={link.href}
                          className={cn(
                            'flex items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium transition-colors',
                            active ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                          )}
                          aria-current={active ? 'page' : undefined}
                        >
                          <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
                          <span className="min-w-0 truncate">{link.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground">快捷入口</div>
              <div className="grid grid-cols-1 gap-2">
                {props.quickActions.map((a) => {
                  const Icon = a.icon;
                  const href = (() => {
                    if (!a.action) return a.href;
                    const [path, queryString = ''] = a.href.split('?');
                    const params = new URLSearchParams(queryString);
                    if (!params.has('action')) params.set('action', a.action);
                    const query = params.toString();
                    return query ? `${path}?${query}` : path;
                  })();
                  return (
                    <Link key={a.id} to={href}>
                      <Card className="transition-colors hover:border-primary/30 hover:bg-surface-2">
                        <CardContent className="flex items-start gap-3 p-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-foreground">{a.name}</div>
                            {a.description ? <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{a.description}</div> : null}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
