import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Copy,
  MessageSquarePlus,
  Play,
  Send,
  Square,
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { registerPlugin } from '../registry';
import { usePluginContext } from '../context';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STORAGE_KEY = 'ussh-ai-agent-messages';
const SHELL_LANGUAGES = new Set(['bash', 'sh', 'shell', 'zsh', 'fish', 'cmd', 'bat', 'powershell', 'pwsh']);

function readMessages() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value)
      ? value.filter(message => message && (message.role === 'user' || message.role === 'assistant'))
      : [];
  } catch (_) {
    return [];
  }
}

function saveMessages(messages) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-100)));
  } catch (_) {
    // Storage may be unavailable in a restricted webview. Chat remains usable in memory.
  }
}

function MarkdownCode({ className, children, node, onExecute, canExecute, ...props }) {
  const language = /language-([\w-]+)/.exec(className || '')?.[1] || '';
  const source = String(children);
  const isBlock = Boolean(language) || source.includes('\n');

  if (!isBlock) {
    return <code className="rounded bg-secondary/80 px-1 py-0.5 font-mono text-[0.9em]" {...props}>{children}</code>;
  }

  const code = source.replace(/\n$/, '');
  const runnable = SHELL_LANGUAGES.has(language.toLowerCase());
  return (
    <div
      className="my-2 overflow-hidden rounded-md border border-border/70 bg-secondary/45"
      data-code-language={language || undefined}
      data-code-runnable={runnable ? 'true' : undefined}
    >
      <div className="flex h-7 items-center justify-between bg-secondary/55 pl-2 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>{language || 'code'}</span>
        {runnable && (
          <button
            type="button"
            className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            onClick={() => onExecute?.(code)}
            disabled={!canExecute || !code.trim()}
            aria-label={canExecute ? '在终端执行命令' : '请先连接终端'}
            title={canExecute ? '在终端执行命令' : '请先连接终端'}
          >
            <Play className="h-3 w-3 fill-current" />
          </button>
        )}
      </div>
      <pre className="overflow-x-auto p-2.5 text-[11px] leading-relaxed text-foreground">
        <code className="font-mono" {...props}>{code}</code>
      </pre>
    </div>
  );
}

function MarkdownContent({ content, onExecute, canExecute }) {
  const components = useMemo(() => ({
    pre: ({ children }) => children,
    code: props => <MarkdownCode {...props} onExecute={onExecute} canExecute={canExecute} />,
    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
    h1: ({ children }) => <h1 className="mb-2 text-sm font-semibold">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-2 text-xs font-semibold">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-1.5 text-xs font-semibold">{children}</h3>,
    ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>,
    ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>,
    blockquote: ({ children }) => <blockquote className="mb-2 border-l-2 border-primary/50 pl-2 text-muted-foreground">{children}</blockquote>,
    a: ({ children, ...props }) => (
      <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    ),
    table: ({ children }) => <table className="mb-2 w-full border-collapse text-[11px]">{children}</table>,
    th: ({ children }) => <th className="border border-border/70 bg-secondary/60 px-2 py-1 text-left font-medium">{children}</th>,
    td: ({ children }) => <td className="border border-border/70 px-2 py-1">{children}</td>,
    hr: () => <hr className="my-2 border-border/70" />,
  }), [canExecute, onExecute]);

  return (
    <div className="break-words leading-relaxed [&>:last-child]:mb-0">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </Markdown>
    </div>
  );
}

