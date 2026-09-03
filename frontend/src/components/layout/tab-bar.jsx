import { useEffect, useRef, useState } from 'react';
import { Copy, LayoutDashboard, Pin, PinOff, Plus, Unplug, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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

export function TabBar({ tabs, activeId, onSelect, onClose, onDisconnect, onClone, onTogglePinned, onNewConnection }) {
  const scrollRef = useRef(null);
  const [contextTabId, setContextTabId] = useState(null);
  const [pendingCloseTabId, setPendingCloseTabId] = useState(null);
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
  const pendingCloseTab = tabs.find(tab => tab.id === pendingCloseTabId);

  const requestClose = tab => {
    if (!tab?.closable) return;
    if (tab.pinned) {
      setPendingCloseTabId(tab.id);
      return;
    }
    onClose(tab.id);
  };

  const confirmClose = () => {
    if (pendingCloseTab) onClose(pendingCloseTab.id);
    setPendingCloseTabId(null);
  };

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <div
          className="app-drag flex min-w-0 select-none bg-transparent"
          style={{ height: 'var(--density-tab-height)' }}
        >
          <div className="relative min-w-0 flex-1">
            <div
              ref={scrollRef}
              className="tab-bar-scroll flex h-full min-w-0 gap-1 overflow-x-auto px-1"
              onScroll={updateScrollMetrics}
              onWheel={handleWheel}
            >
              {tabs.map(tab => {
                const active = tab.id === activeId;
                const isOverview = tab.kind === 'dashboard';
                const compactOverview = tab.kind === 'dashboard' && !active;
                const trigger = (
                  <div
                    className={cn(
                      'app-no-drag group relative my-[4px] flex h-[calc(100%-8px)] max-w-[240px] shrink-0 cursor-pointer select-none items-center gap-2 rounded-[8px] text-xs transition-[width,min-width,padding,gap] duration-200 ease-out',
                      compactOverview && 'justify-center gap-0 overflow-hidden',
                      active
                        ? 'bg-background font-semibold text-foreground shadow-sm'
                        : 'text-[#6f6f75] hover:bg-[#eeeeF0] hover:text-[#2d2d31] dark:text-muted-foreground dark:hover:bg-background/50 dark:hover:text-foreground',
                    )}
                    style={{
                      minWidth: compactOverview
                        ? 'calc(var(--density-tab-height) - 8px)'
                        : tab.pinned
                          ? 'var(--density-tab-pinned-min-width)'
                          : 'var(--density-tab-min-width)',
                      width: isOverview
                        ? compactOverview
                          ? 'calc(var(--density-tab-height) - 8px)'
                          : tab.pinned
                            ? 'var(--density-tab-pinned-min-width)'
                            : 'var(--density-tab-min-width)'
                        : undefined,
                      paddingInline: compactOverview ? '0px' : 'var(--density-tab-padding-x)',
                    }}
                    onClick={event => {
                      onSelect(tab.id);
                      event.preventDefault();
                    }}
                    onDoubleClick={event => event.stopPropagation()}
                    onMouseDown={event => {
                      if (event.button !== 1) return;
                      event.preventDefault();
                      event.stopPropagation();
                      if (tab.closable) requestClose(tab);
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
                      <>
                        {tab.color && (
                          <span
                            className="h-[1em] w-[3px] shrink-0 rounded-full"
                            style={{ backgroundColor: tab.color }}
                            aria-hidden="true"
                          />
                        )}
                        <span
                          className={cn(
                            'h-1.5 w-1.5 shrink-0 rounded-full',
                            dotColor[tab.status] ?? 'bg-muted-foreground',
                            !active && tab.status === 'connected' && 'opacity-50',
                          )}
                        />
                      </>
                    )}
                    <span
                      className={cn(
                        'min-w-0 truncate transition-[max-width,opacity] duration-200 ease-out',
                        compactOverview ? 'max-w-0 opacity-0' : 'max-w-[12rem] opacity-100',
                      )}
                    >
                      {tab.label}
                    </span>
                    {tab.pinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
                    {tab.closable && (
                      <button
                        className={cn(
                          'ml-auto flex items-center justify-center rounded-md text-[#77777d] opacity-0 transition-opacity hover:bg-[#dedee2] hover:text-[#36363b] group-hover:opacity-100 focus-visible:opacity-100 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground',
                          active && 'opacity-100',
                        )}
                        style={{ width: 'var(--density-tab-control-size)', height: 'var(--density-tab-control-size)' }}
                        onClick={e => {
                          e.stopPropagation();
                          requestClose(tab);
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
                      <DropdownMenuItem disabled={!tab.closable} onSelect={() => requestClose(tab)}>
                        <X className="h-3.5 w-3.5" />
                        关闭
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={tab.kind === 'dashboard' || !tab.form}
                        onSelect={() => onClone(tab)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        克隆标签页
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
                className="app-no-drag my-[4px] h-[calc(100%-8px)] shrink-0 rounded-[7px] p-0 text-[#77777d] hover:bg-[#e8e8eb] hover:text-[#36363b] dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-foreground"
                style={{
                  width: 'calc(var(--density-tab-height) - 8px)',
                }}
                onClick={onNewConnection}
                onDoubleClick={event => event.stopPropagation()}
                aria-label="新增连接"
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
      <AlertDialog
        open={pendingCloseTab !== undefined}
        onOpenChange={open => {
          if (!open) setPendingCloseTabId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>关闭固定标签？</AlertDialogTitle>
            <AlertDialogDescription>
              将关闭固定标签「{pendingCloseTab?.label || ''}」，确定继续吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmClose}>关闭</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
