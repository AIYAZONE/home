import { useEffect, useMemo, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import { useToastStore } from '@/stores/toast';

type NavItem = { name: string; href: string; icon: React.ComponentType<{ className?: string }> };

const navigation: NavItem[] = [
  { name: '仪表板', href: '/dashboard', icon: LayoutDashboard },
  { name: '财务中心', href: '/finance', icon: Wallet },
  { name: '成长规划', href: '/growth', icon: TrendingUp },
  { name: '健康中心', href: '/health', icon: Heart },
  { name: '关系管理', href: '/relationships', icon: Users },
  { name: 'AI顾问', href: '/advisor', icon: Bot },
  { name: '设置', href: '/settings', icon: Settings },
];

const mobileTabs: NavItem[] = [
  { name: '概览', href: '/dashboard', icon: LayoutDashboard },
  { name: '财务', href: '/finance', icon: Wallet },
  { name: 'AI', href: '/advisor', icon: Bot },
  { name: '设置', href: '/settings', icon: Settings },
];

export default function MainLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const pushToast = useToastStore((s) => s.push);

  const current = useMemo(() => {
    return navigation.find((item) => location.pathname.startsWith(item.href)) ?? navigation[0];
  }, [location.pathname]);

  const closeDrawer = () => setDrawerOpen(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const handleSignOut = async () => {
    await signOut();
    pushToast({ variant: 'default', title: '已退出登录', message: '期待你下次回来。' });
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={closeDrawer}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70 transform transition-transform duration-200 ease-out lg:translate-x-0',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Sidebar"
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
            <button className="lg:hidden" onClick={closeDrawer} aria-label="Close menu">
              <X className="h-6 w-6 text-muted-foreground" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 pb-6 pt-2">
            <div className="space-y-1">
              {navigation.map((item) => {
                const isActive = location.pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                    onClick={closeDrawer}
                  >
                    <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                    <span className="truncate">{item.name}</span>
                  </Link>
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

      <div className="lg:pl-72">
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
