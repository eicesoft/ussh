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
    async name => {
      await api.createFolder(0, name);
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
