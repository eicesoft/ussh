import { Button } from '@/components/ui/button';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { getPluginsByType } from '@/plugins/registry';

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
                variant={active === id ? 'default' : 'ghost'}
                size="icon"
                className="h-8 w-8"
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
