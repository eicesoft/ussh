import { useState } from 'react';
import { Plus, FolderPlus, Link2, Terminal, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { TreeNode } from './tree-node';
import { TreeFolder } from './tree-folder';
import { EditLinkMenu } from '@/components/connection/edit-link-menu';

export function ConnectionTree({
  tabs,
  activeId,
  nodes,
  onSelect,
  onNew,
  onOpenSaved,
  onAddFolder,
  onAddLink,
  onMoveNode,
  onEditSaved,
  onDeleteSaved,
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
        </div>

        <div className="flex gap-1.5 px-2">
          <Button variant="outline" size="sm" className="flex-1 justify-start text-xs" onClick={onNew}>
            <Plus className="h-3.5 w-3.5" />
            临时连接
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={onAddFolder}>
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">新建文件夹</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={onAddLink}>
                <Link2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">新增连接</TooltipContent>
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

          <div className="mb-1 mt-3 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            已保存
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
                    onDelete={onDeleteSaved}
                  />
                ))}
                {rootLinks.length === 0 && (
                  <p className="px-2 py-1 text-[11px] italic text-muted-foreground">拖入此处移至根目录</p>
                )}
              </div>
            </>
          )}
        </ScrollArea>

        <Separator />
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
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

function SavedRootNode({ node, onOpen, onEdit, onDelete }) {
  const showEdit = Boolean(onEdit || onDelete);

  return (
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
        onEdit && onEdit(node, event.currentTarget);
      }}
      className="group relative flex h-7 cursor-grab items-center gap-2 rounded-md px-2 text-xs font-normal text-secondary-foreground hover:bg-accent active:cursor-grabbing"
      title="双击连接"
    >
      <Terminal className="h-3.5 w-3.5 shrink-0 text-primary/70" />
      <span className="truncate">{node.name}</span>
      {showEdit && (
        <span className="ml-auto flex items-center pr-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <EditLinkMenu
            node={node}
            onOpen={onOpen}
            onEdit={onEdit}
            onDelete={onDelete}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-6"
                onClick={event => {
                  event.stopPropagation();
                  event.preventDefault();
                }}
                aria-label="编辑连接"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            }
          />
        </span>
      )}
    </div>
  );
}
