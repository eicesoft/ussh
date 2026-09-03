import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Box,
  ChevronDown,
  CircleStop,
  Database,
  HardDrive,
  Info,
  Layers3,
  Pause,
  Play,
  RefreshCw,
  RotateCw,
  Server,
  SquareTerminal,
  Trash2,
} from 'lucide-react';
import { registerPlugin } from '../registry';
import { usePluginContext } from '../context';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const TABS = [
  { id: 'containers', label: '容器', icon: Box },
  { id: 'compose', label: 'Compose', icon: Layers3 },
  { id: 'storage', label: '磁盘', icon: HardDrive },
];

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function parseJsonRecords(output) {
  const text = String(output || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (_) {
    return text.split(/\r?\n/).map(line => {
      try { return JSON.parse(line); } catch (_) { return null; }
    }).filter(Boolean);
  }
}

function parseJsonObject(output) {
  const text = String(output || '').trim();
  try { return JSON.parse(text); } catch (_) {}
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (_) {}
  }
  return null;
}

function parseLabels(value) {
  return String(value || '').split(',').reduce((labels, item) => {
    const index = item.indexOf('=');
    if (index > 0) labels[item.slice(0, index)] = item.slice(index + 1);
    return labels;
  }, {});
}

function containerName(container) {
  return String(container.Names || container.Name || container.name || '').replace(/^\//, '') || container.ID;
}

function containerId(container) {
  return container.ID || container.Id || container.id || containerName(container);
}

function formatBytes(value) {
  if (value === undefined || value === null || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let current = number;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${current.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function getProjectName(container) {
  const labels = parseLabels(container.Labels);
  return labels['com.docker.compose.project'] || '';
}

function composeProjectArgs(project) {
  const name = project.Name || project.name;
  const configFiles = String(project.ConfigFiles || project.configFiles || '')
    .split(',')
    .map(path => path.trim())
    .filter(Boolean);
  const files = configFiles.map(path => `-f ${shellQuote(path)}`).join(' ');
  return `${files}${files ? ' ' : ''}-p ${shellQuote(name)}`;
}

function isRunning(container) {
  const state = String(container.State || container.state || '').toLowerCase();
  const status = String(container.Status || '');
  if (state === 'paused' || /\(paused\)/i.test(status)) return false;
  return state === 'running' || /^up\b/i.test(status);
}

function statusClass(container) {
  return isRunning(container)
    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    : 'bg-muted text-muted-foreground';
}

function isDockerPermissionError(message) {
  const text = String(message || '').toLowerCase();
  return text.includes('permission denied')
    && (text.includes('docker.sock') || text.includes('docker api') || text.includes('docker daemon'));
}

function CommandError({ message, onRepair, repairing }) {
  if (!message) return null;
  return (
    <div className="mx-2 mt-2 flex min-w-0 items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[10px] leading-relaxed text-destructive">
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRepair && <Button variant="outline" size="sm" className="h-7 shrink-0 border-destructive/40 px-2 text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onRepair} disabled={repairing}>{repairing ? '执行中…' : '修复权限'}</Button>}
    </div>
  );
}

function EmptyState({ icon: Icon, children }) {
  return (
    <div className="flex h-32 flex-col items-center justify-center gap-2 px-4 text-center text-[10px] text-muted-foreground">
      <Icon className="h-6 w-6 opacity-40" />
      <span>{children}</span>
    </div>
  );
}

function MiniStat({ label, value, tone = '' }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-background/40 px-2 py-1.5">
      <div className="truncate text-[9px] text-muted-foreground">{label}</div>
      <div className={`truncate text-xs font-semibold ${tone}`}>{value ?? '-'}</div>
    </div>
  );
}

function ConfirmDialog({ target, onClose, onConfirm }) {
  return (
    <Dialog open={Boolean(target)} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-sm">确认危险操作</DialogTitle></DialogHeader>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {target?.kind === 'project'
            ? `确定要停止并删除 Compose 项目「${target.name}」的资源吗？`
            : `确定要删除容器「${target?.name}」吗？此操作不可撤销。`}
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>确认删除</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContainerDetail({ container, detail, stats, logs, onBack, onInspect, onStats, onLogs, onRefreshLogs, onLogTailChange }) {
  const [section, setSection] = useState('detail');
  const logsRef = useRef(null);
  useEffect(() => { setSection('detail'); }, [container && containerId(container)]);
  useEffect(() => {
    if (section !== 'logs' || !logsRef.current) return;
    logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs?.loading, logs?.text, section]);
  if (!container) return null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex min-w-0 items-center gap-1 border-b border-border px-2 py-2">
        <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2 text-[10px]" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" />返回
        </Button>
        <div className="min-w-0 flex-1 border-l border-border pl-2">
          <div className="truncate text-xs font-semibold">{containerName(container)}</div>
          <div className="truncate font-mono text-[9px] text-muted-foreground">{containerId(container)}</div>
        </div>
      </div>
      <div className="flex min-w-0 border-b border-border px-2">
        {[
          ['detail', '详情', onInspect],
          ['stats', '资源', onStats],
          ['logs', '日志', onLogs],
        ].map(([id, label, handler]) => (
          <button key={id} type="button" className={`border-b-2 px-2 py-1.5 text-[10px] ${section === id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground'}`} onClick={() => { setSection(id); handler(); }}>{label}</button>
        ))}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {section === 'detail' ? (
          detail?.loading ? <div className="flex-1 p-3 text-[10px] text-muted-foreground">正在读取详情…</div> : detail?.error ? <CommandError message={detail.error} /> : (
            <pre className="min-h-0 min-w-0 max-w-full flex-1 overflow-auto whitespace-pre-wrap break-all px-2 py-2 font-mono text-[9px] leading-relaxed text-muted-foreground">{detail?.text || '暂无详情'}</pre>
          )
        ) : section === 'stats' ? (stats?.loading ? <div className="flex-1 p-3 text-[10px] text-muted-foreground">正在读取资源…</div> : stats?.error ? <CommandError message={stats.error} /> : (
          <div className="grid min-w-0 grid-cols-2 content-start gap-1.5 overflow-auto p-2">
            <MiniStat label="CPU" value={stats?.data?.CPUPerc || stats?.data?.cpuPerc} tone="text-sky-600 dark:text-sky-400" />
            <MiniStat label="内存" value={stats?.data?.MemUsage || stats?.data?.memUsage} tone="text-amber-600 dark:text-amber-400" />
            <MiniStat label="内存占用" value={stats?.data?.MemPerc || stats?.data?.memPerc} />
            <MiniStat label="进程数" value={stats?.data?.PIDs || stats?.data?.pids} />
            <MiniStat label="网络 I/O" value={stats?.data?.NetIO || stats?.data?.netIO} />
            <MiniStat label="块设备 I/O" value={stats?.data?.BlockIO || stats?.data?.blockIO} />
          </div>
        )) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-end gap-1 border-b border-border px-2 py-1.5">
              <select className="h-7 rounded border border-border bg-muted/40 px-1.5 text-[10px]" value={logs?.tail || 200} onChange={e => onLogTailChange(Number(e.target.value))} aria-label="日志行数">
                <option value="100">最近 100 行</option>
                <option value="200">最近 200 行</option>
                <option value="500">最近 500 行</option>
                <option value="1000">最近 1000 行</option>
              </select>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRefreshLogs} disabled={logs?.loading} title="刷新日志">
                <RefreshCw className={`h-3.5 w-3.5 ${logs?.loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <pre ref={logsRef} className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words bg-slate-950 p-3 text-[10px] leading-relaxed text-slate-200">{logs?.loading ? '正在读取日志…' : logs?.error || logs?.text || '暂无日志'}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

function ContainerActions({ container, busy, onAction }) {
  const running = isRunning(container);
  const paused = String(container.State || container.state || '').toLowerCase() === 'paused';
  const actions = paused
    ? [['unpause', '继续运行', Play], ['restart', '重启', RotateCw], ['remove', '删除', Trash2]]
    : running
    ? [['stop', '停止', CircleStop], ['restart', '重启', RotateCw], ['pause', '暂停', Pause]]
    : [['start', '启动', Play], ['remove', '删除', Trash2]];
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {actions.map(([action, label, Icon]) => (
        <Button key={action} variant={action === 'remove' ? 'ghost' : 'outline'} size="icon" className={`h-7 w-7 bg-muted/40 hover:bg-muted/70 ${action === 'remove' ? 'text-destructive hover:text-destructive' : ''}`} title={label} disabled={busy} onClick={e => { e.stopPropagation(); onAction(action, container); }}>
          <Icon className="h-3.5 w-3.5" />
        </Button>
      ))}
    </div>
  );
}

function DockerPlugin() {
  const { activeTab, api } = usePluginContext();
  const connected = activeTab?.status === 'connected';
  const [tab, setTab] = useState('containers');
  const [filter, setFilter] = useState('all');
  const [containerQuery, setContainerQuery] = useState('');
  const [containers, setContainers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [collapsedProjects, setCollapsedProjects] = useState({});
  const [info, setInfo] = useState(null);
  const [disk, setDisk] = useState({ rows: [], raw: '' });
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [repairMessage, setRepairMessage] = useState('');
  const [repairingPermission, setRepairingPermission] = useState(false);

  const runRemote = useCallback(async (command, timeout = 30) => {
    if (!connected || !activeTab?.id) throw new Error('请先连接 SSH 服务器');
    const result = await api.execRemoteCommand(activeTab.id, command, timeout);
    if (result?.timedOut) throw new Error('远程命令执行超时');
    if (!result || result.exitCode !== 0) {
      throw new Error(String(result?.output || 'Docker 命令执行失败').trim());
    }
    return result.output || '';
  }, [activeTab?.id, api, connected]);

  const loadContainers = useCallback(async () => {
    const output = await runRemote("docker ps -a --format '{{json .}}'");
    const next = parseJsonRecords(output);
    setContainers(next);
    return next;
  }, [runRemote]);

  const loadInfo = useCallback(async () => {
    try {
      const output = await runRemote("docker info --format '{{json .}}'");
      setInfo(parseJsonObject(output));
    } catch (e) {
      setInfo({ error: String(e) });
    }
  }, [runRemote]);

  const loadProjects = useCallback(async currentContainers => {
    let composeRows = [];
    try {
      const output = await runRemote("docker compose ls --all --format json 2>/dev/null || docker-compose ls --all --format json");
      composeRows = parseJsonRecords(output);
    } catch (_) {}
    const byName = new Map(composeRows.map(project => [project.Name || project.name, project]));
    currentContainers.forEach(container => {
      const name = getProjectName(container);
      if (name && !byName.has(name)) byName.set(name, { Name: name, Status: '运行中' });
    });
    setProjects([...byName.values()].filter(project => project.Name || project.name));
  }, [runRemote]);

  const loadDisk = useCallback(async () => {
    const output = await runRemote("docker system df --format '{{json .}}'");
    setDisk({ rows: parseJsonRecords(output), raw: output });
  }, [runRemote]);

  const refresh = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError('');
    try {
      const currentContainers = await loadContainers();
      await loadInfo();
      if (tab === 'compose') await loadProjects(currentContainers);
      if (tab === 'storage') await loadDisk();
      setSelected(current => current ? currentContainers.find(item => containerId(item) === containerId(current)) || null : null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [connected, loadContainers, loadDisk, loadInfo, loadProjects, tab]);

  useEffect(() => {
    setContainers([]);
    setProjects([]);
    setSelected(null);
    setDetail(null);
    setStats(null);
    setError('');
    setRepairMessage('');
    if (connected) refresh();
  }, [activeTab?.id, connected, refresh]);

  const repairDockerPermission = useCallback(async () => {
    const username = activeTab?.username || activeTab?.form?.username;
    if (!connected || !activeTab?.id || !username) {
      setRepairMessage('无法获取当前 SSH 用户名，请重新连接后再试。');
      return;
    }
    setRepairingPermission(true);
    setRepairMessage('');
    try {
      await api.sendInput(activeTab.id, `sudo usermod -aG docker ${shellQuote(username)}\r`);
      setRepairMessage('修复命令已发送到当前终端；如终端提示，请输入 sudo 密码。执行完成后请断开并重新连接 SSH。');
    } catch (e) {
      setRepairMessage(`修复命令发送失败：${String(e)}`);
    } finally {
      setRepairingPermission(false);
    }
  }, [activeTab?.form?.username, activeTab?.id, activeTab?.username, api, connected]);

  const inspect = useCallback(async container => {
    setDetail({ loading: true });
    try {
      const output = await runRemote(`docker inspect ${shellQuote(containerId(container))}`);
      const parsed = parseJsonRecords(output);
      setDetail({ text: JSON.stringify(parsed[0] || parsed, null, 2) });
    } catch (e) {
      setDetail({ error: String(e) });
    }
  }, [runRemote]);

  const readStats = useCallback(async container => {
    setStats({ loading: true });
    try {
      const output = await runRemote(`docker stats --no-stream --format '{{json .}}' ${shellQuote(containerId(container))}`);
      setStats({ data: parseJsonObject(output) || {} });
    } catch (e) {
      setStats({ error: String(e) });
    }
  }, [runRemote]);

  const openContainer = useCallback(container => {
    setSelected(container);
    inspect(container);
  }, [inspect]);

  const closeContainer = useCallback(() => {
    setSelected(null);
    setDetail(null);
    setStats(null);
  }, []);

  const executeContainerAction = useCallback(async (action, container) => {
    const id = shellQuote(containerId(container));
    const commands = {
      start: `docker start ${id}`,
      stop: `docker stop ${id}`,
      restart: `docker restart ${id}`,
      pause: `docker pause ${id}`,
      unpause: `docker unpause ${id}`,
      remove: `docker rm ${id}`,
    };
    if (action === 'remove') {
      setConfirm({ kind: 'container', name: containerName(container), command: commands[action] });
      return;
    }
    try {
      await runRemote(commands[action]);
      await refresh();
    } catch (e) { setError(String(e)); }
  }, [refresh, runRemote]);

  const loadLogs = useCallback(async (state = logs) => {
    if (!state) return;
    setLogs(current => ({ ...current, loading: true, error: '' }));
    try {
      const output = await runRemote(`docker logs --timestamps --tail ${Number(state.tail) || 200} ${shellQuote(state.id)} 2>&1`, 45);
      setLogs(current => ({ ...current, loading: false, text: output }));
    } catch (e) {
      setLogs(current => ({ ...current, loading: false, error: String(e) }));
    }
  }, [logs, runRemote]);

  const openLogs = useCallback(container => {
    const next = { id: containerId(container), name: containerName(container), tail: 200, loading: true, text: '' };
    setLogs(next);
    loadLogs(next);
  }, [loadLogs]);

  const confirmAction = useCallback(async () => {
    if (!confirm) return;
    try {
      await runRemote(confirm.command);
      setConfirm(null);
      await refresh();
    } catch (e) { setError(String(e)); }
  }, [confirm, refresh, runRemote]);

  const filteredContainers = useMemo(() => containers.filter(container => (
    (filter === 'all' || (filter === 'running' ? isRunning(container) : !isRunning(container)))
      && (!containerQuery.trim() || [
        containerName(container),
        containerId(container),
        container.Image || container.image,
        container.Status || container.State || container.state,
        getProjectName(container),
      ].some(value => String(value || '').toLowerCase().includes(containerQuery.trim().toLowerCase())))
  )), [containers, filter, containerQuery]);

  const containerGroups = useMemo(() => {
    const groups = new Map();
    filteredContainers.forEach(container => {
      const group = getProjectName(container) || '独立容器';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(container);
    });
    return [...groups.entries()];
  }, [filteredContainers]);

  const projectContainers = useCallback(project => {
    const name = project.Name || project.name;
    return containers.filter(container => getProjectName(container) === name);
  }, [containers]);

  const toggleProject = useCallback(name => {
    setCollapsedProjects(current => ({ ...current, [name]: !current[name] }));
  }, []);

  const runComposeAction = useCallback(async (action, project) => {
    const projectArgs = composeProjectArgs(project);
    const compose = action === 'up' ? `up -d` : action === 'down' ? 'down' : 'restart';
    if (action === 'down') {
      setConfirm({ kind: 'project', name: project.Name || project.name, command: `docker compose ${projectArgs} ${compose} 2>/dev/null || docker-compose ${projectArgs} ${compose}` });
      return;
    }
    try {
      await runRemote(`docker compose ${projectArgs} ${compose} 2>/dev/null || docker-compose ${projectArgs} ${compose}`);
      await refresh();
    } catch (e) { setError(String(e)); }
  }, [refresh, runRemote]);

  const headerInfo = info?.error ? null : info || {};
  const runningCount = containers.filter(isRunning).length;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col text-xs">
      <div className="grid grid-cols-3 gap-1 border-b border-border p-2">
        <MiniStat label="容器" value={`${runningCount} / ${containers.length}`} tone="text-emerald-600 dark:text-emerald-400" />
        <MiniStat label="镜像" value={headerInfo.Images} />
        <MiniStat label="Docker" value={headerInfo.ServerVersion || '-'} />
      </div>
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <div className="flex min-w-0 flex-1 gap-0.5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => { setTab(id); if (id !== 'containers') closeContainer(); }} className={`flex items-center gap-1 rounded px-2 py-1.5 text-[10px] ${tab === id ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60'}`}>
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={refresh} disabled={!connected || loading} title="刷新">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      {!connected ? <EmptyState icon={Server}>请先连接 SSH 服务器，再查看 Docker</EmptyState> : (
        <>
          <CommandError
            message={error || info?.error}
            onRepair={isDockerPermissionError(error || info?.error) ? repairDockerPermission : undefined}
            repairing={repairingPermission}
          />
          {repairMessage && <div className="mx-2 mt-2 break-words rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">{repairMessage}</div>}
          {tab === 'containers' && !selected && (
            <div className="flex min-w-0 shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
              <div className="shrink-0 text-[10px] text-muted-foreground">全部容器 · {filteredContainers.length}</div>
              <input
                className="ml-auto h-7 w-24 shrink-0 rounded border border-border bg-muted/40 px-2 text-[10px] outline-none placeholder:text-muted-foreground/70 focus:border-primary"
                value={containerQuery}
                onChange={e => setContainerQuery(e.target.value)}
                placeholder="过滤容器…"
                aria-label="过滤容器"
              />
              <select className="h-7 shrink-0 rounded border border-border bg-muted/40 px-1.5 text-[10px]" value={filter} onChange={e => setFilter(e.target.value)} aria-label="容器状态过滤">
                <option value="all">全部状态</option><option value="running">运行中</option><option value="stopped">已停止</option>
              </select>
            </div>
          )}
          <ScrollArea className="docker-scroll-area min-h-0 w-full min-w-0 max-w-full flex-1">
          {tab === 'containers' && selected ? (
            <ContainerDetail
              container={selected}
              detail={detail}
              stats={stats}
              logs={logs}
              onBack={closeContainer}
              onInspect={() => inspect(selected)}
              onStats={() => readStats(selected)}
              onLogs={() => openLogs(selected)}
              onRefreshLogs={() => loadLogs()}
              onLogTailChange={tail => {
                if (!logs) return;
                const next = { ...logs, tail };
                setLogs(next);
                loadLogs(next);
              }}
            />
          ) : tab === 'containers' && (
            <>
              {containerGroups.length === 0 ? <EmptyState icon={Box}>没有符合条件的容器</EmptyState> : containerGroups.map(([group, members]) => (
                <div key={group} className="mb-2 min-w-0 max-w-full">
                  <div className="sticky top-0 z-10 flex min-w-0 max-w-full items-center gap-1 bg-muted/40 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm"><Layers3 className="h-3 w-3 shrink-0" /><span className="min-w-0 truncate">{group}</span><span className="shrink-0 font-normal">· {members.length}</span></div>
                  {members.map(container => <div key={containerId(container)} className={`mx-2 my-1.5 min-w-0 w-[calc(100%_-_1rem)] max-w-[calc(100%_-_1rem)] cursor-pointer overflow-hidden rounded-md border p-2 transition-colors ${selected && containerId(selected) === containerId(container) ? 'border-primary/50 bg-accent/40' : 'border-border hover:bg-accent/30'}`} onClick={() => openContainer(container)}>
                    <div className="flex min-w-0 items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1">
                          <div className="min-w-0 max-w-[10rem] flex-1 truncate text-[11px] font-medium" title={containerName(container)}>{containerName(container)}</div>
                          <div className="min-w-0 flex-1 truncate text-right text-[9px] text-muted-foreground" title={container.Image || container.image || '-'}>{container.Image || container.image || '-'}</div>
                        </div>
                        <div className="mt-1 flex min-w-0 items-center justify-between gap-1">
                          <div className={`w-fit max-w-[calc(100%_-_8rem)] min-w-0 shrink truncate rounded px-1.5 py-0.5 text-[9px] ${statusClass(container)}`} title={container.Status || container.State || '-'}>{container.Status || container.State || '-'}</div>
                          <div className="ml-auto flex shrink-0 items-center gap-0.5">
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 bg-muted/40 hover:bg-muted/70" title="显示详情" onClick={e => { e.stopPropagation(); openContainer(container); }}>
                              <Info className="h-3.5 w-3.5" />
                            </Button>
                            <ContainerActions container={container} busy={loading} onAction={executeContainerAction} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>)}
                </div>
              ))}
            </>
          )}
          {tab === 'compose' && (
            <div className="w-full min-w-0 max-w-full overflow-hidden">
              <div className="flex min-w-0 max-w-full items-center justify-between px-2 py-2"><div className="min-w-0 truncate text-[10px] text-muted-foreground">Compose 项目 · {projects.length}</div><span className="shrink-0 pl-2 text-[9px] text-muted-foreground">按项目分组</span></div>
              {projects.length === 0 ? <EmptyState icon={Layers3}>未发现 Docker Compose 项目</EmptyState> : projects.map(project => {
                const name = project.Name || project.name;
                const members = projectContainers(project);
                const collapsed = Boolean(collapsedProjects[name]);
                return <div key={name} className="mx-2 mb-2 min-w-0 w-[calc(100%_-_1rem)] max-w-[calc(100%_-_1rem)] overflow-hidden rounded-md border border-border p-2">
                  <div className="flex min-w-0 max-w-full items-center gap-2">
                    <button type="button" className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => toggleProject(name)} aria-expanded={!collapsed} aria-label={`${collapsed ? '展开' : '收起'} Compose 项目 ${name}`}>
                      <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                      <div className="min-w-0 flex-1"><div className="min-w-0 truncate text-[11px] font-medium">{name}</div><div className="min-w-0 truncate text-[9px] text-muted-foreground">{project.Status || project.status || `${members.length} 个容器`} · {project.ConfigFiles || project.configFiles || 'Compose'}</div></div>
                    </button>
                    <div className="flex shrink-0 gap-0.5"><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="启动项目" onClick={() => runComposeAction('up', project)}><Play className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="重启项目" onClick={() => runComposeAction('restart', project)}><RotateCw className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" title="停止并删除项目" onClick={() => runComposeAction('down', project)}><Trash2 className="h-3.5 w-3.5" /></Button></div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 self-center" title={collapsed ? '展开容器列表' : '收起容器列表'} onClick={() => toggleProject(name)} aria-label={collapsed ? '展开容器列表' : '收起容器列表'} aria-expanded={!collapsed}><ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${collapsed ? '-rotate-90' : ''}`} /></Button>
                  </div>
                  {!collapsed && members.length > 0 && <div className="mt-2 min-w-0 max-w-full space-y-1 overflow-hidden border-t border-border pt-1.5">{members.map(member => <div key={containerId(member)} className="flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden text-[9px]"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isRunning(member) ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`} /><span className="min-w-0 flex-1 truncate">{containerName(member)}</span><span className="min-w-0 max-w-24 shrink truncate text-muted-foreground">{member.Status || member.State}</span><Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" title="查看详情" onClick={() => { setTab('containers'); openContainer(member); }}><Info className="h-3 w-3" /></Button></div>)}</div>}
                </div>;
              })}
            </div>
          )}
          {tab === 'storage' && (
            <>
              <div className="grid grid-cols-2 gap-1.5 p-2"><MiniStat label="Docker 根目录" value={headerInfo.DockerRootDir || '-'} /><MiniStat label="CPU" value={headerInfo.NCPU ? `${headerInfo.NCPU} 核` : '-'} /><MiniStat label="内存" value={formatBytes(headerInfo.MemTotal)} /><MiniStat label="存储驱动" value={headerInfo.Driver || '-'} /></div>
              {disk.rows.length > 0 ? <div className="mx-2 overflow-hidden rounded-md border border-border"><div className="grid grid-cols-[1fr_.65fr_.65fr_.9fr] gap-1 border-b border-border bg-muted/40 px-2 py-1.5 text-[9px] text-muted-foreground"><span>类型</span><span>数量</span><span>占用</span><span>可回收</span></div>{disk.rows.map((row, index) => <div key={`${row.Type || row.type}-${index}`} className="grid grid-cols-[1fr_.65fr_.65fr_.9fr] gap-1 border-b border-border px-2 py-1.5 text-[9px] last:border-0"><span className="truncate">{row.Type || row.type || '-'}</span><span>{row.TotalCount || row.totalCount || '-'}</span><span>{row.Size || row.size || '-'}</span><span className="truncate">{row.Reclaimable || row.reclaimable || '-'}</span></div>)}</div> : <EmptyState icon={Database}>暂无磁盘占用数据</EmptyState>}
              {disk.raw && disk.rows.length === 0 && <pre className="mx-2 mt-2 whitespace-pre-wrap rounded-md border border-border p-2 text-[9px] text-muted-foreground">{disk.raw}</pre>}
              <div className="mx-2 mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-[9px] leading-relaxed text-muted-foreground">磁盘数据来自 docker system df；“可回收”空间可通过终端中的 Docker 清理命令进一步处理。</div>
            </>
          )}
          </ScrollArea>
        </>
      )}
      <ConfirmDialog target={confirm} onClose={() => setConfirm(null)} onConfirm={confirmAction} />
    </div>
  );
}

registerPlugin({
  id: 'docker',
  type: 'tool',
  title: 'Docker',
  icon: SquareTerminal,
  component: DockerPlugin,
});
