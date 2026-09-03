const AGENT_NONCE = '[0-9a-f]+';
const BEGIN_MARKER = new RegExp(`__USSH_BEGIN_${AGENT_NONCE}__`, 'gi');
const END_MARKER = new RegExp(`__USSH_END_${AGENT_NONCE}__:(-?\\d+)`, 'gi');

// runViaPTY 的包裹命令会回显到终端。只装饰用户可见的终端流，
// 不修改 Go 端收到的原始数据，避免影响命令边界识别和智能体观测。
export function decorateAgentMarkers(output) {
  if (typeof output !== 'string' || !output.includes('__USSH_')) return output || '';

  return output
    .replace(
      new RegExp(`printf '\\\\n__USSH_BEGIN_${AGENT_NONCE}__\\\\n';\\s*`, 'gi'),
      '🤖 ▶️  开始执行 ',
    )
    .replace(
      new RegExp(`;\\s*__USSH_R=\\$\\?;\\s*printf '\\\\n__USSH_END_${AGENT_NONCE}__:%s\\\\n'\\s*"\\$__USSH_R"`, 'gi'),
      ' 🤖 ⏹️  执行结束',
    )
    .replace(END_MARKER, (_, exitCode) => `🤖 ⏹️  执行结束 · 退出码 ${exitCode}`)
    .replace(BEGIN_MARKER, '🤖 ▶️  开始执行');
}
