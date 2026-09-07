import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

function mount(active = true) {
  const effects = [], frames = new Map();
  let observer, fits = 0, notifications = 0, nextFrame = 0;
  const host = { querySelector() {}, clientWidth: 800, clientHeight: 600 };
  const terminal = { cols: 80, rows: 24, options: {}, loadAddon() {}, open() {}, focus() {}, attachCustomKeyEventHandler() {}, onSelectionChange: () => ({ dispose() {} }), onData: () => ({ dispose() {} }), dispose() {} };
  const source = readFileSync(new URL('../src/components/connection/terminal-view.jsx', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export function'), source.indexOf('\n  return (')).replace('export function', 'function') + '\n}';
  const context = vm.createContext({
    useRef: value => ({ current: value === null ? host : value }),
    useState: () => [false, () => {}], useEffect: fn => effects.push(fn),
    Terminal: function () { return terminal; }, FitAddon: function () { this.fit = () => fits++; },
    ResizeObserver: function (fn) { observer = fn; this.observe = () => {}; this.disconnect = () => {}; },
    requestAnimationFrame: fn => { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
    window: { addEventListener() {}, removeEventListener() {}, clearTimeout() {} },
  });
  vm.runInContext(body + '\nthis.mount = TerminalView;', context);
  context.mount({ tab: { id: 'test', status: 'connected' }, active, onResize: () => notifications++, onSend() {}, terminalSettings: {} });
  const cleanups = effects.map(fn => fn());
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
  flush(); fits = 0; notifications = 0;
  return { terminal, observer: () => observer(), flush, counts: () => ({ fits, notifications }), cleanup: () => cleanups.forEach(fn => fn?.()) };
}

test('coalesces resize bursts and skips unchanged terminal dimensions', () => {
  const app = mount();
  for (let i = 0; i < 100; i++) app.observer();
  app.flush();
  assert.ok(app.counts().fits <= 1, JSON.stringify(app.counts()));
  assert.equal(app.counts().notifications, 0);
  app.cleanup();
});

test('hidden terminals do no resize work while dragging', () => {
  const app = mount(false);
  app.observer(); app.flush();
  assert.equal(app.counts().fits, 0);
  app.cleanup();
});

test('reports changed dimensions once and cancels work on unmount', () => {
  const app = mount();
  app.terminal.cols = 100;
  app.observer(); app.observer(); app.flush();
  assert.deepEqual(app.counts(), { fits: 1, notifications: 1 });
  app.observer();
  app.cleanup();
  app.flush();
  assert.deepEqual(app.counts(), { fits: 1, notifications: 1 });
});
