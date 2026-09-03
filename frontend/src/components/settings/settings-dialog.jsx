import { useEffect, useMemo, useState } from 'react';
import { Bot, Check, Eye, Palette, RefreshCw, Search, Settings, Terminal } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';

const themeOptions = [
  ['system', '跟随系统'],
  ['light', '浅色'],
  ['dark', '深色'],
];
const densityOptions = [
  ['compact', '紧凑'],
  ['default', '默认'],
  ['comfortable', '宽松'],
];
const backdropOptions = [
  ['none', '无'],
  ['mica', '云母'],
  ['acrylic', '亚克力'],
];
const fontSizeOptions = [12, 13, 14, 15, 16];
const scrollbackOptions = [1000, 5000, 10000, 20000];

export function SettingsDialog({ open, anchorRef, onClose, settings, onSave }) {
  const [draft, setDraft] = useState(settings);
  const [animationOrigin, setAnimationOrigin] = useState({ x: 0, y: 0 });
  const [models, setModels] = useState([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState('');
  const [modelSearch, setModelSearch] = useState('');

  const visibleModels = useMemo(() => {
    const saved = draft.ai?.visibleModels || [];
    if (saved.length === 0) return models;
    // 一旦用户开始筛选，只展示用户选择的模型。
    const savedSet = new Set(saved);
    return models.filter(m => savedSet.has(m));
  }, [models, draft.ai?.visibleModels]);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  useEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      const rect = anchorRef?.current?.getBoundingClientRect();
      if (!rect) return;
      setAnimationOrigin({
        // Translate offsets are relative to the dialog center. A button in
        // the upper-left therefore needs negative x/y offsets.
        x: rect.left + rect.width / 2 - window.innerWidth / 2,
        y: rect.top + rect.height / 2 - window.innerHeight / 2,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [open, anchorRef]);

  const updateDraft = (key, value) => {
    setDraft(current => ({ ...current, [key]: value }));
  };
  const updateTerminalDraft = (key, value) => {
    setDraft(current => ({ ...current, terminal: { ...current.terminal, [key]: value } }));
  };
  const updateAIDraft = (key, value) => {
    setDraft(current => ({ ...current, ai: { ...current.ai, [key]: value } }));
    if (key === 'baseURL') {
      setModels([]);
      setModelError('');
    }
  };
  const updateAgentDraft = (key, value) => {
    setDraft(current => ({
      ...current,
      ai: { ...current.ai, agent: { ...current.ai.agent, [key]: value } },
    }));
  };
  const fetchModels = async () => {
    const baseURL = draft.ai?.baseURL?.trim();
    if (!baseURL) {
      setModelError('请先填写 Base URL');
      return;
    }
    setModelLoading(true);
    setModelError('');
    try {
      const list = await api.fetchModels(baseURL, draft.ai?.apiKey || '');
      setModels(list);
      if (!draft.ai?.model || !list.includes(draft.ai.model)) {
        updateAIDraft('model', list[0] || '');
      }
    } catch (e) {
      setModelError(String(e));
    } finally {
      setModelLoading(false);
    }
  };
  const toggleModelVisibility = (modelName) => {
    setDraft(previous => {
      const current = previous.ai?.visibleModels || [];
      const next = current.includes(modelName)
        ? current.filter(m => m !== modelName)
        : [...current, modelName];
      return {
        ...previous,
        ai: {
          ...previous.ai,
          visibleModels: next,
          // 首次筛选或隐藏当前模型时，保证主选择框始终指向可见模型。
          model: next.length > 0 && !next.includes(previous.ai?.model)
            ? next[0]
            : previous.ai?.model,
        },
      };
    });
  };
  const allModelsVisible = models.length > 0 && (draft.ai?.visibleModels || []).length === 0;
  const filteredModels = models.filter(modelName =>
    modelName.toLocaleLowerCase().includes(modelSearch.trim().toLocaleLowerCase()),
  );
  const save = () => {
    onSave(draft);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent
        className="settings-dialog-content max-h-[calc(100vh-3rem)] max-w-xl overflow-y-auto"
        overlayClassName="bg-black/20 backdrop-blur-[1px]"
        disableDefaultAnimation
        style={{
          '--settings-origin-x': `${animationOrigin.x}px`,
          '--settings-origin-y': `${animationOrigin.y}px`,
        }}
      >
        <DialogHeader>
          <DialogTitle>软件设置</DialogTitle>
          <DialogDescription>调整 uSSH 的外观和终端行为，保存后生效。</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="appearance" className="min-h-0">
          <TabsList className="w-full">
            <TabsTrigger value="appearance" className="flex-1 gap-2">
              <Palette className="h-4 w-4" />
              外观
            </TabsTrigger>
            <TabsTrigger value="terminal" className="flex-1 gap-2">
              <Terminal className="h-4 w-4" />
              终端
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex-1 gap-2">
              <Bot className="h-4 w-4" />
              AI 智能体
            </TabsTrigger>
          </TabsList>

          <TabsContent value="appearance" className="mt-4 space-y-4">
            <SettingRow label="主题" description="选择应用的颜色主题。">
              <Select value={draft.theme || 'system'} onValueChange={value => updateDraft('theme', value)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {themeOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label="界面密度" description="调整会话标签和界面控件的间距。">
              <Select value={draft.density} onValueChange={value => updateDraft('density', value)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {densityOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label="终端透明度" description="降低不透明度可透出终端背后的桌面背景。">
              <div className="flex items-center gap-2">
                <Slider
                  value={draft.terminal.opacity}
                  min={10}
                  max={100}
                  step={5}
                  onValueChange={([value]) => updateTerminalDraft('opacity', value)}
                  aria-label="终端透明度"
                />
                <span className="w-9 text-right text-xs text-muted-foreground">{draft.terminal.opacity}%</span>
              </div>
            </SettingRow>
            <SettingRow label="GPU 硬件加速" description="使用显卡渲染界面，出现花屏或闪烁时可关闭，重启应用后生效。">
              <Switch checked={draft.gpuAcceleration} onCheckedChange={value => updateDraft('gpuAcceleration', value)} aria-label="GPU 硬件加速" />
            </SettingRow>
            <SettingRow label="背景材质" description="半透明窗口背后的模糊质感；macOS 立即生效，Windows 需重启。">
              <Select value={draft.backdropType} onValueChange={value => updateDraft('backdropType', value)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {backdropOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </SettingRow>
          </TabsContent>

          <TabsContent value="terminal" className="mt-4 space-y-4">
            <SettingRow label="字体大小" description="调整终端文字大小。">
              <Select value={String(draft.terminal.fontSize)} onValueChange={value => updateTerminalDraft('fontSize', Number(value))}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {fontSizeOptions.map(value => <SelectItem key={value} value={String(value)}>{value}px</SelectItem>)}
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label="光标闪烁" description="控制终端光标是否闪烁。">
              <Switch checked={draft.terminal.cursorBlink} onCheckedChange={value => updateTerminalDraft('cursorBlink', value)} aria-label="光标闪烁" />
            </SettingRow>
            <SettingRow label="回滚行数" description="终端保留的历史输出行数。">
              <Select value={String(draft.terminal.scrollback)} onValueChange={value => updateTerminalDraft('scrollback', Number(value))}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {scrollbackOptions.map(value => <SelectItem key={value} value={String(value)}>{value.toLocaleString()} 行</SelectItem>)}
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label="选择后复制" description="选中终端文本后自动复制到剪贴板。">
              <Switch checked={draft.terminal.copyOnSelect} onCheckedChange={value => updateTerminalDraft('copyOnSelect', value)} aria-label="选择后复制" />
            </SettingRow>
            <SettingRow label="右键直接粘贴" description="在终端内点击右键时粘贴剪贴板内容。">
              <Switch checked={draft.terminal.rightClickPaste} onCheckedChange={value => updateTerminalDraft('rightClickPaste', value)} aria-label="右键直接粘贴" />
            </SettingRow>
          </TabsContent>

          <TabsContent value="ai" className="mt-4 space-y-4">
            <SettingRow label="Base URL" description="OpenAI 兼容的 API 地址，例如 https://api.openai.com/v1。">
              <Input
                className="w-52"
                placeholder="https://api.openai.com/v1"
                value={draft.ai?.baseURL || ''}
                onChange={e => updateAIDraft('baseURL', e.target.value)}
              />
            </SettingRow>
            <SettingRow label="API Key" description="用于认证的 API 密钥，留空则不发送 Authorization 头。">
              <Input
                className="w-52"
                type="password"
                placeholder="sk-..."
                value={draft.ai?.apiKey || ''}
                onChange={e => updateAIDraft('apiKey', e.target.value)}
              />
            </SettingRow>
            <SettingRow label="模型" description="选择要使用的 AI 模型。">
              <div className="flex items-center gap-2">
                <Select
                  value={draft.ai?.model || ''}
                  onValueChange={value => updateAIDraft('model', value)}
                  disabled={visibleModels.length === 0}
                >
                  <SelectTrigger className="w-40"><SelectValue placeholder="请先获取模型列表" /></SelectTrigger>
                  <SelectContent>
                    {visibleModels.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={fetchModels}
                  disabled={modelLoading || !draft.ai?.baseURL?.trim()}
                  aria-label="刷新模型列表"
                >
                  <RefreshCw className={modelLoading ? 'animate-spin h-4 w-4' : 'h-4 w-4'} />
                </Button>
                <DropdownMenu onOpenChange={open => !open && setModelSearch('')}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={models.length === 0}
                      aria-label="设置可见模型"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-60 overflow-y-auto">
                    <div
                      className="border-b p-1"
                      onKeyDown={event => event.stopPropagation()}
                      onPointerDown={event => event.stopPropagation()}
                    >
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={modelSearch}
                          onChange={event => setModelSearch(event.target.value)}
                          placeholder="搜索模型"
                          aria-label="搜索模型"
                          className="h-7 border-0 pl-7 text-xs shadow-none focus-visible:ring-1"
                        />
                      </div>
                    </div>
                    {filteredModels.map(m => {
                      const hidden = (draft.ai?.visibleModels || []).length > 0
                        && !(draft.ai?.visibleModels || []).includes(m);
                      return (
                        <DropdownMenuItem
                          key={m}
                          onSelect={event => {
                            event.preventDefault();
                            toggleModelVisibility(m);
                          }}
                        >
                          <Check className={hidden ? 'opacity-0 h-4 w-4' : 'h-4 w-4'} />
                          <span className={hidden ? 'text-muted-foreground' : ''}>{m}</span>
                        </DropdownMenuItem>
                      );
                    })}
                    {filteredModels.length === 0 && (
                      <div className="px-2 py-2 text-xs text-muted-foreground">未找到匹配的模型</div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </SettingRow>
            <SettingRow
              label="只读命令自动执行"
              description="ls、cat、df、ps 等只读命令直接执行，不弹确认框。其余命令始终需要确认。"
            >
              <Switch
                checked={draft.ai?.agent?.autoApproveReadonly !== false}
                onCheckedChange={value => updateAgentDraft('autoApproveReadonly', value)}
                aria-label="只读命令自动执行"
              />
            </SettingRow>
            <SettingRow
              label="使用原生 function calling"
              description="关闭时改用文本块解析动作，兼容所有 OpenAI 兼容端点。"
            >
              <Switch
                checked={draft.ai?.agent?.useTools === true}
                onCheckedChange={value => updateAgentDraft('useTools', value)}
                aria-label="使用原生 function calling"
              />
            </SettingRow>
            <SettingRow label="单任务最大步数" description="限制一个任务最多执行多少条命令，防止死循环。">
              <Select
                value={String(draft.ai?.agent?.maxSteps || 12)}
                onValueChange={value => updateAgentDraft('maxSteps', Number(value))}
              >
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[6, 12, 20].map(value => (
                    <SelectItem key={value} value={String(value)}>{value} 步</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow label="单命令超时" description="超过该时间会中断命令，并把已产生的输出交给智能体判断。">
              <Select
                value={String(draft.ai?.agent?.commandTimeoutSec || 30)}
                onValueChange={value => updateAgentDraft('commandTimeoutSec', Number(value))}
              >
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[15, 30, 60, 120].map(value => (
                    <SelectItem key={value} value={String(value)}>{value} 秒</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
            {modelError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {modelError}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Settings className="h-3.5 w-3.5" />
          未保存的修改将在关闭时丢弃。
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>取消</Button>
          <Button type="button" onClick={save}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingRow({ label, description, children }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-4 rounded-md border bg-muted/20 px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
