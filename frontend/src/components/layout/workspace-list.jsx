import { Home, Layers3, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function WorkspaceList({ workspaces, activeId, onSelect, onAdd, onDelete }) {
  return (
    <section className="pt-2.5" aria-label="工作区">
      <div className="mb-1 flex items-center justify-between px-1.5">
        <span className="text-[11px] font-medium text-[#66666b] dark:text-muted-foreground">工作区</span>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 rounded-md text-[#77777d] hover:bg-[#e6e6e9] hover:text-[#36363b]"
                onClick={onAdd}
                aria-label="新建工作区"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">新建工作区</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="space-y-0.5">
        {workspaces.map(workspace => {
          const Icon = workspace.icon === 'home' ? Home : Layers3;
          return (
            <div
              key={workspace.id}
              role="button"
              tabIndex={0}
              className={cn(
                'app-no-drag group flex h-7 w-full min-w-0 items-center gap-2 rounded-[7px] px-2.5 text-[13px] font-normal text-[#2d2d31] transition-colors hover:bg-[#e8e8eb] dark:text-secondary-foreground dark:hover:bg-accent',
                workspace.id === activeId && 'bg-[#dfdfe3] font-medium text-[#242429] dark:bg-accent dark:text-accent-foreground',
              )}
              onClick={() => onSelect(workspace.id)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(workspace.id);
                }
              }}
              title={workspace.name}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0 rounded-md text-[#88888d] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                onClick={event => {
                  event.stopPropagation();
                  onDelete?.(workspace);
                }}
                disabled={workspaces.length <= 1}
                aria-label={`删除工作区 ${workspace.name}`}
                title={workspaces.length <= 1 ? '至少保留一个工作区' : '删除工作区'}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
