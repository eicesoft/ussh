import { useEffect } from 'react';
import { onTerminalOutput, onTerminalStatus, runtimeAvailable } from '@/lib/api';

export function useTerminalEvents({ onOutput, onStatus }) {
  useEffect(() => {
    if (!runtimeAvailable) return undefined;
    const offOutput = onTerminalOutput(payload => {
      if (!payload?.tabId) return;
      onOutput(payload.tabId, payload.data);
    });
    const offStatus = onTerminalStatus(payload => {
      if (!payload) return;
      onStatus(payload);
    });
    return () => {
      offOutput?.();
      offStatus?.();
    };
  }, [onOutput, onStatus]);
}