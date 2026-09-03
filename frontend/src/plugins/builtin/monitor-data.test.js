import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { formatBytes, formatLoad, formatPercent, parseMonitorOutput, parsePortOutput, parseProcessOutput } from './monitor-data.js';

test('parseMonitorOutput parses performance records', () => {
  const snapshot = parseMonitorOutput(`noise\n__USSH_MONITOR_BEGIN__
cpu_cores=8
cpu_usage=23.4
load_1m=1.25
load_5m=0.80
load_15m=0.42
mem_total_kb=16384
mem_available_kb=4096
mem_used_kb=12288
mem_usage=75.0
net_rx_bytes=1048576
net_tx_bytes=2048
net_rx_rate=51200
net_tx_rate=1024
net_if\teth0\t1000\t2000
disk\t/\t102400\t51200\t51200\t50%
__USSH_MONITOR_END__`);

  assert.equal(snapshot.cpu.cores, 8);
  assert.equal(snapshot.cpu.usage, 23.4);
  assert.equal(snapshot.cpu.load5, 0.8);
  assert.equal(snapshot.cpu.load15, 0.42);
  assert.equal(snapshot.memory.availableKb, 4096);
  assert.deepEqual(snapshot.network.interfaces, [{ name: 'eth0', rxBytes: 1000, txBytes: 2000 }]);
  assert.deepEqual(snapshot.disks[0], { mount: '/', sizeKb: 102400, usedKb: 51200, availableKb: 51200, usage: 50 });
});

test('parseMonitorOutput ignores malformed records and clamps percentages', () => {
  const snapshot = parseMonitorOutput(`__USSH_MONITOR_BEGIN__
cpu_usage=120
net_if\tbad
disk\t/\t1\t2\t3\t-4%
__USSH_MONITOR_END__`);
  assert.equal(snapshot.cpu.usage, 100);
  assert.equal(snapshot.network.interfaces.length, 0);
  assert.equal(snapshot.disks[0].usage, 0);
});

test('formatBytes formats rates and unknown values', () => {
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(2048, true), '2.0 KB/s');
  assert.equal(formatBytes(null), '-');
  assert.equal(formatPercent(null), '-');
  assert.equal(formatLoad(1.5), '1.50');
  assert.equal(formatLoad(null), '-');
});

test('CPU collection fragment works in zsh with multi-field snapshots', () => {
  const source = readFileSync(new URL('./monitor.jsx', import.meta.url), 'utf8');
  const match = source.match(/if \[ -n "\$cpu_1" \] && \[ -n "\$cpu_2" \]; then\n([\s\S]*?)\nelse/);
  assert.ok(match, '未找到 CPU 采集逻辑');
  const command = [
    'cpu_1="2528 16493 821 45231 100 0 3 2"',
    'cpu_2="2528 16493 900 45280 110 0 3 2"',
    'if [ -n "$cpu_1" ] && [ -n "$cpu_2" ]; then',
    match[1],
    'fi',
  ].join('\n');
  const result = spawnSync('zsh', ['-c', command], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /cpu_usage=/);
});

test('parsePortOutput parses listen sockets and keeps full commands', () => {
  const result = parsePortOutput(`noise
__USSH_PORT_BEGIN__
port\tTCP\tLISTEN\t0.0.0.0:22\t123\tsshd\t/usr/sbin/sshd -D --long-option
__USSH_PORT_END__`);

  assert.equal(result.error, '');
  assert.deepEqual(result.ports, [
    {
      protocol: 'TCP',
      state: 'LISTEN',
      local: '0.0.0.0:22',
      pid: 123,
      process: 'sshd',
      command: '/usr/sbin/sshd -D --long-option',
      container: '',
    },
  ]);
});

