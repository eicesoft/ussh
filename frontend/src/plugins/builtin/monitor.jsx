import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Cpu,
  Gauge,
  HardDrive,
  List,
  MemoryStick,
  Network,
  Server,
  Search,
  CircleStop,
  Zap,
  Wifi,
} from 'lucide-react';
import { registerPlugin } from '../registry';
import { usePluginContext } from '../context';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  EMPTY_MONITOR_SNAPSHOT,
  formatBytes,
  formatKilobytes,
  formatLoad,
  formatPercent,
  parseProcessOutput,
  parsePortOutput,
  parseMonitorOutput,
} from './monitor-data';

// 采集脚本只读系统接口，并通过固定记录格式返回，避免依赖 top/vmstat 等发行版差异较大的输出。
const monitorCommand = String.raw`
printf '%s\n' '__USSH_MONITOR_BEGIN__'
cpu_snapshot() {
  if [ -r /proc/stat ]; then
    awk '/^cpu / {print $2, $3, $4, $5, $6, $7, $8, $9; exit}' /proc/stat 2>/dev/null
  fi
}
cpu_1=$(cpu_snapshot)
sleep 1
cpu_2=$(cpu_snapshot)
if [ -n "$cpu_1" ] && [ -n "$cpu_2" ]; then
  awk -v first="$cpu_1" -v second="$cpu_2" 'BEGIN {
    split(first, a, / +/)
    split(second, b, / +/)
    total1 = a[1]+a[2]+a[3]+a[4]+a[5]+a[6]+a[7]+a[8]
    idle1 = a[4]+a[5]
    total2 = b[1]+b[2]+b[3]+b[4]+b[5]+b[6]+b[7]+b[8]
    idle2 = b[4]+b[5]
    if (total2 > total1) printf "cpu_usage=%.1f\n", 100 * (1 - (idle2-idle1)/(total2-total1))
  }'
else
  top -l 2 -n 0 2>/dev/null | awk '/CPU usage/ {for (i=1; i<=NF; i++) if ($(i) ~ /%$/ && $(i+1) == "idle,") {gsub("%", "", $(i)); usage=100-$(i)}} END {if (usage != "") printf "cpu_usage=%.1f\n", usage}' 2>/dev/null
fi
printf 'cpu_cores=%s\n' "$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || true)"
load_avg=$(awk '{print $1, $2, $3}' /proc/loadavg 2>/dev/null)
[ -z "$load_avg" ] && load_avg=$(sysctl -n vm.loadavg 2>/dev/null | awk '{print $(NF-3), $(NF-2), $(NF-1)}')
awk -v loads="$load_avg" 'BEGIN {
  split(loads, a, / +/)
  printf "load_1m=%s\n", a[1]
  printf "load_5m=%s\n", a[2]
  printf "load_15m=%s\n", a[3]
}'
mem_total=$(awk '$1 == "MemTotal:" {print $2; exit}' /proc/meminfo 2>/dev/null)
mem_available=$(awk '$1 == "MemAvailable:" {print $2; exit}' /proc/meminfo 2>/dev/null)
[ -z "$mem_available" ] && mem_available=$(awk '$1 == "MemFree:" {print $2; exit}' /proc/meminfo 2>/dev/null)
if [ -z "$mem_total" ]; then
  mem_total=$(sysctl -n hw.memsize 2>/dev/null | awk '{printf "%d", $1/1024}')
  page_size=$(vm_stat 2>/dev/null | awk '/page size/ {gsub("\\.", "", $NF); print $NF; exit}')
  [ -z "$page_size" ] && page_size=4096
  mem_available=$(vm_stat 2>/dev/null | awk '/Pages free|Pages inactive|Pages speculative/ {gsub("\\.", "", $3); total += $3} END {printf "%d", total * page_size / 1024}' page_size="$page_size")
fi
if [ -n "$mem_total" ] && [ -n "$mem_available" ]; then
  mem_used=$((mem_total-mem_available))
  printf 'mem_total_kb=%s\n' "$mem_total"
  printf 'mem_available_kb=%s\n' "$mem_available"
  printf 'mem_used_kb=%s\n' "$mem_used"
  awk -v used="$mem_used" -v total="$mem_total" 'BEGIN { if (total > 0) printf "mem_usage=%.1f\n", 100*used/total }'
fi
net_snapshot() {
  if [ -r /proc/net/dev ]; then
    awk -F: 'NR > 2 {gsub(/^ +| +$/, "", $1); split($2, a, / +/); rx += a[1]; tx += a[9]} END {printf "%d %d", rx+0, tx+0}' /proc/net/dev 2>/dev/null
  else
    netstat -ib 2>/dev/null | awk 'NR > 1 && $1 != "Name" {rx += $7; tx += $10} END {printf "%d %d", rx+0, tx+0}'
  fi
}
net_1=$(net_snapshot)
sleep 0.1
net_2=$(net_snapshot)
awk -v first="$net_1" -v second="$net_2" 'BEGIN {
  split(first, a, / +/)
  split(second, b, / +/)
  printf "net_rx_bytes=%s\n", b[1]
  printf "net_tx_bytes=%s\n", b[2]
  if (b[1] >= a[1]) printf "net_rx_rate=%.0f\n", (b[1]-a[1])*10
  else printf "net_rx_rate=0\n"
  if (b[2] >= a[2]) printf "net_tx_rate=%.0f\n", (b[2]-a[2])*10
  else printf "net_tx_rate=0\n"
}'
if [ -r /proc/net/dev ]; then
  awk -F: 'NR > 2 {gsub(/^ +| +$/, "", $1); split($2, a, / +/); if ($1 != "") printf "net_if\t%s\t%s\t%s\n", $1, a[1]+0, a[9]+0}' /proc/net/dev 2>/dev/null
else
  netstat -ib 2>/dev/null | awk 'NR > 1 && $1 != "Name" && $1 != "lo0" {printf "net_if\t%s\t%s\t%s\n", $1, $7+0, $10+0}'
fi
df -P -k 2>/dev/null | awk 'NR > 1 && $1 !~ /^(tmpfs|devtmpfs|squashfs|overlay)$/ && $2 ~ /^[0-9]+$/ {print "disk\t" $NF "\t" $2 "\t" $3 "\t" $4 "\t" $5}'
printf '%s\n' '__USSH_MONITOR_END__'
`;

