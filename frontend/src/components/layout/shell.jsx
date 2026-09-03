import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import { Quit, WindowIsMaximised, WindowMinimise, WindowToggleMaximise } from '../../../wailsjs/runtime/runtime';
import { Minus, PanelLeftClose, PanelLeftOpen, Plus, Settings, X } from 'lucide-react';
import { ConnectionTree } from './connection-tree';
import { TabBar } from './tab-bar';
import { UtilityPanel } from './utility-panel';
import { StatusBar } from './status-bar';
import { ConnectionForm } from '@/components/connection/connection-form';
import { TerminalView } from '@/components/connection/terminal-view';
import { TerminalActions } from '@/components/connection/terminal-actions';
import { SavedLinkDialog } from '@/components/connection/saved-link-dialog';
import { NewFolderDialog } from '@/components/connection/new-folder-dialog';
import { ConfirmDeleteDialog } from '@/components/connection/confirm-delete-dialog';
import { SettingsDialog } from '@/components/settings/settings-dialog';
import { AboutDialog } from '@/components/about-dialog';
import { ConnectionDashboard } from '@/components/dashboard/connection-dashboard';
import { useTabs } from '@/hooks/use-tabs';
import { useSavedNodes } from '@/hooks/use-saved-nodes';
import { useTerminalEvents } from '@/hooks/use-terminal-event';
import { useSettings } from '@/hooks/use-settings';
import { api, onShowAbout, onShowSettings, runtimeAvailable } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DEFAULT_FOLDER_COLOR, normalizeFolderColor } from '@/lib/folder-colors';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import '@/plugins';
import { PluginContext } from '@/plugins/context';

