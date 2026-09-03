import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { ClipboardGetText } from '../../../wailsjs/runtime/runtime';

export function TerminalView({ tab, active = true, onSend, onResize, onFocus, onTermReady, onReconnect, terminalSettings }) {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const scrollTimerRef = useRef(null);
  const terminalSettingsRef = useRef(terminalSettings);
  const tabStatusRef = useRef(tab.status);
  const reconnectRef = useRef(onReconnect);
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
    const term = new Terminal({
      cursorBlink: terminalSettings?.cursorBlink ?? true,
      fontFamily: 'Menlo, Consolas, "Courier New", monospace',
      fontSize: terminalSettings?.fontSize ?? 13,
      // 画布背景完全透明：透明度由外层终端容器统一承担，文字保持不透明。
      theme: {
        background: '#0b122000',
        foreground: '#e2e8f0',
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

    const fitTerminal = () => {
      try {
        fit.fit();
        onResize({ columns: term.cols, rows: term.rows });
      } catch (_) {}
    };
    requestAnimationFrame(fitTerminal);

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

    const ro = new ResizeObserver(() => {
      fitTerminal();
    });
    ro.observe(hostRef.current);
    window.addEventListener('resize', fitTerminal);

    try {
      term.focus();
    } catch (_) {}

    if (onTermReady) onTermReady(term, tab.id);

    return () => {
      if (onTermReady) onTermReady(null, tab.id);
      ro.disconnect();
      window.removeEventListener('resize', fitTerminal);
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
    term.options.fontSize = terminalSettings.fontSize;
    term.options.scrollback = terminalSettings.scrollback;
    try {
      fitRef.current?.fit();
      onResize({ columns: term.cols, rows: term.rows });
    } catch (_) {}
  }, [terminalSettings?.cursorBlink, terminalSettings?.fontSize, terminalSettings?.scrollback, onResize]);

  useEffect(() => {
    if (tab.buffer && termRef.current) {
      try {
        termRef.current.write(tab.buffer);
      } catch (_) {}
    }
  }, [tab.buffer, ready]);

  useEffect(() => {
    if (ready && fitRef.current) {
      try {
        fitRef.current.fit();
        onResize({ columns: termRef.current?.cols, rows: termRef.current?.rows });
      } catch (_) {}
    }
  }, [ready, tab.status]);

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
              <p className="mt-1 text-xs text-slate-400">正在建立安全 SSH 会话…</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
