import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function NewFolderDialog({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setName('');
      setError('');
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const submit = async event => {
    event?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请输入文件夹名称');
      return;
    }
    setBusy(true);
    try {
      await onCreate(trimmed);
      onClose();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建文件夹</DialogTitle>
          <DialogDescription>文件夹用于在侧栏分组管理保存的 SSH 连接。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="folder-name">名称</Label>
            <Input
              id="folder-name"
              ref={inputRef}
              value={name}
              onChange={e => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="例如：生产环境"
              maxLength={64}
            />
          </div>
          {error && <div className="text-xs text-destructive">{error}</div>}
          <DialogFooter className="mt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}