import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  TrendingUp,
  Heart,
  Users,
  Bot,
  Settings,
  Menu,
  X,
  LogOut,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Receipt,
  PiggyBank,
  Tags,
  Repeat,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import { useToastStore } from '@/stores/toast';

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavItem[];
};

const navigation: NavItem[] = [
  { name: '仪表板', href: '/dashboard', icon: LayoutDashboard },
  {
    name: '财务中心',
    href: '/finance',
    icon: Wallet,
    children: [
      { name: '概览', href: '/finance', icon: LayoutDashboard },
      { name: '交易记录', href: '/finance/transactions', icon: Receipt },
      { name: '预算管理', href: '/finance/budgets', icon: PiggyBank },
      { name: '分类管理', href: '/finance/categories', icon: Tags },
      { name: '固定支出', href: '/finance/recurring', icon: Repeat },
      { name: '3层基金', href: '/finance/funds', icon: TrendingUp },
    ],
  },
  {
    name: '成长规划',
    href: '/growth',
    icon: TrendingUp,
    children: [
      { name: '概览', href: '/growth', icon: LayoutDashboard },
      { name: '目标列表', href: '/growth/goals', icon: Target },
    ],
  },
  { name: '健康中心', href: '/health', icon: Heart },
  { name: '关系管理', href: '/relationships', icon: Users },
  { name: 'AI顾问', href: '/advisor', icon: Bot },
  {
    name: '家庭设置',
    href: '/settings',
    icon: Settings,
    children: [
      { name: '概览', href: '/settings', icon: LayoutDashboard },
      { name: '成员管理', href: '/settings/members', icon: Users },
    ],
  },
];

const mobileTabs: NavItem[] = [
  { name: '概览', href: '/dashboard', icon: LayoutDashboard },
  { name: '财务', href: '/finance', icon: Wallet },
  { name: 'AI', href: '/advisor', icon: Bot },
  { name: '设置', href: '/settings', icon: Settings },
];

function isParentActive(item: NavItem, pathname: string): boolean {
  if (pathname.startsWith(item.href)) return true;
  if (item.children) {
    return item.children.some((child) => pathname.startsWith(child.href));
  }
  return false;
}