// 端口采集优先使用 ss；较老的 Linux 使用 netstat，macOS 使用 lsof。
// ps 的 args= 返回完整启动命令，无法读取端口进程信息时仍保留端口记录。
const portCommand = String.raw`
printf '%s\n' '__USSH_PORT_BEGIN__'
docker_ports=""
if command -v docker >/dev/null 2>&1; then
  docker_ports=$(docker ps --format '{{.ID}}|{{.Names}}|{{.Ports}}' 2>/dev/null)
fi
emit_port() {
  proto="$1"
  state="$2"
  local_addr="$3"
  pid="$4"
  name="$5"
  full_command=""
  container=""
  case "$pid" in ''|*[!0-9]*) pid="";; esac
  if [ -n "$pid" ]; then
    full_command=$(ps -p "$pid" -o args= 2>/dev/null | head -n 1 | tr '\t\r\n' '   ')
    [ -z "$name" ] && name=$(ps -p "$pid" -o comm= 2>/dev/null | head -n 1 | tr '\t\r\n' '   ')
  fi
  [ -z "$name" ] && name="-"
  [ -z "$full_command" ] && full_command="$name"
  docker_proxy=0
  case "$name" in
    docker-proxy|docker-proxy-*) docker_proxy=1;;
  esac
  if { [ -z "$pid" ] || [ "$docker_proxy" -eq 1 ]; } && [ -n "$docker_ports" ]; then
    local_port=$(printf '%s\n' "$local_addr" | sed 's/.*://')
    container=$(printf '%s\n' "$docker_ports" | awk -F '|' -v port="$local_port" ' {
      count=split($3, mappings, /, /)
      for (i=1; i<=count; i++) {
        if (mappings[i] ~ ":" port "->" && mappings[i] ~ /\/tcp/) {
          printf "%s (%s)", $2, $1
          exit
        }
      }
    }')
  fi
  printf 'port\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$proto" "$state" "$local_addr" "$pid" "$name" "$full_command" "$container"
}

if command -v ss >/dev/null 2>&1; then
  ss -H -lntp 2>/dev/null | while IFS= read -r line; do
    proto="TCP"
    state=$(printf '%s\n' "$line" | awk '{if ($1 == "LISTEN") print $1; else if ($2 == "LISTEN") print $2; exit}')
    local_addr=$(printf '%s\n' "$line" | awk '{if ($1 == "LISTEN") print $4; else if ($2 == "LISTEN") print $5; exit}')
    pid=$(printf '%s\n' "$line" | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p')
    name=$(printf '%s\n' "$line" | sed -n 's/.*users:(("\([^"]*\)".*/\1/p')
    [ -n "$proto" ] && emit_port "$proto" "$state" "$local_addr" "$pid" "$name"
  done
elif command -v lsof >/dev/null 2>&1; then
  lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR > 1 && $8 == "TCP" {
    state="LISTEN"
    print $8 "\t" state "\t" $9 "\t" $2 "\t" $1
  }' | while IFS="$(printf '\t')" read -r proto state local_addr pid name; do
    emit_port "$proto" "$state" "$local_addr" "$pid" "$name"
  done
elif command -v netstat >/dev/null 2>&1; then
  netstat -lntp 2>/dev/null | awk 'NR > 2 && $4 !~ /^Local/ {
    proto=$1
    state=$6
    pid=$7
    sub("/.*", "", pid)
    print proto "\t" state "\t" $4 "\t" pid
  }' | while IFS="$(printf '\t')" read -r proto state local_addr pid; do
    emit_port "$proto" "$state" "$local_addr" "$pid" ""
  done
else
  printf '%s\n' 'port_error=未找到 ss、netstat 或 lsof'
fi
printf '%s\n' '__USSH_PORT_END__'
`;

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

