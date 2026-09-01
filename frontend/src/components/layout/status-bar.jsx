import { Monitor, Moon, Sun } from 'lucide-react';
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

function ThemeIcon({ resolved }) {
  if (resolved === 'dark') return <Moon className="h-3.5 w-3.5" />;
  if (resolved === 'light') return <Sun className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

export function StatusBar({ activeTab, activeConnectionCount, globalStatus, onDisconnect }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const connected = activeTab?.status === 'connected';

  return (
    <footer className="flex h-7 items-center gap-2 border-t border-border bg-muted px-3 text-xs text-muted-foreground">
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          connected ? 'bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]' : 'bg-muted-foreground',
        )}
      />
      <span className="shrink-0">{activeConnectionCount} 个活动会话</span>
      <Separator orientation="vertical" className="mx-1 h-3" />
      <span className="truncate">{globalStatus}</span>
      <span className="ml-auto truncate">{connected ? activeTab.label : '未连接'}</span>

      {connected && (
        <>
          <Separator orientation="vertical" className="mx-1 h-3" />
          <button
            onClick={onDisconnect}
            className="text-destructive transition-colors hover:text-destructive/80"
          >
            断开
          </button>
        </>
      )}

      <Separator orientation="vertical" className="mx-1 h-3" />
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
    </footer>
  );
}
