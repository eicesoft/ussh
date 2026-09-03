import { useState, useEffect, useRef } from 'react';
import { Copy, FolderPlus, Link2, Terminal, Pencil, ExternalLink, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  onEditFolder,
  onDeleteFolder,
}) {
  const [rootDropping, setRootDropping] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const connectionTabs = tabs.filter(tab => tab.kind !== 'dashboard');
  const activeSessions = connectionTabs.filter(tab => tab.status === 'connected' || tab.status === 'connecting');
  const inactiveSessions = connectionTabs.filter(tab => tab.status !== 'connected' && tab.status !== 'connecting');
  const folders = nodes.filter(node => node.type === 'folder');
  const rootLinks = nodes.filter(node => node.parentId === 0 && node.type === 'ssh');
  const normalizedFilter = filterQuery.trim().toLocaleLowerCase();
  const matchesFilter = node => {
    if (!normalizedFilter) return true;
    return [node.name, node.host, node.username, node.port]
      .filter(value => value !== undefined && value !== null)
      .some(value => String(value).toLocaleLowerCase().includes(normalizedFilter));
  };
  const visibleFolders = folders
    .map(folder => {
      const folderMatches = matchesFilter(folder);
      const links = nodes.filter(
        node =>
          node.parentId === folder.id &&
          node.type === 'ssh' &&
          (!normalizedFilter || folderMatches || matchesFilter(node)),
      );
      return { folder, links };
    })
    .filter(({ folder, links }) => !normalizedFilter || matchesFilter(folder) || links.length > 0);
  const visibleRootLinks = rootLinks.filter(matchesFilter);
  const hasVisibleSavedNodes = visibleFolders.length > 0 || visibleRootLinks.length > 0;

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className="acrylic-panel flex h-full flex-col select-none text-[#2d2d31] dark:text-secondary-foreground"
        aria-label="连接管理"
        onContextMenu={event => event.preventDefault()}
      >
        <ScrollArea className="app-drag flex-1 px-2.5 pt-2.5">
          <div className="mb-1 px-1.5 text-[11px] font-medium text-[#66666b] dark:text-muted-foreground">
            连接
          </div>
          {activeSessions.length > 0 ? (
            activeSessions.map(tab => (
              <TreeNode key={tab.id} tab={tab} active={tab.id === activeId} onSelect={onSelect} />
            ))
          ) : (
            <p className="app-no-drag px-2.5 py-1 text-xs text-[#85858a] dark:text-muted-foreground">暂无活动连接</p>
          )}

          {inactiveSessions.length > 0 && (
            <>
              <div className="mb-1 mt-3 px-1.5 text-[11px] font-medium text-[#66666b] dark:text-muted-foreground">
                未连接
              </div>
              {inactiveSessions.map(tab => (
                <TreeNode key={tab.id} tab={tab} active={tab.id === activeId} onSelect={onSelect} />
              ))}
            </>
          )}

          <div className="mb-1 mt-4 flex items-center justify-between px-1.5">
            <span className="text-[11px] font-medium text-[#66666b] dark:text-muted-foreground">已保存的连接</span>
            <div className="app-no-drag flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5 rounded-md text-[#77777d] hover:bg-[#e6e6e9] hover:text-[#36363b]" onClick={onAddFolder}>
                    <FolderPlus className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">新建文件夹</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5 rounded-md text-[#77777d] hover:bg-[#e6e6e9] hover:text-[#36363b]" onClick={() => onAddLink?.(0)}>
                    <Link2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">新建链接</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="app-no-drag relative mb-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#85858a] dark:text-muted-foreground" />
            <Input
              value={filterQuery}
              onChange={event => setFilterQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape') setFilterQuery('');
              }}
              placeholder="过滤保存的连接"
              aria-label="过滤保存的连接"
              className="h-7 rounded-md border-transparent bg-[#ececef] pl-8 pr-2 text-xs shadow-none placeholder:text-[#8b8b90] focus-visible:border-ring focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-background/60"
            />
          </div>
          {nodes.length === 0 ? (
            <p className="app-no-drag px-2.5 py-1 text-xs text-[#85858a] dark:text-muted-foreground">添加常用 SSH 连接</p>
          ) : !hasVisibleSavedNodes ? (
            <p className="app-no-drag px-2.5 py-1 text-xs text-[#85858a] dark:text-muted-foreground">未找到匹配的保存连接</p>
          ) : (
            <>
              {visibleFolders.map(({ folder, links }) => (
                <TreeFolder
                  key={folder.id}
                  folder={folder}
                  onMoveNode={onMoveNode}
                  onAddLink={onAddLink}
                  onEdit={onEditFolder}
                  onDelete={onDeleteFolder}
                  emptyHint="拖入连接"
                >
                  {links.map(node => (
                    <SavedRootNode
                      key={node.id}
                      node={node}
                      color={folder.color}
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
                {visibleRootLinks.map(node => (
                  <SavedRootNode
                    key={node.id}
                    node={node}
                    onOpen={onOpenSaved}
                    onEdit={onEditSaved}
                    onClone={onCloneSaved}
                    onDelete={onDeleteSaved}
                  />
                ))}
                {visibleRootLinks.length === 0 && (
                  <div className="h-7" aria-label="可拖放区域" />
                )}
              </div>
            </>
          )}
        </ScrollArea>

      </aside>
    </TooltipProvider>
  );
}

function SavedRootNode({ node, color, onOpen, onEdit, onClone, onDelete }) {
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
        className="app-no-drag group relative flex h-7 cursor-grab items-center gap-2 rounded-[7px] px-2.5 text-[13px] font-normal text-[#2d2d31] transition-colors hover:bg-[#e8e8eb] active:cursor-grabbing dark:text-secondary-foreground dark:hover:bg-accent"
        title="双击连接"
      >
        <Terminal
          className="h-3.5 w-3.5 shrink-0"
          style={color ? { color } : undefined}
          strokeWidth={1.8}
        />
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
          className="app-no-drag min-w-[9rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
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
