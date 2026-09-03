import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Folder, File, Home, ArrowLeft, RefreshCw,
  Copy, Download, Edit3, Trash2, FileUp, FolderUp, X,
} from 'lucide-react';
import { registerPlugin } from '../registry';
import { usePluginContext } from '../context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from '@/components/ui/tooltip';

function formatSize(size) {
  if (size === undefined || size === null) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let s = size;
  while (s >= 1024 && i < units.length - 1) { s /= 1024; i++; }
  return i === 0 ? `${s} ${units[i]}` : `${s.toFixed(1)} ${units[i]}`;
}

function formatTime(t) {
  if (!t) return '-';
  const d = new Date(t);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function joinRemotePath(...parts) {
  const joined = parts
    .filter(part => part !== undefined && part !== null && part !== '')
    .join('/')
    .replace(/\/+/g, '/');
  return joined.startsWith('/') ? joined : `/${joined}`;
}

function normalizeRemotePath(value) {
  const path = String(value || '').trim().replace(/\/+/g, '/');
  if (!path || path === '/') return '/';
  return `/${path.replace(/^\/+|\/+$/g, '')}`;
}

function isMissingRemotePath(error) {
  const message = String(error).toLowerCase();
  return message.includes('no such file')
    || message.includes('file does not exist')
    || message.includes('not exist')
    || message.includes('不存在')
    || message.includes('找不到');
}

const COLUMNS = [
  { label: '名称', width: 'minmax(0, 1fr)', key: 'name', render: (e) => e.name },
  { label: '大小', width: 'minmax(0, 0.55fr)', key: 'size', align: 'right', render: (e) => e.isDir ? '-' : formatSize(e.size) },
  { label: '修改时间', width: 'minmax(0, 1.1fr)', key: 'modTime', render: (e) => formatTime(e.modTime) },
  { label: '权限', width: 'minmax(0, 0.65fr)', key: 'mode', render: (e) => (e.mode || '').slice(1) || '-' },
];

function RenameDialog({ open, defaultName, onConfirm, onClose }) {
  const [name, setName] = useState(defaultName || '');

  useEffect(() => {
    if (open) setName(defaultName || '');
  }, [open, defaultName]);

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === defaultName) { onClose(); return; }
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm" overlayClassName="bg-black/40">
        <DialogHeader>
          <DialogTitle className="text-sm">重命名</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
        />
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={handleConfirm}>确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog({ open, message, onConfirm, onClose }) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm" overlayClassName="bg-black/40">
        <DialogHeader>
          <DialogTitle className="text-sm">确认</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground">{message}</div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadProgressPanel({ task, onClose }) {
  if (!task) return null;

  const progress = task.total > 0 ? Math.round((task.completed / task.total) * 100) : 0;
  const statusLabel = task.status === 'uploading'
    ? `${task.completed}/${task.total} 个文件处理中`
    : task.status === 'completed'
      ? '上传完成'
      : task.status === 'cancelled'
        ? '上传已取消'
        : '上传失败';

  return (
    <div className="shrink-0 border-t border-border bg-background/80 px-3 py-2 text-[10px]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate font-medium">上传进度 · {statusLabel}</div>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={onClose}
          title="关闭进度查看"
          aria-label="关闭进度查看"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full bg-primary transition-[width] duration-200',
            task.status === 'failed' && 'bg-destructive',
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-muted-foreground">
        <span className="min-w-0 truncate">
          {task.currentName ? `${task.currentAction}：${task.currentName}` : '等待上传'}
        </span>
        <span className="shrink-0">
          {task.uploaded} 个已上传 · {task.skipped} 个已跳过 · {formatSize(task.uploadedBytes)} / {formatSize(task.totalBytes)}
        </span>
      </div>
      {task.error && <div className="mt-1 truncate text-red-500">{task.error}</div>}
    </div>
  );
}

