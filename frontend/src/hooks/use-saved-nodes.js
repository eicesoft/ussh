import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

export function useSavedNodes() {
  const [nodes, setNodes] = useState([]);

  const reload = useCallback(async () => {
    const list = await api.listConnectionNodes();
    setNodes(list || []);
  }, []);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  const createFolder = useCallback(
    async (name, color) => {
      await api.createFolder(0, name, color);
      await reload();
    },
    [reload],
  );

  const updateFolder = useCallback(
    async (id, name, color) => {
      const updated = await api.updateFolder(id, name, color);
      await reload();
      return updated;
    },
    [reload],
  );

  const deleteFolder = useCallback(
    async id => {
      await api.deleteFolder(id);
      await reload();
    },
    [reload],
  );

  const createSSHLink = useCallback(
    async (parentId, form) => {
      const created = await api.createSSHLink(parentId, form);
      await reload();
      return created;
    },
    [reload],
  );

  const moveNode = useCallback(
    async (id, parentId) => {
      await api.moveNode(id, parentId);
      await reload();
    },
    [reload],
  );

  const updateSSHLink = useCallback(
    async (id, parentId, form) => {
      const updated = await api.updateSSHLink(id, parentId, form);
      await reload();
      return updated;
    },
    [reload],
  );

  const cloneSSHLink = useCallback(
    async id => {
      const created = await api.cloneSSHLink(id);
      await reload();
      return created;
    },
    [reload],
  );

  const deleteSSHLink = useCallback(
    async id => {
      await api.deleteSSHLink(id);
      await reload();
    },
    [reload],
  );

  return {
    nodes,
    reload,
    createFolder,
    updateFolder,
    deleteFolder,
    createSSHLink,
    moveNode,
    updateSSHLink,
    cloneSSHLink,
    deleteSSHLink,
    getCredential: api.getCredential,
    setCredential: api.setCredential,
    clearCredential: api.clearCredential,
    pickPrivateKeyFile: api.pickPrivateKeyFile,
  };
}
