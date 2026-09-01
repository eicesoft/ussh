import { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, Pin, PinOff, Plus, Unplug, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const dotColor = {
  idle: 'bg-muted-foreground',
  connecting: 'bg-amber-500',
  connected: 'bg-primary',
  closed: 'bg-destructive',
};

export function TabBar({ tabs, activeId, onSelect, onClose, onDisconnect, onTogglePinned, onAddSaved }) {
  const scrollRef = useRef(null);
  const [contextTabId, setContextTabId] = useState(null);
  const [scrollMetrics, setScrollMetrics] = useState({ left: 0, width: 1, viewport: 1 });

  const updateScrollMetrics = () => {
    const element = scrollRef.current;
    if (!element) return;
    setScrollMetrics({
      left: element.scrollLeft,
      width: element.scrollWidth,
      viewport: element.clientWidth,
    });
  };

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    updateScrollMetrics();
    if (typeof window.ResizeObserver === 'function') {
      const observer = new window.ResizeObserver(updateScrollMetrics);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', updateScrollMetrics);
    return () => window.removeEventListener('resize', updateScrollMetrics);
  }, [tabs.length]);

  const handleWheel = event => {
    const element = scrollRef.current;
    if (!element || event.ctrlKey || element.scrollWidth <= element.clientWidth) return;
    const delta = event.shiftKey ? event.deltaY : event.deltaX || event.deltaY;
    if (!delta) return;
    element.scrollLeft += delta;
    event.preventDefault();
  };

  const hasOverflow = scrollMetrics.width > scrollMetrics.viewport;
  const thumbWidth = hasOverflow ? (scrollMetrics.viewport / scrollMetrics.width) * 100 : 100;
  const thumbOffset = hasOverflow ? (scrollMetrics.left / scrollMetrics.width) * 100 : 0;

  return (
    <div className="flex h-9 min-w-0 select-none border-b border-border bg-muted">
      <div className="relative min-w-0 flex-1">
        <div
          ref={scrollRef}
          className="tab-bar-scroll flex h-full min-w-0 overflow-x-auto"
          onScroll={updateScrollMetrics}
          onWheel={handleWheel}
        >
          {tabs.map(tab => {
            const active = tab.id === activeId;
            return (
              <DropdownMenu
                key={tab.id}
                open={contextTabId === tab.id}
                onOpenChange={open => !open && setContextTabId(null)}
              >
                <DropdownMenuTrigger asChild>
                  <div
                    className={cn(
                      'group relative flex h-full min-w-[140px] max-w-[240px] shrink-0 cursor-pointer items-center gap-2 border-r border-border/70 px-3 text-xs transition-colors',
                      active
                        ? 'bg-background font-medium text-foreground before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-primary'
                        : 'text-muted-foreground hover:bg-background/50 hover:text-foreground',
                      tab.pinned && 'min-w-[118px]',
                    )}
                    onClick={event => {
                      onSelect(tab.id);
                      event.preventDefault();
                    }}
                    onContextMenu={event => {
                      event.preventDefault();
                      onSelect(tab.id);
                      setContextTabId(tab.id);
                    }}
                    title={tab.label}
                  >
                    {tab.kind === 'dashboard' ? (
                      <LayoutDashboard className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : (
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          dotColor[tab.status] ?? 'bg-muted-foreground',
                        )}
                      />
                    )}
                    <span className="truncate">{tab.label}</span>
                    {tab.pinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
                    {tab.closable && (
                      <button
                        className="ml-auto flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={e => {
                          e.stopPropagation();
                          onClose(tab.id);
                        }}
                        aria-label="关闭标签"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="bottom" className="min-w-[9rem]">
                  <DropdownMenuItem
                    disabled={tab.status !== 'connected' && tab.status !== 'connecting'}
                    onSelect={() => onDisconnect(tab)}
                  >
                    <Unplug className="h-3.5 w-3.5" />
                    断开
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!tab.closable} onSelect={() => onClose(tab.id)}>
                    <X className="h-3.5 w-3.5" />
                    关闭
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onTogglePinned(tab.id)}>
                    {tab.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    {tab.pinned ? '取消固定' : '固定'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </div>
        {hasOverflow && (
          <span className="pointer-events-none absolute inset-x-1 bottom-0 h-px overflow-hidden rounded-full bg-border/70">
            <span
              className="absolute inset-y-0 rounded-full bg-muted-foreground/70 transition-transform duration-100"
              style={{ left: `${thumbOffset}%`, width: `${thumbWidth}%` }}
            />
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-full w-9 shrink-0 rounded-none border-l border-border p-0 text-muted-foreground hover:bg-background/60 hover:text-foreground"
        onClick={onAddSaved}
        aria-label="新增连接"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
