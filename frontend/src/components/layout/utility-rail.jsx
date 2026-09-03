import { Button } from '@/components/ui/button';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { getPluginsByType } from '@/plugins/registry';
import { cn } from '@/lib/utils';

export function UtilityRail({ active, onToggle }) {
  const items = getPluginsByType('tool');

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className="flex h-full w-10 flex-col items-center gap-1.5 bg-secondary py-2"
        aria-label="终端工具"
      >
        {items.map(({ id, title, icon: Icon }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7',
                  active === id && 'bg-primary/15 text-primary ring-1 ring-primary/30 hover:bg-primary/20 hover:text-primary',
                )}
                onClick={() => onToggle(active === id ? null : id)}
                aria-label={title}
              >
                <Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">{title}</TooltipContent>
          </Tooltip>
        ))}
      </aside>
    </TooltipProvider>
  );
}
