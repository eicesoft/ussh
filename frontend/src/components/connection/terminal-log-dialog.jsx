import { useEffect, useState } from 'react';
import { FileText, LoaderCircle, Trash2, TriangleAlert } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/lib/api';

function formatSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function TerminalLogDialog({ open, tab, onClose, onOpenLog }) {
  const connectionId = tab?.kind === 'local'
    ? 'local'
    : String(tab?.form?.savedNodeId || tab?.id || '');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const doDelete = async () => {
    const log = confirmDelete;
    if (!log) return;
    setConfirmDelete(null);
    setDeleting(log.name);
    setError('');
    try {
      await api.deleteTerminalLog(connectionId, log.name);
      setLogs(items => items.filter(item => item.name !== log.name));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setDeleting('');
    }
  };

  const doDeleteAll = async () => {
    setConfirmDeleteAll(false);
    setDeletingAll(true);
    setError('');
    const currentLogs = [...logs];
    let hasError = false;
    for (const log of currentLogs) {
      try {
        await api.deleteTerminalLog(connectionId, log.name);
        setLogs(items => items.filter(item => item.name !== log.name));
      } catch (reason) {
        hasError = true;
        setError(String(reason));
      }
    }
    setDeletingAll(false);
    if (!hasError) setLogs([]);
  };

  useEffect(() => {
    if (!open || !connectionId) return undefined;
    let current = true;
    setLoading(true);
    setError('');
    api.listTerminalLogs(connectionId)
      .then(items => { if (current) setLogs(Array.isArray(items) ? items : []); })
      .catch(reason => { if (current) setError(String(reason)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [open, connectionId]);

  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent className="max-w-2xl select-none">
        <DialogHeader className="flex-row items-center justify-between gap-2 space-y-0 pr-10">
          <DialogTitle className="truncate">终端日志 - {tab?.label || '当前连接'} 保存的日志文件</DialogTitle>
          {logs.length > 0 && (
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5 text-xs" disabled={deletingAll} onClick={() => setConfirmDeleteAll(true)}>
              {deletingAll ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              清理全部
            </Button>
          )}
        </DialogHeader>
        <ScrollArea className="max-h-80 rounded-md border">
          <div className="p-2">
            {loading && <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />正在读取日志…</div>}
            {!loading && error && <p className="px-2 py-8 text-sm text-destructive">{error}</p>}
            {!loading && !error && logs.length === 0 && <p className="px-2 py-8 text-center text-sm text-muted-foreground">这个连接还没有日志文件。</p>}
            {!loading && !error && logs.map(log => (
              <div key={log.name} className="flex w-full items-center gap-1 rounded-sm hover:bg-accent">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start px-1 py-2 text-left" onClick={() => onOpenLog(tab, log)}>
                  <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs">{log.name}</span>
                  <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{formatSize(log.size)} · {new Date(log.modifiedAt).toLocaleString()}</span>
                  </span>
                </Button>
                <Button variant="ghost" size="icon" className="mr-1 h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" disabled={deleting === log.name} onClick={() => setConfirmDelete(log)} aria-label={`删除 ${log.name}`}>
                  {deleting === log.name ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>

      <AlertDialog open={confirmDelete !== null} onOpenChange={next => { if (!next) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除日志文件</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除日志文件「{confirmDelete?.name}」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDelete(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteAll} onOpenChange={next => { if (!next) setConfirmDeleteAll(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-destructive" />
              清理全部日志文件
            </AlertDialogTitle>
            <AlertDialogDescription>
              确定删除「{tab?.label || '当前连接'}」的全部 {logs.length} 个日志文件吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDeleteAll(false)} disabled={deletingAll}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteAll} disabled={deletingAll}>全部删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
