import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  X,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import { navigation, mobileTabs, type NavNode } from '@/config/navigation';

function isHeadingNode(node: NavNode): node is Extract<NavNode, { kind: 'heading' }> {
  return node.kind === 'heading';
}

function isGroupNode(node: NavNode): node is Extract<NavNode, { kind: 'group' }> {
  return node.kind === 'group';
}

function isLinkNode(node: NavNode): node is Extract<NavNode, { href: string }> {
  return 'href' in node;
}

function getGroupKey(item: Extract<NavNode, { kind: 'group' }>): string {
  const overviewChild = item.children.find((child): child is Extract<NavNode, { href: string }> => isLinkNode(child) && child.name === '概览');
  const firstChild = item.children.find((child): child is Extract<NavNode, { href: string }> => isLinkNode(child));
  const overviewHref = overviewChild?.href;
  const firstHref = firstChild?.href;
  return overviewHref ?? firstHref ?? item.name;
}

function isGroupActive(item: Extract<NavNode, { kind: 'group' }>, pathname: string): boolean {
  return item.children.some((child) => isLinkNode(child) && child.href === pathname);
}

function findActiveNode(items: NavNode[], pathname: string): NavNode | null {
  for (const item of items) {
    if (isHeadingNode(item)) continue;
    if (isLinkNode(item) && item.href === pathname) return item;
    if (isGroupNode(item)) {
      const found = findActiveNode(item.children, pathname);
      if (found) return found;
    }
  }
  return null;
}

function toDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

