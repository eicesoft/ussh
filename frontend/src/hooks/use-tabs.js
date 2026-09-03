import { useCallback, useMemo, useRef, useState } from 'react';

export const blankForm = {
  host: '',
  port: 22,
  username: '',
  password: '',
  privateKey: '',
  passphrase: '',
  keyFile: '',
  authType: 'password',
  savedNodeId: 0,
};

const newTabId = () =>
  `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function useTabs() {
  const [tabs, setTabs] = useState(() => [
    { id: newTabId(), kind: 'dashboard', label: '总览', status: 'idle', buffer: '', closable: false },
  ]);
  const [activeId, setActiveId] = useState(tabs[0].id);
  const buffersRef = useRef({});
  const termsRef = useRef({});

  const setTabStatus = useCallback((tabId, status) => {
    setTabs(prev => prev.map(t => (t.id === tabId ? { ...t, status } : t)));
  }, []);

  const writeToTab = useCallback((tabId, data) => {
    const previous = buffersRef.current[tabId] || '';
    buffersRef.current[tabId] = (previous + data).slice(-2_000_000);
    const term = termsRef.current[tabId];
    if (term) {
      try {
        term.write(data);
      } catch (_) {}
    }
  }, []);

  const selectTab = id => setActiveId(id);

  const newTab = useCallback(() => {
    const id = newTabId();
    const tab = { id, kind: 'connection', label: '连接', status: 'idle', buffer: '', closable: true, form: blankForm };
    setTabs(prev => [...prev, tab]);
    setActiveId(id);
    return id;
  }, []);

  const closeTab = useCallback(
    id => {
      setTabs(prev => {
        const remaining = prev.filter(t => t.id !== id);
        if (remaining.length === 0) {
          const fresh = {
            id: newTabId(),
            kind: 'dashboard',
            label: '总览',
            status: 'idle',
            buffer: '',
            closable: false,
          };
          setActiveId(fresh.id);
          return [fresh];
        }
        if (activeId === id) setActiveId(remaining[0].id);
        return remaining;
      });
      if (buffersRef.current[id]) delete buffersRef.current[id];
    },
    [activeId],
  );

  const updateTab = useCallback((id, patch) => {
    setTabs(prev =>
      prev.map(t => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t)),
    );
  }, []);

  const toggleTabPinned = useCallback(id => {
    setTabs(prev => {
      const next = prev.map(tab => (tab.id === id ? { ...tab, pinned: !tab.pinned } : tab));
      const overviewTabs = next.filter(tab => tab.kind === 'dashboard');
      const connectionTabs = next.filter(tab => tab.kind !== 'dashboard');
      return [
        ...overviewTabs,
        ...connectionTabs.filter(tab => tab.pinned),
        ...connectionTabs.filter(tab => !tab.pinned),
      ];
    });
  }, []);

  const registerTerm = useCallback((id, term) => {
    if (term) {
      termsRef.current[id] = term;
      const pending = buffersRef.current[id];
      if (pending) {
        try {
          term.write(pending);
        } catch (_) {}
      }
    } else {
      delete termsRef.current[id];
    }
  }, []);

  const activeTab = useMemo(() => tabs.find(t => t.id === activeId) || tabs[0], [tabs, activeId]);

  return {
    tabs,
    activeId,
    activeTab,
    selectTab,
    newTab,
    closeTab,
    setTabStatus,
    writeToTab,
    updateTab,
    toggleTabPinned,
    registerTerm,
    buffersRef,
    termsRef,
  };
}
