import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRunOutput } from './ai-agent-output.js';

test('run output renders serialized newlines as actual line breaks', () => {
  const output = String.raw`\n总内存：30GiB\n剩余可用：约 12GiB\n\n\`\`\`\n## 建议\n1. 当前可用内存尚可`;

  assert.equal(
    normalizeRunOutput(output),
    '\n总内存：30GiB\n剩余可用：约 12GiB\n\n```\n## 建议\n1. 当前可用内存尚可',
  );
});

test('run output keeps ordinary text and existing line breaks unchanged', () => {
  const output = '总内存：30GiB\n剩余可用：约 12GiB';
  assert.equal(normalizeRunOutput(output), output);
});