export default function MainLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('ui.sidebarCollapsed') === '1';
  });
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    const saved = window.localStorage.getItem('ui.expandedMenus');
    return saved ? new Set(JSON.parse(saved)) : new Set(['/finance']);
  });
  const [submenuPopup, setSubmenuPopup] = useState<{ item: Extract<NavNode, { kind: 'group' }>; top: number; left: number } | null>(null);
  const tooltipAnchorRef = useRef<HTMLElement | null>(null);
  const [floatingTooltip, setFloatingTooltip] = useState<null | { label: string; top: number; left: number }>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  const current = useMemo(() => {
    return findActiveNode(navigation, location.pathname) ?? navigation[0];
  }, [location.pathname]);

  const closeDrawer = () => setDrawerOpen(false);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') window.localStorage.setItem('ui.sidebarCollapsed', next ? '1' : '0');
      return next;
    });
  };

  const toggleMenu = (key: string) => {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('ui.expandedMenus', JSON.stringify([...next]));
      }
      return next;
    });
  };

  const syncTooltipPosition = (label?: string) => {
    const el = tooltipAnchorRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    setFloatingTooltip((prev) => {
      const nextLabel = label ?? prev?.label;
      if (!nextLabel) return null;
      return { label: nextLabel, top: rect.top + rect.height / 2, left: rect.right + 12 };
    });
  };

  const openFloatingTooltip = (el: HTMLElement, label: string) => {
    tooltipAnchorRef.current = el;
    syncTooltipPosition(label);
  };

  const closeFloatingTooltip = () => {
    tooltipAnchorRef.current = null;
    setFloatingTooltip(null);
  };

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  useEffect(() => {
    if (!sidebarCollapsed) {
      closeFloatingTooltip();
      setSubmenuPopup(null);
      return;
    }
    if (!floatingTooltip && !submenuPopup) return;
    const onReposition = () => syncTooltipPosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [sidebarCollapsed, floatingTooltip, submenuPopup]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (submenuPopup) {
        if (!target.closest('[data-submenu-popup]') && !target.closest('[data-submenu-trigger]')) {
          setSubmenuPopup(null);
        }
      }
    };
    window.addEventListener('click', onClickOutside);
    return () => window.removeEventListener('click', onClickOutside);
  }, [submenuPopup]);

  const openSubmenuPopup = (el: HTMLElement, item: Extract<NavNode, { kind: 'group' }>) => {
    const rect = el.getBoundingClientRect();
    setSubmenuPopup({
      item,
      top: rect.top,
      left: rect.right + 8,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {sidebarCollapsed &&
        floatingTooltip &&
        createPortal(
          <div
            className="fixed z-[9999] -translate-y-1/2 whitespace-nowrap rounded-xl border border-border/60 bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-lg before:content-[''] before:absolute before:-left-2 before:top-1/2 before:-translate-y-1/2 before:border-y-8 before:border-y-transparent before:border-r-8 before:border-r-border/60 after:content-[''] after:absolute after:-left-[7px] after:top-1/2 after:-translate-y-1/2 after:border-y-[7px] after:border-y-transparent after:border-r-[7px] after:border-r-popover"
            style={{ top: floatingTooltip.top, left: floatingTooltip.left }}
            role="tooltip"
          >
            {floatingTooltip.label}
          </div>,
          document.body,
        )}
      {sidebarCollapsed &&
        submenuPopup &&
        createPortal(
          <div
            data-submenu-popup
            className="fixed z-[9999] min-w-[160px] rounded-2xl border border-border/60 bg-popover p-1.5 shadow-lg"
            style={{ top: submenuPopup.top, left: submenuPopup.left }}
          >
            {submenuPopup.item.children.map((child, index) => {
              if (isHeadingNode(child)) {
                return (
                  <div
                    key={`heading-${index}-${child.name}`}
                    className="mt-1 px-3 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground/70 first:mt-0"
                  >
                    {child.name}
                  </div>
                );
              }
              if (!isLinkNode(child)) return null;
              const isActive = location.pathname === child.href;
              const Icon = child.icon;
              return (
                <Link
                  key={child.href}
                  to={child.href}
                  onClick={() => setSubmenuPopup(null)}
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {child.name}
                </Link>
              );
            })}
          </div>,
          document.body,
        )}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={closeDrawer}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 border-r border-border/60 bg-card transform transition-all duration-300 ease-out lg:translate-x-0 hidden lg:block',
          sidebarCollapsed ? 'w-20' : 'w-72',
          drawerOpen ? 'translate-x-0 block' : '',
        )}
        aria-label="Sidebar"
      >
        <div className="relative flex h-full flex-col">
          <div className={cn('flex h-16 items-center border-b border-border/40 px-3', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
            <Link
              to="/dashboard"
              className={cn('flex items-center overflow-hidden', sidebarCollapsed ? 'justify-center' : 'gap-2')}
            >
              <div className="h-10 w-10 shrink-0 rounded-2xl border border-primary/15 bg-primary/10 text-primary grid place-items-center text-sm font-semibold">
                FI
              </div>
              <div
                className={cn(
                  'leading-tight transition-all duration-200',
                  sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 ml-2',
                )}
              >
                <div className="text-sm font-semibold text-foreground whitespace-nowrap">Family Inc. OS</div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">家庭经营系统</div>
              </div>
            </Link>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-3">
            <div className={cn('space-y-1', sidebarCollapsed && 'pt-1')}>
              {navigation.map((item) => {
                if (isHeadingNode(item)) return null;
                const groupItem = isGroupNode(item) ? item : null;
                const hasChildren = Boolean(groupItem);
                const groupKey = groupItem ? getGroupKey(groupItem) : (isLinkNode(item) ? item.href : item.name);
                const isExpanded = groupItem ? expandedMenus.has(groupKey) : false;
                const isActive = groupItem
                  ? isGroupActive(groupItem, location.pathname)
                  : isLinkNode(item)
                    ? location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)
                    : false;
                const Icon = item.icon;

                if (sidebarCollapsed) {
                  return (
                    <div key={groupKey} className="relative">
                      <button
                        type="button"
                        data-submenu-trigger={hasChildren ? 'true' : undefined}
                        onClick={(e) => {
                          if (hasChildren) {
                            closeFloatingTooltip();
                            openSubmenuPopup(e.currentTarget, groupItem!);
                          } else if (isLinkNode(item)) {
                            navigate(item.href);
                          }
                        }}
                        className={cn(
                          'group relative z-0 mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                          isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                        onMouseEnter={(e) => {
                          openFloatingTooltip(e.currentTarget, item.name);
                        }}
                        onMouseLeave={() => {
                          closeFloatingTooltip();
                        }}
                        aria-haspopup={hasChildren ? 'menu' : undefined}
                      >
                        <Icon className={cn('h-5 w-5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                      </button>
                    </div>
                  );
                }

                if (groupItem) {
                  const menuId = `sidebar-group-${toDomId(groupKey)}`;
                  return (
                    <div key={groupKey}>
                      <button
                        type="button"
                        onClick={() => toggleMenu(groupKey)}
                        className={cn(
                          'group relative z-0 flex w-full items-center justify-between rounded-2xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                          'h-11 px-3',
                          isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                        aria-expanded={isExpanded}
                        aria-controls={menuId}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <Icon className={cn('h-5 w-5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                          <span className="truncate">{item.name}</span>
                        </span>
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-foreground',
                            isExpanded && 'rotate-180',
                            isActive && 'text-primary',
                          )}
                          aria-hidden="true"
                        />
                      </button>

                      {isExpanded && (
                        <div id={menuId} className="mt-1 ml-4 space-y-0.5 border-l border-border/40 pl-4">
                          {groupItem.children.map((child, index) => {
                            if (isHeadingNode(child)) {
                              return (
                                <div
                                  key={`heading-${index}-${child.name}`}
                                  className="mt-2 px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground/70 first:mt-0"
                                >
                                  {child.name}
                                </div>
                              );
                            }
                            if (!isLinkNode(child)) return null;
                            const childIsActive = location.pathname === child.href;
                            const ChildIcon = child.icon;
                            return (
                              <Link
                                key={child.href}
                                to={child.href}
                                className={cn(
                                  'group flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors',
                                  childIsActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                                )}
                              >
                                <ChildIcon className={cn('h-4 w-4', childIsActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                                <span className="truncate">{child.name}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                return isLinkNode(item) ? (
                  <Link
                    key={groupKey}
                    to={item.href}
                    className={cn(
                      'group relative z-0 flex w-full items-center rounded-2xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                      'h-11 gap-3 px-3',
                      isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className={cn('h-5 w-5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                    <span className="truncate">{item.name}</span>
                  </Link>
                ) : null;
              })}
            </div>
          </nav>

          <div className={cn('border-t border-border/40', sidebarCollapsed ? 'p-2' : 'p-3')}>
            {sidebarCollapsed ? (
              <button
                type="button"
                className="group mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                onClick={toggleSidebarCollapsed}
                aria-label="展开侧栏"
                onMouseEnter={(e) => {
                  openFloatingTooltip(e.currentTarget, '展开侧栏');
                }}
                onMouseLeave={() => {
                  closeFloatingTooltip();
                }}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                className="group flex h-11 w-full items-center justify-between rounded-2xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                onClick={toggleSidebarCollapsed}
                aria-label="收起侧栏"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" />
                  <span className="truncate">收起侧栏</span>
                </span>
              </button>
            )}
          </div>
        </div>
      </aside>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 border-r border-border/60 bg-card transform transition-transform duration-200 ease-out lg:hidden',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Mobile Sidebar"
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between px-5">
            <Link to="/dashboard" className="flex items-center gap-2" onClick={closeDrawer}>
              <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary grid place-items-center text-sm font-semibold">
                FI
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-foreground">Family Inc. OS</div>
                <div className="text-xs text-muted-foreground">家庭经营系统</div>
              </div>
            </Link>
            <button onClick={closeDrawer} aria-label="Close menu">
              <X className="h-6 w-6 text-muted-foreground" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 pb-6 pt-2">
            <div className="space-y-1">
              {navigation.map((item) => {
                if (isHeadingNode(item)) return null;
                const groupItem = isGroupNode(item) ? item : null;
                const hasChildren = Boolean(groupItem);
                const groupKey = groupItem ? getGroupKey(groupItem) : (isLinkNode(item) ? item.href : item.name);
                const isExpanded = groupItem ? expandedMenus.has(groupKey) : false;
                const isActive = groupItem
                  ? isGroupActive(groupItem, location.pathname)
                  : isLinkNode(item)
                    ? location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)
                    : false;
                const Icon = item.icon;

                return (
                  <div key={groupKey}>
                    {hasChildren ? (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleMenu(groupKey)}
                          className={cn(
                            'group flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                            isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                          )}
                          aria-expanded={isExpanded}
                          aria-controls={`mobile-group-${toDomId(groupKey)}`}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                            <span className="truncate">{item.name}</span>
                          </span>
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-foreground',
                              isExpanded && 'rotate-180',
                              isActive && 'text-primary',
                            )}
                            aria-hidden="true"
                          />
                        </button>

                        {isExpanded && (
                          <div
                            id={`mobile-group-${toDomId(groupKey)}`}
                            className="mt-1 ml-4 space-y-0.5 border-l border-border/60 pl-4"
                          >
                            {groupItem!.children.map((child, index) => {
                              if (isHeadingNode(child)) {
                                return (
                                  <div
                                    key={`heading-${index}-${child.name}`}
                                    className="mt-2 px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground/70 first:mt-0"
                                  >
                                    {child.name}
                                  </div>
                                );
                              }
                              if (!isLinkNode(child)) return null;
                              const childIsActive = location.pathname === child.href;
                              const ChildIcon = child.icon;
                              return (
                                <Link
                                  key={child.href}
                                  to={child.href}
                                  onClick={closeDrawer}
                                  className={cn(
                                    'group flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                                    childIsActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                                  )}
                                >
                                  <ChildIcon className={cn('h-4 w-4', childIsActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                                  <span className="truncate">{child.name}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : isLinkNode(item) ? (
                      <Link
                        to={item.href}
                        onClick={closeDrawer}
                        className={cn(
                          'group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors',
                          isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                        <span className="truncate">{item.name}</span>
                      </Link>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </nav>
        </div>
      </aside>

      <div className={cn('transition-all duration-300', sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72')}>
        <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 lg:px-8">
            <button className="lg:hidden" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <Menu className="h-6 w-6 text-foreground" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">{current?.name}</div>
              <div className="truncate text-xs text-muted-foreground">简单易用 · 响应式 · 协作</div>
            </div>

            <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="Toggle theme">
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 lg:px-8 lg:pb-10">
          <Outlet />
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur lg:hidden">
          <div className="mx-auto grid max-w-7xl grid-cols-4 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
            {mobileTabs.map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-medium transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
