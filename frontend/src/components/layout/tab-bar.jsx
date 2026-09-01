import { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, Pin, PinOff, Plus, Unplug, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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

const statusText = {
  idle: '未连接',
  connecting: '连接中…',
  connected: '已连接',
  closed: '已断开',
};

const authText = {
  password: '密码',
  key: '密钥',
  keyfile: '密钥文件',
};

export function TabBar({ tabs, activeId, onSelect, onClose, onDisconnect, onTogglePinned, onNew }) {
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
    <TooltipProvider delayDuration={300}>
      <div
        className="app-drag flex min-w-0 select-none border-b border-border bg-muted"
        style={{ height: 'var(--density-tab-height)' }}
      >
        <div className="relative min-w-0 flex-1">
          <div
            ref={scrollRef}
            className="tab-bar-scroll flex h-full min-w-0 overflow-x-auto"
            onScroll={updateScrollMetrics}
            onWheel={handleWheel}
          >
            {tabs.map(tab => {
              const active = tab.id === activeId;
              const trigger = (
                <div
                  className={cn(
                    'app-no-drag group relative flex h-full max-w-[240px] shrink-0 cursor-pointer select-none items-center gap-2 border-r border-border/70 text-xs transition-colors',
                    active
                      ? 'bg-background font-medium text-foreground before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-primary'
                      : 'text-muted-foreground hover:bg-background/50 hover:text-foreground',
                  )}
                  style={{
                    minWidth: tab.pinned
                      ? 'var(--density-tab-pinned-min-width)'
                      : 'var(--density-tab-min-width)',
                    paddingInline: 'var(--density-tab-padding-x)',
                  }}
                  onClick={event => {
                    onSelect(tab.id);
                    event.preventDefault();
                  }}
                  onContextMenu={event => {
                    event.preventDefault();
                    onSelect(tab.id);
                    setContextTabId(tab.id);
                  }}
                  title={tab.kind === 'dashboard' ? tab.label : undefined}
                >
                  {tab.kind === 'dashboard' ? (
                    <LayoutDashboard
                      className="shrink-0 text-primary"
                      style={{ width: 'var(--density-tab-icon-size)', height: 'var(--density-tab-icon-size)' }}
                    />
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
                      className="ml-auto flex items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                      style={{ width: 'var(--density-tab-control-size)', height: 'var(--density-tab-control-size)' }}
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
              );
              return (
                <DropdownMenu
                  key={tab.id}
                  open={contextTabId === tab.id}
                  onOpenChange={open => !open && setContextTabId(null)}
                >
                  {tab.kind === 'dashboard' ? (
                    <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        align="start"
                        className="w-64 bg-popover px-3 py-2.5 text-popover-foreground shadow-md"
                      >
                        <p className="truncate whitespace-nowrap text-xs font-medium leading-none">
                          {tab.name || tab.label}
                        </p>
                        <div className="mt-2 grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[11px] leading-none">
                          <span className="text-muted-foreground">主机</span>
                          <span className="truncate whitespace-nowrap">{tab.host || '—'}:{tab.port || 22}</span>
                          <span className="text-muted-foreground">用户</span>
                          <span className="truncate whitespace-nowrap">{tab.username || '—'}</span>
                          <span className="text-muted-foreground">认证</span>
                          <span className="truncate whitespace-nowrap">{authText[tab.authType] ?? '—'}</span>
                          <span className="text-muted-foreground">状态</span>
                          <span className="truncate whitespace-nowrap">{statusText[tab.status] ?? tab.status}</span>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}
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
            <Button
              variant="ghost"
              size="sm"
              className="app-no-drag ml-1.5 h-full shrink-0 rounded-none p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              style={{ width: 'var(--density-tab-control-size)' }}
              onClick={onNew}
              aria-label="临时连接"
            >
              <Plus className="h-4 w-4" />
            </Button>
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
      </div>
    </TooltipProvider>
  );
}
