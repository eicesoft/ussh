import { useState } from 'react';
import { ChevronRight, Home, Layers3, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function WorkspaceList({ workspaces, activeId, onSelect, onAdd, onDelete }) {
  const [open, setOpen] = useState(true);
  const activeWorkspace = workspaces.find(workspace => workspace.id === activeId);

  return (
    <section className="pt-2.5" aria-label="工作区">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="app-no-drag group/header mb-1 flex items-center justify-between px-1.5">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              aria-expanded={open}
              className="flex h-5 min-w-0 flex-1 items-center gap-1 text-left text-[11px] font-medium text-[#66666b] transition-colors hover:text-[#36363b] dark:text-muted-foreground dark:hover:text-foreground"
            >
              <ChevronRight className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-90')} />
              <span className="truncate">{activeWorkspace && !open ? `工作区 - ${activeWorkspace.name}` : '工作区'}</span>
            </button>
          </CollapsibleTrigger>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 rounded-md text-[#77777d] opacity-0 transition-opacity hover:bg-foreground/10 hover:text-[#36363b] focus-visible:opacity-100 group-hover/header:opacity-100 dark:text-muted-foreground dark:hover:text-foreground"
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
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div className="space-y-0.5">
            {workspaces.map(workspace => {
              const Icon = workspace.icon === 'home' ? Home : Layers3;
              return (
                <div
                  key={workspace.id}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'app-no-drag group flex h-7 w-full min-w-0 items-center gap-2 rounded-[7px] px-2.5 text-[13px] font-normal text-[#2d2d31] transition-colors hover:bg-foreground/10 dark:text-secondary-foreground',
                    workspace.id === activeId && 'bg-foreground/[0.14] font-medium text-[#242429] dark:text-accent-foreground',
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
                  {workspace.icon !== 'home' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0 rounded-md text-[#88888d] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-destructive/10 hover:text-destructive dark:text-muted-foreground dark:hover:text-destructive"
                      onClick={event => {
                        event.stopPropagation();
                        onDelete?.(workspace);
                      }}
                      aria-label={`删除工作区 ${workspace.name}`}
                      title="删除工作区"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
