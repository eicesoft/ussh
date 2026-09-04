import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Folder, FolderOpen, FolderPlus, Link2, Pencil, Trash2 } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function TreeFolder({ folder, children, emptyHint, onMoveNode, onReorderNode, canReorderNode, sortable = true, onAddFolder, onAddLink, onEdit, onDelete }) {
  const [open, setOpen] = useState(true);
  const [dropping, setDropping] = useState(false);
  const [dropPosition, setDropPosition] = useState(null);
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0 });
  const menuRef = useRef(null);
  const isEmpty = !children || (Array.isArray(children) && children.length === 0);

  useEffect(() => {
    if (!contextMenu.open) return undefined;
    const close = () => setContextMenu(prev => ({ ...prev, open: false }));
    const handler = event => {
      if (menuRef.current && !menuRef.current.contains(event.target)) close();
    };
    const id = setTimeout(() => {
      document.addEventListener('mousedown', handler);
      document.addEventListener('contextmenu', close);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('contextmenu', close);
    };
  }, [contextMenu.open]);

  useEffect(() => {
    const clearDropState = () => {
      setDropping(false);
      setDropPosition(null);
    };
    document.addEventListener('dragend', clearDropState);
    return () => document.removeEventListener('dragend', clearDropState);
  }, []);

  const closeMenu = () => setContextMenu({ open: false, x: 0, y: 0 });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        onDragOver={event => {
          if (!onMoveNode) return;
          event.preventDefault();
          event.stopPropagation();
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
          event.stopPropagation();
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
            draggable={Boolean(onMoveNode)}
            className="app-no-drag relative h-7 w-full justify-start gap-1.5 rounded-[7px] px-2.5 text-[13px] font-normal text-[#3c3c41] hover:bg-[#e8e8eb] hover:text-[#242429] dark:text-foreground dark:hover:bg-accent dark:hover:text-foreground"
            onDragStart={event => {
              event.dataTransfer.setData('application/x-ussh-node', String(folder.id));
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={event => {
              if (!sortable || !onReorderNode) return;
              const dragId = Number(event.dataTransfer.getData('application/x-ussh-node'));
              if (!dragId || dragId === folder.id) return;
              if (canReorderNode && !canReorderNode(dragId, folder.id)) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const relativeY = (event.clientY - rect.top) / rect.height;
              if (relativeY > 0.25 && relativeY < 0.75) {
                setDropPosition(null);
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = 'move';
              setDropPosition(relativeY <= 0.5 ? 'before' : 'after');
            }}
            onDragLeave={event => {
              if (!event.currentTarget.contains(event.relatedTarget)) setDropPosition(null);
            }}
            onDrop={event => {
              if (!sortable || !onReorderNode) return;
              const dragId = Number(event.dataTransfer.getData('application/x-ussh-node'));
              if (!dragId || dragId === folder.id) return;
              if (canReorderNode && !canReorderNode(dragId, folder.id)) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const relativeY = (event.clientY - rect.top) / rect.height;
              if (relativeY > 0.25 && relativeY < 0.75) return;
              const handled = onReorderNode(dragId, folder.id, dropPosition || 'after');
              if (!handled) return;
              event.preventDefault();
              event.stopPropagation();
              setDropPosition(null);
            }}
            onContextMenu={event => {
              event.preventDefault();
              event.stopPropagation();
              setContextMenu({ open: true, x: event.clientX, y: event.clientY });
            }}
          >
            {dropPosition === 'before' && <span className="pointer-events-none absolute inset-x-1 top-0 h-0.5 rounded-full bg-primary" />}
            {dropPosition === 'after' && <span className="pointer-events-none absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-primary" />}
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-[#85858a] transition-transform duration-200 dark:text-muted-foreground',
                open && 'rotate-90',
              )}
            />
            {open ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#7b7b81] dark:text-muted-foreground" strokeWidth={1.7} />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-[#7b7b81] dark:text-muted-foreground" strokeWidth={1.7} />
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
      {contextMenu.open && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 50 }}
          className="app-no-drag min-w-[9rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={() => { closeMenu(); onAddLink?.(folder.id); }}
          >
            <Link2 className="h-3.5 w-3.5" />
            新建连接
          </button>
          {onAddFolder && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
              onClick={() => { closeMenu(); onAddFolder(folder.id); }}
            >
              <FolderPlus className="h-3.5 w-3.5" />
              新建子目录
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={() => { closeMenu(); onEdit?.(folder); }}
          >
            <Pencil className="h-3.5 w-3.5" />
            编辑
          </button>
          <div className="-mx-1 my-1 h-px bg-muted" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive outline-none hover:bg-destructive/10 hover:text-destructive"
            onClick={() => { closeMenu(); onDelete?.(folder); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </button>
        </div>,
        document.body,
      )}
    </Collapsible>
  );
}
