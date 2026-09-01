import { useEffect, useState } from 'react';
import { Loader2, Lock, KeyRound, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const blankForm = {
  host: '',
  port: 22,
  username: '',
  password: '',
  privateKey: '',
  passphrase: '',
  keyFile: '',
  authType: 'password',
  savedNodeId: 0,
};

export function ConnectionForm({ initialForm = blankForm, onConnect, onPickFile }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ ...blankForm, ...initialForm });

  useEffect(() => setForm({ ...blankForm, ...initialForm }), [initialForm]);

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const setAuthType = value => setField('authType', value);

  const submit = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await onConnect({
        ...form,
        port: Number(form.port) || 22,
        password: form.authType === 'password' ? form.password : '',
        privateKey: form.authType === 'key' ? form.privateKey : '',
        keyFile: form.authType === 'keyfile' ? form.keyFile : '',
      });
    } catch (e) {
      setError(String(e));
    } finally {
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

  const usingSavedCredential = form.savedNodeId > 0;

  return (
    <div className="m-auto w-full max-w-3xl rounded-lg border border-border bg-card p-7 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">连接信息</h2>
          <p className="text-xs text-muted-foreground">
            {usingSavedCredential
              ? '已从已保存连接加载认证方式，凭证在连接时从密钥环读取。'
              : '使用密码或 PEM 私钥安全登录服务器'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_140px_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="host">主机地址</Label>
          <Input
            id="host"
            value={form.host}
            onChange={e => setField('host', e.target.value)}
            placeholder="example.com 或 192.168.1.10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="port">端口</Label>
          <Input
            id="port"
            type="number"
            value={form.port}
            onChange={e => setField('port', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="username">用户名</Label>
          <Input
            id="username"
            value={form.username}
            onChange={e => setField('username', e.target.value)}
            placeholder="root"
          />
        </div>
      </div>

      <Tabs value={form.authType} onValueChange={setAuthType} className="mt-5">
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
        <TabsContent value="password" className="mt-3 space-y-1.5">
          <Label htmlFor="password">密码</Label>
          <Input
            id="password"
            type="password"
            value={form.password}
            onChange={e => setField('password', e.target.value)}
            placeholder={usingSavedCredential ? '已保存到密钥环，连接时自动读取' : '不会被保存'}
          />
        </TabsContent>
        <TabsContent value="key" className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="privateKey">PEM 私钥</Label>
            <Textarea
              id="privateKey"
              rows={4}
              className="font-mono text-xs"
              value={form.privateKey}
              onChange={e => setField('privateKey', e.target.value)}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="passphrase">私钥密码（可选）</Label>
            <Input
              id="passphrase"
              type="password"
              value={form.passphrase}
              onChange={e => setField('passphrase', e.target.value)}
            />
          </div>
        </TabsContent>
        <TabsContent value="keyfile" className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="keyFile">私钥文件路径</Label>
            <div className="flex gap-2">
              <Input
                id="keyFile"
                value={form.keyFile}
                onChange={e => setField('keyFile', e.target.value)}
                placeholder="点击右侧选择 ~/.ssh/id_rsa"
              />
              <Button type="button" variant="outline" onClick={handlePickFile}>
                选择文件
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="passphrase">私钥密码（可选）</Label>
            <Input
              id="passphrase"
              type="password"
              value={form.passphrase}
              onChange={e => setField('passphrase', e.target.value)}
            />
          </div>
        </TabsContent>
      </Tabs>

      {error && <div className="mt-3 text-xs text-destructive">{error}</div>}

      <div className="mt-5 flex items-center gap-3">
        <Button onClick={submit} disabled={busy}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          连接服务器 <span>→</span>
        </Button>
      </div>
    </div>
  );
}