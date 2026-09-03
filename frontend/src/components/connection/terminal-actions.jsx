import { Button } from '@/components/ui/button';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { getPluginsByType } from '@/plugins/registry';
import { cn } from '@/lib/utils';

export function TerminalActions({ active, onToggle }) {
  const items = getPluginsByType('tool');

  return (
    <div className="pointer-events-none absolute right-0.5 top-0.5 z-20 flex shrink-0 gap-1">
      <TooltipProvider delayDuration={200}>
        {items.map(({ id, title, icon: Icon }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'pointer-events-auto h-7 w-7 text-slate-400 hover:bg-slate-700/70 hover:text-slate-100 active:scale-95',
                  active === id && 'bg-primary/15 text-primary ring-1 ring-primary/30 hover:bg-primary/20 hover:text-primary',
                )}
                onClick={() => onToggle(active === id ? null : id)}
                aria-label={title}
              >
                <Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{title}</TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>
    </div>
  );
}
