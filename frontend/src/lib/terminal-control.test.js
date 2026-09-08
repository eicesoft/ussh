import test from 'node:test';
import assert from 'node:assert/strict';
import { readableTerminalContent } from './terminal-control.js';

test('removes OSC terminal title sequences from log content', () => {
  const output = '\x1b]2;pwd\x07\x1b]1;pwd\x07/home/user\r\n';
  assert.equal(readableTerminalContent(output), '/home/user\n');
});

test('removes ANSI styles and preserves readable terminal output', () => {
  assert.equal(readableTerminalContent('\x1b[32mready\x1b[0m\n'), 'ready\n');
});

test('removes shell keypad mode switches seen in recorded output', () => {
  const output = '\x1b[?1l\x1b>\x1b[?2004l\r\r\nListing\r\n\x1b[?1h\x1b=\x1b[?2004h';
  assert.equal(readableTerminalContent(output), '\n\nListing\n');
});

test('removes ESC commands while preserving literal punctuation and Unicode', () => {
  assert.equal(readableTerminalContent('\x1b(B\x1b7中文 > = [OK]\t✓\x1b8'), '中文 > = [OK]\t✓');
});

test('output display removes leading blank lines after shell controls', () => {
  const output = '\x1b[?1l\x1b>\r\r\n \t\r\n  Listing\r\n\r\n  next\r\n';
  assert.equal(readableTerminalContent(output, { trimLeadingBlankLines: true }), '  Listing\n\n  next\n');
  assert.equal(readableTerminalContent('\r\n\r\n', { trimLeadingBlankLines: true }), '');
});

test('default display preserves input leading blank lines and indentation', () => {
  assert.equal(readableTerminalContent('\r\n  command\r'), '\n  command\n');
});
