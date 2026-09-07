import { useState, useCallback } from 'react';
import { Check, ChevronDown, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function BroadcastInput({ tabs, onSend }) {
  const nonDashboardTabs = tabs.filter(t => t.kind !== 'dashboard');
  const [input, setInput] = useState('');
  const [selectedTabIds, setSelectedTabIds] = useState(() => new Set(nonDashboardTabs.map(t => t.id)));

  const toggleTab = useCallback(id => {
    setSelectedTabIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim() || selectedTabIds.size === 0) return;
    onSend(input + '\n', Array.from(selectedTabIds));
    setInput('');
  }, [input, selectedTabIds, onSend]);

  const handleKeyDown = useCallback(e => {
    if (e.key === 'Enter') handleSend();
  }, [handleSend]);

  return (
    <div className="pointer-events-auto absolute bottom-0 left-0 right-0 z-10 border-t border-border bg-background/80 backdrop-blur-sm">
      <Input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="广播命令到当前工作区已连接的标签页…"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
        autoComplete="off"
        className="h-9 w-full border-0 bg-transparent pl-3 pr-24 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-end gap-1 pr-2">
        <div className="pointer-events-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 gap-1 px-2 text-xs font-normal text-muted-foreground">
                {selectedTabIds.size}/{nonDashboardTabs.length}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              <DropdownMenuLabel>选择目标标签页</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {nonDashboardTabs.length === 0 ? (
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">暂无标签页</DropdownMenuItem>
              ) : (
                nonDashboardTabs.map(tab => (
                  <DropdownMenuItem key={tab.id} onClick={() => toggleTab(tab.id)} className="gap-2 py-2 text-xs">
                    <Check className={cn('h-3.5 w-3.5 shrink-0', selectedTabIds.has(tab.id) ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{tab.label || tab.name || tab.host || tab.id}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleSend}
            disabled={!input.trim() || selectedTabIds.size === 0}
            aria-label="发送命令"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}