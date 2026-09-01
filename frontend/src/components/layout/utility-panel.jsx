import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

const content = {
  commands: { title: '快捷命令', empty: '保存常用命令后，可在当前终端一键执行。' },
  files: { title: '文件传输', empty: '连接后可在此查看传输任务。' },
  settings: { title: '会话设置', empty: '终端字体、配色与连接选项将在这里配置。' },
};

export function UtilityPanel({ active, onToggle }) {
  if (!active) return null;
  const { title, empty } = content[active];
  return (
    <aside className="flex h-full flex-col border-l border-border bg-background">
      <div className="flex h-9 items-center justify-between border-b border-border px-3 text-xs font-semibold">
        <span>{title}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onToggle(null)} aria-label="关闭面板">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="px-3 py-3 text-xs leading-relaxed text-muted-foreground">{empty}</div>
      </ScrollArea>
    </aside>
  );
}