import { Terminal, FileText, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const items = [
  ['commands', '快捷命令', Terminal],
  ['files', '文件传输', FileText],
  ['settings', '会话设置', Settings],
];

export function UtilityRail({ active, onToggle }) {
  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className="flex h-full w-10 flex-col items-center gap-1.5 border-l border-border bg-secondary py-2"
        aria-label="终端工具"
      >
        {items.map(([id, label, Icon]) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <Button
                variant={active === id ? 'default' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => onToggle(active === id ? null : id)}
                aria-label={label}
              >
                <Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">{label}</TooltipContent>
          </Tooltip>
        ))}
      </aside>
    </TooltipProvider>
  );
}