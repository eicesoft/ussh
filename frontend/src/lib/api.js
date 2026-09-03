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
  async getSystemInfo(tabId) {
    const app = appApi();
    if (!app?.GetSystemInfo) throw new Error('服务器信息服务不可用，请在 uSSH 应用中运行。');
    return app.GetSystemInfo(tabId);
  },
  async execRemoteCommand(tabId, command, timeoutSeconds = 30) {
    const app = appApi();
    if (!app?.ExecRemoteCommand) throw new Error('远程命令服务不可用，请在 uSSH 应用中运行。');
    return app.ExecRemoteCommand(tabId, command, timeoutSeconds);
  },
  async listConnectionNodes() {
    return appApi()?.ListConnectionNodes();
  },
  async createFolder(parentId, name, color) {
    return appApi()?.CreateFolder(parentId, name, color);
  },
  async updateFolder(id, name, color) {
    return appApi()?.UpdateFolder(id, name, color);
  },
  async deleteFolder(id) {
    return appApi()?.DeleteFolder(id);
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
  async setBackdropType(material) {
    return appApi()?.SetBackdropType(material);
  },
  async listSftp(tabId, dirPath) {
    return appApi()?.ListSftp(tabId, dirPath);
  },
  async sftpRead(tabId, filePath) {
    return appApi()?.SftpRead(tabId, filePath);
  },
  async sftpWrite(tabId, filePath, content) {
    return appApi()?.SftpWrite(tabId, filePath, content);
  },
  async sftpMkdir(tabId, dirPath) {
    return appApi()?.SftpMkdir(tabId, dirPath);
  },
  async sftpRemove(tabId, targetPath) {
    return appApi()?.SftpRemove(tabId, targetPath);
  },
  async sftpRename(tabId, oldPath, newPath) {
    return appApi()?.SftpRename(tabId, oldPath, newPath);
  },
  async sftpStat(tabId, targetPath) {
    return appApi()?.SftpStat(tabId, targetPath);
  },
  async sftpDownload(tabId, remotePath, localPath) {
    return appApi()?.SftpDownload(tabId, remotePath, localPath);
  },
  async pickSavePath(defaultName) {
    return appApi()?.PickSavePath(defaultName);
  },
  async fetchModels(baseURL, apiKey) {
    return appApi()?.FetchModels(baseURL, apiKey);
  },
  async startAIChat(requestId, baseURL, apiKey, model, messages) {
    const app = appApi();
    if (!app?.StartAIChat) throw new Error('AI 智能体服务不可用，请在 uSSH 应用中运行。');
    return app.StartAIChat(requestId, baseURL, apiKey, model, messages);
  },
  async stopAIChat(requestId) {
    return appApi()?.StopAIChat(requestId);
  },
  onAIChatToken(handler) {
    return onAIChatToken(handler);
  },
  onAIChatDone(handler) {
    return onAIChatDone(handler);
  },
  onAIChatError(handler) {
    return onAIChatError(handler);
  },
  async startAgent(request) {
    const app = appApi();
    if (!app?.StartAgent) throw new Error('AI 智能体服务不可用，请在 uSSH 应用中运行。');
    return app.StartAgent(request);
  },
  async stopAgent(requestId) {
    return appApi()?.StopAgent(requestId);
  },
  async resolveApproval(requestId, decision) {
    return appApi()?.ResolveApproval(requestId, decision);
  },
  onAgentText(handler) {
    return onAgentText(handler);
  },
  onAgentStep(handler) {
    return onAgentStep(handler);
  },
  onAgentAction(handler) {
    return onAgentAction(handler);
  },
  onAgentResult(handler) {
    return onAgentResult(handler);
  },
  onAgentApproval(handler) {
    return onAgentApproval(handler);
  },
  onAgentDenied(handler) {
    return onAgentDenied(handler);
  },
  onAgentDone(handler) {
    return onAgentDone(handler);
  },
  onAgentError(handler) {
    return onAgentError(handler);
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

export function onShowAbout(handler) {
  EventsOn('show-about', handler);
  return () => EventsOff('show-about', handler);
}

export function onShowSettings(handler) {
  EventsOn('show-settings', handler);
  return () => EventsOff('show-settings', handler);
}

export function onAIChatToken(handler) {
  EventsOn('ai-chat-token', handler);
  return () => EventsOff('ai-chat-token', handler);
}

export function onAIChatDone(handler) {
  EventsOn('ai-chat-done', handler);
  return () => EventsOff('ai-chat-done', handler);
}

export function onAIChatError(handler) {
  EventsOn('ai-chat-error', handler);
  return () => EventsOff('ai-chat-error', handler);
}

// 智能体事件：Go 端循环推送，前端只负责渲染与授权回应。
const AGENT_EVENTS = [
  'ai-agent-text',
  'ai-agent-step',
  'ai-agent-action',
  'ai-agent-result',
  'ai-agent-approval',
  'ai-agent-denied',
  'ai-agent-done',
  'ai-agent-error',
];

function onAgentEvent(event) {
  return handler => {
    EventsOn(event, handler);
    return () => EventsOff(event, handler);
  };
}

export const onAgentText = onAgentEvent('ai-agent-text');
export const onAgentStep = onAgentEvent('ai-agent-step');
export const onAgentAction = onAgentEvent('ai-agent-action');
export const onAgentResult = onAgentEvent('ai-agent-result');
export const onAgentApproval = onAgentEvent('ai-agent-approval');
export const onAgentDenied = onAgentEvent('ai-agent-denied');
export const onAgentDone = onAgentEvent('ai-agent-done');
export const onAgentError = onAgentEvent('ai-agent-error');

// onAgentAny 一次订阅全部智能体事件，便于按 requestId 统一分发。
export function onAgentAny(handler) {
  const offs = AGENT_EVENTS.map(event => onAgentEvent(event)(payload => handler(event, payload)));
  return () => offs.forEach(off => off());
}

export const runtimeAvailable = Boolean(typeof window !== 'undefined' && window.runtime);