// 统一输出固定字段，避免 ps 的列间空格和命令中的空格影响前端解析。
const processCommand = String.raw`
printf '%s\n' '__USSH_PROCESS_BEGIN__'
if ps -e -o pid= -o ppid= -o user= -o state= -o pcpu= -o pmem= -o rss= -o etime= -o comm= -o args= >/dev/null 2>&1; then
  ps -e -o pid= -o ppid= -o user= -o state= -o pcpu= -o pmem= -o rss= -o etime= -o comm= -o args= 2>/dev/null | awk '{
  pid=$1
  ppid=$2
  user=$3
  state=$4
  cpu=$5
  memory=$6
  rss=$7
  elapsed=$8
  name=$9
  if (pid !~ /^[0-9]+$/) next
  for (i=1; i<=9; i++) $i=""
  sub(/^[[:space:]]+/, "")
  command=$0
  gsub(/[\t\r\n]/, " ", command)
  if (command == "") command=name
  printf "process\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n", pid, ppid, user, state, cpu, memory, rss, elapsed, name, command
  }'
elif command -v ps >/dev/null 2>&1; then
  ps auxww 2>/dev/null | awk 'NR > 1 {
    user=$1
    pid=$2
    cpu=$3
    memory=$4
    rss=$6
    state=$8
    name=$11
    if (pid !~ /^[0-9]+$/) next
    for (i=1; i<=11; i++) $i=""
    sub(/^[[:space:]]+/, "")
    command=$0
    gsub(/[\t\r\n]/, " ", command)
    if (command == "") command=name
    printf "process\t%s\t\t%s\t%s\t%s\t%s\t%s\t-\t%s\t%s\n", pid, user, state, cpu, memory, rss, name, command
  }'
else
  printf '%s\n' 'process_error=未找到 ps 命令'
fi
printf '%s\n' '__USSH_PROCESS_END__'
`;

function UsageBar({ value, tone = 'bg-primary' }) {
  const safeValue = Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full transition-[width] duration-500 ${tone}`} style={{ width: `${safeValue}%` }} />
    </div>
  );
}

function Metric({ label, value, hint, icon: Icon, tone = 'text-primary' }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background/35 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${tone}`} />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
      {hint && <div className="mt-0.5 truncate text-[9px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <section className="rounded-lg border border-border bg-card/35 p-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span>{title}</span>
      </div>
      {children}
    </section>
  );
}

