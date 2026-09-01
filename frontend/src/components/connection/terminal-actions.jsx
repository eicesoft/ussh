import { Terminal, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const items = [
  ['commands', '快捷命令', Terminal],
  ['files', '文件传输', FileText],
];

export function TerminalActions({ active, onToggle }) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-20 flex shrink-0 gap-1">
      <TooltipProvider delayDuration={200}>
        {items.map(([id, label, Icon]) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <Button
                variant={active === id ? 'default' : 'ghost'}
                size="icon"
                className="pointer-events-auto h-8 w-8 text-slate-400 hover:bg-slate-700/70 hover:text-slate-100 active:scale-95"
                onClick={() => onToggle(active === id ? null : id)}
                aria-label={label}
              >
                <Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>
    </div>
  );
}
