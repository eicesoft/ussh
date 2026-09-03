import { MessageSquarePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPlugin } from '@/plugins/registry';

export function UtilityPanel({ active, onToggle }) {
  if (!active) return null;
  const plugin = getPlugin(active);
  if (!plugin) return null;

  const { title, component: Comp } = plugin;

  return (
    <aside className="acrylic-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3 text-xs font-semibold">
        <span>{title}</span>
        <div className="flex items-center gap-0.5">
          {active === 'ai-agent' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => window.dispatchEvent(new Event('ai-agent-new-chat'))}
              aria-label="新建会话"
              title="新建会话"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onToggle(null)} aria-label="关闭面板">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        {Comp ? <Comp /> : (
          <div className="px-3 py-3 text-xs leading-relaxed text-muted-foreground">
            暂无内容
          </div>
        )}
      </div>
    </aside>
  );
}
