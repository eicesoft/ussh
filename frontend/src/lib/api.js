// 封装 wails 生成的 Go 端 API 与运行时事件订阅。
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';

const appApi = () => window.go?.main?.App;

export const api = {
  async connect(tabId, payload, size) {
    return appApi()?.Connect(tabId, payload, size);
  },
  async disconnect(tabId) {
    return appApi()?.Disconnect(tabId);
  },
  async sendInput(tabId, data) {
    return appApi()?.SendInput(tabId, data);
  },
  async resizeTerminal(tabId, size) {
    return appApi()?.ResizeTerminal(tabId, size);
  },
  async listConnectionNodes() {
    return appApi()?.ListConnectionNodes();
  },
  async createFolder(parentId, name) {
    return appApi()?.CreateFolder(parentId, name);
  },
  async createSSHLink(parentId, form) {
    return appApi()?.CreateSSHLink(parentId, form);
  },
  async moveNode(id, parentId) {
    return appApi()?.MoveNode(id, parentId);
  },
  async updateSSHLink(id, parentId, form) {
    return appApi()?.UpdateSSHLink(id, parentId, form);
  },
  async cloneSSHLink(id) {
    return appApi()?.CloneSSHLink(id);
  },
  async deleteSSHLink(id) {
    return appApi()?.DeleteSSHLink(id);
  },
  async getCredential(nodeId) {
    return appApi()?.GetCredential(nodeId);
  },
  async setCredential(nodeId, credential) {
    return appApi()?.SetCredential(nodeId, credential);
  },
  async clearCredential(nodeId) {
    return appApi()?.ClearCredential(nodeId);
  },
  async pickPrivateKeyFile() {
    return appApi()?.PickPrivateKeyFile();
  },
  async setGpuAcceleration(enabled) {
    return appApi()?.SetGpuAcceleration(enabled);
  },
};

export function onTerminalOutput(handler) {
  EventsOn('terminal-output', handler);
  return () => EventsOff('terminal-output', handler);
}

export function onTerminalStatus(handler) {
  EventsOn('terminal-status', handler);
  return () => EventsOff('terminal-status', handler);
}

export const runtimeAvailable = Boolean(typeof window !== 'undefined' && window.runtime);