export function Shell() {
  const {
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
    termsRef,
  } = useTabs();

  const {
    nodes,
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
  } = useSavedNodes();
  const { settings, applySettings } = useSettings();
  const [globalStatus, setGlobalStatus] = useState('准备就绪');
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [showSavedLinkDialog, setShowSavedLinkDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [newLinkParentId, setNewLinkParentId] = useState(0);
  const [editingNode, setEditingNode] = useState(null);
  const [editingCredential, setEditingCredential] = useState(null);
  const [deletingNode, setDeletingNode] = useState(null);
  const [activeUtility, setActiveUtility] = useState(null);
  const [isWindowMaximised, setIsWindowMaximised] = useState(false);
  const [connectionTreeWidth, setConnectionTreeWidth] = useState(240);
  const [isConnectionTreeVisible, setIsConnectionTreeVisible] = useState(true);
  const connectionTreePanelRef = usePanelRef();
  const settingsButtonRef = useRef(null);

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

  useEffect(() => {
    if (!runtimeAvailable) return undefined;
    const offAbout = onShowAbout(() => setShowAboutDialog(true));
    const offSettings = onShowSettings(() => setShowSettingsDialog(true));
    return () => {
      offAbout?.();
      offSettings?.();
    };
  }, []);

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

  const handleAddFolder = useCallback(() => {
    setEditingFolder(null);
    setShowNewFolderDialog(true);
  }, []);

  const handleAddLink = useCallback(parentId => {
    setNewLinkParentId(Number(parentId) || 0);
    setShowSavedLinkDialog(true);
  }, []);

  const openNewConnection = useCallback(() => {
    handleAddLink(0);
  }, [handleAddLink]);

  const handleEditFolder = useCallback(folder => {
    setEditingFolder(folder);
  }, []);

  const closeFolderDialog = useCallback(() => {
    setShowNewFolderDialog(false);
    setEditingFolder(null);
  }, []);

  const submitFolder = useCallback(
    async (name, color) => {
      if (editingFolder) {
        await updateFolder(editingFolder.id, name, color);
      } else {
        await createFolder(name, color);
      }
    },
    [createFolder, editingFolder, updateFolder],
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
      } catch (e) {
        setGlobalStatus(`连接失败：${e}`);
        setTabStatus(tabId, reconnecting ? 'closed' : 'idle');
      }
    },
    [setTabStatus, updateTab, termsRef],
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
      };
      updateTab(id, { label: node.name, name: node.name, sourceNodeId: node.id, color, form });
      handleConnect(id, form);
    },
    [newTab, updateTab, handleConnect, nodes],
  );

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
      };
      const label = payload.name || `${payload.username || 'user'}@${payload.host}`;
      updateTab(id, { label, name: payload.name, form });
      closeSavedDialog();
      await handleConnect(id, form);
    },
    [newTab, updateTab, closeSavedDialog, handleConnect],
  );

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
    if (window.runtime) Quit();
  }, []);

  const syncConnectionTreeWidth = useCallback(({ inPixels }) => {
    const nextWidth = Math.round(inPixels);
    if (nextWidth === 0) return;
    setConnectionTreeWidth(width => (width === nextWidth ? width : nextWidth));
  }, []);

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
    activeTab.kind !== 'dashboard' &&
    (activeTab.status === 'connected' || activeTab.status === 'connecting' || activeTab.status === 'closed');
  const terminalOpacity = (settings.terminal?.opacity ?? 100) / 100;
  const activeConnectionCount = tabs.filter(
    tab => tab.kind !== 'dashboard' && (tab.status === 'connected' || tab.status === 'connecting'),
  ).length;

  const pluginContext = useMemo(() => ({
    activeTab,
    tabs,
    sendInput: handleSend,
    disconnect: disconnectTab,
    api,
    settings,
  }), [activeTab, tabs, handleSend, disconnectTab, settings]);

  return (
    <main
      className={cn(
        'app-window flex h-screen flex-col overflow-hidden bg-background text-foreground',
        isWindowMaximised ? 'rounded-none' : 'rounded-[14px]',
        // 启用窗口材质时保持主容器透明，让总览和其他标签下的界面区域都能透出亚克力背景。
        settings.backdropType !== 'none' && 'bg-transparent',
      )}
      data-density={settings.density}
    >
      <header
        className="app-drag acrylic-panel flex min-w-0 select-none"
        style={{ height: 'var(--density-tab-height)' }}
      >
        <TooltipProvider delayDuration={300}>
          <div
            className="flex shrink-0 items-center gap-3 bg-transparent px-3 transition-[width] duration-200 ease-out"
            style={{ width: isConnectionTreeVisible ? connectionTreeWidth + 1 : 200 }}
          >
            <div className="app-no-drag group/window-controls flex items-center gap-2" aria-label="窗口控制">
              <WindowControl label="关闭窗口" className="bg-[#ff5f57]" onClick={closeWindow}><X /></WindowControl>
              <WindowControl label="最小化" className="bg-[#ffbd2e]" onClick={minimiseWindow}><Minus /></WindowControl>
              <WindowControl label={isWindowMaximised ? '还原窗口' : '最大化'} className="bg-[#28c840]" onClick={toggleMaximiseWindow}><Plus /></WindowControl>
            </div>
            <span className="text-xs font-semibold tracking-tight text-foreground">uSSH</span>
            <div className="app-no-drag ml-auto flex items-center gap-1">
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
                  onClick={() => setShowSettingsDialog(true)}
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
            tabs={tabs}
            activeId={activeId}
            onSelect={selectTab}
            onClose={closeTab}
            onDisconnect={disconnectTab}
            onTogglePinned={toggleTabPinned}
            onNewConnection={openNewConnection}
          />
        </div>
      </header>

      <Group orientation="horizontal" className="app-main-panels min-h-0 flex-1 w-full overflow-hidden">
        <Panel
          panelRef={connectionTreePanelRef}
          collapsible
          collapsedSize={0}
          defaultSize={280}
          minSize={200}
          maxSize={340}
          groupResizeBehavior="preserve-pixel-size"
          onResize={syncConnectionTreeWidth}
        >
          <ConnectionTree
            tabs={tabs}
            activeId={activeId}
            nodes={nodes}
            onSelect={selectTab}
            onOpenSaved={connectSavedLink}
            onAddFolder={handleAddFolder}
            onAddLink={handleAddLink}
            onMoveNode={handleMoveNode}
            onEditSaved={handleEditSaved}
            onCloneSaved={handleCloneSaved}
            onDeleteSaved={handleDeleteSaved}
            onEditFolder={handleEditFolder}
            onDeleteFolder={handleDeleteSaved}
          />
        </Panel>
        <Separator
          className={cn(
            'split-resizer',
            isConnectionTreeVisible ? 'w-px' : 'pointer-events-none w-0 opacity-0',
          )}
        />
        <Panel minSize={460}>
          <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <Group orientation="horizontal" className="min-h-0 flex-1">
              <Panel minSize={320}>
                <div
                  className={cn(
                    'terminal-panel relative flex h-full min-h-0 overflow-auto bg-background p-5',
                    terminalActive && 'overflow-hidden p-0',
                    activeTab.kind === 'dashboard' && 'overflow-hidden p-0',
                  )}
                  style={
                    terminalActive
                      ? { backgroundColor: `rgba(11, 18, 32, ${terminalOpacity})` }
                      : undefined
                  }
                >
                  {activeTab.kind === 'dashboard' ? (
                    <ConnectionDashboard
                      nodes={nodes}
                      onConnect={connectSavedLink}
                      onNewConnection={openNewConnection}
                    />
                  ) : terminalActive ? (
                    <>
                      <TerminalView
                        key={activeTab.id}
                        tab={activeTab}
                        onSend={onActiveSend}
                        onResize={onActiveResize}
                        onFocus={() => {}}
                        onTermReady={onActiveTermReady}
                        onReconnect={onActiveReconnect}
                        terminalSettings={settings.terminal}
                      />
                      <TerminalActions active={activeUtility} onToggle={setActiveUtility} />
                    </>
                  ) : (
                    <ConnectionForm
                      initialForm={activeTab.form}
                      onConnect={onActiveConnect}
                      onPickFile={pickPrivateKeyFile}
                    />
                  )}
                </div>
              </Panel>
              {terminalActive && activeUtility && (
                <>
                  <Separator className="split-resizer" />
                  <Panel
                    defaultSize={360}
                    minSize={200}
                    maxSize={680}
                    groupResizeBehavior="preserve-pixel-size"
                  >
                    <PluginContext.Provider value={pluginContext}>
                      <UtilityPanel active={activeUtility} onToggle={setActiveUtility} />
                    </PluginContext.Provider>
                  </Panel>
                </>
              )}
            </Group>
          </section>
        </Panel>
      </Group>
      <StatusBar
        activeTab={activeTab}
        activeConnectionCount={activeConnectionCount}
        globalStatus={globalStatus}
      />

      <SettingsDialog
        open={showSettingsDialog}
        anchorRef={settingsButtonRef}
        onClose={() => setShowSettingsDialog(false)}
        settings={settings}
        onSave={applySettings}
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

      <ConfirmDeleteDialog
        open={deletingNode !== null}
        node={deletingNode}
        onClose={() => setDeletingNode(null)}
        onConfirm={submitDelete}
      />
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
            'flex h-3 w-3 items-center justify-center rounded-full text-black/55 shadow-[inset_0_0_0_0.5px_rgb(0_0_0_/_0.18)] transition-transform duration-100 hover:brightness-95 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            className,
          )}
          onClick={onClick}
          aria-label={label}
        >
          <span className="opacity-0 transition-opacity duration-100 group-hover/window-controls:opacity-100 [&_svg]:h-[7px] [&_svg]:w-[7px] [&_svg]:stroke-[2.4]">
            {children}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
