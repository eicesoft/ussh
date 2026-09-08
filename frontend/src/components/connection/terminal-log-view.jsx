import { useEffect, useState } from 'react';
import { FileWarning, LoaderCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/lib/api';
import { readableTerminalContent, terminalAnsiSegments } from '@/lib/terminal-control';

function parseLogBlocks(content) {
  const blocks = [];
  content.split('\n').forEach(line => {
    if (!line.trim()) return;
    try {
      const record = JSON.parse(line);
      if (record && typeof record === 'object' && (record.type === 'input' || record.type === 'output')) blocks.push(record);
    } catch (_) {}
  });
  return blocks;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未知日期' : date.toLocaleDateString();
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function LogBlock({ block, separated }) {
  let content = readableTerminalContent(block.content, { trimLeadingBlankLines: block.type === 'output' });
  if (block.type === 'output') {
    content = content.split('\n').filter(line => line.trim() !== '').join('\n');
  }
  if (!content) return null;
  const isInput = block.type === 'input';
  const segments = isInput ? terminalAnsiSegments(block.content) : trimLeadingBlankSegments(terminalAnsiSegments(block.content));
  return <div className={`flex gap-3 border-slate-400/35 py-2 font-mono text-xs leading-5 ${separated ? 'border-t' : ''}`}><span className={`select-none font-semibold ${isInput ? 'text-sky-300' : 'text-emerald-300'}`}>{isInput ? '<' : '>'}</span><pre className="min-w-0 flex-1 whitespace-pre-wrap break-words text-slate-100">{segments.map((segment, index) => <span key={index} style={segment.style}>{segment.text}</span>)}</pre><span className="shrink-0 self-end whitespace-nowrap pl-2 text-[10px] font-normal text-slate-300">{formatTime(block.timestamp)}</span></div>;
}

function trimLeadingBlankSegments(segments) {
  let started = false;
  return segments.flatMap(segment => {
    if (started) return [segment];
    const first = segment.text.search(/\S/);
    if (first < 0) return [];
    started = true;
    return [{ ...segment, text: segment.text.slice(first) }];
  });
}

export function TerminalLogView({ log }) {
  const [state, setState] = useState({ loading: true, blocks: [], error: '' });
  useEffect(() => {
    if (!log?.connectionId || !log?.name) return undefined;
    let current = true;
    setState({ loading: true, blocks: [], error: '' });
    api.readTerminalLog(log.connectionId, log.name)
      .then(result => { if (current) setState({ loading: false, blocks: parseLogBlocks(result.content || ''), error: '' }); })
      .catch(reason => { if (current) setState({ loading: false, blocks: [], error: String(reason) }); });
    return () => { current = false; };
  }, [log?.name, log?.connectionId]);
  if (state.loading) return <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" />正在打开日志…</div>;
  if (state.error) return <div className="flex h-full items-center justify-center gap-2 p-6 text-sm text-destructive"><FileWarning className="h-4 w-4" />{state.error}</div>;
return <div className="terminal-log-view flex h-full min-h-0 w-full min-w-0 flex-col text-slate-200"><ScrollArea className="min-h-0 w-full min-w-0 flex-1"><div className="w-full min-w-0 px-4 py-2">{state.blocks.map((block, index, blocks) => <LogBlock key={`${block.sequence ?? block.timestamp}-${index}`} block={block} separated={index > 0 && block.type !== blocks[index - 1].type} />)}{state.blocks.length === 0 && <p className="py-12 text-center text-sm text-slate-400">日志中没有可显示的数据块。</p>}</div></ScrollArea></div>;
}
