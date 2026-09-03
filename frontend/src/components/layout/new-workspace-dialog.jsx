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

export function NewWorkspaceDialog({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setError('');
    setBusy(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const submit = event => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请输入工作区名称');
      return;
    }
    setBusy(true);
    try {
      onCreate(trimmed);
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
          <DialogTitle>新建工作区</DialogTitle>
          <DialogDescription>工作区会分别记住自己的连接标签页，切换时不会断开会话。</DialogDescription>
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
            <Button type="submit" disabled={busy}>创建</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
