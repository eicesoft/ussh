// Some command-producing models return a JSON-escaped text block as the command
// output, so the PTY result contains the two characters "\\n". Decode only the
// common presentation escapes for display; keep the raw value for the next model turn.
export function normalizeRunOutput(output) {
  if (typeof output !== 'string' || !output.includes('\\n')) return output || '';
  return output
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\(["`])/g, '$1');
}
