import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  Bot,
  Check,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  CircleX,
  Clock,
  Copy,
  LoaderCircle,
  MessageSquarePlus,
  Play,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  TerminalSquare,
  X,
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { registerPlugin } from '../registry';
import { usePluginContext } from '../context';
import {
  createAgentSession,
  readAgentSessions,
  saveAgentSessions,
  updateAgentSession,
} from './ai-agent-session';
import { normalizeRunOutput } from './ai-agent-output';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const SHELL_LANGUAGES = new Set(['bash', 'sh', 'shell', 'zsh', 'fish', 'cmd', 'bat', 'powershell', 'pwsh']);

// 风险等级 → 展示文案与配色，与 Go 端 agent_policy.go 的等级一一对应。
const RISK_LABELS = {
  allow: { text: '只读', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  confirm: { text: '需确认', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  danger: { text: '高危', className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  deny: { text: '已拒绝', className: 'bg-muted text-muted-foreground' },
};

// 模型把动作写在 ```ussh-action 围栏里，对使用者来说那是噪音，展示前剥掉。
// 围栏可能还没闭合（正在流式输出），未闭合的部分同样不展示，避免闪出半截 JSON。
const ACTION_FENCE = /```ussh-action[\s\S]*?(?:```|$)/g;

function stripActionFences(text) {
  return (text || '').replace(ACTION_FENCE, '').replace(/\s+$/, '');
}

// readTurns 清洗落盘的段落：历史数据或人工改动过的内容不能让渲染崩掉。
function readTurns(message) {
  if (!Array.isArray(message?.segments)) return undefined;
  const segments = message.segments.filter(segment => (
    segment && (segment.kind === 'run' || segment.kind === 'done' || segment.kind === 'text')
  ));
  return segments.length > 0 ? segments : undefined;
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

// 执行条状态：等待确认 → 执行中 → 成功/失败/超时，被拒绝与已停止单列。
const RUN_STATUS = {
  waiting: { text: '等待确认', icon: CircleDashed, className: 'text-muted-foreground' },
  running: { text: '执行中', icon: LoaderCircle, className: 'text-primary', spin: true },
  success: { text: '成功', icon: CircleCheck, className: 'text-emerald-600 dark:text-emerald-400' },
  failed: { text: '失败', icon: CircleX, className: 'text-red-600 dark:text-red-400' },
  timeout: { text: '超时', icon: Clock, className: 'text-orange-600 dark:text-orange-400' },
  denied: { text: '已拒绝', icon: CircleSlash, className: 'text-muted-foreground' },
  stopped: { text: '已停止', icon: Ban, className: 'text-muted-foreground' },
};

function runStatus(step) {
  if (step.denied) return RUN_STATUS.denied;
  if (step.stopped) return RUN_STATUS.stopped;
  if (!step.result) return step.waiting ? RUN_STATUS.waiting : RUN_STATUS.running;
  if (step.result.timedOut) return RUN_STATUS.timeout;
  return step.result.exitCode === 0 ? RUN_STATUS.success : RUN_STATUS.failed;
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function Message({ message, onCopy, onExecute, canExecute, pending }) {
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
            : pending
              ? <span className="inline-flex gap-1 text-muted-foreground"><i className="animate-pulse">●</i><i className="animate-pulse [animation-delay:120ms]">●</i><i className="animate-pulse [animation-delay:240ms]">●</i></span>
              : <span className="text-muted-foreground">回复未完成</span>}
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

// StatusPill 执行条的右侧状态：图标 + 文案 + 退出码/耗时。
function StatusPill({ status, result }) {
  const Icon = status.icon;
  const detail = [];
  if (result && !result.timedOut && typeof result.exitCode === 'number') detail.push(`退出码 ${result.exitCode}`);
  const duration = formatDuration(result?.durationMs);
  if (duration) detail.push(duration);

  return (
    <span className={`inline-flex shrink-0 flex-col items-end gap-0.5 text-[10px] ${status.className}`}>
      <span className="inline-flex items-center gap-1 font-medium">
        <Icon className={`h-3 w-3 ${status.spin ? 'animate-spin' : ''}`} />
        {status.text}
      </span>
      {detail.length > 0 && (
        <span className="flex flex-col items-end font-normal opacity-70">
          {detail.map(item => <span key={item}>{item}</span>)}
        </span>
      )}
    </span>
  );
}

// RunBar 把 {"action":"run"} 渲染成一条执行条：左侧 RUN 标记，右侧命令与原因，
// 点击展开后展示实际执行的命令与运行结果。
function RunBar({ step, onCopy }) {
  // 有结果时默认收起，避免长输出刷屏；执行中默认展开，让进度可见。
  const [expanded, setExpanded] = useState(false);
  const risk = RISK_LABELS[step.level] || RISK_LABELS.confirm;
  const status = runStatus(step);
  const result = step.result;
  const output = normalizeRunOutput(result?.output || '');

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-secondary/35">
      <button
        type="button"
        className="flex w-full items-start gap-2 px-2 py-1.5 text-left transition-colors hover:bg-secondary/60"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
      >
        <span className="mt-px flex shrink-0 flex-col items-start gap-1">
          <span className="inline-flex h-4 items-center rounded bg-primary/15 px-1 text-[9px] font-bold uppercase tracking-wider text-primary">
            Run
          </span>
          <span className={`inline-flex items-center rounded px-1 py-px text-[9px] font-medium ${risk.className}`}>
            {risk.text}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <code className="break-all font-mono text-[11px] leading-relaxed">{step.command}</code>
          </span>
          {step.reason && (
            <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">{step.reason}</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <StatusPill status={status} result={result} />
          <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </span>
      </button>

      {expanded && (
        <div className="space-y-1.5 border-t border-border/60 px-2 py-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">执行的命令</span>
            <button
              type="button"
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => onCopy(step.command)}
              aria-label="复制命令"
              title="复制命令"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
          <pre className="overflow-x-auto rounded bg-background/70 px-2 py-1.5 font-mono text-[10px] leading-relaxed">
            {step.command}
          </pre>

          <div className="flex items-start justify-between gap-2 pt-0.5">
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">执行结果</span>
            {output && (
              <button
                type="button"
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => onCopy(output)}
                aria-label="复制输出"
                title="复制输出"
              >
                <Copy className="h-3 w-3" />
              </button>
            )}
          </div>
          {result ? (
            <>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-background/70 px-2 py-1.5 font-mono text-[10px] leading-relaxed">
                {output || '（无输出）'}
              </pre>
              <div className={`text-[10px] leading-relaxed ${status.className}`}>
                {result.timedOut
                  ? `执行超过 ${formatDuration(result.durationMs)} 被中断，以上是中断前的部分输出`
                  : result.exitCode === 0
                    ? '执行完成，退出码 0'
                    : `执行结束，命令以退出码 ${result.exitCode} 退出`}
              </div>
            </>
          ) : (
            <div className="text-[10px] leading-relaxed text-muted-foreground">
              {status === RUN_STATUS.waiting ? '等待你确认后执行…' : '正在执行…'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// DoneBar 把 {"action":"done"} 的总结渲染成结论卡，替代原来的原始 JSON。
function DoneBar({ step, onExecute, canExecute }) {
  const summary = normalizeRunOutput(step.summary || '');
  return (
    <div className="block w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-primary/25 bg-primary/5">
      <div className="flex min-w-0 items-center gap-1.5 border-b border-primary/20 px-2 py-1">
        <Sparkles className="h-3 w-3 text-primary" />
        <span className="text-[9px] font-bold uppercase tracking-wider text-primary">Done</span>
        <span className="text-[9px] text-muted-foreground">任务完成</span>
      </div>
      {summary
        ? (
          <div className="min-w-0 max-w-full overflow-x-auto px-2 py-1.5 text-[11px] leading-relaxed">
            <MarkdownContent content={summary} onExecute={onExecute} canExecute={canExecute} />
          </div>
        )
        : <div className="px-2 py-1.5 text-[10px] text-muted-foreground">智能体未给出总结。</div>}
    </div>
  );
}

// ApprovalDialog 高危命令执行前的人工确认。拒绝与放行都要回传给 Go 端。
function ApprovalDialog({ approval, onResolve }) {
  const risk = RISK_LABELS[approval?.level] || RISK_LABELS.confirm;
  return (
    <AlertDialog open={Boolean(approval)}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-sm">
            <ShieldAlert className="h-4 w-4 text-destructive" />
            智能体想要执行命令
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-left">
              <div className="flex items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${risk.className}`}>{risk.text}</span>
                <span className="text-[10px] text-muted-foreground">第 {approval?.step} 步</span>
              </div>
              <code className="block break-all rounded bg-secondary/70 px-2 py-1.5 font-mono text-[11px] text-foreground">
                {approval?.command}
              </code>
              {approval?.reason && (
                <div className="text-[11px] leading-relaxed text-muted-foreground">理由：{approval.reason}</div>
              )}
              {approval?.policy && (
                <div className="text-[10px] leading-relaxed text-muted-foreground">判定依据：{approval.policy}</div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => onResolve('deny')}
          >
            <X className="mr-1 h-3 w-3" /> 拒绝并停止
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => onResolve('deny')}>
              拒绝
            </Button>
            <Button size="sm" className="h-7 text-[11px]" onClick={() => onResolve('allow_all')}>
              <Check className="mr-1 h-3 w-3" /> 本次会话全部放行
            </Button>
            <Button
              size="sm"
              className="h-7 text-[11px]"
              variant={approval?.level === 'danger' ? 'destructive' : 'default'}
              onClick={() => onResolve('allow')}
            >
              允许执行
            </Button>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function getBrowserStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch (_) {
    return null;
  }
}

function AIAgent() {
  const { api, settings, activeTab, tabs, sendInput } = usePluginContext();
  const ai = settings?.ai || {};
  const activeTabId = activeTab?.id;
  // 每条助手消息自带一组段落（segments）：文本与执行条按发生顺序交错排列，
  // 执行条因此落在模型说到它的位置。段落挂在消息上而不是另开一份按下标索引的状态，
  // 这样它随消息一起持久化，且不会因消息裁剪导致下标错位。
  const [sessions, setSessions] = useState(() => readAgentSessions(
    getBrowserStorage(),
    activeTabId,
  ));
  const activeSession = sessions[activeTabId] || createAgentSession();
  const { messages, content, sending, error, agentMode, approval } = activeSession;
  const [selectedModel, setSelectedModel] = useState(ai.model || '');
  // 请求按标签保存。切换标签只改变视图，不会丢掉原标签正在接收的流。
  const requestsRef = useRef(new Map());
  const bottomRef = useRef(null);

  const patchSession = useCallback((tabId, updater) => {
    setSessions(current => updateAgentSession(current, tabId, updater));
  }, []);

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
    saveAgentSessions(
      getBrowserStorage(),
      sessions,
      tabs?.map(tab => tab.id),
    );
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [sessions, tabs]);

  const updateAssistant = useCallback((tabId, assistantIndex, token) => {
    patchSession(tabId, current => ({
      ...current,
      messages: current.messages.map((message, index) => (
        index === assistantIndex
          ? { ...message, content: `${message.content || ''}${token}` }
          : message
      )),
    }));
  }, [patchSession]);

  // patchTurn 只改动指定助手消息的段落，彼此互不干扰。
  const patchTurn = useCallback((tabId, messageIndex, updater) => {
    patchSession(tabId, current => ({
      ...current,
      messages: current.messages.map((message, index) => (
        index === messageIndex
          ? { ...message, segments: updater(Array.isArray(message.segments) ? message.segments : []) }
          : message
      )),
    }));
  }, [patchSession]);

  // finalizeTurn 收尾一轮：把还在转圈的执行条标记为已停止，
  // 并把累计的正文回填进消息，这样刷新页面后内容还在。
  const finalizeTurn = useCallback(request => {
    if (!request || request.assistantIndex == null) return;
    const { tabId, assistantIndex } = request;
    patchTurn(tabId, assistantIndex, current => current.map(item => (
      item.kind === 'run' && !item.result && !item.denied ? { ...item, stopped: true } : item
    )));
    const text = stripActionFences(request.text || '');
    if (!text) return;
    patchSession(tabId, current => ({
      ...current,
      messages: current.messages.map((message, index) => (
        index === assistantIndex ? { ...message, content: text } : message
      )),
    }));
  }, [patchSession, patchTurn]);

  const appendText = useCallback((request, token) => {
    if (!token) return;
    if (!request || request.assistantIndex == null) return;
    // 同时累计纯文本，任务结束时回填进 messages，刷新后内容不会丢。
    request.text = `${request.text || ''}${token}`;
    patchTurn(request.tabId, request.assistantIndex, current => {
      const last = current[current.length - 1];
      if (last?.kind === 'text') {
        return [...current.slice(0, -1), { ...last, text: last.text + token }];
      }
      return [...current, { kind: 'text', step: `text-${current.length}`, text: token }];
    });
  }, [patchTurn]);

  useEffect(() => {
    const offToken = api.onAIChatToken(payload => {
      const request = requestsRef.current.get(payload?.requestId);
      if (!request || request.mode !== 'chat') return;
      updateAssistant(request.tabId, request.assistantIndex, payload.token || '');
    });
    const offDone = api.onAIChatDone(payload => {
      const request = requestsRef.current.get(payload?.requestId);
      if (!request || request.mode !== 'chat') return;
      request.finish?.();
    });
    const offError = api.onAIChatError(payload => {
      const request = requestsRef.current.get(payload?.requestId);
      if (!request || request.mode !== 'chat') return;
      request.fail?.(new Error(payload.error || 'AI 服务请求失败'));
    });
    return () => {
      offToken?.();
      offDone?.();
      offError?.();
    };
  }, [api, updateAssistant]);

  // 智能体事件：Go 端持有循环，这里只做渲染与授权回应；事件按请求回写到对应标签。
  useEffect(() => {
    // 按 requestId 找回所属标签和助手消息，切换标签不会改变事件去向。
    const patchRun = (tabId, messageIndex, stepNumber, patch) => {
      patchTurn(tabId, messageIndex, current => current.map(item => (
        item.kind === 'run' && item.step === stepNumber ? { ...item, ...patch } : item
      )));
    };

    const offText = api.onAgentText(payload => {
      const request = requestsRef.current.get(payload?.requestId);
      if (!request || request.mode !== 'agent') return;
      appendText(request, payload.token || '');
    });

    const offAction = api.onAgentAction(payload => {
      const request = requestsRef.current.get(payload?.requestId);
      if (!request || request.mode !== 'agent') return;
      const { tabId, assistantIndex: messageIndex } = request;
      if (payload.action === 'done') {
        patchTurn(tabId, messageIndex, current => [
          ...current.filter(item => !(item.kind === 'done' && item.step === payload.step)),
          { kind: 'done', step: payload.step, summary: payload.summary || '' },
        ]);
        return;
      }
      // 同一 step 重试时替换旧的执行条。
      patchTurn(tabId, messageIndex, current => [
        ...current.filter(item => !(item.kind === 'run' && item.step === payload.step)),
        {
          kind: 'run',
          step: payload.step,
          command: payload.cmd || '',
          reason: payload.reason || '',
          level: payload.level,
          result: null,
        },
      ]);
    });

    const offResult = api.onAgentResult(payload => {
      const request = requestsRef.current.get(payload?.requestId);
      if (!request || request.mode !== 'agent') return;
      patchRun(request.tabId, request.assistantIndex, payload.step, {
        result: {
          output: payload.output,
          exitCode: payload.exitCode,
          timedOut: payload.timedOut,
          durationMs: payload.durationMs,
        },
      });
    });

    const offDenied = api.onAgentDenied(payload => {
      const request = requestsRef.current.get(payload?.requestId);
      if (!request || request.mode !== 'agent') return;
      patchRun(request.tabId, request.assistantIndex, payload.step, {
        denied: true,
        reason: payload.reason || '被安全策略拒绝',
      });
    });

    const offApproval = api.onAgentApproval(payload => {
      const request = requestsRef.current.get(payload?.requestId);
      if (!request || request.mode !== 'agent') return;
      if (request.allowAll) {
        api.resolveApproval(payload.requestId, 'allow').catch(() => {});
        return;
      }
      patchRun(request.tabId, request.assistantIndex, payload.step, { waiting: true });
      patchSession(request.tabId, current => ({ ...current, approval: payload }));
    });
    const offDone = api.onAgentDone(payload => {
      const request = requestsRef.current.get(payload?.requestId);
      if (!request || request.mode !== 'agent') return;
      patchSession(request.tabId, current => ({ ...current, approval: null }));
      finalizeTurn(request);
      request.finish?.();
    });
    const offError = api.onAgentError(payload => {
      const request = requestsRef.current.get(payload?.requestId);
      if (!request || request.mode !== 'agent') return;
      patchSession(request.tabId, current => ({ ...current, approval: null }));
      finalizeTurn(request);
      request.fail?.(new Error(payload.error || '智能体执行失败'));
    });

    return () => {
      offText?.();
      offAction?.();
      offResult?.();
      offDenied?.();
      offApproval?.();
      offDone?.();
      offError?.();
    };
  }, [api, appendText, finalizeTurn, patchSession, patchTurn]);

  // 只有真正关闭 AI 工具面板时才停止请求；标签切换不会卸载该面板（Shell 会保持 AI 面板挂载）。
  useEffect(() => () => {
    for (const request of requestsRef.current.values()) {
      const stopRequest = request.mode === 'agent' ? api.stopAgent : api.stopAIChat;
      stopRequest(request.requestId).catch(() => {});
    }
  }, [api]);

  const send = useCallback(async () => {
    const tabId = activeTab?.id;
    const session = sessions[tabId] || createAgentSession();
    const prompt = content.trim();
    if (!tabId || session.sending) return;
    if (!prompt) {
      patchSession(tabId, current => ({ ...current, error: '请输入要发送的内容。' }));
      return;
    }
    if (!ai.baseURL?.trim() || (!ai.model?.trim() && !selectedModel)) {
      patchSession(tabId, current => ({ ...current, error: '请先在设置中配置 Base URL 和模型。' }));
      return;
    }
    // 智能体要真实执行命令，必须先有一个已连接的终端。
    if (agentMode && activeTab?.status !== 'connected') {
      patchSession(tabId, current => ({ ...current, error: '请先连接一个终端，智能体需要它来执行命令。' }));
      return;
    }

    const model = selectedModel || ai.model;
    const userMessage = { role: 'user', content: prompt };
    const assistantIndex = session.messages.length + 1;
    const nextMessages = [...session.messages, userMessage, { role: 'assistant', content: '' }];
    patchSession(tabId, current => ({
      ...current,
      messages: nextMessages,
      content: '',
      error: '',
      sending: true,
    }));
    const requestId = `${agentMode ? 'agent' : 'ai'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const request = {
      requestId,
      tabId,
      mode: agentMode ? 'agent' : 'chat',
      assistantIndex,
      text: '',
      allowAll: session.allowAll,
    };
    requestsRef.current.set(requestId, request);

    try {
      await new Promise((resolve, reject) => {
        request.finish = resolve;
        request.fail = reject;
        if (agentMode) {
          api.startAgent({
            requestId,
            tabId,
            baseURL: ai.baseURL,
            apiKey: ai.apiKey || '',
            model,
            messages: nextMessages.filter(message => message.content),
            context: {
              host: activeTab.host || '',
              username: activeTab.username || '',
            },
            options: {
              autoApproveReadonly: ai.agent?.autoApproveReadonly !== false,
              useTools: ai.agent?.useTools === true,
              maxSteps: ai.agent?.maxSteps || 12,
              commandTimeoutSec: ai.agent?.commandTimeoutSec || 30,
            },
          }).catch(reject);
        } else {
          api.startAIChat(
            requestId,
            ai.baseURL,
            ai.apiKey || '',
            model,
            nextMessages.filter(message => message.content),
          ).catch(reject);
        }
      });
    } catch (e) {
      patchSession(tabId, current => ({
        ...current,
        error: String(e),
        messages: current.messages.filter((_, index) => index !== assistantIndex),
      }));
    } finally {
      if (requestsRef.current.get(requestId) === request) requestsRef.current.delete(requestId);
      patchSession(tabId, current => ({ ...current, sending: false, approval: null }));
    }
  }, [
    activeTab?.host,
    activeTab?.id,
    activeTab?.status,
    activeTab?.username,
    agentMode,
    ai.agent,
    ai.apiKey,
    ai.baseURL,
    ai.model,
    api,
    content,
    messages,
    patchSession,
    sessions,
    selectedModel,
  ]);

  const stop = useCallback(() => {
    const request = activeTabId && [...requestsRef.current.values()].find(item => item.tabId === activeTabId);
    if (!request) return;
    if (request.mode === 'agent') {
      api.stopAgent(request.requestId).catch(() => {});
    } else {
      api.stopAIChat(request.requestId).catch(() => {});
    }
    patchSession(activeTabId, current => ({ ...current, approval: null }));
  }, [activeTabId, api, patchSession]);

  // resolveApproval 把用户决定回传给 Go 端，循环才会继续。
  const resolveApproval = useCallback(decision => {
    const pending = approval;
    if (decision === 'allow_all' && activeTabId) {
      const request = requestsRef.current.get(pending?.requestId);
      if (request) request.allowAll = true;
      patchSession(activeTabId, current => ({ ...current, approval: null, allowAll: true }));
    } else if (activeTabId) {
      patchSession(activeTabId, current => ({ ...current, approval: null }));
    }
    if (!pending?.requestId) return;
    api.resolveApproval(pending.requestId, decision === 'allow_all' ? 'allow' : decision).catch(() => {});
  }, [activeTabId, api, approval, patchSession]);

  const clearChat = useCallback(() => {
    if (!activeTabId || activeSession.sending) return;
    patchSession(activeTabId, current => ({
      ...current,
      messages: [],
      content: '',
      error: '',
      approval: null,
      allowAll: false,
    }));
  }, [activeSession.sending, activeTabId, patchSession]);

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
      patchSession(activeTab.id, current => ({ ...current, error: `执行失败：${e}` }));
    }
  }, [activeTab?.id, activeTab?.status, patchSession, sendInput]);

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
          ) : messages.map((message, index) => {
            // 每段助手消息按「正文 / 执行条 / 结论」的原始顺序铺开，
            // 执行条就落在模型说到它的位置。段落挂在消息自身上，
            // 因此刷新后能原样还原，也不会串到别的轮次。
            const segments = readTurns(message);
            if (segments) {
              return (
                <div key={`${index}-assistant`} className="space-y-1.5">
                  {segments.map(segment => {
                    if (segment.kind === 'run') {
                      return <RunBar key={`run-${segment.step}`} step={segment} onCopy={copyMessage} />;
                    }
                    if (segment.kind === 'done') {
                      return (
                        <DoneBar
                          key={`done-${segment.step}`}
                          step={segment}
                          onExecute={executeCommand}
                          canExecute={canExecute}
                        />
                      );
                    }
                    // 围栏在渲染前统一剥离：标记可能横跨多个流式分片，
                    // 逐 token 过滤会在分片边界漏出半截 JSON。
                    const text = stripActionFences(segment.text);
                    if (!text) return null;
                    return (
                      <div key={segment.step} className="px-0 py-1 text-xs leading-relaxed">
                        <MarkdownContent
                          content={text}
                          onExecute={executeCommand}
                          canExecute={canExecute}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            }
            return (
              <Message
                key={`${index}-${message.role}`}
                message={message}
                pending={sending && index === messages.length - 1}
                onCopy={copyMessage}
                onExecute={executeCommand}
                canExecute={canExecute}
              />
            );
          })}
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
            onChange={event => patchSession(activeTabId, current => ({ ...current, content: event.target.value }))}
            onKeyDown={event => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') send();
            }}
            aria-label="AI 智能体内容输入框"
          />
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
            <Select value={selectedModel || undefined} onValueChange={setSelectedModel} disabled={availableModels.length === 0 || sending}>
              <SelectTrigger className="h-7 min-w-0 max-w-36 border-0 bg-transparent px-2 text-[10px] shadow-none focus:ring-0">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map(model => <SelectItem key={model} value={model}>{model}</SelectItem>)}
              </SelectContent>
            </Select>
            <button
              type="button"
              className={`mr-10 inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] font-medium transition-colors disabled:opacity-50 ${
                agentMode
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border/70 text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => patchSession(activeTabId, current => ({ ...current, agentMode: !current.agentMode }))}
              disabled={sending}
              aria-pressed={agentMode}
              title={agentMode ? '智能体会自动执行命令' : '仅对话，命令由你手动执行'}
            >
              <TerminalSquare className="h-3 w-3" />
              {agentMode ? '智能体' : '仅对话'}
            </button>
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

      <ApprovalDialog approval={approval} onResolve={resolveApproval} />
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
