import { useEffect, useState } from 'react';
import { Palette, Settings, Terminal } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
