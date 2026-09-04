import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CirclePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  ListTree,
  Pencil,
  Play,
  Plus,
  TerminalSquare,
  Trash2,
} from 'lucide-react';
import { registerPlugin } from '../registry';
import { usePluginContext } from '../context';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'ussh-quick-commands';
const TREE_INDENT = 16;
const FOLDER_CONTENT_OFFSET = 28;

function createId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyStore() {
  return { version: 2, folders: [], commands: [] };
}

function readStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    // 兼容旧版：旧格式是 string[]，统一迁移到根目录下的命令。
    if (Array.isArray(saved)) {
      return {
        ...emptyStore(),
        commands: saved
          .filter(item => typeof item === 'string' && item.trim())
          .map(content => ({ id: createId('command'), folderId: null, name: '', content })),
      };
    }
    if (!saved || typeof saved !== 'object') return emptyStore();
    return {
      ...emptyStore(),
      folders: Array.isArray(saved.folders)
        ? saved.folders
          .filter(folder => folder && folder.id != null && typeof folder.name === 'string')
          .map(folder => ({
            id: String(folder.id),
            parentId: folder.parentId == null ? null : String(folder.parentId),
            name: folder.name.trim() || '未命名目录',
          }))
        : [],
      commands: Array.isArray(saved.commands)
        ? saved.commands
          .filter(command => command && command.id != null && typeof command.content === 'string')
          .map(command => ({
            id: String(command.id),
            folderId: command.folderId == null ? null : String(command.folderId),
            name: typeof command.name === 'string' ? command.name : '',
            content: command.content,
          }))
        : [],
    };
  } catch {
    return emptyStore();
  }
}

function commandTitle(command) {
  const name = command.name.trim();
  if (name) return name;
  return command.content.replace(/\s+/g, ' ').trim() || '未命名命令';
}

