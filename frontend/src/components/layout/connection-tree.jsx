import { useState, useEffect, useRef } from 'react';
import { Copy, FolderPlus, Link2, Terminal, Pencil, ExternalLink, Trash2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { TreeNode } from './tree-node';
import { TreeFolder } from './tree-folder';

export function ConnectionTree({
  tabs,
  activeId,
  nodes,
  onSelect,
  onOpenSaved,
  onAddFolder,
  onAddLink,
  onMoveNode,
  onEditSaved,
  onCloneSaved,
  onDeleteSaved,
  onOpenSettings,
}) {
  const [rootDropping, setRootDropping] = useState(false);
  const connectionTabs = tabs.filter(tab => tab.kind !== 'dashboard');
  const activeSessions = connectionTabs.filter(tab => tab.status === 'connected' || tab.status === 'connecting');
  const inactiveSessions = connectionTabs.filter(tab => tab.status !== 'connected' && tab.status !== 'connecting');
  const folders = nodes.filter(node => node.type === 'folder');
  const rootLinks = nodes.filter(node => node.parentId === 0 && node.type === 'ssh');

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className="flex h-full flex-col select-none border-r border-border bg-secondary text-secondary-foreground"
        aria-label="连接管理"
      >
        <div className="flex items-center gap-2 px-3 py-3 text-sm font-semibold tracking-tight">
          <span className="font-mono text-muted-foreground">{'>_'}</span>
          <span>uSSH</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-6 w-6"
                onClick={onOpenSettings}
                aria-label="软件设置"
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">软件设置</TooltipContent>
          </Tooltip>
        </div>

        <ScrollArea className="mt-3 flex-1 px-3">
          <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            连接
          </div>
          {activeSessions.length > 0 ? (
            activeSessions.map(tab => (
              <TreeNode key={tab.id} tab={tab} active={tab.id === activeId} onSelect={onSelect} />
            ))
          ) : (
            <p className="px-2 py-1 text-xs text-muted-foreground">暂无活动连接</p>
          )}

          {inactiveSessions.length > 0 && (
            <>
              <div className="mb-1 mt-3 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                未连接
              </div>
              {inactiveSessions.map(tab => (
                <TreeNode key={tab.id} tab={tab} active={tab.id === activeId} onSelect={onSelect} />
              ))}
            </>
          )}

          <div className="mb-1 mt-3 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">本地</span>
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onAddFolder}>
                    <FolderPlus className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">新建文件夹</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onAddLink}>
                    <Link2 className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">新建链接</TooltipContent>
              </Tooltip>
            </div>
          </div>
          {nodes.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">添加常用 SSH 连接</p>
          ) : (
            <>
              {folders.map(folder => (
                <TreeFolder
                  key={folder.id}
                  folder={folder}
                  onMoveNode={onMoveNode}
                  emptyHint="拖入连接"
                >
                  {nodes
                    .filter(node => node.parentId === folder.id && node.type === 'ssh')
                    .map(node => (
                      <SavedRootNode
                        key={node.id}
                        node={node}
                        onOpen={onOpenSaved}
                        onEdit={onEditSaved}
                        onClone={onCloneSaved}
                        onDelete={onDeleteSaved}
                      />
                    ))}
                </TreeFolder>
              ))}
              <div
                onDragOver={event => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  if (!rootDropping) setRootDropping(true);
                }}
                onDragLeave={event => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setRootDropping(false);
                  }
                }}
                onDrop={event => {
                  event.preventDefault();
                  setRootDropping(false);
                  const dragId = Number(event.dataTransfer.getData('application/x-ussh-node'));
                  if (!dragId) return;
                  onMoveNode?.(dragId, 0);
                }}
                className={cn(
                  'rounded-md transition-colors',
                  rootDropping && 'bg-primary/15 ring-1 ring-primary/50',
                )}
              >
                {rootLinks.map(node => (
                  <SavedRootNode
                    key={node.id}
                    node={node}
                    onOpen={onOpenSaved}
                    onEdit={onEditSaved}
                    onClone={onCloneSaved}
                    onDelete={onDeleteSaved}
                  />
                ))}
                {rootLinks.length === 0 && (
                  <div className="h-7" aria-label="可拖放区域" />
                )}
              </div>
            </>
          )}
        </ScrollArea>

        <Separator />
        <div className="flex h-7 items-center gap-2 px-3 text-xs text-muted-foreground">
          <span
            className={
              'h-2 w-2 shrink-0 rounded-full ' +
              (activeSessions.length ? 'bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]' : 'bg-muted-foreground')
            }
          />
          {activeSessions.length} 个活动会话
        </div>
      </aside>
    </TooltipProvider>
  );
}

function SavedRootNode({ node, onOpen, onEdit, onClone, onDelete }) {
  const showEdit = Boolean(onEdit || onDelete);
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0 });
  const menuRef = useRef(null);

  useEffect(() => {
    if (!contextMenu.open) return;
    const close = () => setContextMenu(prev => ({ ...prev, open: false }));
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) close();
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

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        draggable
        onDragStart={event => {
          event.dataTransfer.setData('application/x-ussh-node', String(node.id));
          event.dataTransfer.effectAllowed = 'move';
        }}
        onDoubleClick={() => onOpen(node)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen(node);
          }
        }}
        onContextMenu={event => {
          event.preventDefault();
          setContextMenu({ open: true, x: event.clientX, y: event.clientY });
        }}
        className="group relative flex h-7 cursor-grab items-center gap-2 rounded-md px-2 text-xs font-normal text-secondary-foreground hover:bg-accent active:cursor-grabbing"
        title="双击连接"
      >
        <Terminal className="h-3.5 w-3.5 shrink-0 text-primary/70" />
        <span className="truncate">{node.name}</span>
        {showEdit && (
          <span className="ml-auto flex items-center pr-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-6"
              onClick={event => {
                event.stopPropagation();
                event.preventDefault();
                onEdit(node);
              }}
              aria-label="编辑连接"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </span>
        )}
      </div>
      {contextMenu.open && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 50 }}
          className="min-w-[9rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
        >
          <div
            role="menuitem"
            tabIndex={0}
            className="flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={() => { setContextMenu({ open: false, x: 0, y: 0 }); onOpen(node); }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            打开
          </div>
          {onEdit && (
            <div
              role="menuitem"
              tabIndex={0}
              className="flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
              onClick={() => { setContextMenu({ open: false, x: 0, y: 0 }); onEdit(node); }}
            >
              <Pencil className="h-3.5 w-3.5" />
              编辑
            </div>
          )}
          {onClone && (
            <div
              role="menuitem"
              tabIndex={0}
              className="flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
              onClick={() => { setContextMenu({ open: false, x: 0, y: 0 }); onClone(node); }}
            >
              <Copy className="h-3.5 w-3.5" />
              克隆
            </div>
          )}
          {onDelete && (
            <>
              <div className="-mx-1 my-1 h-px bg-muted" />
              <div
                role="menuitem"
                tabIndex={0}
                className="flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive outline-none hover:bg-destructive/10 hover:text-destructive"
                onClick={() => { setContextMenu({ open: false, x: 0, y: 0 }); onDelete(node); }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
