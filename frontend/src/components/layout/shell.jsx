import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import { PersistedWidthPanel } from '@/components/ui/persisted-width-panel';
import { Quit, WindowIsMaximised, WindowMinimise, WindowToggleMaximise } from '../../../wailsjs/runtime/runtime';
import { Maximize2, Minus, PanelLeftClose, PanelLeftOpen, Settings, X } from 'lucide-react';
import { ConnectionTree } from './connection-tree';
import { TabBar } from './tab-bar';
import { UtilityPanel } from './utility-panel';
import { StatusBar } from './status-bar';
import { BroadcastInput } from './broadcast-input';
import { ConnectionForm } from '@/components/connection/connection-form';
import { TerminalView } from '@/components/connection/terminal-view';
import { TerminalLogDialog } from '@/components/connection/terminal-log-dialog';
import { TerminalLogView } from '@/components/connection/terminal-log-view';
import { TerminalActions } from '@/components/connection/terminal-actions';
import { SavedLinkDialog } from '@/components/connection/saved-link-dialog';
import { NewFolderDialog } from '@/components/connection/new-folder-dialog';
import { NewWorkspaceDialog } from './new-workspace-dialog';
import { ConfirmDeleteDialog } from '@/components/connection/confirm-delete-dialog';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { AboutDialog } from '@/components/about-dialog';
import { ConnectionDashboard } from '@/components/dashboard/connection-dashboard';
import { useTabs } from '@/hooks/use-tabs';
import { useSavedNodes } from '@/hooks/use-saved-nodes';
import { useTerminalEvents } from '@/hooks/use-terminal-event';
import { useSettings } from '@/hooks/use-settings';
import { api, onShowAbout, onShowQuitConfirm, onShowSettings, runtimeAvailable } from '@/lib/api';
import { cn } from '@/lib/utils';
import { matchesShortcut } from '@/lib/shortcuts';
import { DEFAULT_FOLDER_COLOR, normalizeFolderColor } from '@/lib/folder-colors';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import '@/plugins';
import { PluginContext } from '@/plugins/context';

