import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAgentSession,
  readAgentSessions,
  saveAgentSessions,
  updateAgentSession,
} from './ai-agent-session.js';

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('agent sessions stay isolated by tab and preserve each tab input', () => {
  let sessions = {};
  sessions = updateAgentSession(sessions, 'tab-a', current => ({
    ...current,
    messages: [{ role: 'user', content: '来自 A' }],
    content: 'A 的草稿',
    sending: true,
  }));
  sessions = updateAgentSession(sessions, 'tab-b', current => ({
    ...current,
    messages: [{ role: 'user', content: '来自 B' }],
    content: 'B 的草稿',
  }));

  assert.deepEqual(sessions['tab-a'].messages, [{ role: 'user', content: '来自 A' }]);
  assert.deepEqual(sessions['tab-b'].messages, [{ role: 'user', content: '来自 B' }]);
  assert.equal(sessions['tab-a'].content, 'A 的草稿');
  assert.equal(sessions['tab-b'].content, 'B 的草稿');
  assert.equal(sessions['tab-a'].sending, true);
  assert.equal(sessions['tab-b'].sending, false);
});

test('persisted in-flight messages do not come back as a permanent loading state', () => {
  const store = storage();
  saveAgentSessions(store, {
    'tab-a': createAgentSession({
      messages: [
        { role: 'user', content: '继续处理' },
        { role: 'assistant', content: '已经收到部分回复' },
      ],
      sending: true,
    }),
  });

  const restored = readAgentSessions(store, 'tab-a');
  assert.equal(restored['tab-a'].messages[1].content, '已经收到部分回复');
  assert.equal(restored['tab-a'].sending, false);
});

