import { useCallback, useEffect, useState } from 'react';
import { useTheme } from './use-theme';
import { api } from '@/lib/api';

const STORAGE_KEY = 'ussh-settings';
const DEFAULT_SETTINGS = {
  density: 'compact',
  gpuAcceleration: true,
  backdropType: 'acrylic',
  terminal: {
    fontSize: 13,
    cursorBlink: true,
    copyOnSelect: false,
    rightClickPaste: false,
    scrollback: 5000,
    opacity: 100,
  },
  ai: {
    baseURL: '',
    apiKey: '',
    model: '',
    visibleModels: [],
    agent: {
      autoApproveReadonly: true,
      useTools: false,
      maxSteps: 12,
      commandTimeoutSec: 30,
    },
  },
};
const DENSITIES = ['compact', 'default', 'comfortable'];
const AGENT_MAX_STEPS = [6, 12, 20];
const AGENT_TIMEOUTS = [15, 30, 60, 120];
const FONT_SIZES = [12, 13, 14, 15, 16];
const SCROLLBACK_VALUES = [1000, 5000, 10000, 20000];
const MIN_OPACITY = 10;
const MAX_OPACITY = 100;
const BACKDROP_TYPES = ['none', 'mica', 'acrylic'];

function readSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const terminal = stored.terminal || {};
    const ai = stored.ai || {};
    const agent = ai.agent || {};
    return {
      density: DENSITIES.includes(stored.density) ? stored.density : DEFAULT_SETTINGS.density,
      gpuAcceleration: typeof stored.gpuAcceleration === 'boolean' ? stored.gpuAcceleration : DEFAULT_SETTINGS.gpuAcceleration,
      backdropType: BACKDROP_TYPES.includes(stored.backdropType) ? stored.backdropType : DEFAULT_SETTINGS.backdropType,
      terminal: {
        fontSize: FONT_SIZES.includes(terminal.fontSize) ? terminal.fontSize : DEFAULT_SETTINGS.terminal.fontSize,
        cursorBlink: typeof terminal.cursorBlink === 'boolean' ? terminal.cursorBlink : DEFAULT_SETTINGS.terminal.cursorBlink,
        copyOnSelect: typeof terminal.copyOnSelect === 'boolean' ? terminal.copyOnSelect : DEFAULT_SETTINGS.terminal.copyOnSelect,
        rightClickPaste: typeof terminal.rightClickPaste === 'boolean' ? terminal.rightClickPaste : DEFAULT_SETTINGS.terminal.rightClickPaste,
        scrollback: SCROLLBACK_VALUES.includes(terminal.scrollback)
          ? terminal.scrollback
          : DEFAULT_SETTINGS.terminal.scrollback,
        opacity:
          typeof terminal.opacity === 'number' && Number.isFinite(terminal.opacity)
            ? Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, Math.round(terminal.opacity)))
            : DEFAULT_SETTINGS.terminal.opacity,
      },
      ai: {
        baseURL: typeof ai.baseURL === 'string' ? ai.baseURL : DEFAULT_SETTINGS.ai.baseURL,
        apiKey: typeof ai.apiKey === 'string' ? ai.apiKey : DEFAULT_SETTINGS.ai.apiKey,
        model: typeof ai.model === 'string' ? ai.model : DEFAULT_SETTINGS.ai.model,
        visibleModels: Array.isArray(ai.visibleModels) ? ai.visibleModels : DEFAULT_SETTINGS.ai.visibleModels,
        agent: {
          autoApproveReadonly: typeof agent.autoApproveReadonly === 'boolean'
            ? agent.autoApproveReadonly
            : DEFAULT_SETTINGS.ai.agent.autoApproveReadonly,
          useTools: typeof agent.useTools === 'boolean' ? agent.useTools : DEFAULT_SETTINGS.ai.agent.useTools,
          maxSteps: AGENT_MAX_STEPS.includes(agent.maxSteps) ? agent.maxSteps : DEFAULT_SETTINGS.ai.agent.maxSteps,
          commandTimeoutSec: AGENT_TIMEOUTS.includes(agent.commandTimeoutSec)
            ? agent.commandTimeoutSec
            : DEFAULT_SETTINGS.ai.agent.commandTimeoutSec,
        },
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
      // GPU 开关与背景材质由 Go 端保存，这里只在变化时落盘：GPU 重启生效，macOS 背景材质即时生效。
      if (next.gpuAcceleration !== settings.gpuAcceleration) {
        api.setGpuAcceleration(Boolean(next.gpuAcceleration)).catch(() => {});
      }
      if (next.backdropType !== settings.backdropType) {
        api.setBackdropType(next.backdropType).catch(() => {});
      }
    },
    [setTheme, settings.gpuAcceleration, settings.backdropType],
  );

  return {
    settings: { ...settings, theme },
    applySettings,
  };
}