export function Shell() {
  const { settings, applySettings, patchSettings } = useSettings();
  const {
    tabs,
    workspaceTabs,
    workspaces,
    activeWorkspaceId,
    activeId,
    activeTab,
    selectTab,
    switchWorkspace,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    newTab,
    openTab,
    closeTab,
    setTabStatus,
    writeToTab,
    updateTab,
    toggleTabPinned,
    registerTerm,
    termsRef,
  } = useTabs({ restoreTabs: settings.restoreTabs });

  const {
    nodes,
    loaded: savedNodesLoaded,
    createFolder,
    updateFolder,
    deleteFolder,
    createSSHLink,
    moveNode,
    updateSSHLink,
    cloneSSHLink,
    deleteSSHLink,
    getCredential,
    setCredential,
    pickPrivateKeyFile,
    reorderNodes,
  } = useSavedNodes();
  const [globalStatus, setGlobalStatus] = useState('准备就绪');
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [previewTerminalOpacity, setPreviewTerminalOpacity] = useState(null);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [showQuitDialog, setShowQuitDialog] = useState(false);
  const [showBroadcastInput, setShowBroadcastInput] = useState(false);
  const [logSourceTab, setLogSourceTab] = useState(null);
  const [showSavedLinkDialog, setShowSavedLinkDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [showNewWorkspaceDialog, setShowNewWorkspaceDialog] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState(null);
  const [newFolderParentId, setNewFolderParentId] = useState(0);
  const [editingFolder, setEditingFolder] = useState(null);
  const [newLinkParentId, setNewLinkParentId] = useState(0);
  const [editingNode, setEditingNode] = useState(null);
  const [editingCredential, setEditingCredential] = useState(null);
  const [deletingNode, setDeletingNode] = useState(null);
  const [deletingWorkspace, setDeletingWorkspace] = useState(null);
  const [activeUtility, setActiveUtility] = useState(null);
  const [isWindowMaximised, setIsWindowMaximised] = useState(false);
  const connectionTreeHeaderRef = useRef(null);
  const [isConnectionTreeVisible, setIsConnectionTreeVisible] = useState(true);
  const connectionTreePanelRef = usePanelRef();
  const settingsButtonRef = useRef(null);
  const systemInfoRequestsRef = useRef(new Set());

  useEffect(() => {
    if (!window.runtime) return undefined;
    let cancelled = false;
    WindowIsMaximised().then(maximised => {
      if (!cancelled) setIsWindowMaximised(maximised);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const openSettingsDialog = useCallback(() => {
    setPreviewTerminalOpacity(null);
    setShowSettingsDialog(true);
  }, []);
  const closeSettingsDialog = useCallback(() => {
    setShowSettingsDialog(false);
    setPreviewTerminalOpacity(null);
  }, []);

  useEffect(() => {
    if (!runtimeAvailable) return undefined;
    const offAbout = onShowAbout(() => setShowAboutDialog(true));
    const offSettings = onShowSettings(openSettingsDialog);
    const offQuit = onShowQuitConfirm(() => setShowQuitDialog(true));
    return () => {
      offAbout?.();
      offSettings?.();
      offQuit?.();
    };
  }, [openSettingsDialog]);

  useEffect(() => {
    const savedLinks = new Map(nodes.filter(node => node.type === 'ssh').map(node => [node.id, node]));
    const folders = new Map(nodes.filter(node => node.type === 'folder').map(node => [node.id, node]));
    tabs.forEach(tab => {
      if (tab.kind === 'dashboard' || !tab.sourceNodeId) return;
      const node = savedLinks.get(tab.sourceNodeId);
      const folder = node ? folders.get(node.parentId) : undefined;
      const color = folder ? normalizeFolderColor(folder.color) : undefined;
      if (tab.color !== color) updateTab(tab.id, { color });
    });
  }, [nodes, tabs, updateTab]);

  useTerminalEvents({
    onOutput: (tabId, data) => writeToTab(tabId, data),
    onStatus: payload => {
      const { tabId, message } = payload || {};
      if (tabId) {
        setTabStatus(tabId, 'closed');
        setGlobalStatus(`${message}（${tabId}）`);
      } else {
        setGlobalStatus(message);
      }
    },
  });

  const handleAddFolder = useCallback(parentId => {
    setEditingFolder(null);
    setNewFolderParentId(Number(parentId) || 0);
    setShowNewFolderDialog(true);
  }, []);

  const handleAddLink = useCallback(parentId => {
    setNewLinkParentId(Number(parentId) || 0);
    setShowSavedLinkDialog(true);
  }, []);

  const openNewConnection = useCallback(() => {
    handleAddLink(0);
  }, [handleAddLink]);

  const handleCreateWorkspace = useCallback(name => {
    createWorkspace(name);
  }, [createWorkspace]);

  const handleEditWorkspace = useCallback(workspace => {
    setEditingWorkspace(workspace);
  }, []);

  const closeWorkspaceDialog = useCallback(() => {
    setShowNewWorkspaceDialog(false);
    setEditingWorkspace(null);
  }, []);

  const submitWorkspaceUpdate = useCallback(name => {
    if (editingWorkspace) updateWorkspace(editingWorkspace.id, name);
  }, [editingWorkspace, updateWorkspace]);

  const handleEditFolder = useCallback(folder => {
    setEditingFolder(folder);
  }, []);

  const closeFolderDialog = useCallback(() => {
    setShowNewFolderDialog(false);
    setEditingFolder(null);
    setNewFolderParentId(0);
  }, []);

  const submitFolder = useCallback(
    async (name, color) => {
      if (editingFolder) {
        await updateFolder(editingFolder.id, name, color);
      } else {
        await createFolder(newFolderParentId, name, color);
      }
    },
    [createFolder, editingFolder, newFolderParentId, updateFolder],
  );

  const handleMoveNode = useCallback(
    async (id, parentId) => {
      try {
        await moveNode(id, parentId);
      } catch (e) {
        setGlobalStatus(`移动失败：${e}`);
      }
    },
    [moveNode],
  );

  const handleReorderNodes = useCallback(
    async (parentId, orderedIds) => {
      try {
        await reorderNodes(parentId, orderedIds);
      } catch (e) {
        setGlobalStatus(`排序失败：${e}`);
      }
    },
    [reorderNodes],
  );

  const handleEditSaved = useCallback(
    async node => {
      try {
        const credential = await getCredential(node.id);
        setEditingNode(node);
        setEditingCredential(credential || null);
      } catch (e) {
        setGlobalStatus(`读取凭证失败：${e}`);
      }
    },
    [getCredential],
  );

  const handleEditConnectionTab = useCallback(
    tab => {
      const node = nodes.find(item => item.type === 'ssh' && item.id === tab?.sourceNodeId);
      if (!node) {
        setGlobalStatus('该连接未保存，无法编辑');
        return;
      }
      void handleEditSaved(node);
    },
    [handleEditSaved, nodes],
  );

  const handleDeleteSaved = useCallback(node => {
    setDeletingNode(node);
  }, []);

  const handleCloneSaved = useCallback(
    async node => {
      try {
        const created = await cloneSSHLink(node.id);
        setGlobalStatus(`已克隆「${created?.name || node.name}」`);
      } catch (e) {
        setGlobalStatus(`克隆失败：${e}`);
      }
    },
    [cloneSSHLink],
  );

  const submitDelete = useCallback(async () => {
    if (!deletingNode) return;
    const target = deletingNode;
    setDeletingNode(null);
    try {
      if (target.type === 'folder') {
        await deleteFolder(target.id);
      } else {
        await deleteSSHLink(target.id);
      }
      setGlobalStatus(`已删除「${target.name}」`);
    } catch (e) {
      setGlobalStatus(`删除失败：${e}`);
    }
  }, [deletingNode, deleteFolder, deleteSSHLink]);

  const closeSavedDialog = useCallback(() => {
    setShowSavedLinkDialog(false);
    setEditingNode(null);
    setEditingCredential(null);
    setNewLinkParentId(0);
  }, []);

  const createLinkInitial = useMemo(() => ({ parentId: newLinkParentId }), [newLinkParentId]);

  const submitSavedLink = useCallback(
    async payload => {
      try {
        const cred = payload.credential || {};
        // 所有槽位都是 undefined = 凭据无变化，不触发密钥环读写
        const credentialChanged = Object.values(cred).some(v => v !== undefined);
        if (editingNode) {
          await updateSSHLink(editingNode.id, payload.parentId, {
            name: payload.name,
            host: payload.host,
            port: payload.port,
            username: payload.username,
            authType: payload.authType,
            keepaliveEnabled: payload.keepaliveEnabled,
            keepaliveInterval: payload.keepaliveInterval,
          });
          if (credentialChanged) {
            await setCredential(editingNode.id, cred);
          }
        } else {
          const created = await createSSHLink(payload.parentId, {
            name: payload.name,
            host: payload.host,
            port: payload.port,
            username: payload.username,
            authType: payload.authType,
            keepaliveEnabled: payload.keepaliveEnabled,
            keepaliveInterval: payload.keepaliveInterval,
          });
          if (created?.id && credentialChanged) {
            await setCredential(created.id, cred);
          }
        }
        closeSavedDialog();
      } catch (e) {
        setGlobalStatus(`保存失败：${e}`);
        throw e;
      }
    },
    [editingNode, createSSHLink, updateSSHLink, setCredential, closeSavedDialog],
  );

  const refreshSystemInfo = useCallback(async tabId => {
    if (!tabId || systemInfoRequestsRef.current.has(tabId)) return;
    systemInfoRequestsRef.current.add(tabId);
    updateTab(tabId, tab => ({ systemInfoStatus: tab.systemInfo ? 'refreshing' : 'loading' }));
    try {
      const systemInfo = await api.getSystemInfo(tabId);
      updateTab(tabId, { systemInfo, systemInfoStatus: 'ready' });
    } catch (_) {
      updateTab(tabId, { systemInfoStatus: 'error' });
    } finally {
      systemInfoRequestsRef.current.delete(tabId);
    }
  }, [updateTab]);

  const handleConnect = useCallback(
    async (tabId, payload) => {
      const reconnecting = Boolean(termsRef.current[tabId]);
      setTabStatus(tabId, 'connecting');
      updateTab(tabId, {
        host: payload.host,
        port: payload.port,
        username: payload.username,
        authType: payload.authType,
        form: payload,
        systemInfo: null,
        systemInfoStatus: 'loading',
      });
      const term = termsRef.current[tabId];
      const size = term
        ? { columns: term.cols, rows: term.rows }
        : { columns: 100, rows: 30 };
      try {
        const message = await api.connect(tabId, payload, size);
        setGlobalStatus(message);
        setTabStatus(tabId, 'connected');
        updateTab(tabId, tab => ({
          label: tab.name || `${payload.username || 'user'}@${payload.host}`,
        }));
        // 连接已建立，a.connections[tabId] 已存在。此时强制同步终端实际尺寸，
        // 避免 mount 阶段的 fit() 因竞争条件被 Go 端丢弃（ResizeTerminal 在
        // Connect 尚未写入 connections 映射时静默跳过）。
        const currentTerm = termsRef.current[tabId];
        if (currentTerm && currentTerm.cols > 0 && currentTerm.rows > 0) {
          api.resizeTerminal(tabId, { columns: currentTerm.cols, rows: currentTerm.rows }).catch(() => {});
        }
        // 连接成功后异步读取系统信息，既不阻塞终端连接，也不污染用户终端输出。
        void refreshSystemInfo(tabId);
      } catch (e) {
        setGlobalStatus(`连接失败：${e}`);
        setTabStatus(tabId, reconnecting ? 'closed' : 'idle');
      }
    },
    [refreshSystemInfo, setTabStatus, updateTab, termsRef],
  );

  const connectSavedLink = useCallback(
    node => {
      const id = newTab();
      const folder = nodes.find(item => item.type === 'folder' && item.id === node.parentId);
      const color = folder ? normalizeFolderColor(folder.color) : undefined;
      const form = {
        host: node.host,
        port: node.port,
        username: node.username,
        password: '',
        privateKey: '',
        passphrase: '',
        keyFile: '',
        authType: node.authType || 'password',
        savedNodeId: node.id,
        keepaliveEnabled: node.keepaliveEnabled,
        keepaliveInterval: node.keepaliveInterval || 30,
      };
      updateTab(id, { label: node.name, name: node.name, sourceNodeId: node.id, color, form });
      handleConnect(id, form);
    },
    [newTab, updateTab, handleConnect, nodes],
  );

  const cloneTab = useCallback(
    tab => {
      if (!tab || tab.kind === 'dashboard' || !tab.form) return;
      const id = newTab(tab.id);
      const form = { ...tab.form };
      updateTab(id, {
        label: tab.label,
        name: tab.name,
        host: tab.host,
        port: tab.port,
        username: tab.username,
        authType: tab.authType,
        sourceNodeId: tab.sourceNodeId || 0,
        color: tab.color,
        form,
      });
      handleConnect(id, form);
    },
    [handleConnect, newTab, updateTab],
  );

  const openLogList = useCallback(tab => {
    if (tab?.kind === 'connection' || tab?.kind === 'local') setLogSourceTab(tab);
  }, []);

  const openSavedLogList = useCallback(node => {
    setLogSourceTab({ label: node.name, form: { savedNodeId: node.id } });
  }, []);

  const openLogTab = useCallback((sourceTab, log) => {
    const connectionId = sourceTab.kind === 'local'
      ? 'local'
      : String(sourceTab.form?.savedNodeId || sourceTab.id);
    const existing = tabs.find(tab => (
      tab.kind === 'log' && tab.log?.connectionId === connectionId && tab.log?.name === log.name
    ));
    if (existing) {
      selectTab(existing.id);
    } else {
      openTab({
        kind: 'log',
        label: log.name.replace(/\.jsonl$/, ''),
        status: 'idle',
        log: {
          connectionId,
          name: log.name,
          size: log.size,
          modifiedAt: log.modifiedAt,
        },
      }, sourceTab.id);
    }
    setLogSourceTab(null);
  }, [openTab, selectTab, tabs]);

  const restoredTabsRef = useRef(false);
  useEffect(() => {
    if (!settings.restoreTabs || !savedNodesLoaded || restoredTabsRef.current) return;
    restoredTabsRef.current = true;
    tabs.filter(tab => tab.restorePending).forEach(tab => {
      const node = nodes.find(item => item.type === 'ssh' && item.id === tab.sourceNodeId);
      if (!node) {
        closeTab(tab.id);
        return;
      }
      const form = {
        host: node.host,
        port: node.port,
        username: node.username,
        password: '',
        privateKey: '',
        passphrase: '',
        keyFile: '',
        authType: node.authType || 'password',
        savedNodeId: node.id,
        keepaliveEnabled: node.keepaliveEnabled,
        keepaliveInterval: node.keepaliveInterval || 30,
      };
      updateTab(tab.id, {
        label: node.name,
        name: node.name,
        sourceNodeId: node.id,
        restorePending: false,
        connectOnActivate: true,
        form,
      });
    });
  }, [closeTab, handleConnect, nodes, savedNodesLoaded, settings.restoreTabs, tabs, updateTab]);

  useEffect(() => {
    const tab = tabs.find(item => item.id === activeId);
    if (!tab?.connectOnActivate || tab.status !== 'idle' || !tab.form) return;
    updateTab(tab.id, { connectOnActivate: false });
    handleConnect(tab.id, tab.form);
  }, [activeId, handleConnect, tabs, updateTab]);

  const connectTemporary = useCallback(
    async payload => {
      const id = newTab();
      const credential = payload.credential || {};
      const form = {
        host: payload.host,
        port: payload.port,
        username: payload.username,
        password: credential.password || '',
        privateKey: credential.privateKey || '',
        passphrase: credential.passphrase || '',
        keyFile: credential.keyFile || '',
        authType: payload.authType || 'password',
        savedNodeId: 0,
        keepaliveEnabled: payload.keepaliveEnabled,
        keepaliveInterval: Number(payload.keepaliveInterval) || 30,
      };
      const label = payload.name || `${payload.username || 'user'}@${payload.host}`;
      updateTab(id, { label, name: payload.name, form });
      closeSavedDialog();
      await handleConnect(id, form);
    },
    [newTab, updateTab, closeSavedDialog, handleConnect],
  );

  // startLocalTerminal 启动本机 shell 并把标签置为 connected；失败时落到
  // closed 状态，把错误写进终端缓冲，用户按 Enter 可重试。
  const startLocalTerminal = useCallback(
    async tabId => {
      setTabStatus(tabId, 'connecting');
      try {
        const shellName = await api.startLocalTerminal(tabId, { columns: 100, rows: 30 });
        updateTab(tabId, { label: shellName });
        setGlobalStatus(`已启动本地终端（${shellName}）`);
        setTabStatus(tabId, 'connected');
        // PTY 以默认尺寸启动，这里补同步终端实际尺寸。
        const term = termsRef.current[tabId];
        if (term && term.cols > 0 && term.rows > 0) {
          api.resizeTerminal(tabId, { columns: term.cols, rows: term.rows }).catch(() => {});
        }
      } catch (e) {
        setGlobalStatus(`本地终端启动失败：${e}`);
        setTabStatus(tabId, 'closed');
        writeToTab(tabId, `\r\n本地终端启动失败：${e}\r\n`);
      }
    },
    [setTabStatus, termsRef, updateTab, writeToTab],
  );

  // openLocalTerminal 在当前工作区最后一个标签后追加一个本地终端标签。
  const openLocalTerminal = useCallback(() => {
    const count = workspaceTabs.filter(tab => tab.kind === 'local').length;
    const id = openTab({
      kind: 'local',
      label: count > 0 ? `本地终端 ${count + 1}` : '本地终端',
      status: 'connecting',
      buffer: '',
    });
    void startLocalTerminal(id);
  }, [openTab, startLocalTerminal, workspaceTabs]);

  // 关闭本地标签时先终止 PTY，避免遗留僵尸 shell 进程。
  const handleCloseTab = useCallback(
    id => {
      const tab = tabs.find(item => item.id === id);
      if (tab?.kind === 'local') api.disconnect(id).catch(() => {});
      closeTab(id);
    },
    [tabs, closeTab],
  );

  const shortcutsRef = useRef(settings.shortcuts);
  shortcutsRef.current = settings.shortcuts;
  const shortcutsActiveTabRef = useRef(activeTab);
  shortcutsActiveTabRef.current = activeTab;
  const cloneTabRef = useRef(cloneTab);
  cloneTabRef.current = cloneTab;
  const handleCloseTabRef = useRef(handleCloseTab);
  handleCloseTabRef.current = handleCloseTab;

  useEffect(() => {
    const onKeyDown = event => {
      if (showSettingsDialog) {
        // 设置弹窗内由快捷键录制器处理按键，避免同时触发下面的动作。
        return;
      }
      const tab = shortcutsActiveTabRef.current;
      if (tab && matchesShortcut(shortcutsRef.current.cloneTab, event)) {
        event.preventDefault();
        event.stopPropagation();
        cloneTabRef.current(tab);
        return;
      }
      if (tab && tab.kind !== 'dashboard' && matchesShortcut(shortcutsRef.current.closeTab, event)) {
        event.preventDefault();
        event.stopPropagation();
        handleCloseTabRef.current(tab.id);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [showSettingsDialog]);

  const handleSend = useCallback(async (tabId, data) => {
    try {
      await api.sendInput(tabId, data);
    } catch (e) {
      setGlobalStatus(`发送失败：${e}`);
    }
  }, []);

  const handleResize = useCallback((tabId, size) => {
    api.resizeTerminal(tabId, size).catch(() => {});
  }, []);

  const minimiseWindow = useCallback(() => {
    if (window.runtime) WindowMinimise();
  }, []);

  const toggleMaximiseWindow = useCallback(() => {
    if (!window.runtime) return;
    WindowToggleMaximise();
    setIsWindowMaximised(maximised => !maximised);
  }, []);

  const closeWindow = useCallback(() => {
    setShowQuitDialog(true);
  }, []);

  const syncConnectionTreeWidth = useCallback(({ inPixels }) => {
    const nextWidth = Math.round(inPixels);
    if (nextWidth === 0) return;
    connectionTreeHeaderRef.current?.style.setProperty('--connection-tree-width', `${nextWidth + 1}px`);
    patchSettings({ sidebarWidth: nextWidth });
  }, [patchSettings]);

  const toggleConnectionTree = useCallback(() => {
    if (isConnectionTreeVisible) {
      connectionTreePanelRef.current?.collapse();
    } else {
      connectionTreePanelRef.current?.expand();
    }
    setIsConnectionTreeVisible(visible => !visible);
  }, [connectionTreePanelRef, isConnectionTreeVisible]);

  const disconnectTab = useCallback(async tab => {
    if (!tab || (tab.status !== 'connected' && tab.status !== 'connecting')) return;
    try {
      await api.disconnect(tab.id);
    } catch (_) {
    } finally {
      writeToTab(tab.id, '\r\n用户断开连接\r\n');
      setTabStatus(tab.id, 'closed');
      setGlobalStatus('已断开连接');
    }
  }, [setTabStatus, writeToTab]);

  const reconnectTab = useCallback(async tab => {
    if (!tab?.form || tab.kind !== 'connection' || tab.status === 'connecting') return;
    if (tab.status === 'connected') await disconnectTab(tab);

    // 已保存连接可能刚在编辑弹窗中更新；重连时使用其最新主机配置。
    const savedNode = nodes.find(node => node.type === 'ssh' && node.id === tab.sourceNodeId);
    const form = savedNode
      ? {
          ...tab.form,
          host: savedNode.host,
          port: savedNode.port,
          username: savedNode.username,
          authType: savedNode.authType || 'password',
          keepaliveEnabled: savedNode.keepaliveEnabled,
          keepaliveInterval: savedNode.keepaliveInterval || 30,
        }
      : tab.form;
    await handleConnect(tab.id, form);
  }, [disconnectTab, handleConnect, nodes]);

  const broadcastSend = useCallback((input, tabIds) => {
    tabIds.forEach(tabId => {
      api.sendInput(tabId, input).catch(() => {});
    });
    setGlobalStatus(`已广播指令到 ${tabIds.length} 个会话`);
  }, []);

  const submitDeleteWorkspace = useCallback(async () => {
    if (!deletingWorkspace) return;
    const target = deletingWorkspace;
    setDeletingWorkspace(null);
    const workspaceTabs = tabs.filter(tab => tab.workspaceId === target.id);
    await Promise.all(workspaceTabs.map(tab => disconnectTab(tab)));
    if (deleteWorkspace(target.id)) {
      setGlobalStatus(`已删除工作区「${target.name}」`);
    }
  }, [deleteWorkspace, deletingWorkspace, disconnectTab, tabs]);

  const onActiveConnect = useCallback(
    payload => handleConnect(activeTab.id, payload),
    [activeTab.id, handleConnect],
  );
  const onActiveSend = useCallback(
    data => handleSend(activeTab.id, data),
    [activeTab.id, handleSend],
  );
  const onActiveResize = useCallback(
    size => handleResize(activeTab.id, size),
    [activeTab.id, handleResize],
  );
  const onActiveReconnect = useCallback(
    () => {
      if (activeTab.status !== 'closed' || !activeTab.form) return;
      handleConnect(activeTab.id, activeTab.form);
    },
    [activeTab.id, activeTab.status, activeTab.form, handleConnect],
  );
  const onActiveTermReady = useCallback(
    (term, tabId) => {
      registerTerm(tabId ?? activeTab.id, term);
    },
    [activeTab.id, registerTerm],
  );

  const terminalActive =
    (activeTab.kind === 'connection' || activeTab.kind === 'local') &&
    (activeTab.status === 'connected' || activeTab.status === 'connecting' || activeTab.status === 'closed');
  // 线性透明度在低值区间变化不明显：例如 30% 仍会把浅色亚克力压成整块灰色。
  // 使用缓出曲线，让用户降低滑块时能更快看到统一背景，同时 100% 仍保持完全不透明。
  const terminalOpacityPercent = previewTerminalOpacity ?? settings.terminal?.opacity ?? 100;
  const terminalOpacity = Math.pow(terminalOpacityPercent / 100, 1.5);
  const activeConnectionCount = tabs.filter(
    tab => tab.kind === 'connection' && (tab.status === 'connected' || tab.status === 'connecting'),
  ).length;
  // AI 智能体的流式监听不能因为切到未连接标签或总览而卸载；
  // 具体工具仍只在终端标签中显示，AI 会话按标签自行隔离。
  // 本地终端禁用插件：内置插件均依赖 SSH 连接，本地标签不显示工具按钮与侧栏。
  const utilityPanelVisible =
    activeUtility &&
    activeTab.kind !== 'local' &&
    (terminalActive || activeUtility === 'ai-agent');

  const pluginContext = useMemo(() => ({
    activeTab,
    tabs,
    sendInput: handleSend,
    updateTab,
    disconnect: disconnectTab,
    api,
    settings,
  }), [activeTab, tabs, handleSend, updateTab, disconnectTab, settings]);

  return (
    <main
      className={cn(
        'app-window flex h-screen flex-col overflow-hidden text-foreground',
        isWindowMaximised ? 'rounded-none' : 'rounded-[14px]',
      )}
      data-density={settings.density}
      data-backdrop-type={settings.backdropType}
      style={{ '--acrylic-opacity-scale': terminalOpacityPercent / 100 }}
    >
      {/* 单一、连续的窗口背景层：所有面板共享这一次模糊采样，避免面板交界处的亚克力断层。 */}
      <div className="app-background" aria-hidden="true" />
      <header
        className="app-drag acrylic-panel flex min-w-0 select-none"
        style={{ height: 'var(--density-tab-height)' }}
        onDoubleClick={toggleMaximiseWindow}
      >
        <TooltipProvider delayDuration={300}>
          <div
            ref={connectionTreeHeaderRef}
            className="flex shrink-0 items-center gap-3 bg-transparent px-3"
            style={{ width: 'var(--connection-tree-width, 281px)' }}
          >
            <div
              className="app-no-drag group/window-controls flex items-center gap-2"
              aria-label="窗口控制"
              onDoubleClick={event => event.stopPropagation()}
            >
              <WindowControl label="关闭窗口" className="bg-[#ff5f57]" onClick={closeWindow}><X /></WindowControl>
              <WindowControl label="最小化" className="bg-[#ffbd2e]" onClick={minimiseWindow}><Minus /></WindowControl>
              <WindowControl label={isWindowMaximised ? '还原窗口' : '最大化'} className="bg-[#28c840]" onClick={toggleMaximiseWindow}><Maximize2 /></WindowControl>
            </div>
            <span className="text-xs font-semibold tracking-tight text-foreground">uSSH 🥤</span>
            <div
              className="app-no-drag ml-auto flex items-center gap-1"
              onDoubleClick={event => event.stopPropagation()}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={toggleConnectionTree}
                    aria-label={isConnectionTreeVisible ? '隐藏侧边栏' : '显示侧边栏'}
                  >
                    {isConnectionTreeVisible ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{isConnectionTreeVisible ? '隐藏侧边栏' : '显示侧边栏'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  ref={settingsButtonRef}
                  onClick={openSettingsDialog}
                    aria-label="软件设置"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">软件设置</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </TooltipProvider>
        <div className="min-w-0 flex-1">
          <TabBar
            tabs={workspaceTabs}
            activeId={activeId}
            onSelect={selectTab}
            onClose={handleCloseTab}
            onDisconnect={disconnectTab}
            onReconnect={reconnectTab}
            onClone={cloneTab}
            onEditConnection={handleEditConnectionTab}
            onTogglePinned={toggleTabPinned}
            onViewLogs={openLogList}
            onNewLocalTerminal={openLocalTerminal}
          />
        </div>
      </header>

      <Group orientation="horizontal" className="app-main-panels min-h-0 flex-1 w-full overflow-hidden">
        <PersistedWidthPanel
          panelRef={connectionTreePanelRef}
          collapsible
          collapsedSize={0}
          defaultSize={settings.sidebarWidth}
          minSize={100}
          groupResizeBehavior="preserve-pixel-size"
          onResize={syncConnectionTreeWidth}
        >
          <ConnectionTree
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            onSwitchWorkspace={switchWorkspace}
            onAddWorkspace={() => setShowNewWorkspaceDialog(true)}
            onEditWorkspace={handleEditWorkspace}
            onDeleteWorkspace={workspace => setDeletingWorkspace(workspace)}
            nodes={nodes}
            onOpenSaved={connectSavedLink}
            onAddFolder={handleAddFolder}
            onAddLink={handleAddLink}
            onMoveNode={handleMoveNode}
            onReorderNodes={handleReorderNodes}
            onEditSaved={handleEditSaved}
            onCloneSaved={handleCloneSaved}
            onViewSavedLogs={openSavedLogList}
            onDeleteSaved={handleDeleteSaved}
            onEditFolder={handleEditFolder}
            onDeleteFolder={handleDeleteSaved}
          />
        </PersistedWidthPanel>
        <Separator
          className={cn(
            'split-resizer',
            isConnectionTreeVisible ? 'w-px' : 'pointer-events-none w-0 opacity-0',
            'split-resizer--hidden',
          )}
          style={
            terminalActive
              ? { backgroundColor: 'transparent' }
              : undefined
          }
        />
        <Panel minSize={utilityPanelVisible ? 310 : 160}>
          <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <Group orientation="horizontal" className="min-h-0 flex-1">
              <Panel minSize={160}>
                <div
                  className={cn(
                    'terminal-panel relative flex h-full min-h-0 overflow-auto bg-transparent p-5',
                    terminalActive && 'mx-0.5 overflow-hidden rounded-lg p-0',
                    (activeTab.kind === 'dashboard' || activeTab.kind === 'log') && 'overflow-hidden bg-transparent p-0',
                  )}
                  style={
                    terminalActive || activeTab.kind === 'log'
                      ? { backgroundColor: `hsl(var(--terminal-surface) / ${terminalOpacity})` }
                      : undefined
                  }
                >
                  {activeTab.kind === 'dashboard' ? (
                    <ConnectionDashboard
                      nodes={nodes}
                      onConnect={connectSavedLink}
                      onNewConnection={openNewConnection}
                    />
                  ) : activeTab.kind === 'log' ? (
                    <TerminalLogView log={activeTab.log} />
                  ) : terminalActive ? (
                    activeTab.kind === 'connection' ? (
                      <TerminalActions active={activeUtility} onToggle={setActiveUtility} />
                    ) : null
                  ) : (
                    <ConnectionForm
                      initialForm={activeTab.form}
                      onConnect={onActiveConnect}
                      onPickFile={pickPrivateKeyFile}
                    />
                  )}
                  <div className="pointer-events-none absolute inset-0">
                    {tabs
                      .filter(tab => (tab.kind === 'connection' || tab.kind === 'local') && (
                        tab.status === 'connected' || tab.status === 'connecting' || tab.status === 'closed'
                      ))
                      .map(tab => (
                        <div
                          key={tab.id}
                          className={cn('absolute inset-0', tab.id === activeId ? 'visible pointer-events-auto' : 'invisible')}
                        >
                          <TerminalView
                            tab={tab}
                            active={tab.id === activeId}
                            onSend={data => handleSend(tab.id, data)}
                            onResize={size => handleResize(tab.id, size)}
                            onFocus={() => {}}
                            onTermReady={onActiveTermReady}
                            onReconnect={() => {
                              if (tab.kind === 'local') {
                                if (tab.status === 'closed') startLocalTerminal(tab.id);
                                return;
                              }
                              if (tab.status === 'closed' && tab.form) handleConnect(tab.id, tab.form);
                            }}
                            terminalSettings={settings.terminal}
                          />
                        </div>
                      ))}
                  </div>
                  {showBroadcastInput && (
                    <BroadcastInput tabs={workspaceTabs} onSend={broadcastSend} />
                  )}
                </div>
              </Panel>
              {utilityPanelVisible && (
                <>
                  <Separator className="split-resizer split-resizer--hidden" />
                  <PersistedWidthPanel
                    defaultSize={settings.utilityPanelWidth}
                    minSize={150}
                    groupResizeBehavior="preserve-pixel-size"
                    onResize={({ inPixels }) => {
                      const w = Math.round(inPixels);
                      if (w > 0) patchSettings({ utilityPanelWidth: w });
                    }}
                  >
                    <PluginContext.Provider value={pluginContext}>
                      <UtilityPanel active={activeUtility} onToggle={setActiveUtility} />
                    </PluginContext.Provider>
                  </PersistedWidthPanel>
                </>
              )}
            </Group>
          </section>
        </Panel>
      </Group>
      <StatusBar
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSwitchWorkspace={switchWorkspace}
        activeTab={activeTab}
        activeConnectionCount={activeConnectionCount}
        globalStatus={globalStatus}
        onRefreshSystemInfo={refreshSystemInfo}
        showBroadcastInput={showBroadcastInput}
        onToggleBroadcastInput={() => setShowBroadcastInput(v => !v)}
      />

      <SettingsDialog
        open={showSettingsDialog}
        anchorRef={settingsButtonRef}
        onClose={closeSettingsDialog}
        settings={settings}
        onSave={applySettings}
        onTerminalOpacityPreview={setPreviewTerminalOpacity}
      />

      <TerminalLogDialog
        open={logSourceTab !== null}
        tab={logSourceTab}
        onClose={() => setLogSourceTab(null)}
        onOpenLog={openLogTab}
      />

      <AboutDialog
        open={showAboutDialog}
        onClose={() => setShowAboutDialog(false)}
      />

      <SavedLinkDialog
        open={showSavedLinkDialog || editingNode !== null}
        mode={editingNode ? 'edit' : 'create'}
        initial={editingNode || createLinkInitial}
        credential={editingCredential || undefined}
        folders={nodes.filter(node => node.type === 'folder')}
        onClose={closeSavedDialog}
        onSave={submitSavedLink}
        onConnect={connectTemporary}
        onPickFile={pickPrivateKeyFile}
      />

      <NewFolderDialog
        open={showNewFolderDialog || editingFolder !== null}
        mode={editingFolder ? 'edit' : 'create'}
        initialName={editingFolder?.name}
        initialColor={normalizeFolderColor(editingFolder?.color || DEFAULT_FOLDER_COLOR)}
        onClose={closeFolderDialog}
        onCreate={submitFolder}
      />

      <NewWorkspaceDialog
        open={showNewWorkspaceDialog || editingWorkspace !== null}
        mode={editingWorkspace ? 'edit' : 'create'}
        initialName={editingWorkspace?.name}
        onClose={closeWorkspaceDialog}
        onCreate={handleCreateWorkspace}
        onUpdate={submitWorkspaceUpdate}
      />

      <ConfirmDeleteDialog
        open={deletingNode !== null}
        node={deletingNode}
        onClose={() => setDeletingNode(null)}
        onConfirm={submitDelete}
      />

      <ConfirmDeleteDialog
        open={deletingWorkspace !== null}
        node={deletingWorkspace ? { ...deletingWorkspace, type: 'workspace' } : null}
        onClose={() => setDeletingWorkspace(null)}
        onConfirm={submitDeleteWorkspace}
      />

      <AlertDialog
        open={showQuitDialog}
        onOpenChange={next => { if (!next) setShowQuitDialog(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认退出？</AlertDialogTitle>
            <AlertDialogDescription>
              退出 uSSH 将断开所有活动连接。确定要退出吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowQuitDialog(false)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (window.runtime) Quit(); }}>退出</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function WindowControl({ label, className, onClick, children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex h-3.5 w-3.5 items-center justify-center rounded-full text-black/55 shadow-[inset_0_0_0_0.5px_rgb(0_0_0_/_0.18)] transition-transform duration-100 hover:brightness-95 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            className,
          )}
          onClick={onClick}
          aria-label={label}
        >
          <span className="opacity-0 transition-opacity duration-100 group-hover/window-controls:opacity-100 [&_svg]:h-2 [&_svg]:w-2 [&_svg]:stroke-[2.4]">
            {children}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
