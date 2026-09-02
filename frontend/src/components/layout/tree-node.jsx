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
        'app-no-drag h-7 w-full justify-start gap-2 rounded-[7px] px-2.5 text-[13px] font-normal text-[#2d2d31] transition-colors hover:bg-[#e8e8eb] dark:text-secondary-foreground dark:hover:bg-accent',
        active && 'bg-[#dfdfe3] text-[#242429] font-medium dark:bg-accent dark:text-accent-foreground',
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotColor[tab.status] ?? 'bg-muted-foreground')}
      />
      <span className="truncate">{tab.label}</span>
    </Button>
  );
}
