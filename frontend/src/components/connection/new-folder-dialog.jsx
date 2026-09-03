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
import { DEFAULT_FOLDER_COLOR, FOLDER_COLORS, normalizeFolderColor } from '@/lib/folder-colors';

export function NewFolderDialog({
  open,
  onClose,
  onCreate,
  initialName = '',
  initialColor = DEFAULT_FOLDER_COLOR,
  mode = 'create',
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setColor(normalizeFolderColor(initialColor));
      setError('');
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, initialName, initialColor]);

  const submit = async event => {
    event?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请输入文件夹名称');
      return;
    }
    setBusy(true);
    try {
      await onCreate(trimmed, color);
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
          <DialogTitle>{mode === 'edit' ? '编辑文件夹' : '新建文件夹'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit' ? '修改连接树中的文件夹名称。' : '文件夹用于在侧栏分组管理保存的 SSH 连接，也可以嵌套创建子目录。'}
          </DialogDescription>
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
          <div className="space-y-1.5">
            <Label>颜色</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="文件夹颜色">
              {FOLDER_COLORS.map(option => {
                const selected = color === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={option.label}
                    title={option.label}
                    className="relative flex h-7 w-7 items-center justify-center rounded-md border border-transparent transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    onClick={() => setColor(option.value)}
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-black/10 dark:border-white/15"
                      style={option.value ? { backgroundColor: option.value } : undefined}
                    >
                      {!option.value && <span className="block h-full w-full rounded-full bg-[linear-gradient(135deg,transparent_44%,#ef4444_45%,#ef4444_55%,transparent_56%)]" />}
                    </span>
                    {selected && <span className="absolute h-5 w-5 rounded-md ring-2 ring-ring ring-offset-1" />}
                  </button>
                );
              })}
              <label className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-transparent transition-colors hover:bg-muted focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1" title="自定义颜色">
                <span
                  className="h-4 w-4 rounded-full border border-black/10 dark:border-white/15"
                  style={{ backgroundColor: color || '#64748b' }}
                />
                <input
                  type="color"
                  value={color || '#64748b'}
                  onChange={event => setColor(event.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="自定义颜色"
                />
              </label>
            </div>
          </div>
          {error && <div className="text-xs text-destructive">{error}</div>}
          <DialogFooter className="mt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              {mode === 'edit' ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
