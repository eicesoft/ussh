import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function NewWorkspaceDialog({ open, mode = 'create', initialName = '', onClose, onCreate, onUpdate }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setName(mode === 'edit' ? initialName : '');
    setError('');
    setBusy(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [initialName, mode, open]);

  const submit = event => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请输入工作区名称');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'edit') {
        onUpdate(trimmed);
      } else {
        onCreate(trimmed);
      }
      onClose();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? '编辑工作区' : '新建工作区'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit' ? '修改工作区名称不会影响其中已打开的连接。' : '工作区会分别记住自己的连接标签页，切换时不会断开会话。'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name">名称</Label>
            <Input
              id="workspace-name"
              ref={inputRef}
              value={name}
              onChange={event => {
                setName(event.target.value);
                setError('');
              }}
              placeholder="例如：生产环境"
              maxLength={64}
            />
          </div>
          {error && <div className="text-xs text-destructive">{error}</div>}
          <DialogFooter className="mt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>取消</Button>
            <Button type="submit" disabled={busy}>{mode === 'edit' ? '保存' : '创建'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
