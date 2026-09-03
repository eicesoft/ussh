import { useState } from 'react';
import { Terminal, Play, Trash2 } from 'lucide-react';
import { registerPlugin } from '../registry';
import { usePluginContext } from '../context';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

function QuickCommands() {
  const { activeTab, sendInput } = usePluginContext();
  const [commands, setCommands] = useState(() => {
    try {
      const saved = localStorage.getItem('ussh-quick-commands');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [text, setText] = useState('');

  const save = (list) => {
    setCommands(list);
    localStorage.setItem('ussh-quick-commands', JSON.stringify(list));
  };

  const add = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    save([...commands,trimmed]);
    setText('');
  };

  const remove = (i) => save(commands.filter((_, idx) => idx !== i));

  const run = (cmd) => {
    if (activeTab?.status === 'connected') {
      sendInput(activeTab.id, cmd + '\r');
    }
  };

  const connected = activeTab?.status === 'connected';

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-2 border-b border-border p-2">
        <input
          className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs outline-none"
          placeholder="输入命令（如 ls -la）"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
          disabled={!connected}
        />
        <Button size="icon" className="h-8 w-8" onClick={add} disabled={!connected}>
          <Play className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {commands.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            保存常用命令后，可在当前终端一键执行。
          </div>
        ) : (
          <ul className="space-y-1 p-2">
            {commands.map((cmd, i) => (
              <li key={i} className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent">
                <span className="flex-1 truncate font-mono">{cmd}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => run(cmd)}
                  disabled={!connected}
                  title="执行"
                >
                  <Play className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => remove(i)}
                  title="删除"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

registerPlugin({
  id: 'commands',
  type: 'tool',
  title: '快捷命令',
  icon: Terminal,
  component: QuickCommands,
});