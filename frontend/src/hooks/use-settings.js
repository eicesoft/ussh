import { useCallback, useEffect, useState } from 'react';
import { useTheme } from './use-theme';

const STORAGE_KEY = 'ussh-settings';
const DEFAULT_SETTINGS = {
  density: 'compact',
  terminal: {
    fontSize: 13,
    cursorBlink: true,
    copyOnSelect: false,
    rightClickPaste: false,
    scrollback: 5000,
  },
};
const DENSITIES = ['compact', 'default', 'comfortable'];
const FONT_SIZES = [12, 13, 14, 15, 16];
const SCROLLBACK_VALUES = [1000, 5000, 10000, 20000];

function readSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const terminal = stored.terminal || {};
    return {
      density: DENSITIES.includes(stored.density) ? stored.density : DEFAULT_SETTINGS.density,
      terminal: {
        fontSize: FONT_SIZES.includes(terminal.fontSize) ? terminal.fontSize : DEFAULT_SETTINGS.terminal.fontSize,
        cursorBlink: typeof terminal.cursorBlink === 'boolean' ? terminal.cursorBlink : DEFAULT_SETTINGS.terminal.cursorBlink,
        copyOnSelect: typeof terminal.copyOnSelect === 'boolean' ? terminal.copyOnSelect : DEFAULT_SETTINGS.terminal.copyOnSelect,
        rightClickPaste: typeof terminal.rightClickPaste === 'boolean' ? terminal.rightClickPaste : DEFAULT_SETTINGS.terminal.rightClickPaste,
        scrollback: SCROLLBACK_VALUES.includes(terminal.scrollback)
          ? terminal.scrollback
          : DEFAULT_SETTINGS.terminal.scrollback,
      },
    };
  } catch (_) {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState(readSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const applySettings = useCallback(
    next => {
      setSettings(next);
      setTheme(next.theme);
    },
    [setTheme],
  );

  return {
    settings: { ...settings, theme },
    applySettings,
  };
}
