import { Button } from '@/components/ui/button';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { getPluginsByType } from '@/plugins/registry';
import { cn } from '@/lib/utils';

export function TerminalActions({ active, onToggle }) {
  const items = getPluginsByType('tool');

  return (
    <div className="pointer-events-none absolute right-[14px] top-0.5 z-20 flex shrink-0 gap-1">
      <TooltipProvider delayDuration={200}>
        {items.map(({ id, title, icon: Icon }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'pointer-events-auto h-7 w-7 text-slate-300 hover:bg-white/10 hover:text-white active:scale-95',
                  active === id && 'bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/16 hover:text-white',
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
