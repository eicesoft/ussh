// 快捷键绑定解析、匹配与展示。绑定为形如 "CmdOrCtrl+Shift+D" 的字符串，
// CmdOrCtrl 在 macOS 上匹配 Command，在其它平台匹配 Control。

const MODIFIER_KEYS = ['Meta', 'Control', 'Alt', 'Shift'];

function isMac() {
  return /Mac|iPhone|iPad/.test(navigator?.platform || '');
}

function canonicalKey(token) {
  const value = String(token).trim();
  if (!value) return '';
  return value.length === 1 ? value.toUpperCase() : value;
}

function normalizeKeyName(key, code) {
  if (!key || MODIFIER_KEYS.includes(key)) return '';
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  switch (key) {
    case 'Escape': case 'Enter': case 'Tab': case 'Backspace': case 'Delete':
    case 'Home': case 'End': case 'PageUp': case 'PageDown': case 'Insert': case 'CapsLock':
    case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight':
      return key;
    default:
      break;
  }
  if (/^F([1-9]|1\d|2[0-4])$/.test(key)) return key;
  const letter = /^Key([A-Z])$/.exec(code || '');
  if (letter) return letter[1];
  const digit = /^Digit(\d)$/.exec(code || '');
  if (digit) return digit[1];
  return key.length <= 12 ? key : '';
}

export function parseShortcut(binding) {
  if (typeof binding !== 'string') return null;
  const parts = binding.trim().split('+').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const keyToken = parts[parts.length - 1];
  const spec = { cmdOrCtrl: false, ctrl: false, alt: false, shift: false, key: '' };
  for (const mod of parts.slice(0, -1)) {
    if (mod === 'CmdOrCtrl') spec.cmdOrCtrl = true;
    else if (mod === 'Ctrl') spec.ctrl = true;
    else if (mod === 'Alt') spec.alt = true;
    else if (mod === 'Shift') spec.shift = true;
    else return null;
  }
  spec.key = canonicalKey(keyToken);
  return spec.key ? spec : null;
}

export function matchesShortcut(binding, event) {
  const spec = parseShortcut(binding);
  if (!spec) return false;
  const mac = isMac();
  const useMeta = spec.cmdOrCtrl && mac;
  const useCtrl = spec.ctrl || (spec.cmdOrCtrl && !mac);
  if (Boolean(event.metaKey) !== useMeta) return false;
  if (Boolean(event.ctrlKey) !== useCtrl) return false;
  if (Boolean(event.altKey) !== spec.alt) return false;
  if (Boolean(event.shiftKey) !== spec.shift) return false;
  return canonicalKey(normalizeKeyName(event.key, event.code)) === spec.key;
}

export function captureShortcut(event) {
  const key = normalizeKeyName(event.key, event.code);
  if (!key) return null;
  const mac = isMac();
  const mods = [];
  if (event.metaKey && mac) mods.push('CmdOrCtrl');
  else if (event.ctrlKey && mac) mods.push('Ctrl');
  else if (event.ctrlKey && !mac) mods.push('CmdOrCtrl');
  if (event.altKey) mods.push('Alt');
  if (event.shiftKey) mods.push('Shift');
  if (mods.length === 0) return null;
  return [...mods, key].join('+');
}

export function formatShortcut(binding) {
  const spec = parseShortcut(binding);
  if (!spec) return String(binding || '未设置');
  const mac = isMac();
  const mods = [];
  const parts = [];
  if (spec.cmdOrCtrl) mods.push('CmdOrCtrl');
  if (spec.ctrl) mods.push('Ctrl');
  if (spec.alt) mods.push('Alt');
  if (spec.shift) mods.push('Shift');
  if (mac) {
    const symbols = { CmdOrCtrl: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' };
    return mods.map(mod => symbols[mod]).join('') + spec.key;
  }
  parts.push(...mods.map(mod => (mod === 'CmdOrCtrl' ? 'Ctrl' : mod)));
  parts.push(spec.key);
  return parts.join('+');
}