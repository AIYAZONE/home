import { PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PanelEdgeToggle(props: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  if (!props.collapsed) return null;
  const Icon = PanelLeftOpen;
  const edgeLeft = 0;
  return (
    <button
      type="button"
      onClick={props.onToggle}
      aria-label="展开侧栏"
      title="展开侧栏"
      className={cn(
        'fixed top-3 z-[70] hidden h-10 w-8 place-items-center rounded-r-full rounded-l-none border border-l-0 border-border/60 bg-background/75 text-muted-foreground shadow-elevated backdrop-blur transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 lg:grid',
      )}
      style={{ left: edgeLeft }}
    >
      <Icon className="h-4 w-4 transition-transform duration-200" />
    </button>
  );
}
