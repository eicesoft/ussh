import { FolderOpen, LayoutDashboard, Plus, Server, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

const cardGridClass = 'grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

function ConnectionCards({ links, onConnect }) {
  if (links.length === 0) return null;

  return (
    <div className={cardGridClass}>
      {links.map(link => (
        <div
          key={link.id}
          className="group cursor-pointer rounded-md border border-border bg-card p-3 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onDoubleClick={() => onConnect(link)}
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Server className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <p className="truncate text-xs font-medium">{link.name}</p>
                <Button
                  type="button"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => onConnect(link)}
                  onDoubleClick={event => event.stopPropagation()}
                  aria-label="终端"
                >
                  <Terminal className="h-3 w-3" />
                </Button>
              </div>
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {link.username}@{link.host}:{link.port || 22}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function FolderSection({ folder, linksByParent, foldersByParent, getFolderConnectionCount, hasContent, onConnect, depth = 0 }) {
  const links = linksByParent.get(folder.id) || [];
  const children = (foldersByParent.get(folder.id) || []).filter(child => hasContent(child));

  return (
    <section className={depth > 0 ? 'mt-4 border-l border-border pl-3' : undefined}>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
        <FolderOpen className="h-3.5 w-3.5 text-primary" />
        <h2>{folder.name}</h2>
        <span className="text-[11px] font-normal text-muted-foreground">{getFolderConnectionCount(folder)}</span>
      </div>
      {children.map(child => (
        <FolderSection
          key={child.id}
          folder={child}
          linksByParent={linksByParent}
          foldersByParent={foldersByParent}
          getFolderConnectionCount={getFolderConnectionCount}
          hasContent={hasContent}
          onConnect={onConnect}
          depth={depth + 1}
        />
      ))}
      {links.length > 0 && (
        <div className={children.length > 0 ? 'mt-1' : undefined}>
          <ConnectionCards links={links} onConnect={onConnect} />
        </div>
      )}
    </section>
  );
}

export function ConnectionDashboard({ nodes, onConnect, onNewConnection }) {
  const folders = nodes.filter(node => node.type === 'folder');
  const savedLinks = nodes.filter(node => node.type === 'ssh');
  const rootLinks = savedLinks.filter(link => (Number(link.parentId) || 0) === 0);
  const linksByParent = new Map();
  const foldersByParent = new Map();

  savedLinks.forEach(link => {
    const parentId = Number(link.parentId) || 0;
    const links = linksByParent.get(parentId) || [];
    links.push(link);
    linksByParent.set(parentId, links);
  });
  folders.forEach(folder => {
    const parentId = Number(folder.parentId) || 0;
    const children = foldersByParent.get(parentId) || [];
    children.push(folder);
    foldersByParent.set(parentId, children);
  });

  const folderContentCache = new Map();
  const hasContent = folder => {
    if (folderContentCache.has(folder.id)) return folderContentCache.get(folder.id);
    const children = foldersByParent.get(folder.id) || [];
    const result = (linksByParent.get(folder.id) || []).length > 0 || children.some(child => hasContent(child));
    folderContentCache.set(folder.id, result);
    return result;
  };
  const folderConnectionCountCache = new Map();
  const getFolderConnectionCount = folder => {
    if (folderConnectionCountCache.has(folder.id)) return folderConnectionCountCache.get(folder.id);
    const children = foldersByParent.get(folder.id) || [];
    const count = (linksByParent.get(folder.id) || []).length
      + children.reduce((total, child) => total + getFolderConnectionCount(child), 0);
    folderConnectionCountCache.set(folder.id, count);
    return count;
  };
  const rootFolders = (foldersByParent.get(0) || []).filter(folder => hasContent(folder));

  return (
    <div className="flex h-full min-h-0 flex-col select-none bg-background">
      <div className="w-full shrink-0 px-4 pt-4">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <LayoutDashboard className="h-4 w-4" />
            </span>
            <div>
              <h1 className="text-base font-semibold tracking-tight">总览</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                共 {savedLinks.length} 个已保存连接，按目录分组展示。
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onNewConnection}
            aria-label="新增连接"
            title="新增连接"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </header>
      </div>

      <div className="dashboard-scrollbar min-h-0 flex-1 overflow-auto px-4 pb-4">
        <div className="w-full">
          {savedLinks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
              <Server className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">暂无已保存连接</p>
              <p className="mt-1 text-xs text-muted-foreground">可在左侧使用“新增连接”添加常用服务器。</p>
            </div>
          ) : (
            <div className="space-y-5">
              {rootLinks.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <FolderOpen className="h-3.5 w-3.5 text-primary" />
                    <h2>未分组</h2>
                    <span className="text-[11px] font-normal text-muted-foreground">{rootLinks.length}</span>
                  </div>
                  <ConnectionCards links={rootLinks} onConnect={onConnect} />
                </section>
              )}
              {rootFolders.map(folder => (
                <FolderSection
                  key={folder.id}
                  folder={folder}
                  linksByParent={linksByParent}
                  foldersByParent={foldersByParent}
                  getFolderConnectionCount={getFolderConnectionCount}
                  hasContent={hasContent}
                  onConnect={onConnect}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
