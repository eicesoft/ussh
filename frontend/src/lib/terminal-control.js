// 日志阅读视图使用：保留可读终端正文，移除不会在普通文本区域执行的控制序列。
// 原始 JSONL 不作修改，供后续审计或按原始字节流重放。
const oscSequence = /\x1B\][\s\S]*?(?:\x07|\x1B\\)/g;
const stringCommand = /\x1B[PX^_][\s\S]*?\x1B\\/g;
const csiSequence = /\x1B\[[0-?]*[ -/]*[@-~]/g;
// ESC 指令可直接带终止字符（如键盘模式 >、=），也可带中间字符（如 (B）。
const escapeSequence = /\x1B[ -/]*[0-~]/g;
const remainingControls = /[\x00-\x08\x0B-\x1F\x7F]/g;

export function readableTerminalContent(content, { trimLeadingBlankLines = false } = {}) {
  const text = String(content || '')
    .replace(oscSequence, '')
    .replace(stringCommand, '')
    .replace(csiSequence, '')
    .replace(escapeSequence, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(remainingControls, '');
  // 仅裁掉输出块开头的空白行，保留第一行缩进和正文内的空行。
  return trimLeadingBlankLines ? text.replace(/^(?:[ \t]*\n)+/, '') : text;
}

export function terminalAnsiSegments(content) {
  const source = String(content || '')
    .replace(oscSequence, '')
    .replace(stringCommand, '')
    .replace(/\x1B\[(?![0-9;]*m)[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B(?!\[[0-9;]*m)[ -/]*[0-~]/g, '')
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    // Keep ESC until SGR parsing below; remove the other control bytes.
    .replace(/[\x00-\x08\x0B-\x1A\x1C-\x1F\x7F]/g, '');
  // Accept both real SGR escapes and legacy log records where the ESC byte
  // was removed but the readable `[01;34m` marker remained.
  const sgr = /(?:\x1B)?\[([0-9;]*)m/g;
  const segments = [];
  let style = {};
  let start = 0;
  let match;
  while ((match = sgr.exec(source))) {
    if (match.index > start) segments.push({ text: source.slice(start, match.index), style });
    const codes = (match[1] || '0').split(';').map(Number);
    for (let i = 0; i < codes.length; i += 1) {
      const code = codes[i];
      if (code === 0) style = {};
      else if (code === 1) style = { ...style, fontWeight: 700 };
      else if (code === 22) { style = { ...style }; delete style.fontWeight; }
      else if (code === 39) { style = { ...style }; delete style.color; }
      else if (code >= 30 && code <= 37) style = { ...style, color: ansiColors[code - 30] };
      else if (code >= 90 && code <= 97) style = { ...style, color: ansiBrightColors[code - 90] };
      else if (code === 38 && codes[i + 1] === 5 && codes[i + 2] != null) { style = { ...style, color: ansi256Color(codes[i + 2]) }; i += 2; }
    }
    start = sgr.lastIndex;
  }
  if (start < source.length) segments.push({ text: source.slice(start), style });
  return segments;
}

const ansiColors = ['#000000', '#ef4444', '#22c55e', '#eab308', '#3b82f6', '#a855f7', '#06b6d4', '#e5e7eb'];
const ansiBrightColors = ['#6b7280', '#f87171', '#86efac', '#fde047', '#93c5fd', '#d8b4fe', '#67e8f9', '#ffffff'];
function ansi256Color(value) {
  if (value < 8) return ansiColors[value];
  if (value < 16) return ansiBrightColors[value - 8];
  if (value >= 232) { const shade = 8 + (value - 232) * 10; return `rgb(${shade}, ${shade}, ${shade})`; }
  const n = value - 16;
  const rgb = v => v === 0 ? 0 : 55 + v * 40;
  return `rgb(${rgb(n % 6)}, ${rgb(Math.floor(n / 6) % 6)}, ${rgb(Math.floor(n / 36))})`;
}
