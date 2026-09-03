export const AI_AGENT_STORAGE_KEY = 'ussh-ai-agent-sessions';
const LEGACY_AI_AGENT_STORAGE_KEY = 'ussh-ai-agent-messages';
const PERSISTED_OUTPUT_LIMIT = 4000;
const SESSION_STATE_VERSION = 2;
const HISTORY_LIMIT = 50;

const EMPTY_SESSION = {
  messages: [],
  content: '',
  sending: false,
  error: '',
  agentMode: false,
  approval: null,
  allowAll: false,
};

export function createAgentSession(source = {}) {
  const value = source && typeof source === 'object' ? source : {};
  return {
    ...EMPTY_SESSION,
    ...value,
    messages: Array.isArray(value.messages)
      ? value.messages.filter(message => message && (message.role === 'user' || message.role === 'assistant'))
      : [],
    sending: Boolean(value.sending),
    error: typeof value.error === 'string' ? value.error : '',
    content: typeof value.content === 'string' ? value.content : '',
    agentMode: Boolean(value.agentMode),
    approval: value.approval || null,
    allowAll: Boolean(value.allowAll),
  };
}

// 模式代表两种不同的会话协议：切换时不复用旧消息、草稿或授权状态。
export function resetAgentSessionForMode(session, agentMode) {
  return createAgentSession({
    ...createAgentSession(session),
    messages: [],
    content: '',
    sending: false,
    error: '',
    agentMode: Boolean(agentMode),
    approval: null,
    allowAll: false,
  });
}

export function createAgentHistoryEntry(session, now = Date.now()) {
  const normalized = createAgentSession(session);
  const firstPrompt = normalized.messages.find(message => message.role === 'user' && message.content?.trim());
  const title = firstPrompt?.content.trim().replace(/\s+/g, ' ').slice(0, 50)
    || (normalized.agentMode ? '智能体会话' : '对话会话');
  return {
    id: `session-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    createdAt: now,
    updatedAt: now,
    session: normalized,
  };
}

function hasSessionContent(session) {
  const normalized = createAgentSession(session);
  return normalized.messages.length > 0 || Boolean(normalized.content.trim());
}

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const session = createAgentSession(entry.session || entry);
  const now = Date.now();
  return {
    id: typeof entry.id === 'string' && entry.id ? entry.id : createAgentHistoryEntry(session, now).id,
    title: typeof entry.title === 'string' && entry.title.trim() ? entry.title : createAgentHistoryEntry(session, now).title,
    createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : now,
    updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : now,
    session,
  };
}

function parseStoredState(storage, activeTabId) {
  try {
    const raw = storage?.getItem(AI_AGENT_STORAGE_KEY)
      || storage?.getItem(LEGACY_AI_AGENT_STORAGE_KEY);
    const value = raw ? JSON.parse(raw) : {};
    if (value && !Array.isArray(value) && typeof value === 'object') {
      if (value.version === SESSION_STATE_VERSION && value.tabs && typeof value.tabs === 'object') {
        const sessions = {};
        const histories = {};
        Object.entries(value.tabs).forEach(([tabId, tabState]) => {
          if (!tabState || typeof tabState !== 'object') return;
          sessions[tabId] = createAgentSession(tabState.current);
          histories[tabId] = Array.isArray(tabState.history)
            ? tabState.history.map(normalizeHistoryEntry).filter(Boolean).slice(0, HISTORY_LIMIT)
            : [];
        });
        return { sessions, histories };
      }

      // Migrate the previous { tabId: session } format in memory.
      return {
        sessions: Object.fromEntries(Object.entries(value).map(([tabId, session]) => (
          [tabId, createAgentSession(session)]
        ))),
        histories: {},
      };
    }

    // Migrate the old single shared transcript into the first active tab only.
    // It must never be copied into every tab.
    if (Array.isArray(value) && activeTabId) {
      return {
        sessions: { [activeTabId]: createAgentSession({ messages: value }) },
        histories: {},
      };
    }
  } catch (_) {
    // Storage may be unavailable or contain malformed historical data.
  }
  return { sessions: {}, histories: {} };
}

export function updateAgentSession(sessions, tabId, updater) {
  if (!tabId) return sessions;
  const current = createAgentSession(sessions[tabId]);
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  return { ...sessions, [tabId]: createAgentSession(next) };
}

function persistedSession(session) {
  const normalized = createAgentSession(session);
  // sending/approval are runtime-only. A refresh has no corresponding request
  // object, so restoring either would render a request that cannot be stopped.
  return {
    messages: normalized.messages.slice(-100).map(message => (
      Array.isArray(message.segments)
        ? {
          ...message,
          segments: message.segments.map(segment => {
            if (segment.kind !== 'run' || !segment.result) return segment;
            const output = segment.result.output || '';
            if (output.length <= PERSISTED_OUTPUT_LIMIT) return segment;
            return {
              ...segment,
              result: {
                ...segment.result,
                output: `${output.slice(0, PERSISTED_OUTPUT_LIMIT)}\n…（已省略 ${output.length - PERSISTED_OUTPUT_LIMIT} 字符，刷新前的完整输出不再保留）`,
                truncated: true,
              },
            };
          }),
        }
        : message
    )),
    content: normalized.content,
    agentMode: normalized.agentMode,
  };
}

export function readAgentSessions(storage, activeTabId) {
  return parseStoredState(storage, activeTabId).sessions;
}

export function readAgentHistories(storage, activeTabId) {
  return parseStoredState(storage, activeTabId).histories;
}

export function saveAgentSessions(storage, sessions, validTabIds, histories = {}) {
  try {
    const valid = validTabIds ? new Set(validTabIds) : null;
    const tabIds = new Set([
      ...Object.keys(sessions || {}),
      ...Object.keys(histories || {}),
    ]);
    const tabs = Object.fromEntries(
      [...tabIds]
        .filter(tabId => !valid || valid.has(tabId))
        .map(tabId => [tabId, {
          current: persistedSession(sessions?.[tabId]),
          history: (histories?.[tabId] || [])
            .slice(0, HISTORY_LIMIT)
            .filter(entry => hasSessionContent(entry?.session))
            .map(entry => ({
              id: entry.id,
              title: entry.title,
              createdAt: entry.createdAt,
              updatedAt: entry.updatedAt,
              session: persistedSession(entry.session),
            })),
        }]),
    );
    const payload = { version: SESSION_STATE_VERSION, tabs };
    storage?.setItem(AI_AGENT_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {
    // Storage may be unavailable in a restricted webview. The in-memory chat remains usable.
  }
}