function UploadConflictDialog({ conflict, onChoice }) {
  return (
    <Dialog open={conflict !== null} onOpenChange={open => { if (!open) onChoice('cancel'); }}>
      <DialogContent className="max-w-sm" overlayClassName="bg-black/40">
        <DialogHeader>
          <DialogTitle className="text-sm">发现同名文件</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 text-xs text-muted-foreground">
          <div>远程目录中已存在：</div>
          <div className="break-all font-mono text-foreground">{conflict?.remotePath}</div>
          <div>请选择如何处理这个文件。</div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onChoice('cancel')}>取消上传</Button>
          <Button variant="outline" size="sm" onClick={() => onChoice('skip')}>跳过</Button>
          <Button size="sm" onClick={() => onChoice('overwrite')}>覆盖</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContextMenu({ items, pos, onClose }) {
  const ref = useRef(null);
  const [safePos, setSafePos] = useState(pos);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;

    const margin = 8;
    const maxX = Math.max(margin, window.innerWidth - menu.offsetWidth - margin);
    const maxY = Math.max(margin, window.innerHeight - menu.offsetHeight - margin);
    setSafePos({
      x: Math.max(margin, Math.min(pos.x, maxX)),
      y: Math.max(margin, Math.min(pos.y, maxY)),
    });
  }, [pos.x, pos.y, items.length]);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-[140px] rounded-md border bg-popover p-1 text-xs text-popover-foreground shadow-md"
      style={{ left: safePos.x, top: safePos.y }}
    >
      {items.map((item, i) =>
        item.sep ? (
          <div key={i} className="-mx-1 my-1 h-px bg-muted" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={cn(
              'flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left outline-none transition-colors hover:bg-accent hover:text-accent-foreground',
              item.disabled && 'pointer-events-none opacity-50',
            )}
            onClick={() => { if (!item.disabled) { item.onSelect(); onClose(); } }}
          >
            {item.icon}
            {item.label}
          </button>
        )
      )}
    </div>,
    document.body,
  );
}

