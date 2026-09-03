import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function AboutDialog({ open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={nextOpen => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>关于 uSSH</DialogTitle>
          <DialogDescription>轻量、现代的 SSH 客户端。</DialogDescription>
        </DialogHeader>

        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">软件名称</dt>
            <dd className="font-medium">uSSH</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">作者</dt>
            <dd className="font-medium">kelezyb</dd>
          </div>
          <div className="flex items-start justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">代码库</dt>
            <dd className="text-right">
              <a
                href="https://github.com/eicesoft/ussh"
                target="_blank"
                rel="noreferrer"
                className="break-all text-primary hover:underline"
              >
                github.com/eicesoft/ussh
              </a>
            </dd>
          </div>
        </dl>

        <DialogFooter>
          <Button onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
