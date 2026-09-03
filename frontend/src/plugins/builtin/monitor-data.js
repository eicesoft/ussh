const MONITOR_BEGIN = '__USSH_MONITOR_BEGIN__';
const MONITOR_END = '__USSH_MONITOR_END__';

export const EMPTY_MONITOR_SNAPSHOT = {
  cpu: { cores: null, usage: null, load1: null, load5: null, load15: null },
  memory: { totalKb: null, usedKb: null, availableKb: null, usage: null },
  network: { rxBytes: null, txBytes: null, rxRate: null, txRate: null, interfaces: [] },
  disks: [],
};

function numberOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function percentOrNull(value) {
  const number = numberOrNull(String(value || '').replace('%', ''));
  return number === null ? null : Math.max(0, Math.min(100, number));
}

export function parseMonitorOutput(output) {
  const snapshot = {
    cpu: { ...EMPTY_MONITOR_SNAPSHOT.cpu },
    memory: { ...EMPTY_MONITOR_SNAPSHOT.memory },
    network: { ...EMPTY_MONITOR_SNAPSHOT.network, interfaces: [] },
    disks: [],
  };
  let inBlock = false;

  for (const rawLine of String(output || '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line === MONITOR_BEGIN) {
      inBlock = true;
      continue;
    }
    if (line === MONITOR_END) {
      inBlock = false;
      continue;
    }
    if (!inBlock || !line) continue;

    const tabParts = line.split('\t');
    if (tabParts[0] === 'net_if' && tabParts.length === 4) {
      snapshot.network.interfaces.push({
        name: tabParts[1],
        rxBytes: numberOrNull(tabParts[2]),
        txBytes: numberOrNull(tabParts[3]),
      });
      continue;
    }
    if (tabParts[0] === 'disk' && tabParts.length === 6) {
      snapshot.disks.push({
        mount: tabParts[1],
        sizeKb: numberOrNull(tabParts[2]),
        usedKb: numberOrNull(tabParts[3]),
        availableKb: numberOrNull(tabParts[4]),
        usage: percentOrNull(tabParts[5]),
      });
      continue;
    }

    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    switch (key) {
      case 'cpu_cores': snapshot.cpu.cores = numberOrNull(value); break;
      case 'cpu_usage': snapshot.cpu.usage = percentOrNull(value); break;
      case 'load_1m': snapshot.cpu.load1 = numberOrNull(value); break;
      case 'load_5m': snapshot.cpu.load5 = numberOrNull(value); break;
      case 'load_15m': snapshot.cpu.load15 = numberOrNull(value); break;
      case 'mem_total_kb': snapshot.memory.totalKb = numberOrNull(value); break;
      case 'mem_used_kb': snapshot.memory.usedKb = numberOrNull(value); break;
      case 'mem_available_kb': snapshot.memory.availableKb = numberOrNull(value); break;
      case 'mem_usage': snapshot.memory.usage = percentOrNull(value); break;
      case 'net_rx_bytes': snapshot.network.rxBytes = numberOrNull(value); break;
      case 'net_tx_bytes': snapshot.network.txBytes = numberOrNull(value); break;
      case 'net_rx_rate': snapshot.network.rxRate = numberOrNull(value); break;
      case 'net_tx_rate': snapshot.network.txRate = numberOrNull(value); break;
      default: break;
    }
  }

  return snapshot;
}

export function formatBytes(value, perSecond = false) {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let current = Math.max(0, number);
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  const precision = index === 0 ? 0 : current >= 100 ? 0 : 1;
  return `${current.toFixed(precision)} ${units[index]}${perSecond ? '/s' : ''}`;
}

export function formatKilobytes(value) {
  if (value === null || value === undefined || value === '') return '-';
  return formatBytes(Number(value) * 1024);
}

export function formatPercent(value) {
  if (value === null || value === undefined || value === '') return '-';
  return Number.isFinite(Number(value)) ? String(Number(value).toFixed(1)) + '%' : '-';
}

export function formatLoad(value) {
  if (value === null || value === undefined || value === '') return '-';
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '-';
}

export function parsePortOutput(output) {
  const ports = [];
  let error = '';
  let inBlock = false;

  for (const rawLine of String(output || '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line === '__USSH_PORT_BEGIN__') {
      inBlock = true;
      continue;
    }
    if (line === '__USSH_PORT_END__') {
      inBlock = false;
      continue;
    }
    if (!inBlock || !line) continue;

    const separator = line.indexOf('=');
    if (separator > 0 && line.slice(0, separator) === 'port_error') {
      error = line.slice(separator + 1).trim();
      continue;
    }

    const parts = line.split('\t');
    if (parts[0] !== 'port' || String(parts[1] || '').toUpperCase() !== 'TCP' || parts.length < 7) continue;
    ports.push({
      protocol: String(parts[1] || '').toUpperCase(),
      state: String(parts[2] || '').toUpperCase(),
      local: parts[3] || '-',
      pid: numberOrNull(parts[4]),
      process: parts[5] || '-',
      command: parts.slice(6).join('\t') || parts[5] || '-',
      container: parts[7] || '',
    });
  }

  return { ports, error };
}

export function parseProcessOutput(output) {
  const processes = [];
  let error = '';
  let inBlock = false;

  for (const rawLine of String(output || '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line === '__USSH_PROCESS_BEGIN__') {
      inBlock = true;
      continue;
    }
    if (line === '__USSH_PROCESS_END__') {
      inBlock = false;
      continue;
    }
    if (!inBlock || !line) continue;

    const separator = line.indexOf('=');
    if (separator > 0 && line.slice(0, separator) === 'process_error') {
      error = line.slice(separator + 1).trim();
      continue;
    }

    const parts = line.split('\t');
    if (parts[0] !== 'process' || parts.length < 11) continue;
    processes.push({
      pid: numberOrNull(parts[1]),
      ppid: numberOrNull(parts[2]),
      user: parts[3] || '-',
      state: parts[4] || '-',
      cpu: numberOrNull(parts[5]),
      memory: numberOrNull(parts[6]),
      rssKb: numberOrNull(parts[7]),
      elapsed: parts[8] || '-',
      name: parts[9] || '-',
      command: parts.slice(10).join('\t') || parts[9] || '-',
    });
  }

  return { processes, error };
}
