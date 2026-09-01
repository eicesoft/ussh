# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概要

uSSH — 基于 Wails v2 的桌面 SSH 客户端。Go 后端提供 SSH 连接管理与 SQLite 持久化，React 前端提供多标签页终端界面。

## 常用命令

```bash
# 开发模式（热重载）
wails dev

# 生产构建
wails build

# 前端开发（浏览器中，可访问 Go 方法）
cd frontend && npm run dev        # Vite dev server，Go 方法通过 http://localhost:34115 访问

# 仅构建前端
cd frontend && npm run build
```

- Go 版本：1.27.0，Wails 版本：v2.14.0
- 无测试套件、无 linter 配置

## 架构

```
main.go          → Wails 入口，窗口配置，绑定 App 结构体
app.go           → SSH 核心：连接/断开/输入/终端大小调整，认证方式（password/key/keyfile）
storage.go       → SQLite 连接节点树（folder + ssh 两种类型），macOS keyring 凭证存储
frontend/        → React + Vite + Tailwind + shadcn/ui（New York 风格）
```

### Go 后端关键设计

- **App 结构体**持有 `map[string]*sshConnection`（key 为 tabId），通过 `sync.Mutex` 保护并发。所有导出方法自动绑定到 Wails 前端。
- **SSH 会话输出**通过 `terminalEventWriter` 实现 `io.Writer` 接口，将数据以 Wails Events 发送到前端（`terminal-output` 事件）。
- **会话生命周期**：`watchSession` goroutine 等待 `session.Wait()`，会话结束后发出 `terminal-status` 事件并清理连接。
- **认证**：三种方式 — `password`（密码）、`key`（内联私钥内容）、`keyfile`（从文件读取私钥）。均支持 passphrase。
- **凭证存储**：元数据存 SQLite（`~/.config/uSSH/connections.db`），敏感凭证（密码/私钥/passphrase）存 macOS keyring（通过 `go-keyring`，service 名 `uSSH`）。`GetCredential` 只返回 `CredentialView`（hasPassword/hasPrivateKey 等布尔标记），不返回明文。
- **节点树**：`connection_nodes` 表，`parent_id` 形成树结构。`type` 为 `folder` 或 `ssh`。`MoveNode` 有循环检测（`isDescendant`）。

### 前端关键设计

- **Shell 组件**是顶层布局编排器：左侧 `ConnectionTree`（连接树 + 活动标签页），中间 `TabBar` + 内容区（`ConnectionForm` / `TerminalView` / `ConnectionDashboard`），右侧可选 `UtilityPanel` + `UtilityRail`。面板用 `react-resizable-panels` 实现可拖拽分割。
- **标签页管理**（`useTabs` hook）：每个标签页有 `kind`（`dashboard` | `connection`）、`status`（`idle` | `connecting` | `connected` | `closed`）。dashboard 标签页不可关闭。`buffersRef` 缓存终端输出（上限 2MB），`termsRef` 持有 xterm.js Terminal 实例引用。
- **终端实现**（`TerminalView`）：xterm.js + FitAddon 自动适应容器大小。`term.onData` 回调发送输入到 Go 后端。通过 `ResizeObserver` + `window.resize` 监听尺寸变化并同步到 SSH 会话。
- **API 层**（`frontend/src/lib/api.js`）：封装 `window.go.main.App` 调用和 Wails Events 订阅。`runtimeAvailable` 标记用于判断是否在 Wails 环境内运行。
- **认证方式**：前端 `ConnectionForm` 根据 `authType` 切换表单字段（密码输入框 vs 私钥文本框 vs 私钥文件选择器）。
- **路径别名**：`@/` → `frontend/src/`（vite.config.js 配置）。
- **主题**：`next-themes` 实现 dark/light 切换，CSS 变量定义在 `index.css` 的 `:root` 和 `.dark` 中。
- **shadcn/ui 组件**在 `frontend/src/components/ui/`，使用 `cn()` 工具函数（clsx + tailwind-merge）合并类名。

### 数据流

```
用户输入 → TerminalView.onData → api.sendInput(tabId, data)
  → Go: App.SendInput → ssh.Session.StdinPipe.Write

SSH 输出 → terminalEventWriter.Write → EventsEmit("terminal-output")
  → 前端: useTerminalEvents → useTabs.writeToTab → term.write(data)
```

### 前端组件目录

| 目录 | 用途 |
|------|------|
| `components/layout/` | Shell、ConnectionTree、TabBar、StatusBar、UtilityPanel、UtilityRail、TreeNode、TreeFolder |
| `components/connection/` | ConnectionForm、TerminalView、SavedLinkDialog、NewFolderDialog、ConfirmDeleteDialog、EditLinkMenu |
| `components/dashboard/` | ConnectionDashboard（连接总览页） |
| `components/theme/` | ThemeProvider |
| `components/ui/` | shadcn/ui 基础组件（button、dialog、select 等） |
| `hooks/` | useTabs、useSavedNodes、useTerminalEvents、useTheme |
| `lib/` | api.js（Go 桥接层）、utils.js（cn 工具函数） |

## Git 约定

Commit message 使用中文，格式：`<类型>: <描述>`，如 `新增: shadcn/ui 迁移`、`修复: 终端断连未清理`。