function CommandItem({ command, connected, onRun, onEdit, onDelete }) {
  const title = commandTitle(command);

  return (
    <div className="group flex min-w-0 items-center gap-1 rounded-lg px-1 py-0.5 transition-colors hover:bg-accent/70">
      <TerminalSquare className="h-3.5 w-3.5 shrink-0 text-primary/80" />
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
        onClick={() => onEdit(command)}
        title={title}
      >
        <span className={cn('block truncate text-[11px] font-medium', !command.name.trim() && 'font-mono')}>{title}</span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-primary hover:bg-primary/10 hover:text-primary"
        onClick={() => onRun(command.content)}
        disabled={!connected}
        title={connected ? '执行命令' : '连接终端后可执行'}
        aria-label={`执行 ${commandTitle(command)}`}
      >
        <Play className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={() => onDelete(command)}
        title="删除命令"
        aria-label={`删除 ${commandTitle(command)}`}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

function FolderNode({
  folder,
  depth,
  folders,
  commands,
  expanded,
  selectedFolderId,
  onToggle,
  onSelect,
  onAddFolder,
  onAddCommand,
  onEdit,
  onDelete,
  onRun,
  connected,
}) {
  const childFolders = folders.filter(item => item.parentId === folder.id);
  const childCommands = commands.filter(item => item.folderId === folder.id);
  const isOpen = expanded.has(folder.id);

  return (
    <div>
      <div
        className={cn(
          'group flex min-w-0 items-center gap-1 rounded-lg px-1 py-0.5 transition-colors',
          selectedFolderId === folder.id ? 'bg-primary/10 text-primary' : 'hover:bg-accent/70',
        )}
        style={{ marginLeft: `${Math.min(depth, 8) * TREE_INDENT}px` }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => onToggle(folder.id)}
          aria-label={isOpen ? `折叠 ${folder.name}` : `展开 ${folder.name}`}
        >
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </Button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
          onClick={() => onSelect(folder.id)}
          title={folder.name}
        >
          {isOpen ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
          <span className="truncate text-[11px] font-medium">{folder.name}</span>
          <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 text-[9px] text-muted-foreground">
            {childCommands.length}
          </span>
        </button>
        <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onAddFolder(folder.id)} title="新建子目录">
            <FolderPlus className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(folder)} title="编辑目录">
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => onDelete(folder)} title="删除目录">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="space-y-0.5">
          {childCommands.map(command => (
            <div key={command.id} style={{ marginLeft: `${(Math.min(depth, 8) + 1) * TREE_INDENT + FOLDER_CONTENT_OFFSET}px` }}>
              <CommandItem command={command} connected={connected} onRun={onRun} onEdit={onAddCommand} onDelete={onDelete} />
            </div>
          ))}
          {childFolders.map(child => (
            <FolderNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              folders={folders}
              commands={commands}
              expanded={expanded}
              selectedFolderId={selectedFolderId}
              onToggle={onToggle}
              onSelect={onSelect}
              onAddFolder={onAddFolder}
              onAddCommand={onAddCommand}
              onEdit={onEdit}
              onDelete={onDelete}
              onRun={onRun}
              connected={connected}
            />
          ))}
          {childCommands.length === 0 && childFolders.length === 0 && (
            <button
              type="button"
              className="ml-9 rounded px-2 py-1 text-[10px] italic text-muted-foreground hover:text-foreground"
              onClick={() => onAddCommand(null, folder.id)}
            >
              目录为空，添加第一条命令
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function QuickCommands() {
  const { activeTab, sendInput } = usePluginContext();
  const [store, setStore] = useState(readStore);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [commandDialog, setCommandDialog] = useState(null);
  const [folderDialog, setFolderDialog] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [commandForm, setCommandForm] = useState({ name: '', content: '' });
  const [folderName, setFolderName] = useState('');

  const connected = activeTab?.status === 'connected';
  const folderMap = useMemo(() => new Map(store.folders.map(folder => [folder.id, folder])), [store.folders]);
  const selectedFolder = selectedFolderId ? folderMap.get(selectedFolderId) : null;
  const rootCommands = store.commands.filter(command => command.folderId === null);
  const rootFolders = store.folders.filter(folder => folder.parentId === null);

  const persist = next => {
    setStore(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const toggleFolder = id => {
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const revealFolder = id => {
    if (!id) return;
    setExpanded(previous => new Set([...previous, id]));
    setSelectedFolderId(id);
  };

  const openCommandDialog = (command = null, folderId = selectedFolderId) => {
    setCommandForm({ name: command?.name || '', content: command?.content || '' });
    setCommandDialog({ command, folderId: command?.folderId ?? folderId ?? null });
  };

  const openFolderDialog = (folder = null, parentId = selectedFolderId) => {
    setFolderName(folder?.name || '');
    setFolderDialog({ folder, parentId: folder?.parentId ?? parentId ?? null });
  };

  useEffect(() => {
    const handleNewFolder = () => openFolderDialog();
    const handleNewCommand = () => openCommandDialog();
    window.addEventListener('quick-commands-new-folder', handleNewFolder);
    window.addEventListener('quick-commands-new-command', handleNewCommand);
    return () => {
      window.removeEventListener('quick-commands-new-folder', handleNewFolder);
      window.removeEventListener('quick-commands-new-command', handleNewCommand);
    };
  }, [selectedFolderId]);

  const saveCommand = event => {
    event.preventDefault();
    const content = commandForm.content.trim();
    if (!content) return;
    const { command, folderId } = commandDialog;
    const nextCommands = command
      ? store.commands.map(item => item.id === command.id ? { ...item, ...commandForm, content } : item)
      : [...store.commands, { id: createId('command'), folderId: folderId || null, ...commandForm, content }];
    persist({ ...store, commands: nextCommands });
    if (folderId) revealFolder(folderId);
    setCommandDialog(null);
  };

  const saveFolder = event => {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) return;
    const { folder, parentId } = folderDialog;
    const nextFolders = folder
      ? store.folders.map(item => item.id === folder.id ? { ...item, name } : item)
      : [...store.folders, { id: createId('folder'), parentId: parentId || null, name }];
    persist({ ...store, folders: nextFolders });
    if (parentId) revealFolder(parentId);
    setFolderDialog(null);
  };

  const requestDelete = item => {
    setDeleteDialog(item);
  };

  const confirmDelete = () => {
    const item = deleteDialog;
    if (!item) return;
    setDeleteDialog(null);
    if (item.content !== undefined) {
      persist({ ...store, commands: store.commands.filter(command => command.id !== item.id) });
      return;
    }
    const descendants = new Set([item.id]);
    let changed = true;
    while (changed) {
      changed = false;
      store.folders.forEach(folder => {
        if (descendants.has(folder.parentId) && !descendants.has(folder.id)) {
          descendants.add(folder.id);
          changed = true;
        }
      });
    }
    persist({
      ...store,
      folders: store.folders.filter(folder => !descendants.has(folder.id)),
      commands: store.commands.filter(command => !descendants.has(command.folderId)),
    });
    if (descendants.has(selectedFolderId)) setSelectedFolderId(null);
  };

  const run = content => {
    if (!connected) return;
    sendInput(activeTab.id, `${content.replace(/\r?\n/g, '\r')}\r`);
  };

  const selectedPath = [];
  let cursor = selectedFolder;
  const visitedFolders = new Set();
  while (cursor && !visitedFolders.has(cursor.id)) {
    visitedFolders.add(cursor.id);
    selectedPath.unshift(cursor.name);
    cursor = folderMap.get(cursor.parentId);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background/20">
      <div className="shrink-0 px-3 pb-2.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <ListTree className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold">命令工作区</span>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">{store.commands.length} 条</span>
            </div>
            <p className="mt-1 truncate text-[10px] text-muted-foreground">
              {selectedPath.length ? selectedPath.join(' / ') : '根目录'}
            </p>
          </div>
          <span className={cn('mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[9px]', connected ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>
            {connected ? '已连接' : '未连接'}
          </span>
        </div>
      </div>

      <ScrollArea className="quick-commands-scroll min-h-0 flex-1">
        <div className="space-y-3 p-2.5">
          <section>
            <div className="mb-1 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>目录</span>
              <span>{store.folders.length}</span>
            </div>
            <div className="space-y-0.5">
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                  selectedFolderId === null ? 'bg-primary/10 text-primary' : 'hover:bg-accent/70',
                )}
                onClick={() => setSelectedFolderId(null)}
              >
                <Home className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[11px] font-medium">根目录</span>
                <span className="ml-auto rounded-full bg-muted px-1.5 text-[9px] text-muted-foreground">{rootCommands.length}</span>
              </button>
              {rootFolders.map(folder => (
                <FolderNode
                  key={folder.id}
                  folder={folder}
                  depth={0}
                  folders={store.folders}
                  commands={store.commands}
                  expanded={expanded}
                  selectedFolderId={selectedFolderId}
                  onToggle={toggleFolder}
                  onSelect={setSelectedFolderId}
                  onAddFolder={parentId => openFolderDialog(null, parentId)}
                  onAddCommand={openCommandDialog}
                  onEdit={item => item.content !== undefined ? openCommandDialog(item) : openFolderDialog(item)}
                  onDelete={requestDelete}
                  onRun={run}
                  connected={connected}
                />
              ))}
              {rootCommands.map(command => (
                <div key={command.id} style={{ marginLeft: `${FOLDER_CONTENT_OFFSET}px` }}>
                  <CommandItem command={command} connected={connected} onRun={run} onEdit={openCommandDialog} onDelete={requestDelete} />
                </div>
              ))}
            </div>
          </section>

          {store.commands.length === 0 && store.folders.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-7 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CirclePlus className="h-5 w-5" />
              </div>
              <p className="mt-3 text-xs font-medium">建立你的命令库</p>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">用目录整理常用命令，名称可以留空，直接显示命令内容。</p>
              <Button size="sm" className="mt-3 h-7 text-[10px]" onClick={() => openCommandDialog(null, null)}>
                添加第一条命令
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog open={Boolean(commandDialog)} onOpenChange={open => { if (!open) setCommandDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{commandDialog?.command ? '编辑快捷命令' : '新建快捷命令'}</DialogTitle>
            <DialogDescription>
              {commandDialog?.folderId ? `保存到：${folderMap.get(commandDialog.folderId)?.name || '当前目录'}` : '保存到根目录'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveCommand} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="quick-command-name">名称（可选）</Label>
              <Input
                id="quick-command-name"
                value={commandForm.name}
                onChange={event => setCommandForm(previous => ({ ...previous, name: event.target.value }))}
                placeholder="例如：查看容器状态"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-command-content">命令内容</Label>
              <Textarea
                id="quick-command-content"
                value={commandForm.content}
                onChange={event => setCommandForm(previous => ({ ...previous, content: event.target.value }))}
                placeholder={'docker ps\n# 支持多行命令'}
                rows={7}
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">支持多行 shell 命令，执行时会一次性发送到当前终端。</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCommandDialog(null)}>取消</Button>
              <Button type="submit" disabled={!commandForm.content.trim()}>保存命令</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(folderDialog)} onOpenChange={open => { if (!open) setFolderDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{folderDialog?.folder ? '编辑目录' : '新建目录'}</DialogTitle>
            <DialogDescription>
              {folderDialog?.parentId ? `将在“${folderMap.get(folderDialog.parentId)?.name || '当前目录'}”下创建子目录` : '创建在根目录'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveFolder} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="quick-command-folder-name">目录名称</Label>
              <Input
                id="quick-command-folder-name"
                value={folderName}
                onChange={event => setFolderName(event.target.value)}
                placeholder="例如：Docker / 日常运维"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFolderDialog(null)}>取消</Button>
              <Button type="submit" disabled={!folderName.trim()}>保存目录</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteDialog)} onOpenChange={open => { if (!open) setDeleteDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{deleteDialog?.content !== undefined ? '删除快捷命令' : '删除目录'}</DialogTitle>
            <DialogDescription>
              {deleteDialog?.content !== undefined
                ? `确定删除“${deleteDialog ? commandTitle(deleteDialog) : ''}”吗？`
                : `“${deleteDialog?.name || ''}”及其中的所有子目录和命令都会被删除。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialog(null)}>取消</Button>
            <Button type="button" variant="destructive" onClick={confirmDelete}>确认删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

registerPlugin({
  id: 'commands',
  type: 'tool',
  title: '快捷命令',
  icon: ListTree,
  component: QuickCommands,
});
