import { useCallback, useEffect, useState } from 'react';
import { FolderPlus, History, MessageSquarePlus, Plus, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPlugin } from '@/plugins/registry';
import { PluginContext, usePluginContext } from '@/plugins/context';
import { readAgentHistories } from '@/plugins/builtin/ai-agent-session';

function getBrowserStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch (_) {
    return null;
  }
}

function formatHistoryTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function AgentHistoryMenu({ tabId }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const refresh = useCallback(() => {
    setHistory(readAgentHistories(getBrowserStorage(), tabId)[tabId] || []);
  }, [tabId]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  useEffect(() => {
    const handleChanged = () => {
      if (open) refresh();
    };
    window.addEventListener('ai-agent-history-changed', handleChanged);
    return () => window.removeEventListener('ai-agent-history-changed', handleChanged);
  }, [open, refresh]);

  const select = sessionId => {
    window.dispatchEvent(new CustomEvent('ai-agent-history-select', {
      detail: { tabId, sessionId },
    }));
    setOpen(false);
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setOpen(value => !value)}
        aria-label="历史会话"
        aria-expanded={open}
        title="历史会话"
      >
        <History className="h-3.5 w-3.5" />
      </Button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-64 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="px-3 py-2 text-[10px] font-semibold">历史会话</div>
          {history.length > 0 ? (
            <div className="max-h-72 overflow-y-auto p-1">
              {history.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="flex w-full min-w-0 flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                  onClick={() => select(item.id)}
                  title={item.title}
                >
                  <span className="truncate text-[11px]">{item.title}</span>
                  <span className="text-[9px] text-muted-foreground">
                    {item.session?.agentMode ? '智能体' : '仅对话'}
                    {formatHistoryTime(item.updatedAt) && ` · ${formatHistoryTime(item.updatedAt)}`}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-4 text-center text-[10px] text-muted-foreground">暂无历史会话</div>
          )}
        </div>
      )}
    </div>
  );
}

export function UtilityPanel({ active, onToggle }) {
  const pluginContext = usePluginContext();
  const { activeTab } = pluginContext;
  const [headerActions, setHeaderActions] = useState(null);
  if (!active) return null;
  const plugin = getPlugin(active);
  if (!plugin) return null;

  const { title, component: Comp } = plugin;
  const contextValue = { ...pluginContext, setHeaderActions };

  return (
    <aside className="acrylic-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex h-9 shrink-0 items-center justify-between px-3 text-xs font-semibold">
        <span>{title}</span>
        <div className="flex items-center gap-0.5">
          {active === 'ai-agent' && (
            <>
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
              <AgentHistoryMenu tabId={activeTab?.id} />
            </>
          )}
          {active === 'monitor' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => window.dispatchEvent(new Event('monitor-refresh'))}
              aria-label="刷新监控"
              title="刷新监控"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
          {active === 'commands' && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => window.dispatchEvent(new Event('quick-commands-new-folder'))}
                aria-label="新建目录"
                title="新建目录"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => window.dispatchEvent(new Event('quick-commands-new-command'))}
                aria-label="新建命令"
                title="新建命令"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {headerActions}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onToggle(null)} aria-label="关闭面板">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        <PluginContext.Provider value={contextValue}>
          {Comp ? <Comp /> : (
            <div className="px-3 py-3 text-xs leading-relaxed text-muted-foreground">
              暂无内容
            </div>
          )}
        </PluginContext.Provider>
      </div>
    </aside>
  );
}
