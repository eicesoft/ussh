import test from 'node:test';
import assert from 'node:assert/strict';
import { decorateAgentMarkers } from './terminal-output.js';

test('terminal display replaces agent command boundary markers with emojis', () => {
  const output = [
    String.raw`printf '\n__USSH_BEGIN_194e33b09136cc6a__\n'; docker compose ps; __USSH_R=$?; printf '\n__USSH_END_194e33b09136cc6a__:%s\n' "$__USSH_R"`,
    '__USSH_BEGIN_194e33b09136cc6a__',
    'NAME        IMAGE                   STATUS',
    '__USSH_END_194e33b09136cc6a__:0',
  ].join('\n');

  const decorated = decorateAgentMarkers(output);

  assert.equal(decorated.includes('__USSH_'), false);
  assert.equal(decorated.includes('__USSH_R'), false);
  assert.match(decorated, /🤖.*▶️/);
  assert.match(decorated, /🤖.*⏹️.*退出码 0/);
  assert.match(decorated, /NAME\s+IMAGE\s+STATUS/);
});

