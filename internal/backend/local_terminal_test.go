package backend

import (
	"strings"
	"testing"
)

func TestResolveLocalShell(t *testing.T) {
	shell, err := resolveLocalShell("")
	if err != nil {
		t.Fatalf("resolveLocalShell() error = %v", err)
	}
	if !strings.HasPrefix(shell, "/") {
		t.Fatalf("shell path = %q, want absolute path", shell)
	}
}

func TestResolveConfiguredLocalShell(t *testing.T) {
	available := availableLocalTerminals()
	if len(available) == 0 {
		t.Skip("no local terminal is available on this test host")
	}
	shell, err := resolveLocalShell(available[0].Path)
	if err != nil {
		t.Fatalf("resolveLocalShell(%q) error = %v", available[0].Path, err)
	}
	if shell != available[0].Path {
		t.Fatalf("shell path = %q, want %q", shell, available[0].Path)
	}
}

// 无本地会话时，路由方法的兜底行为必须与 SSH 侧一致：输入报错、
// 尺寸静默忽略、断开视为无事发生。
func TestLocalSessionRoutingWithoutSession(t *testing.T) {
	app := NewApp()
	if err := app.sendLocalInput("tab-none", "ls\r"); err == nil {
		t.Fatal("sendLocalInput should fail without a local session")
	}
	if err := app.resizeLocalTerminal("tab-none", TerminalSize{Columns: 80, Rows: 24}); err != nil {
		t.Fatalf("resizeLocalTerminal should be a no-op, got %v", err)
	}
	if app.disconnectLocal("tab-none") {
		t.Fatal("disconnectLocal should report false without a local session")
	}
	if app.hasLocalSession("tab-none") {
		t.Fatal("hasLocalSession should report false without a local session")
	}
}