function findActiveItem(items: NavItem[], pathname: string): NavItem | null {
  for (const item of items) {
    if (item.href === pathname) return item;
    if (item.children) {
      const found = item.children.find((child) => child.href === pathname);
      if (found) return found;
    }
  }
  return null;
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
  const [submenuPopup, setSubmenuPopup] = useState<{ item: NavItem; top: number; left: number } | null>(null);
  const tooltipAnchorRef = useRef<HTMLElement | null>(null);
  const [floatingTooltip, setFloatingTooltip] = useState<null | { label: string; top: number; left: number }>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const pushToast = useToastStore((s) => s.push);

  const current = useMemo(() => {
    return findActiveItem(navigation, location.pathname) ?? navigation[0];
  }, [location.pathname]);

  const closeDrawer = () => setDrawerOpen(false);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') window.localStorage.setItem('ui.sidebarCollapsed', next ? '1' : '0');
      return next;
    });
  };

  const toggleMenu = (href: string) => {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
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
      if (submenuPopup) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-submenu-popup]') && !target.closest('[data-submenu-trigger]')) {
          setSubmenuPopup(null);
        }
      }
    };
    window.addEventListener('click', onClickOutside);
    return () => window.removeEventListener('click', onClickOutside);
  }, [submenuPopup]);

  const handleSignOut = async () => {
    await signOut();
    pushToast({ variant: 'default', title: '已退出登录', message: '期待你下次回来。' });
    navigate('/login');
  };

  const openSubmenuPopup = (el: HTMLElement, item: NavItem) => {
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
            className="fixed z-[9999] -translate-y-1/2 whitespace-nowrap rounded-lg border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-sm before:content-[''] before:absolute before:-left-2 before:top-1/2 before:-translate-y-1/2 before:border-y-8 before:border-y-transparent before:border-r-8 before:border-r-border after:content-[''] after:absolute after:-left-[7px] after:top-1/2 after:-translate-y-1/2 after:border-y-[7px] after:border-y-transparent after:border-r-[7px] after:border-r-popover"
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
            className="fixed z-[9999] min-w-[160px] rounded-xl border border-border bg-popover p-1.5 shadow-lg"
            style={{ top: submenuPopup.top, left: submenuPopup.left }}
          >
            {submenuPopup.item.children?.map((child) => {
              const isActive = location.pathname === child.href;
              const Icon = child.icon;
              return (
                <Link
                  key={child.href}
                  to={child.href}
                  onClick={() => setSubmenuPopup(null)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
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
          'fixed inset-y-0 left-0 z-50 border-r border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70 transform transition-all duration-300 ease-out lg:translate-x-0 hidden lg:block',
          sidebarCollapsed ? 'w-20' : 'w-72',
          drawerOpen ? 'translate-x-0 block' : '',
        )}
        aria-label="Sidebar"
      >
        <div className="relative flex h-full flex-col">
          <button
            type="button"
            className="absolute -right-4 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-background shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            onClick={toggleSidebarCollapsed}
            aria-label={sidebarCollapsed ? '展开菜单' : '折叠菜单'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          <div className={cn('flex h-16 items-center px-4', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
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

          <nav className="flex-1 overflow-y-auto px-3 pb-6 pt-2">
            <div className={cn('space-y-1', sidebarCollapsed && 'pt-1')}>
              {navigation.map((item) => {
                const isActive = isParentActive(item, location.pathname);
                const isExpanded = expandedMenus.has(item.href);
                const Icon = item.icon;
                const hasChildren = item.children && item.children.length > 0;

                if (sidebarCollapsed) {
                  return (
                    <div key={item.href} className="relative">
                      <button
                        type="button"
                        data-submenu-trigger={hasChildren ? 'true' : undefined}
                        onClick={() => {
                          if (hasChildren) {
                            const el = document.activeElement as HTMLElement;
                            openSubmenuPopup(el, item);
                          } else {
                            navigate(item.href);
                          }
                        }}
                        className={cn(
                          'group relative z-0 mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                          isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                        onMouseEnter={(e) => {
                          if (!hasChildren) {
                            openFloatingTooltip(e.currentTarget, item.name);
                          } else {
                            openSubmenuPopup(e.currentTarget, item);
                          }
                        }}
                        onMouseLeave={() => {
                          if (!hasChildren) {
                            closeFloatingTooltip();
                          }
                        }}
                      >
                        <Icon className={cn('h-5 w-5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={item.href}>
                    <div className="flex items-center">
                      <Link
                        to={item.href}
                        className={cn(
                          'group relative z-0 flex flex-1 items-center rounded-2xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                          'h-11 w-full gap-3 px-3',
                          isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <Icon className={cn('h-5 w-5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                        <span className="truncate transition-all duration-200 opacity-100">
                          {item.name}
                        </span>
                      </Link>
                      {hasChildren && (
                        <button
                          type="button"
                          onClick={() => toggleMenu(item.href)}
                          className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          aria-label={isExpanded ? '折叠菜单' : '展开菜单'}
                        >
                          <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', isExpanded && 'rotate-180')} />
                        </button>
                      )}
                    </div>

                    {hasChildren && isExpanded && (
                      <div className="mt-1 ml-4 space-y-0.5 border-l border-border pl-4">
                        {item.children!.map((child) => {
                          const childIsActive = location.pathname === child.href;
                          const ChildIcon = child.icon;
                          return (
                            <Link
                              key={child.href}
                              to={child.href}
                              className={cn(
                                'group flex items-center gap-2 rounded-xl px-3 h-9 text-sm font-medium transition-colors',
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
              })}
            </div>
          </nav>

          <div className="border-t border-border p-3">
            <button
              type="button"
              className={cn(
                'group relative z-0 flex w-full items-center rounded-2xl text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                sidebarCollapsed ? 'mx-auto h-12 w-12 justify-center' : 'h-11 justify-start px-3',
              )}
              onClick={handleSignOut}
              onMouseEnter={(e) => {
                if (!sidebarCollapsed) return;
                openFloatingTooltip(e.currentTarget, '退出登录');
              }}
              onMouseLeave={() => {
                if (!sidebarCollapsed) return;
                closeFloatingTooltip();
              }}
            >
              <LogOut className="h-5 w-5 shrink-0" />
              <span className={cn('transition-all duration-200', sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100 ml-3')}>
                退出登录
              </span>
            </button>
          </div>
        </div>
      </aside>

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70 transform transition-transform duration-200 ease-out lg:hidden',
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
                const isActive = isParentActive(item, location.pathname);
                const isExpanded = expandedMenus.has(item.href);
                const Icon = item.icon;
                const hasChildren = item.children && item.children.length > 0;

                return (
                  <div key={item.href}>
                    <div className="flex items-center">
                      <Link
                        to={item.href}
                        onClick={closeDrawer}
                        className={cn(
                          'group flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                          isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                        <span className="truncate">{item.name}</span>
                      </Link>
                      {hasChildren && (
                        <button
                          type="button"
                          onClick={() => toggleMenu(item.href)}
                          className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        >
                          <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', isExpanded && 'rotate-180')} />
                        </button>
                      )}
                    </div>

                    {hasChildren && isExpanded && (
                      <div className="mt-1 ml-4 space-y-0.5 border-l border-border pl-4">
                        {item.children!.map((child) => {
                          const childIsActive = location.pathname === child.href;
                          const ChildIcon = child.icon;
                          return (
                            <Link
                              key={child.href}
                              to={child.href}
                              onClick={closeDrawer}
                              className={cn(
                                'group flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
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
              })}
            </div>
          </nav>

          <div className="border-t border-border p-3">
            <Button variant="ghost" className="w-full justify-start" onClick={handleSignOut}>
              <LogOut className="h-5 w-5" />
              退出登录
            </Button>
          </div>
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