function Message({ message, onCopy, onExecute, canExecute }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`group max-w-[88%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={isUser
            ? 'whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-xs leading-relaxed text-primary-foreground'
            : 'px-0 py-1 text-xs leading-relaxed'}
        >
          {message.content
            ? (isUser ? message.content : <MarkdownContent content={message.content} onExecute={onExecute} canExecute={canExecute} />)
            : <span className="inline-flex gap-1 text-muted-foreground"><i className="animate-pulse">●</i><i className="animate-pulse [animation-delay:120ms]">●</i><i className="animate-pulse [animation-delay:240ms]">●</i></span>}
        </div>
        {!isUser && message.content && (
          <button
            type="button"
            className="mt-1 inline-flex items-center gap-1 px-1 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
            onClick={() => onCopy(message.content)}
          >
            <Copy className="h-3 w-3" /> 复制
          </button>
        )}
      </div>
    </div>
  );
}

function AIAgent() {
  const { api, settings, activeTab, sendInput } = usePluginContext();
  const ai = settings?.ai || {};
  const [messages, setMessages] = useState(readMessages);
  const [content, setContent] = useState('');
  const [selectedModel, setSelectedModel] = useState(ai.model || '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(null);
  const bottomRef = useRef(null);

  const visibleModels = useMemo(
    () => (Array.isArray(ai.visibleModels) ? ai.visibleModels.filter(model => typeof model === 'string' && model) : []),
    [ai.visibleModels],
  );
  const availableModels = useMemo(() => {
    // 设置页将 visibleModels 作为最终可见模型列表保存；为空时保留当前模型，
    // 这样旧配置仍可正常使用，但插件不会再次主动请求模型列表。
    const source = visibleModels.length > 0 ? visibleModels : [ai.model];
    return [...new Set(source.filter(Boolean))];
  }, [ai.model, visibleModels]);

  useEffect(() => {
    const nextModel = visibleModels.includes(ai.model) ? ai.model : availableModels[0] || '';
    setSelectedModel(nextModel);
  }, [ai.model, availableModels, visibleModels]);

  useEffect(() => {
    saveMessages(messages);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const updateAssistant = useCallback((assistantIndex, token) => {
    setMessages(current => current.map((message, index) => (
      index === assistantIndex
        ? { ...message, content: `${message.content || ''}${token}` }
        : message
    )));
  }, []);

  useEffect(() => {
    const offToken = api.onAIChatToken(payload => {
      if (payload?.requestId !== requestRef.current?.requestId) return;
      updateAssistant(requestRef.current.assistantIndex, payload.token || '');
    });
    const offDone = api.onAIChatDone(payload => {
      if (payload?.requestId !== requestRef.current?.requestId) return;
      requestRef.current?.finish?.();
    });
    const offError = api.onAIChatError(payload => {
      if (payload?.requestId !== requestRef.current?.requestId) return;
      requestRef.current?.fail?.(new Error(payload.error || 'AI 服务请求失败'));
    });
    return () => {
      offToken?.();
      offDone?.();
      offError?.();
    };
  }, [api, updateAssistant]);

  useEffect(() => () => {
    if (requestRef.current?.requestId) api.stopAIChat(requestRef.current.requestId).catch(() => {});
  }, [api]);

  const send = useCallback(async () => {
    const prompt = content.trim();
    if (sending) return;
    if (!prompt) {
      setError('请输入要发送的内容。');
      return;
    }
    if (!ai.baseURL?.trim() || (!ai.model?.trim() && !selectedModel)) {
      setError('请先在设置中配置 Base URL 和模型。');
      return;
    }

    const model = selectedModel || ai.model;
    const userMessage = { role: 'user', content: prompt };
    const assistantIndex = messages.length + 1;
    const nextMessages = [...messages, userMessage, { role: 'assistant', content: '' }];
    setMessages(nextMessages);
    setContent('');
    setError('');
    setSending(true);
    const requestId = `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      await new Promise((resolve, reject) => {
        requestRef.current = {
          requestId,
          assistantIndex,
          finish: resolve,
          fail: reject,
        };
        api.startAIChat(
          requestId,
          ai.baseURL,
          ai.apiKey || '',
          model,
          nextMessages.filter(message => message.content),
        ).catch(reject);
      });
    } catch (e) {
      setError(String(e));
      setMessages(current => current.filter((_, index) => index !== assistantIndex));
    } finally {
      if (requestRef.current?.requestId === requestId) requestRef.current = null;
      setSending(false);
    }
  }, [ai.apiKey, ai.baseURL, ai.model, api, content, messages, selectedModel, sending]);

  const stop = useCallback(() => {
    const requestId = requestRef.current?.requestId;
    if (requestId) api.stopAIChat(requestId).catch(() => {});
  }, [api]);

  const clearChat = useCallback(() => {
    if (sending) return;
    setMessages([]);
    setContent('');
    setError('');
  }, [sending]);

  useEffect(() => {
    const handleNewChat = () => clearChat();
    window.addEventListener('ai-agent-new-chat', handleNewChat);
    return () => window.removeEventListener('ai-agent-new-chat', handleNewChat);
  }, [clearChat]);

  const copyMessage = useCallback(async text => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {}
  }, []);

  const executeCommand = useCallback(async command => {
    const input = command.trim();
    if (!input || activeTab?.status !== 'connected') return;
    try {
      await sendInput(activeTab.id, `${input}\r`);
    } catch (e) {
      setError(`执行失败：${e}`);
    }
  }, [activeTab?.id, activeTab?.status, sendInput]);

  const configured = Boolean(ai.baseURL?.trim() && (selectedModel || ai.model));
  const canExecute = activeTab?.status === 'connected';

  return (
    <div className="flex h-full min-h-0 flex-col bg-background/35">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {messages.length === 0 ? (
            <div className="flex min-h-36 flex-col items-center justify-center gap-2 px-5 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MessageSquarePlus className="h-5 w-5" />
              </div>
              <div className="text-xs font-medium">开始一段新对话</div>
              <div className="text-[10px] leading-relaxed text-muted-foreground">描述任务、分析日志，或让智能体帮你生成命令。</div>
            </div>
          ) : messages.map((message, index) => (
            <Message
              key={`${index}-${message.role}`}
              message={message}
              onCopy={copyMessage}
              onExecute={executeCommand}
              canExecute={canExecute}
            />
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="shrink-0 p-3">
        <div className="relative min-h-[100px] rounded-2xl border border-border/70 bg-background/60 shadow-sm transition-[border-color,box-shadow] focus-within:border-ring/70 focus-within:ring-2 focus-within:ring-ring/15">
          <textarea
            id="ai-agent-content"
            className="min-h-[100px] w-full resize-none rounded-2xl border-0 bg-transparent px-3 py-2.5 pb-11 pr-12 text-xs leading-relaxed outline-none placeholder:text-muted-foreground/70 focus:outline-none focus:ring-0"
            placeholder="输入要交给智能体的任务…"
            value={content}
            onChange={event => setContent(event.target.value)}
            onKeyDown={event => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') send();
            }}
            aria-label="AI 智能体内容输入框"
          />
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            <Select value={selectedModel || undefined} onValueChange={setSelectedModel} disabled={availableModels.length === 0 || sending}>
              <SelectTrigger className="h-7 min-w-0 max-w-36 border-0 bg-transparent px-2 text-[10px] shadow-none focus:ring-0">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map(model => <SelectItem key={model} value={model}>{model}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            {sending ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full bg-destructive/80 p-0 text-destructive-foreground hover:bg-destructive hover:text-destructive-foreground"
                onClick={stop}
                aria-label="停止"
                title="停止"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full bg-primary/75 p-0 text-primary-foreground shadow-none hover:bg-primary disabled:bg-primary/25 disabled:text-primary-foreground/60"
                onClick={send}
                disabled={!content.trim()}
                aria-label="发送"
                title="发送"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {error && <div className="mt-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-[10px] leading-relaxed text-destructive">{error}</div>}
        {!configured && !error && <div className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">请在设置 → AI 智能体中配置接口和模型。</div>}
      </div>
    </div>
  );
}

registerPlugin({
  id: 'ai-agent',
  type: 'tool',
  title: 'AI 智能体',
  icon: Bot,
  component: AIAgent,
});