function SystemSection({ info }) {
  const rows = [
    ['主机', info?.hostname || info?.host],
    ['操作系统', info?.os],
    ['内核', info?.kernel],
    ['架构', info?.architecture],
    ['Shell', info?.shell],
    ['运行时间', info?.uptime],
  ];
  return (
    <Section title="系统基础" icon={Server}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[10px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <span className="text-muted-foreground">{label}</span>
            <span className="truncate text-right" title={value || ''}>{value || '-'}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function CpuSection({ cpu }) {
  return (
    <Section title="CPU" icon={Cpu}>
      <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-2.5">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Gauge className="h-3.5 w-3.5 text-sky-500" />
              <span>当前使用率</span>
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-sky-600 dark:text-sky-400">{formatPercent(cpu.usage)}</div>
          </div>
          <div className="text-right text-[9px] text-muted-foreground">
            <div>处理器</div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">{cpu.cores ?? '-'} 核</div>
          </div>
        </div>
        <div className="mt-2"><UsageBar value={cpu.usage} tone="bg-sky-500" /></div>
      </div>
      <div className="mt-2">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-medium">
            <Activity className="h-3.5 w-3.5 text-violet-500" />
            <span>系统负载</span>
          </div>
          <span className="text-[9px] text-muted-foreground">Load average</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            ['1 分钟', cpu.load1],
            ['5 分钟', cpu.load5],
            ['15 分钟', cpu.load15],
          ].map(([label, value], index) => (
            <div key={label} className={'rounded-md border px-2 py-1.5 ' + (index === 0 ? 'border-violet-500/30 bg-violet-500/10' : 'border-border bg-background/30')}>
              <div className="text-[9px] text-muted-foreground">{label}</div>
              <div className="mt-0.5 text-base font-semibold tabular-nums">{formatLoad(value)}</div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function MemorySection({ memory }) {
  return (
    <Section title="内存" icon={MemoryStick}>
      <Metric label="已用" value={formatKilobytes(memory.usedKb)} hint={`共 ${formatKilobytes(memory.totalKb)}`} icon={Gauge} tone="text-amber-500" />
      <div className="mt-2"><UsageBar value={memory.usage} tone="bg-amber-500" /></div>
      <div className="mt-1.5 flex justify-between text-[9px] text-muted-foreground">
        <span>占用 {formatPercent(memory.usage)}</span>
        <span>可用 {formatKilobytes(memory.availableKb)}</span>
      </div>
    </Section>
  );
}

function NetworkSection({ network }) {
  const [expanded, setExpanded] = useState(false);
  const visibleInterfaces = expanded ? network.interfaces : network.interfaces.slice(0, 8);

  return (
    <Section title="网络" icon={Wifi}>
      <div className="grid grid-cols-2 gap-1.5">
        <Metric label="接收速率" value={formatBytes(network.rxRate, true)} hint={`累计 ${formatBytes(network.rxBytes)}`} icon={ArrowDown} tone="text-emerald-500" />
        <Metric label="发送速率" value={formatBytes(network.txRate, true)} hint={`累计 ${formatBytes(network.txBytes)}`} icon={ArrowUp} tone="text-blue-500" />
      </div>
      {network.interfaces.length > 0 && (
        <div className="mt-2 border-t border-border pt-1.5">
          {visibleInterfaces.map(item => (
            <div key={item.name} className="flex items-center justify-between gap-2 py-0.5 text-[9px]">
              <span className="truncate font-mono">{item.name}</span>
              <span className="shrink-0 text-muted-foreground">↓ {formatBytes(item.rxBytes)} · ↑ {formatBytes(item.txBytes)}</span>
            </div>
          ))}
          {network.interfaces.length > 8 && (
            <button
              type="button"
              className="mt-1.5 flex w-full items-center justify-center gap-1 border-t border-border pt-1.5 text-[9px] text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(value => !value)}
              aria-expanded={expanded}
              aria-label={expanded ? '收起网络接口' : '展开全部网络接口'}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? '收起' : '展开其余 ' + (network.interfaces.length - 8) + ' 条'}
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

function DiskSection({ disks }) {
  return (
    <Section title="磁盘" icon={HardDrive}>
      {disks.length === 0 ? (
        <div className="text-[10px] text-muted-foreground">暂无磁盘数据</div>
      ) : (
        <div className="space-y-2">
          {disks.map(disk => (
            <div key={disk.mount} className="min-w-0">
              <div className="mb-1 flex items-center justify-between gap-2 text-[10px]">
                <span className="truncate font-mono" title={disk.mount}>{disk.mount}</span>
                <span className="shrink-0 text-muted-foreground">{formatPercent(disk.usage)}</span>
              </div>
              <UsageBar
                value={disk.usage}
                tone={disk.usage > 85 ? 'bg-red-700' : disk.usage > 60 ? 'bg-amber-600' : 'bg-slate-600'}
              />
              <div className="mt-0.5 text-[9px] text-muted-foreground">{formatKilobytes(disk.usedKb)} / {formatKilobytes(disk.sizeKb)} · 可用 {formatKilobytes(disk.availableKb)}</div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function ProcessConfirmDialog({ target, loading, error, onClose, onConfirm }) {
  const force = target?.action === 'force';
  const process = target?.process;

  return (
    <Dialog open={Boolean(target)} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">{force ? '确认强制关闭进程' : '确认关闭进程'}</DialogTitle>
        </DialogHeader>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {force ? '强制关闭会立即发送 SIGKILL，进程无法执行清理操作。' : '关闭会发送 SIGTERM，进程仍有机会完成清理后退出。'}
        </p>
        <div className="min-w-0 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[10px]">
          <div className="flex gap-2"><span className="shrink-0 text-muted-foreground">PID</span><span>{process?.pid ?? '-'}</span></div>
          <div className="mt-1 flex min-w-0 gap-2"><span className="shrink-0 text-muted-foreground">命令</span><span className="truncate font-mono" title={process?.command || ''}>{process?.command || '-'}</span></div>
        </div>
        {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[10px] leading-relaxed text-destructive">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>取消</Button>
          <Button variant={force ? 'destructive' : 'default'} size="sm" onClick={onConfirm} disabled={loading}>
            {loading ? '执行中…' : force ? '确认强制关闭' : '确认关闭'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProcessSection({ processes, loading, error, actionMessage, actionLoading, onAction }) {
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState('cpu');
  const [descending, setDescending] = useState(true);
  const sortOptions = [
    ['cpu', 'CPU'],
    ['memory', '内存占用'],
    ['rssKb', '物理内存'],
    ['pid', 'PID'],
    ['elapsed', '运行时间'],
    ['name', '进程名'],
  ];

  const visibleProcesses = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    const filtered = keyword
      ? processes.filter(process => [process.pid, process.ppid, process.user, process.state, process.cpu, process.memory, process.rssKb, process.elapsed, process.name, process.command].some(value => String(value ?? '').toLowerCase().includes(keyword)))
      : processes;

    return [...filtered].sort((left, right) => {
      const leftValue = sortKey === 'name' || sortKey === 'elapsed' ? String(left[sortKey] ?? '') : Number(left[sortKey]);
      const rightValue = sortKey === 'name' || sortKey === 'elapsed' ? String(right[sortKey] ?? '') : Number(right[sortKey]);
      let result;
      if (typeof leftValue === 'string') result = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
      else if (Number.isNaN(leftValue)) result = 1;
      else if (Number.isNaN(rightValue)) result = -1;
      else result = leftValue - rightValue;
      return descending ? -result : result;
    });
  }, [descending, filter, processes, sortKey]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
        <label className="flex h-7 min-w-[120px] flex-1 items-center gap-1 rounded border border-border bg-muted/30 px-1.5 text-muted-foreground sm:max-w-[240px]">
          <Search className="h-3 w-3 shrink-0" />
          <input
            className="min-w-0 flex-1 bg-transparent text-[10px] text-foreground outline-none placeholder:text-muted-foreground"
            value={filter}
            onChange={event => setFilter(event.target.value)}
            placeholder="过滤 PID、用户或命令"
            aria-label="过滤进程"
          />
        </label>
        <select className="h-7 rounded border border-border bg-muted/30 px-1.5 text-[10px]" value={sortKey} onChange={event => setSortKey(event.target.value)} aria-label="进程排序字段">
          {sortOptions.map(([value, label]) => <option key={value} value={value}>按 {label}</option>)}
        </select>
        <button
          type="button"
          className="h-7 rounded border border-border px-2 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => setDescending(value => !value)}
          aria-label={descending ? '当前降序，点击切换为升序' : '当前升序，点击切换为降序'}
          title={descending ? '降序，点击切换为升序' : '升序，点击切换为降序'}
        >
          {descending ? '↓ 降序' : '↑ 升序'}
        </button>
        {loading && <span className="ml-auto text-[9px] text-muted-foreground">正在读取…</span>}
        {!loading && <span className="ml-auto text-[9px] text-muted-foreground">{visibleProcesses.length} / {processes.length} 个进程</span>}
      </div>
      {error && <div className="mx-2 mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[10px] leading-relaxed text-destructive">{error}</div>}
      {actionMessage && <div className="mx-2 mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[10px] text-emerald-700 dark:text-emerald-400">{actionMessage}</div>}
      <div className="monitor-scrollbar min-h-0 flex-1 overflow-auto p-2">
        {visibleProcesses.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-center text-[10px] text-muted-foreground">
            {loading ? '正在读取进程列表…' : filter ? '没有匹配的进程' : '未读取到进程'}
          </div>
        ) : (
          <div className="min-w-[620px] overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[44px_54px_44px_48px_60px_42px_minmax(0,1fr)_52px] gap-1.5 border-b border-border bg-muted/40 px-1.5 py-1 text-[8px] text-muted-foreground">
              <span>PID</span><span>用户</span><span>CPU</span><span>内存</span><span>RSS</span><span>状态</span><span>进程 / 完整命令</span><span className="text-right">操作</span>
            </div>
            {visibleProcesses.map(process => (
              <div key={String(process.pid) + '-' + process.command} className="group grid grid-cols-[44px_54px_44px_48px_60px_42px_minmax(0,1fr)_52px] items-center gap-1.5 border-b border-border px-1.5 py-1.5 last:border-b-0 hover:bg-muted/30">
                <span className="font-mono text-[9px] tabular-nums">{process.pid ?? '-'}</span>
                <span className="truncate text-[9px]" title={process.user}>{process.user || '-'}</span>
                <span className="text-[9px] tabular-nums">{formatPercent(process.cpu)}</span>
                <span className="text-[9px] tabular-nums">{formatPercent(process.memory)}</span>
                <span className="text-[9px] tabular-nums" title={process.rssKb == null ? '' : formatKilobytes(process.rssKb)}>{formatKilobytes(process.rssKb)}</span>
                <span className="truncate text-[9px]" title={process.state}>{process.state || '-'}</span>
                <div className="min-w-0">
                  <div className="truncate text-[9px] font-medium" title={process.command}>{process.name || '-'}</div>
                  <div className="truncate font-mono text-[8px] text-muted-foreground" title={process.command}>{process.command || '-'}</div>
                </div>
                <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    type="button"
                    className="rounded p-0.5 text-amber-600 hover:bg-amber-500/15 dark:text-amber-400"
                    onClick={() => onAction(process, 'term')}
                    disabled={actionLoading || !process.pid}
                    title="关闭进程（SIGTERM）"
                    aria-label={'关闭进程 PID ' + process.pid}
                  >
                    <CircleStop className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 text-destructive hover:bg-destructive/15"
                    onClick={() => onAction(process, 'force')}
                    disabled={actionLoading || !process.pid}
                    title="强制关闭进程（SIGKILL）"
                    aria-label={'强制关闭进程 PID ' + process.pid}
                  >
                    <Zap className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="shrink-0 px-2 pb-2 text-[9px] text-muted-foreground">进程列表每 5 秒自动刷新；操作需要远程用户具备相应权限。悬停进程行右侧可关闭或强制关闭。</div>
    </div>
  );
}

function PortSection({ ports, loading, error }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
        <span className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground">TCP ({ports.length})</span>
        {loading && <span className="ml-auto text-[9px] text-muted-foreground">正在扫描…</span>}
      </div>
      {error && <div className="mx-2 mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[10px] leading-relaxed text-destructive">{error}</div>}
      <div className="monitor-scrollbar min-h-0 flex-1 overflow-auto p-2">
        {ports.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-center text-[10px] text-muted-foreground">
            {loading ? '正在读取监听端口…' : '未发现监听端口'}
          </div>
        ) : (
          <div className="min-w-[420px] overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[44px_110px_minmax(0,1fr)] gap-2 border-b border-border bg-muted/40 px-1.5 py-1 text-[9px] text-muted-foreground">
              <span>协议</span>
              <span>监听地址</span>
              <span>进程 / Docker 容器 / 启动命令</span>
            </div>
            {ports.map((port, index) => {
              const processName = port.process && port.process !== '-' ? port.process : port.container ? 'Docker 容器' : '-';
              const processLabel = port.pid != null && processName !== '-' ? processName + '(' + port.pid + ')' : processName;
              const detailLabel = port.container
                ? 'Docker · ' + port.container + (port.command && port.command !== '-' ? ' · ' + port.command : '')
                : port.command && port.command !== '-' ? port.command : '-';
              return (
              <div key={port.protocol + '-' + port.local + '-' + port.pid + '-' + index} className="grid grid-cols-[44px_110px_minmax(0,1fr)] items-center gap-2 border-b border-border px-1.5 py-1.5 last:border-b-0">
                <div className="min-w-0">
                  <div className="inline-flex rounded bg-sky-500/15 px-1 py-0.5 text-[9px] font-semibold text-sky-600 dark:text-sky-400">TCP</div>
                </div>
                <span className="truncate font-mono text-[9px]" title={port.local}>{port.local}</span>
                <div className="min-w-0">
                  <div className="truncate text-[9px] font-medium" title={port.container || port.command}>{processLabel}</div>
                  <div className="truncate font-mono text-[8px] text-muted-foreground" title={port.command}>{detailLabel}</div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="shrink-0 px-2 pb-2 text-[9px] text-muted-foreground">
        端口列表每 10 秒自动刷新；无 PID 时会尝试根据 Docker 发布端口显示容器名称。悬停可查看完整命令。
      </div>
    </div>
  );
}

function MonitorPlugin() {
  const { activeTab, api } = usePluginContext();
  const connected = activeTab?.status === 'connected';
  const [view, setView] = useState('performance');
  const [snapshot, setSnapshot] = useState(EMPTY_MONITOR_SNAPSHOT);
  const [error, setError] = useState('');
  const loadingRef = useRef(false);
  const requestRef = useRef(0);
  const [ports, setPorts] = useState([]);
  const [portLoading, setPortLoading] = useState(false);
  const [portError, setPortError] = useState('');
  const portLoadingRef = useRef(false);
  const portRequestRef = useRef(0);
  const [processes, setProcesses] = useState([]);
  const [processLoading, setProcessLoading] = useState(false);
  const [processError, setProcessError] = useState('');
  const [processNotice, setProcessNotice] = useState('');
  const [processAction, setProcessAction] = useState(null);
  const [processActionLoading, setProcessActionLoading] = useState(false);
  const [processActionError, setProcessActionError] = useState('');
  const processLoadingRef = useRef(false);
  const processRequestRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!connected || !activeTab?.id || loadingRef.current) return;
    loadingRef.current = true;
    const requestId = ++requestRef.current;
    setError('');
    try {
      const result = await api.execRemoteCommand(activeTab.id, monitorCommand, 15);
      if (result?.timedOut) throw new Error('监控采集超时');
      if (!result || result.exitCode !== 0) throw new Error(String(result?.output || '监控采集失败').trim());
      if (requestId !== requestRef.current) return;
      setSnapshot(parseMonitorOutput(result.output));
    } catch (e) {
      if (requestId === requestRef.current) setError(String(e?.message || e));
    } finally {
      loadingRef.current = false;
    }
  }, [activeTab?.id, api, connected]);

  useEffect(() => {
    if (view !== 'performance') return undefined;
    requestRef.current += 1;
    setSnapshot(EMPTY_MONITOR_SNAPSHOT);
    setError('');
    if (!connected) return undefined;
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      requestRef.current += 1;
      window.clearInterval(timer);
    };
  }, [activeTab?.id, connected, refresh, view]);

  const refreshPorts = useCallback(async () => {
    if (!connected || !activeTab?.id || portLoadingRef.current) return;
    portLoadingRef.current = true;
    const requestId = ++portRequestRef.current;
    setPortLoading(true);
    setPortError('');
    try {
      const result = await api.execRemoteCommand(activeTab.id, 'sudo -n sh -c ' + shellQuote(portCommand), 15);
      if (result?.timedOut) throw new Error('端口扫描超时');
      if (!result || result.exitCode !== 0) throw new Error(String(result?.output || '端口扫描失败').trim());
      if (requestId !== portRequestRef.current) return;
      const parsed = parsePortOutput(result.output);
      if (parsed.error) throw new Error(parsed.error);
      setPorts(parsed.ports);
    } catch (e) {
      if (requestId === portRequestRef.current) setPortError(String(e?.message || e));
    } finally {
      portLoadingRef.current = false;
      if (requestId === portRequestRef.current) setPortLoading(false);
    }
  }, [activeTab?.id, api, connected]);

  useEffect(() => {
    if (view !== 'ports') return undefined;
    portRequestRef.current += 1;
    setPorts([]);
    setPortError('');
    refreshPorts();
    const timer = window.setInterval(refreshPorts, 10000);
    return () => {
      portRequestRef.current += 1;
      window.clearInterval(timer);
    };
  }, [activeTab?.id, connected, refreshPorts, view]);

  const refreshProcesses = useCallback(async () => {
    if (!connected || !activeTab?.id || processLoadingRef.current) return;
    processLoadingRef.current = true;
    const requestId = ++processRequestRef.current;
    setProcessLoading(true);
    setProcessError('');
    try {
      const result = await api.execRemoteCommand(activeTab.id, processCommand, 15);
      if (result?.timedOut) throw new Error('进程列表采集超时');
      if (!result || result.exitCode !== 0) throw new Error(String(result?.output || '进程列表采集失败').trim());
      if (requestId !== processRequestRef.current) return;
      const parsed = parseProcessOutput(result.output);
      if (parsed.error) throw new Error(parsed.error);
      setProcesses(parsed.processes);
    } catch (e) {
      if (requestId === processRequestRef.current) setProcessError(String(e?.message || e));
    } finally {
      processLoadingRef.current = false;
      if (requestId === processRequestRef.current) setProcessLoading(false);
    }
  }, [activeTab?.id, api, connected]);

  useEffect(() => {
    if (view !== 'processes') return undefined;
    processRequestRef.current += 1;
    setProcesses([]);
    setProcessError('');
    setProcessNotice('');
    if (!connected) return undefined;
    refreshProcesses();
    const timer = window.setInterval(refreshProcesses, 5000);
    return () => {
      processRequestRef.current += 1;
      window.clearInterval(timer);
    };
  }, [activeTab?.id, connected, refreshProcesses, view]);

  const requestProcessAction = useCallback((process, action) => {
    setProcessActionError('');
    setProcessAction({ process, action });
  }, []);

  const confirmProcessAction = useCallback(async () => {
    if (!processAction?.process || !connected || !activeTab?.id) return;
    const pid = Number(processAction.process.pid);
    if (!Number.isInteger(pid) || pid <= 0) {
      setProcessActionError('无效的进程 ID，无法执行操作。');
      return;
    }
    const signal = processAction.action === 'force' ? 'KILL' : 'TERM';
    setProcessActionLoading(true);
    setProcessActionError('');
    try {
      const result = await api.execRemoteCommand(activeTab.id, 'kill -' + signal + ' ' + pid, 10);
      if (result?.timedOut) throw new Error('进程操作超时');
      if (!result || result.exitCode !== 0) throw new Error(String(result?.output || '进程操作失败').trim());
      setProcessAction(null);
      setProcessNotice((processAction.action === 'force' ? '已强制关闭进程 PID ' : '已发送关闭信号给进程 PID ') + pid);
      refreshProcesses();
    } catch (e) {
      setProcessActionError(String(e?.message || e));
    } finally {
      setProcessActionLoading(false);
    }
  }, [activeTab?.id, api, connected, processAction, refreshProcesses]);

  useEffect(() => {
    const handleRefresh = () => {
      if (view === 'ports') refreshPorts();
      else if (view === 'processes') refreshProcesses();
      else refresh();
    };
    window.addEventListener('monitor-refresh', handleRefresh);
    return () => window.removeEventListener('monitor-refresh', handleRefresh);
  }, [refresh, refreshPorts, refreshProcesses, view]);

  if (!connected) {
    return <div className="flex h-full items-center justify-center px-5 text-center text-xs text-muted-foreground">请先连接 SSH 服务器，再查看监控数据。</div>;
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
        {[
          ['performance', '性能', Activity],
          ['ports', '网络端口', Network],
          ['processes', '进程', List],
        ].map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            className={'flex items-center gap-1 rounded px-2 py-1 text-[10px] ' + (view === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}
            onClick={() => setView(value)}
          >
            <Icon className="h-3 w-3" />
            {label}
            {value === 'ports' && ports.length > 0 && ' (' + ports.length + ')'}
            {value === 'processes' && processes.length > 0 && ' (' + processes.length + ')'}
          </button>
        ))}
      </div>
      {view === 'ports' ? (
        <PortSection ports={ports} loading={portLoading} error={portError} />
      ) : view === 'processes' ? (
        <ProcessSection
          processes={processes}
          loading={processLoading}
          error={processError}
          actionMessage={processNotice}
          actionLoading={processActionLoading}
          onAction={requestProcessAction}
        />
      ) : (
        <>
          {error && <div className="mx-2 mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[10px] leading-relaxed text-destructive">{error}</div>}
          <div className="monitor-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
            <SystemSection info={activeTab.systemInfo || {}} />
            <CpuSection cpu={snapshot.cpu} />
            <MemorySection memory={snapshot.memory} />
            <NetworkSection network={snapshot.network} />
            <DiskSection disks={snapshot.disks} />
            <div className="flex items-center gap-1 px-1 pb-1 text-[9px] text-muted-foreground">
              <Activity className="h-3 w-3" /> 每 5 秒自动刷新。
            </div>
          </div>
        </>
      )}
      <ProcessConfirmDialog
        target={processAction}
        loading={processActionLoading}
        error={processActionError}
        onClose={() => { if (!processActionLoading) { setProcessAction(null); setProcessActionError(''); } }}
        onConfirm={confirmProcessAction}
      />
    </div>
  );
}

registerPlugin({
  id: 'monitor',
  type: 'tool',
  title: '服务器监控',
  icon: Activity,
  component: MonitorPlugin,
});
