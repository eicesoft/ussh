import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const dotColor = {
  idle: 'bg-muted-foreground',
  connecting: 'bg-amber-500',
  connected: 'bg-primary',
  closed: 'bg-destructive',
};

export function TreeNode({ tab, active, onSelect }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onSelect(tab.id)}
      title={tab.label}
      className={cn(
        'app-no-drag h-7 w-full justify-start gap-2 px-2 text-xs font-normal',
        active && 'bg-accent text-accent-foreground font-medium',
      )}
    >
      <span
        className={cn('h-2 w-2 shrink-0 rounded-full', dotColor[tab.status] ?? 'bg-muted-foreground')}
      />
      <span className="truncate">{tab.label}</span>
    </Button>
  );
}