import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decorateAgentMarkers } from '@/lib/terminal-output';

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

const TABS_STORAGE_KEY = 'ussh-open-tabs';
const DEFAULT_WORKSPACE_ID = 'workspace-default';

const newWorkspaceId = () =>
  `workspace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const createDashboardTab = workspaceId => ({
  id: newTabId(),
  kind: 'dashboard',
  label: '总览',
  status: 'idle',
  buffer: '',
  closable: false,
  workspaceId,
});

function makeWorkspace(name = '默认', id = DEFAULT_WORKSPACE_ID) {
  const dashboard = createDashboardTab(id);
  return {
    workspace: { id, name, icon: id === DEFAULT_WORKSPACE_ID ? 'home' : 'workspace', activeTabId: dashboard.id },
    dashboard,
  };
}

function restoreWorkspace(rawWorkspace, fallbackId, fallbackName) {
  const id = typeof rawWorkspace?.id === 'string' && rawWorkspace.id.trim()
    ? rawWorkspace.id
    : fallbackId;
  const name = typeof rawWorkspace?.name === 'string' && rawWorkspace.name.trim()
    ? rawWorkspace.name.trim()
    : fallbackName;
  const { workspace, dashboard } = makeWorkspace(name, id);
  const links = Array.isArray(rawWorkspace?.tabs) ? rawWorkspace.tabs : [];
  const connections = links
    .filter(link => Number(link?.sourceNodeId) > 0)
    .map(link => ({
      id: newTabId(),
      kind: 'connection',
      label: '连接',
      status: 'idle',
      buffer: '',
      closable: true,
      pinned: Boolean(link?.pinned),
      sourceNodeId: Number(link.sourceNodeId),
      restorePending: true,
      workspaceId: id,
      form: { ...blankForm },
    }));
  const activeSourceNodeId = Number(rawWorkspace?.activeSourceNodeId) || 0;
  const activeLinkIndex = Number(rawWorkspace?.activeLinkIndex);
  const activeTab = Number.isInteger(activeLinkIndex) && activeLinkIndex >= 0
    ? connections[activeLinkIndex]
    : connections.find(tab => tab.sourceNodeId === activeSourceNodeId);
  workspace.activeTabId = activeTab?.id || dashboard.id;
  return { workspace, tabs: [dashboard, ...connections] };
}

function getInitialTabs(restoreTabs) {
  const fresh = makeWorkspace();
  if (!restoreTabs) {
    return {
      workspaces: [fresh.workspace],
      activeWorkspaceId: fresh.workspace.id,
      tabs: [fresh.dashboard],
      activeId: fresh.dashboard.id,
    };
  }

  try {
    const snapshot = JSON.parse(localStorage.getItem(TABS_STORAGE_KEY) || 'null');
    if (!snapshot) {
      return {
        workspaces: [fresh.workspace],
        activeWorkspaceId: fresh.workspace.id,
        tabs: [fresh.dashboard],
        activeId: fresh.dashboard.id,
      };
    }

    // 新格式按工作区保存连接 Tab；旧格式迁移到“默认”工作区。
    const rawWorkspaces = Array.isArray(snapshot.workspaces)
      ? snapshot.workspaces
      : [{
        id: DEFAULT_WORKSPACE_ID,
        name: '默认',
        tabs: Array.isArray(snapshot.links)
          ? snapshot.links
          : Array.isArray(snapshot.tabs)
            ? snapshot.tabs
              .filter(tab => tab?.kind !== 'dashboard')
              .map(tab => ({
                sourceNodeId: tab?.sourceNodeId,
                pinned: tab?.pinned,
              }))
            : [],
        activeSourceNodeId: snapshot.activeSourceNodeId,
        activeLinkIndex: snapshot.activeLinkIndex,
      }];
    const restored = rawWorkspaces.map((workspace, index) => restoreWorkspace(
      workspace,
      index === 0 ? DEFAULT_WORKSPACE_ID : newWorkspaceId(),
      index === 0 ? '默认' : `工作区 ${index + 1}`,
    ));
    const validRestored = restored.length > 0 ? restored : [fresh];
    const workspaces = validRestored.map(item => item.workspace);
    const activeWorkspaceId = workspaces.some(workspace => workspace.id === snapshot.activeWorkspaceId)
      ? snapshot.activeWorkspaceId
      : workspaces[0].id;
    const activeWorkspace = workspaces.find(workspace => workspace.id === activeWorkspaceId);
    const tabs = validRestored.flatMap(item => item.tabs);
    return {
      workspaces,
      activeWorkspaceId,
      tabs,
      activeId: activeWorkspace?.activeTabId || tabs.find(tab => tab.workspaceId === activeWorkspaceId)?.id,
    };
  } catch (_) {
    return {
      workspaces: [fresh.workspace],
      activeWorkspaceId: fresh.workspace.id,
      tabs: [fresh.dashboard],
      activeId: fresh.dashboard.id,
    };
  }
}

function serializeTab(tab) {
  const sourceNodeId = Number(tab.sourceNodeId) || 0;
  if (tab.kind === 'dashboard' || sourceNodeId <= 0) return null;
  return {
    sourceNodeId,
    pinned: Boolean(tab.pinned),
  };
}

function persistTabs(workspaces, tabs, activeWorkspaceId, activeId, enabled) {
  try {
    if (!enabled) {
      localStorage.removeItem(TABS_STORAGE_KEY);
      return;
    }
    const savedWorkspaces = workspaces.map(workspace => {
      const savedTabs = tabs
        .filter(tab => tab.workspaceId === workspace.id)
        .map(tab => ({ tab, saved: serializeTab(tab) }))
        .filter(item => item.saved);
      const workspaceActiveId = workspace.activeTabId || (workspace.id === activeWorkspaceId ? activeId : undefined);
      const activeTab = tabs.find(tab => tab.id === workspaceActiveId && tab.workspaceId === workspace.id);
      const activeLinkIndex = savedTabs.findIndex(item => item.tab.id === activeTab?.id);
      return {
        id: workspace.id,
        name: workspace.name,
        icon: workspace.icon,
        activeSourceNodeId: Number(activeTab?.sourceNodeId) || 0,
        activeLinkIndex,
        tabs: savedTabs.map(item => item.saved),
      };
    });
    localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify({
      version: 2,
      activeWorkspaceId,
      workspaces: savedWorkspaces,
    }));
  } catch (_) {}
}

export function useTabs({ restoreTabs = true } = {}) {
  const [initialState] = useState(() => getInitialTabs(restoreTabs));
  const [workspaces, setWorkspaces] = useState(initialState.workspaces);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(initialState.activeWorkspaceId);
  const [tabs, setTabs] = useState(initialState.tabs);
  const [activeId, setActiveId] = useState(initialState.activeId);
  const buffersRef = useRef({});
  const termsRef = useRef({});

  useEffect(() => {
    persistTabs(workspaces, tabs, activeWorkspaceId, activeId, restoreTabs);
  }, [activeId, activeWorkspaceId, restoreTabs, tabs, workspaces]);

  const setTabStatus = useCallback((tabId, status) => {
    setTabs(prev => prev.map(t => (t.id === tabId ? { ...t, status } : t)));
  }, []);

  const writeToTab = useCallback((tabId, data) => {
    const displayData = decorateAgentMarkers(data);
    const previous = buffersRef.current[tabId] || '';
    buffersRef.current[tabId] = (previous + displayData).slice(-2_000_000);
    const term = termsRef.current[tabId];
    if (term) {
      try {
        term.write(displayData);
      } catch (_) {}
    }
  }, []);

  const selectTab = useCallback(id => {
    const tab = tabs.find(item => item.id === id);
    if (!tab || tab.workspaceId !== activeWorkspaceId) return;
    setActiveId(id);
    setWorkspaces(prev => prev.map(workspace => (
      workspace.id === activeWorkspaceId ? { ...workspace, activeTabId: id } : workspace
    )));
  }, [activeWorkspaceId, tabs]);

  const switchWorkspace = useCallback(id => {
    if (!workspaces.some(workspace => workspace.id === id) || id === activeWorkspaceId) return;
    setWorkspaces(prev => prev.map(workspace => (
      workspace.id === activeWorkspaceId ? { ...workspace, activeTabId: activeId } : workspace
    )));
    const target = workspaces.find(workspace => workspace.id === id);
    const nextTab = tabs.find(tab => tab.id === target.activeTabId && tab.workspaceId === id)
      || tabs.find(tab => tab.workspaceId === id && tab.kind === 'dashboard')
      || tabs.find(tab => tab.workspaceId === id);
    setActiveWorkspaceId(id);
    setActiveId(nextTab?.id);
  }, [activeId, activeWorkspaceId, tabs, workspaces]);

  const createWorkspace = useCallback(name => {
    const id = newWorkspaceId();
    const created = makeWorkspace(name.trim() || '新工作区', id);
    setWorkspaces(prev => [...prev, created.workspace]);
    setTabs(prev => [...prev, created.dashboard]);
    setActiveWorkspaceId(id);
    setActiveId(created.dashboard.id);
    return created.workspace;
  }, []);

  const deleteWorkspace = useCallback(id => {
    if (workspaces.length <= 1) return false;
    const targetIndex = workspaces.findIndex(workspace => workspace.id === id);
    if (targetIndex < 0) return false;

    const remainingWorkspaces = workspaces.filter(workspace => workspace.id !== id);
    const removedTabs = tabs.filter(tab => tab.workspaceId === id);
    const remainingTabs = tabs.filter(tab => tab.workspaceId !== id);
    removedTabs.forEach(tab => {
      delete buffersRef.current[tab.id];
      delete termsRef.current[tab.id];
    });

    if (id === activeWorkspaceId) {
      const nextWorkspace = remainingWorkspaces[Math.min(targetIndex, remainingWorkspaces.length - 1)];
      const nextTab = remainingTabs.find(tab => tab.id === nextWorkspace.activeTabId && tab.workspaceId === nextWorkspace.id)
        || remainingTabs.find(tab => tab.workspaceId === nextWorkspace.id && tab.kind === 'dashboard')
        || remainingTabs.find(tab => tab.workspaceId === nextWorkspace.id);
      setActiveWorkspaceId(nextWorkspace.id);
      setActiveId(nextTab?.id);
    }

    setWorkspaces(remainingWorkspaces);
    setTabs(remainingTabs);
    return true;
  }, [activeWorkspaceId, tabs, workspaces]);

  const newTab = useCallback(() => {
    const id = newTabId();
    const tab = {
      id,
      kind: 'connection',
      label: '连接',
      status: 'idle',
      buffer: '',
      closable: true,
      workspaceId: activeWorkspaceId,
      form: { ...blankForm },
    };
    setTabs(prev => [...prev, tab]);
    setWorkspaces(prev => prev.map(workspace => (
      workspace.id === activeWorkspaceId ? { ...workspace, activeTabId: id } : workspace
    )));
    setActiveId(id);
    return id;
  }, [activeWorkspaceId]);

  const closeTab = useCallback(
    id => {
      const closingTab = tabs.find(tab => tab.id === id);
      if (!closingTab?.closable) return;
      setTabs(prev => prev.filter(t => t.id !== id));
      if (activeId === id) {
        const nextTab = tabs.find(tab => tab.workspaceId === activeWorkspaceId && tab.id !== id && tab.kind === 'dashboard')
          || tabs.find(tab => tab.workspaceId === activeWorkspaceId && tab.id !== id);
        setActiveId(nextTab?.id);
        setWorkspaces(prev => prev.map(workspace => (
          workspace.id === activeWorkspaceId ? { ...workspace, activeTabId: nextTab?.id } : workspace
        )));
      }
      if (buffersRef.current[id]) delete buffersRef.current[id];
    },
    [activeId, activeWorkspaceId, tabs],
  );

  const updateTab = useCallback((id, patch) => {
    setTabs(prev =>
      prev.map(t => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t)),
    );
  }, []);

  const toggleTabPinned = useCallback(id => {
    setTabs(prev => {
      const next = prev.map(tab => (tab.id === id ? { ...tab, pinned: !tab.pinned } : tab));
      const workspaceTabs = next.filter(tab => tab.workspaceId === activeWorkspaceId);
      const otherTabs = next.filter(tab => tab.workspaceId !== activeWorkspaceId);
      const overviewTabs = workspaceTabs.filter(tab => tab.kind === 'dashboard');
      const connectionTabs = workspaceTabs.filter(tab => tab.kind !== 'dashboard');
      return [
        ...otherTabs,
        ...overviewTabs,
        ...connectionTabs.filter(tab => tab.pinned),
        ...connectionTabs.filter(tab => !tab.pinned),
      ];
    });
  }, [activeWorkspaceId]);

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

  const activeTab = useMemo(
    () => tabs.find(tab => tab.id === activeId && tab.workspaceId === activeWorkspaceId)
      || tabs.find(tab => tab.workspaceId === activeWorkspaceId)
      || tabs[0],
    [activeId, activeWorkspaceId, tabs],
  );
  const workspaceTabs = useMemo(
    () => tabs.filter(tab => tab.workspaceId === activeWorkspaceId),
    [activeWorkspaceId, tabs],
  );

  return {
    tabs,
    workspaceTabs,
    workspaces,
    activeWorkspaceId,
    activeId,
    activeTab,
    selectTab,
    switchWorkspace,
    createWorkspace,
    deleteWorkspace,
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
