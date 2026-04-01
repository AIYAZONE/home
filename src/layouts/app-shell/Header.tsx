import { Menu, Moon, Search, Sun, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function AppHeader(props: {
  title: string;
  subtitle?: string;
  isDark: boolean;
  onOpenDrawer: () => void;
  onOpenCommand: () => void;
  onOpenCopilot: () => void;
  onToggleTheme: () => void;
  containerClassName?: string;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b border-border/70 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50',
        props.className,
      )}
    >
      <div className={cn('mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 lg:px-8', props.containerClassName)}>
        <Button variant="ghost" size="sm" className="lg:hidden" onClick={props.onOpenDrawer} aria-label="打开菜单">
          <Menu className="h-5 w-5" />
        </Button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{props.title}</div>
          {props.subtitle ? <div className="hidden truncate text-xs text-muted-foreground sm:block">{props.subtitle}</div> : null}
        </div>

        <button
          type="button"
          onClick={props.onOpenCommand}
          className="hidden h-10 w-[360px] items-center gap-2 rounded-2xl border border-border/60 bg-background/40 px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 lg:flex"
          aria-label="打开全局搜索"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 truncate">搜索模块 / 输入命令…</span>
          <span className="shrink-0 rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs text-muted-foreground">⌘K</span>
        </button>

        <Button variant="secondary" size="sm" onClick={props.onOpenCopilot} aria-label="问 AI">
          <Wand2 className="h-4 w-4" />
          问 AI
        </Button>

        <Button variant="ghost" size="sm" onClick={props.onToggleTheme} aria-label="切换主题">
          {props.isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      <div className="px-4 pb-3 lg:hidden">
        <button
          type="button"
          onClick={props.onOpenCommand}
          className="flex h-10 w-full items-center gap-2 rounded-2xl border border-border/60 bg-background/40 px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          aria-label="打开全局搜索"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 truncate">搜索模块 / 输入命令…</span>
        </button>
      </div>
    </header>
  );
}