test('TCP port collection falls back to lsof when netstat rejects Linux flags', () => {
  const source = readFileSync(new URL('./monitor.jsx', import.meta.url), 'utf8');
  const backtick = String.fromCharCode(96);
  const marker = 'const portCommand = String.raw' + backtick;
  const start = source.indexOf(marker);
  const end = source.indexOf(backtick + ';', start + marker.length);
  assert.ok(start >= 0 && end > start, '未找到 TCP 端口采集逻辑');
  const fakeTools = [
    'PATH=/usr/bin:/bin',
    "lsof() { printf '%s\\n' 'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME' 'sshd 123 root 3u IPv4 123 0t0 TCP 0.0.0.0:22 (LISTEN)'; }",
    "ps() { printf '%s\\n' '/usr/sbin/sshd -D'; }",
    'netstat() { return 1; }',
    source.slice(start + marker.length, end),
  ].join('\n');
  const result = spawnSync('zsh', ['-c', fakeTools], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const parsed = parsePortOutput(result.stdout);
  assert.equal(parsed.ports.length, 1);
  assert.equal(parsed.ports[0].local, '0.0.0.0:22');
  assert.equal(parsed.ports[0].pid, 123);
});

test('TCP port collection parses ss output without a netid column', () => {
  const source = readFileSync(new URL('./monitor.jsx', import.meta.url), 'utf8');
  const backtick = String.fromCharCode(96);
  const marker = 'const portCommand = String.raw' + backtick;
  const start = source.indexOf(marker);
  const end = source.indexOf(backtick + ';', start + marker.length);
  assert.ok(start >= 0 && end > start, '未找到 TCP 端口采集逻辑');
  const fakeTools = [
    "ss() { printf '%s\\n' 'LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:((\\\"sshd\\\",pid=123,fd=3))'; }",
    "ps() { printf '%s\\n' '/usr/sbin/sshd -D'; }",
    "lsof() { return 1; }",
    source.slice(start + marker.length, end),
  ].join('\n');
  const result = spawnSync('zsh', ['-c', fakeTools], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const parsed = parsePortOutput(result.stdout);
  assert.equal(parsed.ports.length, 1);
  assert.equal(parsed.ports[0].protocol, 'TCP');
  assert.equal(parsed.ports[0].local, '0.0.0.0:22');
  assert.equal(parsed.ports[0].pid, 123);
});

test('TCP port collection maps a pid-less published Docker port to its container', () => {
  const source = readFileSync(new URL('./monitor.jsx', import.meta.url), 'utf8');
  const backtick = String.fromCharCode(96);
  const marker = 'const portCommand = String.raw' + backtick;
  const start = source.indexOf(marker);
  const end = source.indexOf(backtick + ';', start + marker.length);
  assert.ok(start >= 0 && end > start, '未找到 TCP 端口采集逻辑');
  const fakeTools = [
    "ss() { printf '%s\\n' 'LISTEN 0 128 0.0.0.0:8080 0.0.0.0:*'; }",
    "docker() { printf '%s\\n' 'container-1|web|0.0.0.0:8080->80/tcp'; }",
    "ps() { return 1; }",
    source.slice(start + marker.length, end),
  ].join('\n');
  const result = spawnSync('zsh', ['-c', fakeTools], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const parsed = parsePortOutput(result.stdout);
  assert.equal(parsed.ports.length, 1);
  assert.equal(parsed.ports[0].pid, null);
  assert.equal(parsed.ports[0].container, 'web (container-1)');
});

test('TCP port collection maps docker-proxy ports even when the proxy has a pid', () => {
  const source = readFileSync(new URL('./monitor.jsx', import.meta.url), 'utf8');
  const backtick = String.fromCharCode(96);
  const marker = 'const portCommand = String.raw' + backtick;
  const start = source.indexOf(marker);
  const end = source.indexOf(backtick + ';', start + marker.length);
  assert.ok(start >= 0 && end > start, '未找到 TCP 端口采集逻辑');
  const fakeTools = [
    "ss() { printf '%s\\n' 'LISTEN 0 128 0.0.0.0:8080 0.0.0.0:* users:((\"docker-proxy\",pid=321,fd=4))'; }",
    "docker() { printf '%s\\n' 'container-2|api|0.0.0.0:8080->80/tcp'; }",
    "ps() { printf '%s\\n' '/usr/bin/docker-proxy -host-port 8080'; }",
    source.slice(start + marker.length, end),
  ].join('\n');
  const result = spawnSync('zsh', ['-c', fakeTools], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const parsed = parsePortOutput(result.stdout);
  assert.equal(parsed.ports.length, 1);
  assert.equal(parsed.ports[0].pid, 321);
  assert.equal(parsed.ports[0].process, 'docker-proxy');
  assert.equal(parsed.ports[0].container, 'api (container-2)');
});

test('parseProcessOutput parses resource fields and full commands', () => {
  const result = parseProcessOutput(`noise
__USSH_PROCESS_BEGIN__
process\t123\t1\troot\tS\t12.5\t3.4\t8192\t01:23\tsshd\t/usr/sbin/sshd -D --long-option
process\t456\t123\tapp\tR\t2.0\t1.0\t4096\t00:10\tworker\t/usr/bin/worker --config /etc/worker.conf
__USSH_PROCESS_END__`);

  assert.equal(result.error, '');
  assert.deepEqual(result.processes[0], {
    pid: 123,
    ppid: 1,
    user: 'root',
    state: 'S',
    cpu: 12.5,
    memory: 3.4,
    rssKb: 8192,
    elapsed: '01:23',
    name: 'sshd',
    command: '/usr/sbin/sshd -D --long-option',
  });
  assert.equal(result.processes.length, 2);
});

test('process collection fragment emits tab-separated records in zsh', () => {
  const source = readFileSync(new URL('./monitor.jsx', import.meta.url), 'utf8');
  const match = source.match(/const processCommand = String.raw`([\s\S]*?)`;/);
  assert.ok(match, '未找到进程采集逻辑');
  const fakePs = [
    "ps() { printf '%s\\n' ' 123 1 root S 12.5 3.4 8192 01:23 sshd /usr/sbin/sshd -D --long-option' ' 456 123 app R 2.0 1.0 4096 00:10 worker /usr/bin/worker --config /etc/worker.conf'; }",
    match[1],
  ].join('\n');
  const result = spawnSync('zsh', ['-c', fakePs], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const parsed = parseProcessOutput(result.stdout);
  assert.equal(parsed.error, '');
  assert.equal(parsed.processes.length, 2);
  assert.equal(parsed.processes[1].command, '/usr/bin/worker --config /etc/worker.conf');
});
