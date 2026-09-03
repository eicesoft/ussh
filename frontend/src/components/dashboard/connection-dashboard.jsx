import { FolderOpen, LayoutDashboard, Plus, Server, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ConnectionDashboard({ nodes, onConnect, onNewConnection }) {
  const folders = nodes.filter(node => node.type === 'folder');
  const rootLinks = nodes.filter(node => node.type === 'ssh' && node.parentId === 0);
  const groups = [
    { id: 0, name: '未分组', links: rootLinks },
    ...folders.map(folder => ({
      id: folder.id,
      name: folder.name,
      links: nodes.filter(node => node.type === 'ssh' && node.parentId === folder.id),
    })),
  ];
  const savedLinks = nodes.filter(node => node.type === 'ssh');

  return (
    <div className="h-full select-none overflow-auto bg-background p-5">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LayoutDashboard className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">连接总览</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                共 {savedLinks.length} 个已保存连接，按目录分组展示。
              </p>
            </div>
          </div>
          <Button onClick={onNewConnection}>
            <Plus className="h-4 w-4" />
            新增连接
          </Button>
        </header>

        {savedLinks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
            <Server className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">暂无已保存连接</p>
            <p className="mt-1 text-xs text-muted-foreground">可在左侧使用“新增连接”添加常用服务器。</p>
          </div>
        ) : (
          <div className="space-y-7">
            {groups.filter(group => group.links.length > 0).map(group => (
              <section key={group.id}>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                  <FolderOpen className="h-4 w-4 text-primary" />
                  <h2>{group.name}</h2>
                  <span className="text-xs font-normal text-muted-foreground">{group.links.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {group.links.map(link => (
                    <div
                      key={link.id}
                      className="group cursor-pointer rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onDoubleClick={() => onConnect(link)}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Server className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium">{link.name}</p>
                            <Button
                              type="button"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => onConnect(link)}
                              onDoubleClick={event => event.stopPropagation()}
                              aria-label="终端"
                            >
                              <Terminal className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                            {link.username}@{link.host}:{link.port || 22}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