function FileBrowser() {
  const { activeTab, api } = usePluginContext();
  const [cwd, setCwd] = useState('/');
  const [pathInput, setPathInput] = useState('/');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [toast, setToast] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadTask, setUploadTask] = useState(null);
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);
  const [uploadConflict, setUploadConflict] = useState(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const conflictResolverRef = useRef(null);

  const connected = activeTab?.status === 'connected';

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }, []);

  const loadDir = useCallback(async (path) => {
    if (!connected) return { ok: false };
    setLoading(true);
    setError('');
    try {
      const list = await api.listSftp(activeTab.id, path);
      setEntries(list);
      return { ok: true };
    } catch (e) {
      setError(String(e));
      return { ok: false, error: e };
    } finally {
      setLoading(false);
    }
  }, [activeTab, api, connected]);

  useEffect(() => {
    if (activeTab?.status === 'connected') {
      setCwd('/');
      setPathInput('/');
      setSelected(null);
      setEntries([]);
      setLoading(true);
      setError('');
      api.listSftp(activeTab.id, '/').then(
        list => { setEntries(list); setLoading(false); },
        e => { setError(String(e)); setLoading(false); },
      );
    }
  }, [activeTab?.id, activeTab?.status, api]);

  const navigateTo = useCallback(async (path) => {
    const target = normalizeRemotePath(path);
    const result = await loadDir(target);
    if (!result.ok) {
      showToast(isMissingRemotePath(result.error) ? `目录不存在：${target}` : `无法打开目录：${target}`);
      return false;
    }
    setCwd(target);
    setPathInput(target);
    setSelected(null);
    return true;
  }, [loadDir, showToast]);

  const goUp = () => {
    if (cwd === '/') return;
    const parent = cwd.split('/').slice(0, -1).join('/') || '/';
    navigateTo(parent);
  };

  const refresh = () => loadDir(cwd);

  const chooseConflictAction = useCallback((action) => {
    conflictResolverRef.current?.(action);
    conflictResolverRef.current = null;
    setUploadConflict(null);
  }, []);

  const askConflictAction = useCallback((file, remotePath) => new Promise(resolve => {
    conflictResolverRef.current = resolve;
    setUploadConflict({ fileName: file.name, remotePath });
  }), []);

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!connected || files.length === 0 || uploading) return;

    setUploading(true);
    setError('');
    let uploaded = 0;
    let skipped = 0;
    let uploadedBytes = 0;
    let cancelled = false;
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    setUploadPanelOpen(true);
    setUploadTask({
      total: files.length,
      completed: 0,
      uploaded: 0,
      skipped: 0,
      uploadedBytes: 0,
      totalBytes,
      currentName: '',
      currentAction: '准备中',
      status: 'uploading',
      error: '',
    });

    try {
      for (const [index, file] of files.entries()) {
        const relativePath = file.webkitRelativePath || file.name;
        const parts = relativePath.split('/').filter(Boolean);
        const filename = parts.pop();
        const remoteDir = joinRemotePath(cwd, ...parts);
        const remotePath = joinRemotePath(remoteDir, filename);

        setUploadTask(task => ({
          ...task,
          currentName: relativePath,
          currentAction: '检查中',
          currentIndex: index,
        }));

        let exists = false;
        try {
          await api.sftpStat(activeTab.id, remotePath);
          exists = true;
        } catch (e) {
          if (!isMissingRemotePath(e)) throw e;
        }

        if (exists) {
          const action = await askConflictAction(file, remotePath);
          if (action === 'cancel') {
            cancelled = true;
            setUploadTask(task => ({
              ...task,
              status: 'cancelled',
              currentAction: '已取消',
              error: `已在第 ${index + 1} 个文件处取消上传`,
            }));
            break;
          }
          if (action === 'skip') {
            skipped += 1;
            setUploadTask(task => ({
              ...task,
              completed: index + 1,
              skipped,
              currentAction: '已跳过',
            }));
            continue;
          }
        }

        if (parts.length > 0) {
          await api.sftpMkdir(activeTab.id, remoteDir);
        }
        setUploadTask(task => ({ ...task, currentAction: '读取中' }));
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
        setUploadTask(task => ({ ...task, currentAction: '上传中' }));
        await api.sftpWrite(activeTab.id, remotePath, bytes);
        uploaded += 1;
        uploadedBytes += file.size;
        setUploadTask(task => ({
          ...task,
          completed: index + 1,
          uploaded,
          uploadedBytes,
          currentAction: '已完成',
        }));
      }

      if (!cancelled) {
        setUploadTask(task => ({ ...task, status: 'completed', currentAction: '已完成' }));
        showToast(`已上传 ${uploaded} 个文件${skipped > 0 ? `，跳过 ${skipped} 个` : ''}`);
      } else {
        showToast(`上传已取消，已上传 ${uploaded} 个文件`);
      }
    } catch (e) {
      setUploadTask(task => ({
        ...task,
        status: 'failed',
        currentAction: '失败',
        error: String(e),
      }));
      showToast(`上传失败：${e}`);
    } finally {
      setUploading(false);
      if (uploaded > 0) await loadDir(cwd);
    }
  };

  const handleFileInputChange = async (e) => {
    await uploadFiles(e.target.files);
    e.target.value = '';
  };

  const handleCopyPath = (entry) => {
    const text = entry.path;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast('已复制路径'),
        () => fallbackCopy(text),
      );
    } else {
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('已复制路径'); }
    catch { showToast('复制失败'); }
    document.body.removeChild(ta);
  };

  const handleDownload = async (entry) => {
    const localPath = await api.pickSavePath(entry.name);
    if (!localPath) return;
    try {
      const size = await api.sftpDownload(activeTab.id, entry.path, localPath);
      showToast(`已下载 ${formatSize(size)}`);
    } catch (e) {
      showToast(`下载失败：${e}`);
    }
  };

  const handleRename = async (newName) => {
    if (!renaming) return;
    const oldPath = renaming.path;
    const parent = oldPath.split('/').slice(0, -1).join('/') || '/';
    const newPath = parent === '/' ? `/${newName}` : `${parent}/${newName}`;
    try {
      await api.sftpRename(activeTab.id, oldPath, newPath);
      showToast('已重命名');
      setRenaming(null);
      loadDir(cwd);
    } catch (e) {
      showToast(`重命名失败：${e}`);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.sftpRemove(activeTab.id, confirmDelete.path);
      showToast('已删除');
      setConfirmDelete(null);
      setSelected(null);
      loadDir(cwd);
    } catch (e) {
      showToast(`删除失败：${e}`);
    }
  };

  const handleContextMenu = (e, entry) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(entry?.path || null);
    setContextMenu({ x: e.clientX, y: e.clientY, entry: entry || null });
  };

  const contextMenuItems = contextMenu?.entry ? [
    { icon: <Copy className="h-3.5 w-3.5" />, label: '复制路径', onSelect: () => handleCopyPath(contextMenu.entry) },
    ...(contextMenu.entry.isDir ? [] : [
      { icon: <Download className="h-3.5 w-3.5" />, label: '下载', onSelect: () => handleDownload(contextMenu.entry) },
    ]),
    { icon: <Edit3 className="h-3.5 w-3.5" />, label: '重命名', onSelect: () => setRenaming(contextMenu.entry) },
    { sep: true },
    { icon: <Trash2 className="h-3.5 w-3.5" />, label: '删除', onSelect: () => setConfirmDelete(contextMenu.entry) },
  ] : [
    { icon: <FileUp className="h-3.5 w-3.5" />, label: '上传文件', disabled: uploading, onSelect: () => fileInputRef.current?.click() },
    { icon: <FolderUp className="h-3.5 w-3.5" />, label: '上传文件夹', disabled: uploading, onSelect: () => folderInputRef.current?.click() },
    { sep: true },
    { icon: <RefreshCw className="h-3.5 w-3.5" />, label: '刷新', disabled: loading, onSelect: refresh },
  ];

  if (!connected) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        连接终端后可使用文件管理
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={500}>
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden select-none">
      {/* 工具栏 */}
      <div className="shrink-0 border-b border-border px-1 py-1">
        <Input
          value={pathInput}
          onChange={event => setPathInput(event.target.value)}
          onKeyDown={event => {
            if (event.key !== 'Enter' || loading) return;
            event.preventDefault();
            navigateTo(event.currentTarget.value);
          }}
          disabled={uploading}
          aria-label="远程路径"
          placeholder="输入远程路径并按回车跳转"
          className="h-7 w-full border-0 bg-transparent px-1 font-mono text-[11px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <div className="mt-1 flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goUp} title="上级目录">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigateTo('/')} title="根目录">
            <Home className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh} disabled={loading} title="刷新">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="上传文件"
          >
            <FileUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => folderInputRef.current?.click()}
            disabled={uploading}
            title="上传文件夹"
          >
            <FolderUp className="h-3.5 w-3.5" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileInputChange}
          />
          <input
            ref={folderInputRef}
            type="file"
            className="hidden"
            multiple
            webkitdirectory=""
            directory=""
            onChange={handleFileInputChange}
          />
        </div>
      </div>

      {/* 表头 */}
      <div
        className="grid min-w-0 shrink-0 items-center gap-2 border-b border-border px-2 py-1 text-[10px] font-medium text-muted-foreground"
        style={{ gridTemplateColumns: COLUMNS.map(c => c.width).join(' ') }}
      >
        {COLUMNS.map(col => (
          <span key={col.key} className={cn('truncate', col.align === 'right' && 'text-right')}>{col.label}</span>
        ))}
      </div>

      {/* 文件列表 */}
      <div
        className="sftp-file-list min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
        onContextMenu={e => handleContextMenu(e, null)}
      >
        {error && (
          <div className="px-3 py-2 text-xs text-red-500">{error}</div>
        )}
        {loading && entries.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">加载中...</div>
        ) : entries.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">空目录</div>
        ) : (
          entries.map(entry => (
            <Tooltip key={entry.name}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'grid cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent',
                    selected === entry.path && 'bg-accent',
                  )}
                  style={{ gridTemplateColumns: COLUMNS.map(c => c.width).join(' ') }}
                  onClick={() => {
                    setSelected(entry.path);
                    if (entry.isDir) navigateTo(entry.path);
                  }}
                  onDoubleClick={() => {
                    if (entry.isDir) navigateTo(entry.path);
                  }}
                  onContextMenu={(e) => handleContextMenu(e, entry)}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    {entry.isDir ? (
                      <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    ) : (
                      <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{entry.name}</span>
                  </div>
                  <span className="truncate text-right text-[10px] text-muted-foreground">{COLUMNS[1].render(entry)}</span>
                  <span className="truncate text-[10px] text-muted-foreground">{COLUMNS[2].render(entry)}</span>
                  <span className="truncate font-mono text-[10px] text-muted-foreground">{COLUMNS[3].render(entry)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="start"
                className="max-w-[min(28rem,calc(100vw-1rem))] whitespace-pre-line break-all"
              >
                {`${entry.name}\n${entry.path}\n${entry.isDir ? '目录' : formatSize(entry.size)} · ${formatTime(entry.modTime)} · ${(entry.mode || '').slice(1) || '-'}`}
              </TooltipContent>
            </Tooltip>
          )))}
      </div>

      {uploadPanelOpen && (
        <UploadProgressPanel
          task={uploadTask}
          onClose={() => setUploadPanelOpen(false)}
        />
      )}

      {/* 底部状态栏 */}
      <div className="shrink-0 border-t border-border px-3 py-1 text-[10px] text-muted-foreground">
        {entries.length} 个项目
        {toast && <span className="ml-2">{toast}</span>}
        {uploadTask && !uploadPanelOpen && (
          <button
            type="button"
            className="ml-2 text-primary hover:underline"
            onClick={() => setUploadPanelOpen(true)}
          >
            查看上传进度
          </button>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          pos={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          items={contextMenuItems}
        />
      )}

      <RenameDialog
        open={renaming !== null}
        defaultName={renaming?.name}
        onConfirm={handleRename}
        onClose={() => setRenaming(null)}
      />
      <ConfirmDialog
        open={confirmDelete !== null}
        message={confirmDelete ? `确定删除「${confirmDelete.name}」？此操作不可撤销。` : ''}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(null)}
      />
      <UploadConflictDialog
        conflict={uploadConflict}
        onChoice={chooseConflictAction}
      />
      </div>
    </TooltipProvider>
  );
}

registerPlugin({
  id: 'files',
  type: 'tool',
  title: '文件传输',
  icon: File,
  component: FileBrowser,
});
