import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

export function useSavedNodes() {
  const [nodes, setNodes] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const list = await api.listConnectionNodes();
      setNodes(list || []);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    reload().catch(() => setLoaded(true));
  }, [reload]);

  const createFolder = useCallback(
    async (parentId, name, color) => {
      await api.createFolder(Number(parentId) || 0, name, color);
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

  const reorderNodes = useCallback(
    async (parentId, orderedIds) => {
      await api.reorderNodes(parentId, orderedIds);
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
    loaded,
    reload,
    createFolder,
    updateFolder,
    deleteFolder,
    createSSHLink,
    moveNode,
    reorderNodes,
    updateSSHLink,
    cloneSSHLink,
    deleteSSHLink,
    getCredential: api.getCredential,
    setCredential: api.setCredential,
    clearCredential: api.clearCredential,
    pickPrivateKeyFile: api.pickPrivateKeyFile,
  };
}
