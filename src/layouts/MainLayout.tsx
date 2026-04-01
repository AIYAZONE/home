import { useEffect, useMemo, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Bot, Sparkles, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { navigation, mobileTabs, flattenNavLinks, getAppModules, moduleQuickActions } from '@/config/navigation';
import { Rail } from '@/layouts/app-shell/Rail';
import { Panel } from '@/layouts/app-shell/Panel';
import { AppHeader } from '@/layouts/app-shell/Header';
import { PanelEdgeToggle } from '@/layouts/app-shell/PanelEdgeToggle';
import { MobileDrawer } from '@/layouts/app-shell/MobileDrawer';
import { CommandPalette, type CommandItem } from '@/components/ui/command-palette';
import { CopilotPanel, type CopilotQuickAction } from '@/components/ai/copilot-panel';
import { CopilotProvider } from '@/contexts/CopilotContext';

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const v = window.localStorage.getItem(key);
  if (v === '1') return true;
  if (v === '0') return false;
  return fallback;
}

function writeBool(key: string, value: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value ? '1' : '0');
}

function findActiveModuleId(modules: Array<{ id: string; href: string }>, pathname: string): string {
  let best: { id: string; href: string } | null = null;
  for (const m of modules) {
    if (pathname === m.href || pathname.startsWith(`${m.href}/`)) {
      if (!best || m.href.length > best.href.length) best = m;
    }
  }
  return best?.id ?? modules[0]?.id ?? '/advisor';
}

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  const modules = useMemo(() => getAppModules(navigation), []);
  const activeModuleId = useMemo(() => findActiveModuleId(modules, location.pathname), [location.pathname, modules]);
  const activeModule = useMemo(() => modules.find((m) => m.id === activeModuleId) ?? modules[0], [activeModuleId, modules]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(() => readBool('ui.panelCollapsed', false));
  const [commandOpen, setCommandOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotPinned, setCopilotPinned] = useState(() => readBool('ui.copilotPinned', false));
  const [copilotDraft, setCopilotDraft] = useState<string | null>(null);

  const quickActions = moduleQuickActions[activeModule?.id ?? ''] ?? [];
  const togglePanelCollapsed = () => {
    setPanelCollapsed((prev) => {
      const next = !prev;
      writeBool('ui.panelCollapsed', next);
      return next;
    });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      if (isCmdK) {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  useEffect(() => {
    writeBool('ui.copilotPinned', copilotPinned);
  }, [copilotPinned]);

  const copilotActions: CopilotQuickAction[] = useMemo(() => {
    const items = moduleQuickActions['/finance'] ?? [];
    const goal = (moduleQuickActions['/growth'] ?? []).find((x) => x.id === 'growth.add-goal');
    const invite = (moduleQuickActions['/settings'] ?? []).find((x) => x.id === 'settings.invite');
    const pick = [items.find((x) => x.id === 'finance.add'), goal, invite].filter(Boolean) as any[];
    return pick.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      onSelect: () => {
        const href = a.action ? `${a.href}?action=${encodeURIComponent(a.action)}` : a.href;
        navigate(href);
        setCopilotOpen(false);
      },
    }));
  }, [navigate]);

  const commands: CommandItem[] = useMemo(() => {
    const linkCommands: CommandItem[] = flattenNavLinks(navigation).map((l) => {
      const module = modules.find((m) => l.href === m.href || l.href.startsWith(`${m.href}/`));
      return {
        id: `nav:${l.href}`,
        label: l.name,
        description: l.href,
        icon: l.icon,
        group: module?.name,
        keywords: [l.href],
        onSelect: () => navigate(l.href),
      };
    });

    const quickCommands: CommandItem[] = Object.values(moduleQuickActions).flatMap((arr) =>
      arr.map((a) => ({
        id: `qa:${a.id}`,
        label: a.name,
        description: a.description ?? a.href,
        icon: a.icon,
        group: '快捷动作',
        keywords: [a.href, a.action ?? ''],
        onSelect: () => navigate(a.action ? `${a.href}?action=${encodeURIComponent(a.action)}` : a.href),
      })),
    );

    const aiCommands: CommandItem[] = [
      {
        id: 'ai.budget',
        label: '问 AI：本月预算建议',
        description: '根据你的现状给出预算切入点与下一步动作',
        icon: Sparkles,
        group: 'AI',
        onSelect: () => {
          setCopilotDraft('给我本月预算建议：先从哪几类开始？每类给一个可执行的下一步。');
          setCopilotOpen(true);
        },
      },
      {
        id: 'ai.expense',
        label: '问 AI：解释支出结构',
        description: '把支出结构解释成“为什么 + 怎么做”',
        icon: Sparkles,
        group: 'AI',
        onSelect: () => {
          setCopilotDraft('请用一句话解释我本月支出结构的风险点，并给 3 条可执行建议。');
          setCopilotOpen(true);
        },
      },
      {
        id: 'ai.week',
        label: '问 AI：下周行动清单',
        description: '把目标拆成可执行清单',
        icon: Sparkles,
        group: 'AI',
        onSelect: () => {
          setCopilotDraft('帮我生成一份下周行动清单：财务、健康、关系各 2 条，尽量具体。');
          setCopilotOpen(true);
        },
      },
      {
        id: 'theme.toggle',
        label: '切换主题',
        description: isDark ? '切换到亮色模式' : '切换到暗色模式',
        icon: isDark ? Sun : Moon,
        group: '系统',
        onSelect: () => toggleTheme(),
      },
      {
        id: 'ai.open',
        label: '打开 AI 面板',
        description: '开始对话或选择建议',
        icon: Bot,
        group: 'AI',
        onSelect: () => setCopilotOpen(true),
      },
    ];

    return [...aiCommands, ...quickCommands, ...linkCommands];
  }, [isDark, modules, navigate, toggleTheme]);

  const contentPaddingLeft = panelCollapsed ? 'lg:pl-16' : 'lg:pl-[352px]';
  const contentPaddingRight = copilotPinned ? 'lg:pr-[360px]' : '';
  const copilotVisible = copilotPinned || copilotOpen;

  const copilotApi = useMemo(
    () => ({
      open: () => setCopilotOpen(true),
      close: () => setCopilotOpen(false),
      openWithDraft: (draft: string) => {
        setCopilotDraft(draft);
        setCopilotOpen(true);
      },
    }),
    [],
  );

  return (
    <CopilotProvider value={copilotApi}>
      <div className="min-h-screen bg-background dark:bg-[radial-gradient(60%_35%_at_50%_-10%,hsl(var(--ring)/0.18),transparent_60%)]">
        <Rail modules={modules} activeId={activeModuleId} />
        {activeModule ? (
          <Panel
            module={activeModule}
            pathname={location.pathname}
            collapsed={panelCollapsed}
            quickActions={quickActions}
            onToggleCollapsed={togglePanelCollapsed}
          />
        ) : null}

        <PanelEdgeToggle collapsed={panelCollapsed} onToggle={togglePanelCollapsed} />

        <MobileDrawer
          open={drawerOpen}
          modules={modules}
          activeModuleId={activeModuleId}
          pathname={location.pathname}
          quickActions={quickActions}
          onClose={() => setDrawerOpen(false)}
        />

        <div className={cn('transition-[padding] duration-300 ease-out', contentPaddingLeft, contentPaddingRight)}>
          <AppHeader
            title={activeModule?.name ?? '工作台'}
            subtitle="用 AI 驱动下一步 · 轻量协作 · 全站一致"
            isDark={isDark}
            onOpenDrawer={() => setDrawerOpen(true)}
            onOpenCommand={() => setCommandOpen(true)}
            onOpenCopilot={() => {
              setCopilotDraft(null);
              setCopilotOpen(true);
            }}
            onToggleTheme={toggleTheme}
          />

          <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 lg:px-8 lg:pb-10 lg:pt-6">
            <Outlet />
          </main>

          <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:hidden">
            <div className="mx-auto grid max-w-7xl grid-cols-4 gap-2 px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {mobileTabs.map((item) => {
                const isActive = location.pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      'flex h-12 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[11px] font-medium transition-colors',
                      isActive ? 'bg-surface-2 text-foreground shadow-elevated' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon className="h-5 w-5" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>

        <CommandPalette open={commandOpen} items={commands} onClose={() => setCommandOpen(false)} />

        {copilotOpen && !copilotPinned ? (
          <div className="fixed inset-0 z-[9000] bg-black/40 backdrop-blur-sm" onClick={() => setCopilotOpen(false)} />
        ) : null}
        {copilotVisible ? (
          <aside
            className={cn(
              'fixed right-0 top-0 z-[9001] h-full w-[360px] border-l border-border/60 bg-surface shadow-elevated',
              copilotPinned ? 'hidden lg:block' : '',
            )}
          >
            <CopilotPanel
              open
              pinned={copilotPinned}
              title="AI Copilot"
              contextLabel={activeModule?.name ?? undefined}
              actions={copilotActions}
              quickPrompts={[
                { id: 'p1', label: '给我预算建议', prompt: '给我本月预算建议：先从哪几类开始？' },
                { id: 'p2', label: '解释支出结构', prompt: '请解释我本月支出结构的风险点，并给 3 条建议。' },
                { id: 'p3', label: '生成行动清单', prompt: '帮我生成一份下周行动清单：财务、健康、关系各 2 条。' },
              ]}
              initialDraft={copilotDraft}
              onClose={() => {
                if (copilotPinned) {
                  setCopilotPinned(false);
                } else {
                  setCopilotOpen(false);
                }
              }}
              onPinnedChange={(next) => {
                setCopilotPinned(next);
                if (next) {
                  setCopilotOpen(false);
                } else {
                  setCopilotOpen(true);
                }
              }}
              onSubmitPrompt={() => setCopilotDraft(null)}
            />
          </aside>
        ) : null}
      </div>
    </CopilotProvider>
  );
}
