import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { ClipboardGetText } from '../../../wailsjs/runtime/runtime';

const defaultTerminalFontFamily = [
  '"FiraCode Nerd Font Mono"',
  '"JetBrainsMono Nerd Font Mono"',
  '"Hack Nerd Font Mono"',
  '"Agave Nerd Font Mono"',
  'Menlo',
  'Consolas',
  '"Courier New"',
  '"Apple Symbols"',
  '"Apple Color Emoji"',
  '"Segoe UI Emoji"',
  'monospace',
].join(', ');

function terminalFontFamily(fontFamily) {
  const selected = String(fontFamily || '').trim();
  if (!selected) return defaultTerminalFontFamily;
  return `"${selected.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}", ${defaultTerminalFontFamily}`;
}

export function TerminalView({ tab, active = true, onSend, onResize, onFocus, onTermReady, onReconnect, terminalSettings }) {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const terminalSettingsRef = useRef(terminalSettings);
  const tabStatusRef = useRef(tab.status);
  const reconnectRef = useRef(onReconnect);
  const activeRef = useRef(active);
  const onResizeRef = useRef(onResize);
  const scheduleFitRef = useRef(null);
  const fitRefreshTimersRef = useRef([]);
  activeRef.current = active;
  onResizeRef.current = onResize;
  const [ready, setReady] = useState(false);

  tabStatusRef.current = tab.status;

  useEffect(() => {
    terminalSettingsRef.current = terminalSettings;
  }, [terminalSettings]);

  useEffect(() => {
    reconnectRef.current = onReconnect;
  }, [onReconnect]);

  useEffect(() => {
    if (!hostRef.current) return;
    // 终端调色板：低饱和暗色风格，覆盖 xterm 默认的高饱和经典色，
    // SSH 与本地终端共用同一套 ANSI 颜色。
    const terminalTheme = {
      cursor: '#d0d4cb',
      cursorAccent: '#1d2225',
      foreground: '#c7ccc3',
      black: '#31363a',
      red: '#d8868b',
      green: '#8ea97b',
      yellow: '#cbb46f',
      // 使用低饱和蓝灰，避免高对比背景下蓝色过于跳脱。
      blue: '#9aaabd',
      magenta: '#bf9bc0',
      cyan: '#7fb5b0',
      white: '#c2c7c4',
      brightBlack: '#787f7c',
      brightRed: '#e39a9e',
      brightGreen: '#a3bd90',
      brightYellow: '#d9c48d',
      brightBlue: '#b2c0cd',
      brightMagenta: '#cdafcd',
      brightCyan: '#94c6c1',
      brightWhite: '#e6e9e4',
    };
    const term = new Terminal({
      cursorBlink: terminalSettings?.cursorBlink ?? true,
      // Nerd Font Mono 覆盖提示符图标与 powerline/emoji 类符号，缺失时逐级
      // 回退到系统符号与 emoji 字体，避免 canvas 渲染画方框。
      fontFamily: terminalFontFamily(terminalSettings?.fontFamily),
      fontSize: terminalSettings?.fontSize ?? 13,
      // 某些 shell 组合 ANSI 前景色和背景色时（例如绿色文字配绿色底），
      // 由 xterm 自动调整前景色以满足 WCAG AA 的可读性对比度。
      minimumContrastRatio: 4.5,
      // 画布背景完全透明：透明度由外层终端容器统一承担，文字保持不透明。
      theme: {
        ...terminalTheme,
        background: '#0b122000',
        selectionBackground: '#5f718a',
        selectionForeground: '#ffffff',
        selectionInactiveBackground: '#52647c',
      },
      allowTransparency: true,
      allowProposedApi: true,
      scrollback: terminalSettings?.scrollback ?? 5000,
      convertEol: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    termRef.current = term;
    fitRef.current = fit;

    let fitFrame = null;
    let lastColumns;
    let lastRows;
    const fitTerminal = () => {
      fitFrame = null;
      if (!activeRef.current || !hostRef.current?.clientWidth || !hostRef.current?.clientHeight) return;
      try {
        fit.fit();
        if (term.cols !== lastColumns || term.rows !== lastRows) {
          lastColumns = term.cols;
          lastRows = term.rows;
          onResizeRef.current({ columns: term.cols, rows: term.rows });
        }
      } catch (_) {}
    };
    // ResizeObserver and React effects can fire together; fit once before paint.
    const scheduleFit = () => {
      if (activeRef.current && fitFrame === null) {
        fitFrame = requestAnimationFrame(fitTerminal);
      }
    };
    scheduleFitRef.current = scheduleFit;
    scheduleFit();

    const viewport = hostRef.current.querySelector('.xterm-viewport');
    const showScrollIndicator = () => {
      hostRef.current?.classList.add('terminal-scrolling');
      window.clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = window.setTimeout(() => {
        hostRef.current?.classList.remove('terminal-scrolling');
      }, 700);
    };
    viewport?.addEventListener('scroll', showScrollIndicator, { passive: true });
    const copySelection = () => {
      if (!terminalSettingsRef.current?.copyOnSelect || !term.hasSelection()) return;
      const clipboard = navigator.clipboard;
      if (clipboard) clipboard.writeText(term.getSelection()).catch(() => {});
    };
    const pasteOnRightClick = event => {
      if (!terminalSettingsRef.current?.rightClickPaste) return;
      event.preventDefault();
      event.stopPropagation();
      const readClipboard = typeof window.runtime?.ClipboardGetText === 'function'
        ? ClipboardGetText()
        : navigator.clipboard?.readText?.();
      Promise.resolve(readClipboard)
        .then(text => {
          if (text) term.paste(text);
        })
        .catch(() => {})
        .finally(() => term.focus());
    };
    const selectionDisposable = term.onSelectionChange(copySelection);
    const screen = hostRef.current.querySelector('.xterm-screen');
    screen?.addEventListener('contextmenu', pasteOnRightClick, true);

    term.attachCustomKeyEventHandler(event => {
      const isPlainEnter = event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.metaKey;
      if (event.type !== 'keydown' || !isPlainEnter || tabStatusRef.current !== 'closed') return true;
      event.preventDefault();
      reconnectRef.current?.();
      return false;
    });

    setReady(true);

    const subscription = term.onData(data => {
      onSend(data);
    });

    const ro = new ResizeObserver(scheduleFit);
    ro.observe(hostRef.current);
    window.addEventListener('resize', scheduleFit);

    try {
      term.focus();
    } catch (_) {}

    if (onTermReady) onTermReady(term, tab.id);

    return () => {
      if (onTermReady) onTermReady(null, tab.id);
      ro.disconnect();
      window.removeEventListener('resize', scheduleFit);
      if (fitFrame !== null) cancelAnimationFrame(fitFrame);
      scheduleFitRef.current = null;
      fitRefreshTimersRef.current.forEach(timer => window.clearTimeout(timer));
      fitRefreshTimersRef.current = [];
      viewport?.removeEventListener('scroll', showScrollIndicator);
      screen?.removeEventListener('contextmenu', pasteOnRightClick, true);
      window.clearTimeout(scrollTimerRef.current);
      selectionDisposable.dispose();
      subscription.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  useEffect(() => {
    const term = termRef.current;
    if (!term || !terminalSettings) return;
    term.options.cursorBlink = terminalSettings.cursorBlink;
    term.options.fontFamily = terminalFontFamily(terminalSettings.fontFamily);
    term.options.fontSize = terminalSettings.fontSize;
    term.options.scrollback = terminalSettings.scrollback;
    scheduleFitRef.current?.();
  }, [terminalSettings?.cursorBlink, terminalSettings?.fontFamily, terminalSettings?.fontSize, terminalSettings?.scrollback]);

  useEffect(() => {
    if (tab.buffer && termRef.current) {
      try {
        termRef.current.write(tab.buffer);
      } catch (_) {}
    }
  }, [tab.buffer, ready]);

  useEffect(() => {
    if (!ready || !active) return undefined;
    // A terminal tab is kept mounted in an invisible overlay. When it becomes
    // visible, xterm may have measured the old (hidden) geometry already, and
    // the parent does not necessarily emit another ResizeObserver notification.
    // Refit across the next few layout passes so full-screen TUIs receive the
    // current PTY size without requiring a manual window resize.
    scheduleFitRef.current?.();
    fitRefreshTimersRef.current.forEach(timer => window.clearTimeout(timer));
    fitRefreshTimersRef.current = [0, 40, 160].map(delay => window.setTimeout(() => {
      scheduleFitRef.current?.();
    }, delay));
    return () => {
      fitRefreshTimersRef.current.forEach(timer => window.clearTimeout(timer));
      fitRefreshTimersRef.current = [];
    };
  }, [active, ready, tab.status]);

  useEffect(() => {
    if (active && ready && termRef.current && tab.id) {
      try {
        termRef.current.focus();
      } catch (_) {}
      onFocus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ready, tab.id]);

  return (
    <div className="app-no-drag relative h-full w-full overflow-hidden">
      <div ref={hostRef} className="terminal-host" />
      {tab.status === 'connecting' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#0b1220]/90">
          <div className="flex flex-col items-center gap-3 text-slate-200">
            <span className="relative flex h-14 w-14 items-center justify-center">
              <span className="absolute inset-0 rounded-full border-2 border-emerald-400/20 animate-ping" />
              <span className="absolute inset-1 rounded-full border border-emerald-400/40" />
              <LoaderCircle className="h-7 w-7 animate-spin text-emerald-400" />
            </span>
            <div className="text-center">
              <p className="text-sm font-medium">正在连接 {tab.label}</p>
              <p className="mt-1 text-xs text-slate-400">{tab.kind === 'local' ? '正在启动本地 shell…' : '正在建立安全 SSH 会话…'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
