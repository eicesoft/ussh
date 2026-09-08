import { useEffect } from 'react';
import { ChevronUp, Home, Layers3, Monitor, Moon, Send, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';

const SYSTEM_INFO_REFRESH_INTERVAL = 15_000;

function ThemeIcon({ resolved }) {
  if (resolved === 'dark') return <Moon className="h-3.5 w-3.5" />;
  if (resolved === 'light') return <Sun className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

export function StatusBar({ activeTab, activeConnectionCount, globalStatus, onRefreshSystemInfo, workspaces, activeWorkspaceId, onSwitchWorkspace, showBroadcastInput, onToggleBroadcastInput }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const activeWorkspace = workspaces.find(workspace => workspace.id === activeWorkspaceId);
  const WorkspaceIcon = activeWorkspace?.icon === 'home' ? Home : Layers3;
  const connected = activeTab?.status === 'connected';
  const connectionInProgress = activeTab?.status === 'connecting';
  const showSystemInfo = connected || connectionInProgress;
  const systemInfoLoading = activeTab?.systemInfoStatus === 'loading';
  const systemInfoRefreshing = activeTab?.systemInfoStatus === 'refreshing';
  const systemInfo = activeTab?.systemInfo;
  const connectionStatus = connected
    ? (activeTab?.kind === 'local'
        ? '已连接本地终端'
        : `已连接到 ${activeTab.name || activeTab.label}(${activeTab.host}:${activeTab.port || 22})`)
    : globalStatus;

  useEffect(() => {
    if (!connected || !activeTab?.id || !onRefreshSystemInfo) return undefined;
    onRefreshSystemInfo(activeTab.id);
    const timer = window.setInterval(() => onRefreshSystemInfo(activeTab.id), SYSTEM_INFO_REFRESH_INTERVAL);
    return () => window.clearInterval(timer);
  }, [activeTab?.id, connected, onRefreshSystemInfo]);

  return (
    <footer
      className="acrylic-panel flex h-8 select-none items-center gap-2 px-3 text-xs text-muted-foreground"
      onContextMenu={event => event.preventDefault()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-6 max-w-[12rem] shrink-0 gap-1.5 px-1.5 text-xs font-normal focus-visible:ring-0 focus-visible:ring-offset-0"
            aria-label={`切换工作区，当前工作区：${activeWorkspace?.name ?? '未选择'}`}
            title={activeWorkspace?.name}
          >
            <WorkspaceIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{activeWorkspace?.name ?? '工作区'}</span>
            <ChevronUp className="h-3 w-3 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] max-w-[20rem] overflow-y-auto select-none">
          <DropdownMenuLabel>切换工作区</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={activeWorkspaceId} onValueChange={onSwitchWorkspace}>
            {workspaces.map(workspace => {
              const Icon = workspace.icon === 'home' ? Home : Layers3;
              return (
                <DropdownMenuRadioItem key={workspace.id} value={workspace.id} className="gap-2 text-xs select-none" title={workspace.name}>
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{workspace.name}</span>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          connected ? 'bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]' : 'bg-muted-foreground',
        )}
      />
      <span className="shrink-0">{activeConnectionCount} 个活动会话</span>
      <Separator orientation="vertical" className="mx-1 h-3 bg-muted-foreground/30" />
      <span className="min-w-0 truncate">{connectionStatus}</span>

      <div className="ml-auto flex min-w-0 items-center gap-1">
        {showSystemInfo && (
          <div
            className="flex min-w-0 items-center gap-2"
            title={systemInfoLoading ? '正在加载系统信息' : systemInfoRefreshing ? '正在更新系统信息' : '当前连接的系统信息'}
          >
            <span className="max-w-[13rem] truncate">
              {systemInfoLoading ? '系统信息加载中…' : systemInfo?.os || '系统信息不可用'}
            </span>
            <span className="shrink-0">负载 {systemInfoLoading ? '…' : systemInfo?.load || '—'}</span>
            <span className="shrink-0">内存 {systemInfoLoading ? '…' : systemInfo?.memory || '—'}</span>
          </div>
        )}
        <Separator orientation="vertical" className="mx-1 h-3 bg-muted-foreground/30" />
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-6 w-6', showBroadcastInput && 'text-foreground')}
          onClick={onToggleBroadcastInput}
          aria-label="广播输入"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="切换主题">
              <ThemeIcon resolved={resolvedTheme} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>主题</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun className="h-3.5 w-3.5" />
                浅色
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="h-3.5 w-3.5" />
                深色
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor className="h-3.5 w-3.5" />
                跟随系统
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </footer>
  );
}
