import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { FileText, KeyRound, Lock, X } from 'lucide-react';

const blankForm = {
  name: '',
  host: '',
  port: 22,
  username: '',
  parentId: 0,
  authType: 'password',
  password: '',
  privateKey: '',
  passphrase: '',
  keyFile: '',
  savePassword: false,
  savePrivateKey: false,
  savePassphrase: false,
  saveKeyFile: false,
};

export function SavedLinkDialog({
  open,
  mode = 'create',
  initial,
  credential,
  folders,
  onClose,
  onSave,
  onPickFile,
}) {
  const [form, setForm] = useState(blankForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const cred = credential || {};
    setForm({
      ...blankForm,
      name: initial?.name ?? '',
      host: initial?.host ?? '',
      port: initial?.port ?? 22,
      username: initial?.username ?? '',
      parentId: initial?.parentId ?? 0,
      authType: initial?.authType || 'password',
      // 编辑模式下凭据字段保持空，用户输入即覆盖；Switch 通过 credential 反映"已保存"
      savePassword: !!cred.hasPassword,
      savePrivateKey: !!cred.hasPrivateKey,
      savePassphrase: !!cred.hasPassphrase,
      saveKeyFile: !!cred.hasKeyFile,
    });
    setError('');
    setBusy(false);
  }, [open, initial, credential]);

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const validate = () => {
    if (!form.name.trim()) return '请输入名称';
    if (!form.host.trim()) return '请输入主机地址';
    if (!form.username.trim()) return '请输入用户名';
    const port = Number(form.port);
    if (!port || port < 1 || port > 65535) return '端口需在 1-65535 之间';
    if (form.authType === 'password' && form.savePassword && !form.password) {
      return '请输入要保存的密码';
    }
    if (form.authType === 'key' && form.savePrivateKey && !form.privateKey.trim()) {
      return '请输入要保存的私钥内容';
    }
    if (form.authType === 'keyfile' && form.saveKeyFile && !form.keyFile.trim()) {
      return '请选择私钥文件';
    }
    return '';
  };

  const submit = async event => {
    event?.preventDefault();
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onSave({
        name: form.name.trim(),
        host: form.host.trim(),
        port: Number(form.port) || 22,
        username: form.username.trim(),
        parentId: Number(form.parentId) || 0,
        authType: form.authType,
        credential: {
          password: form.savePassword ? form.password : '',
          privateKey: form.savePrivateKey ? form.privateKey : '',
          passphrase: form.authType === 'keyfile' ? form.passphrase : form.passphrase,
          keyFile: form.saveKeyFile ? form.keyFile : '',
        },
        clearCredential: false,
      });
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  const handlePickFile = async () => {
    try {
      const path = await onPickFile?.();
      if (path) setField('keyFile', path);
    } catch (e) {
      setError(`文件选择失败：${e}`);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? '编辑 SSH 连接' : '新增连接'}</DialogTitle>
          <DialogDescription>
            勾选"保存"即可让密码或私钥写入系统密钥环，下次连接无需再输入。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="link-name">名称</Label>
              <Input
                id="link-name"
                autoFocus
                value={form.name}
                onChange={e => setField('name', e.target.value)}
                placeholder="例如：生产服务器"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="link-folder">文件夹</Label>
              <Select
                value={String(form.parentId)}
                onValueChange={value => setField('parentId', value)}
              >
                <SelectTrigger id="link-folder">
                  <SelectValue placeholder="根目录" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">根目录</SelectItem>
                  {folders.map(folder => (
                    <SelectItem key={folder.id} value={String(folder.id)}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="link-host">主机地址</Label>
              <Input
                id="link-host"
                value={form.host}
                onChange={e => setField('host', e.target.value)}
                placeholder="192.168.1.10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="link-port">端口</Label>
              <Input
                id="link-port"
                type="number"
                value={form.port}
                onChange={e => setField('port', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="link-username">用户名</Label>
              <Input
                id="link-username"
                value={form.username}
                onChange={e => setField('username', e.target.value)}
                placeholder="root"
              />
            </div>
          </div>

          <Tabs value={form.authType} onValueChange={value => setField('authType', value)}>
            <TabsList className="w-full">
              <TabsTrigger value="password" className="flex-1">
                <Lock className="mr-1 h-3.5 w-3.5" />
                密码
              </TabsTrigger>
              <TabsTrigger value="key" className="flex-1">
                <KeyRound className="mr-1 h-3.5 w-3.5" />
                私钥
              </TabsTrigger>
              <TabsTrigger value="keyfile" className="flex-1">
                <FileText className="mr-1 h-3.5 w-3.5" />
                私钥文件
              </TabsTrigger>
            </TabsList>

            <TabsContent value="password" className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="link-password" className="mb-0">
                  密码
                  {credential?.hasPassword && mode === 'edit' && (
                    <span className="ml-2 text-xs font-normal text-primary">已保存</span>
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  <Label htmlFor="save-password" className="mb-0 text-xs font-normal text-muted-foreground">
                    保存到密钥环
                  </Label>
                  <Switch
                    id="save-password"
                    checked={form.savePassword}
                    onCheckedChange={value => setField('savePassword', value)}
                  />
                </div>
              </div>
              <Input
                id="link-password"
                type="password"
                value={form.password}
                onChange={e => setField('password', e.target.value)}
                placeholder={
                  credential?.hasPassword && mode === 'edit'
                    ? '留空保持原密码不变'
                    : '不会被保存，除非勾选"保存到密钥环"'
                }
              />
            </TabsContent>

            <TabsContent value="key" className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="link-private-key" className="mb-0">
                  PEM 私钥
                  {credential?.hasPrivateKey && mode === 'edit' && (
                    <span className="ml-2 text-xs font-normal text-primary">已保存</span>
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  <Label htmlFor="save-key" className="mb-0 text-xs font-normal text-muted-foreground">
                    保存到密钥环
                  </Label>
                  <Switch
                    id="save-key"
                    checked={form.savePrivateKey}
                    onCheckedChange={value => setField('savePrivateKey', value)}
                  />
                </div>
              </div>
              <Textarea
                id="link-private-key"
                rows={5}
                className="font-mono text-xs"
                value={form.privateKey}
                onChange={e => setField('privateKey', e.target.value)}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              />
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="link-passphrase" className="mb-0">
                  私钥密码（可选）
                  {credential?.hasPassphrase && mode === 'edit' && (
                    <span className="ml-2 text-xs font-normal text-primary">已保存</span>
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="save-passphrase"
                    className="mb-0 text-xs font-normal text-muted-foreground"
                  >
                    保存到密钥环
                  </Label>
                  <Switch
                    id="save-passphrase"
                    checked={form.savePassphrase}
                    onCheckedChange={value => setField('savePassphrase', value)}
                  />
                </div>
              </div>
              <Input
                id="link-passphrase"
                type="password"
                value={form.passphrase}
                onChange={e => setField('passphrase', e.target.value)}
                placeholder="如私钥无密码保护则留空"
              />
            </TabsContent>

            <TabsContent value="keyfile" className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="link-keyfile" className="mb-0">
                  私钥文件路径
                  {credential?.hasKeyFile && mode === 'edit' && (
                    <span className="ml-2 text-xs font-normal text-primary">已保存</span>
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  <Label htmlFor="save-keyfile" className="mb-0 text-xs font-normal text-muted-foreground">
                    保存到密钥环
                  </Label>
                  <Switch
                    id="save-keyfile"
                    checked={form.saveKeyFile}
                    onCheckedChange={value => setField('saveKeyFile', value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  id="link-keyfile"
                  value={form.keyFile}
                  readOnly
                  onChange={e => setField('keyFile', e.target.value)}
                  placeholder="点击右侧选择 ~/.ssh/id_rsa 等"
                />
                {form.keyFile ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setField('keyFile', '')}
                    aria-label="清除路径"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button type="button" variant="outline" onClick={handlePickFile}>
                    选择文件
                  </Button>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="link-keyfile-passphrase" className="mb-0">
                  私钥密码（可选）
                  {credential?.hasPassphrase && mode === 'edit' && (
                    <span className="ml-2 text-xs font-normal text-primary">已保存</span>
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="save-keyfile-passphrase"
                    className="mb-0 text-xs font-normal text-muted-foreground"
                  >
                    保存到密钥环
                  </Label>
                  <Switch
                    id="save-keyfile-passphrase"
                    checked={form.savePassphrase}
                    onCheckedChange={value => setField('savePassphrase', value)}
                  />
                </div>
              </div>
              <Input
                id="link-keyfile-passphrase"
                type="password"
                value={form.passphrase}
                onChange={e => setField('passphrase', e.target.value)}
                placeholder="如私钥无密码保护则留空"
              />
            </TabsContent>
          </Tabs>

          {error && <div className="text-xs text-destructive">{error}</div>}

          <DialogFooter className="mt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              {mode === 'edit' ? '保存修改' : '新增连接'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
