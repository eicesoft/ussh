import { useState } from 'react';
import { ChevronRight, Folder, FolderOpen } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function TreeFolder({ folder, children, emptyHint, onMoveNode }) {
  const [open, setOpen] = useState(true);
  const [dropping, setDropping] = useState(false);
  const isEmpty = !children || (Array.isArray(children) && children.length === 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        onDragOver={event => {
          if (!onMoveNode) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          if (!dropping) setDropping(true);
        }}
        onDragLeave={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setDropping(false);
          }
        }}
        onDrop={event => {
          event.preventDefault();
          setDropping(false);
          const dragId = Number(event.dataTransfer.getData('application/x-ussh-node'));
          if (!dragId || dragId === folder.id) return;
          onMoveNode?.(dragId, folder.id);
        }}
        className={cn(
          'app-no-drag rounded-[7px] transition-colors',
          dropping && 'bg-primary/15 ring-1 ring-primary/50',
        )}
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="app-no-drag h-7 w-full justify-start gap-1.5 rounded-[7px] px-2.5 text-[13px] font-normal text-[#3c3c41] hover:bg-[#e8e8eb] hover:text-[#242429] dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-secondary-foreground"
          >
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-[#85858a] transition-transform duration-200',
                open && 'rotate-90',
              )}
            />
            {open ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#7b7b81]" strokeWidth={1.7} />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-[#7b7b81]" strokeWidth={1.7} />
            )}
            <span className="truncate">{folder.name}</span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div className="space-y-0.5 pl-4 pt-0.5">
            {children}
            {isEmpty && emptyHint && (
              <p className="px-2 pl-6 text-[11px] italic text-[#85858a] dark:text-muted-foreground">{emptyHint}</p>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
