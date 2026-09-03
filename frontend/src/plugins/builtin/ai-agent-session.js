export const AI_AGENT_STORAGE_KEY = 'ussh-ai-agent-sessions';
const LEGACY_AI_AGENT_STORAGE_KEY = 'ussh-ai-agent-messages';
const PERSISTED_OUTPUT_LIMIT = 4000;

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
  try {
    const raw = storage?.getItem(AI_AGENT_STORAGE_KEY)
      || storage?.getItem(LEGACY_AI_AGENT_STORAGE_KEY);
    const value = raw ? JSON.parse(raw) : {};
    if (value && !Array.isArray(value) && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([tabId, session]) => (
        [tabId, createAgentSession(session)]
      )));
    }

    // Migrate the old single shared transcript into the first active tab only.
    // It must never be copied into every tab.
    if (Array.isArray(value) && activeTabId) {
      return { [activeTabId]: createAgentSession({ messages: value }) };
    }
  } catch (_) {
    // Storage may be unavailable or contain malformed historical data.
  }
  return {};
}

export function saveAgentSessions(storage, sessions, validTabIds) {
  try {
    const valid = validTabIds ? new Set(validTabIds) : null;
    const payload = Object.fromEntries(
      Object.entries(sessions || {})
        .filter(([tabId]) => !valid || valid.has(tabId))
        .map(([tabId, session]) => [tabId, persistedSession(session)]),
    );
    storage?.setItem(AI_AGENT_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {
    // Storage may be unavailable in a restricted webview. The in-memory chat remains usable.
  }
}
