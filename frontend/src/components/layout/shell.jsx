import { useCallback, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
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
import { ConnectionDashboard } from '@/components/dashboard/connection-dashboard';
import { useTabs } from '@/hooks/use-tabs';
import { useSavedNodes } from '@/hooks/use-saved-nodes';
import { useTerminalEvents } from '@/hooks/use-terminal-event';
import { useSettings } from '@/hooks/use-settings';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

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
    buffersRef,
    termsRef,
  } = useTabs();

  const {
    nodes,
    createFolder,
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
  const [showSavedLinkDialog, setShowSavedLinkDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [editingCredential, setEditingCredential] = useState(null);
  const [deletingNode, setDeletingNode] = useState(null);
  const [activeUtility, setActiveUtility] = useState(null);

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
    setShowNewFolderDialog(true);
  }, []);

  const submitNewFolder = useCallback(
    async name => {
      await createFolder(name);
    },
    [createFolder],
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
      await deleteSSHLink(target.id);
      setGlobalStatus(`已删除「${target.name}」`);
    } catch (e) {
      setGlobalStatus(`删除失败：${e}`);
    }
  }, [deletingNode, deleteSSHLink]);

  const closeSavedDialog = useCallback(() => {
    setShowSavedLinkDialog(false);
    setEditingNode(null);
    setEditingCredential(null);
  }, []);

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
      buffersRef.current[tabId] = '';
      setTabStatus(tabId, 'connecting');
      updateTab(tabId, {
        host: payload.host,
        port: payload.port,
        username: payload.username,
        authType: payload.authType,
      });
      const term = termsRef.current[tabId];
      if (term) term.reset();
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
        setTabStatus(tabId, 'idle');
      }
    },
    [setTabStatus, updateTab, buffersRef, termsRef],
  );

  const connectSavedLink = useCallback(
    node => {
      const id = newTab();
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
      updateTab(id, { label: node.name, name: node.name, sourceNodeId: node.id, form });
      handleConnect(id, form);
    },
    [newTab, updateTab, handleConnect],
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

  const disconnectTab = useCallback(async tab => {
    if (!tab || (tab.status !== 'connected' && tab.status !== 'connecting')) return;
    try {
      await api.disconnect(tab.id);
    } catch (_) {
    } finally {
      buffersRef.current[tab.id] = '';
      setTabStatus(tab.id, 'idle');
      setGlobalStatus('已断开连接');
    }
  }, [setTabStatus, buffersRef]);

  const handleDisconnect = useCallback(() => disconnectTab(activeTab), [activeTab, disconnectTab]);

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
  const onActiveTermReady = useCallback(
    (term, tabId) => {
      registerTerm(tabId ?? activeTab.id, term);
    },
    [activeTab.id, registerTerm],
  );

  const terminalActive =
    activeTab.kind !== 'dashboard' &&
    (activeTab.status === 'connected' || activeTab.status === 'connecting');

  return (
    <main
      className="h-screen overflow-hidden bg-background text-foreground"
      data-density={settings.density}
    >
      <Group orientation="horizontal" className="h-full min-h-0 w-full overflow-hidden">
        <Panel
          defaultSize={240}
          minSize={200}
          maxSize={340}
          groupResizeBehavior="preserve-pixel-size"
        >
          <ConnectionTree
            tabs={tabs}
            activeId={activeId}
            nodes={nodes}
            onSelect={selectTab}
            onOpenSaved={connectSavedLink}
            onAddFolder={handleAddFolder}
            onAddLink={() => setShowSavedLinkDialog(true)}
            onMoveNode={handleMoveNode}
            onEditSaved={handleEditSaved}
            onCloneSaved={handleCloneSaved}
            onDeleteSaved={handleDeleteSaved}
            onOpenSettings={() => setShowSettingsDialog(true)}
          />
        </Panel>
        <Separator className="w-px cursor-col-resize bg-transparent transition-colors duration-150 hover:bg-primary/60 data-[separator=dragging]:bg-primary" />
        <Panel minSize={460}>
          <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <TabBar
              tabs={tabs}
              activeId={activeId}
              onSelect={selectTab}
              onClose={closeTab}
              onDisconnect={disconnectTab}
              onTogglePinned={toggleTabPinned}
              onNew={newTab}
            />
            <Group orientation="horizontal" className="min-h-0 flex-1">
              <Panel minSize={320}>
                <div
                  className={cn(
                    'relative flex h-full min-h-0 overflow-auto bg-background p-5',
                    terminalActive && 'overflow-hidden bg-[#0b1220] p-0',
                    activeTab.kind === 'dashboard' && 'overflow-hidden p-0',
                  )}
                >
                  {activeTab.kind === 'dashboard' ? (
                    <ConnectionDashboard nodes={nodes} onConnect={connectSavedLink} onNew={newTab} />
                  ) : terminalActive ? (
                    <>
                      <TerminalView
                        key={activeTab.id}
                        tab={activeTab}
                        onSend={onActiveSend}
                        onResize={onActiveResize}
                        onFocus={() => {}}
                        onTermReady={onActiveTermReady}
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
                  <Separator className="w-px cursor-col-resize bg-transparent transition-colors duration-150 hover:bg-primary/60 data-[separator=dragging]:bg-primary" />
                  <Panel
                    defaultSize={240}
                    minSize={180}
                    maxSize={360}
                    groupResizeBehavior="preserve-pixel-size"
                  >
                    <UtilityPanel active={activeUtility} onToggle={setActiveUtility} />
                  </Panel>
                </>
              )}
            </Group>
            <StatusBar
              activeTab={activeTab}
              globalStatus={globalStatus}
              onDisconnect={handleDisconnect}
            />
          </section>
        </Panel>
      </Group>

      <SettingsDialog
        open={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
        settings={settings}
        onSave={applySettings}
      />

      <SavedLinkDialog
        open={showSavedLinkDialog || editingNode !== null}
        mode={editingNode ? 'edit' : 'create'}
        initial={editingNode || undefined}
        credential={editingCredential || undefined}
        folders={nodes.filter(node => node.type === 'folder')}
        onClose={closeSavedDialog}
        onSave={submitSavedLink}
        onPickFile={pickPrivateKeyFile}
      />

      <NewFolderDialog
        open={showNewFolderDialog}
        onClose={() => setShowNewFolderDialog(false)}
        onCreate={submitNewFolder}
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
