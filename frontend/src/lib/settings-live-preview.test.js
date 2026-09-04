import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settingsDialog = readFileSync(
  new URL('../components/settings/settings-dialog.jsx', import.meta.url),
  'utf8',
);
const shell = readFileSync(new URL('../components/layout/shell.jsx', import.meta.url), 'utf8');

test('dragging terminal opacity previews the value before settings are saved', () => {
  assert.match(settingsDialog, /onTerminalOpacityPreview\?\.\(value\)/);
  assert.match(shell, /previewTerminalOpacity\s*\?\?\s*settings\.terminal\?\.opacity/);
});

test('the opacity preview is applied to the whole acrylic window', () => {
  assert.match(shell, /'--acrylic-opacity-scale':\s*terminalOpacityPercent\s*\/\s*100/);
});

test('closing settings discards the terminal opacity preview', () => {
  assert.match(shell, /setPreviewTerminalOpacity\(null\)/);
});
