package backend

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestTerminalLogFileNameValidation(t *testing.T) {
	for _, name := range []string{"20260907-120000-session.jsonl", "中文日志.jsonl"} {
		if !validTerminalLogFileName(name) {
			t.Fatalf("expected valid name: %q", name)
		}
	}
	for _, name := range []string{"../secret.jsonl", "notes.txt", "nested/log.jsonl"} {
		if validTerminalLogFileName(name) {
			t.Fatalf("expected invalid name: %q", name)
		}
	}
}

func TestTerminalLogFilesCanBeListedAndRead(t *testing.T) {
	root := t.TempDir()
	dir := terminalLogDir(root, "tab-1")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	older := filepath.Join(dir, "20260907-120000-session-a.jsonl")
	newer := filepath.Join(dir, "20260907-130000-session-b.jsonl")
	if err := os.WriteFile(older, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(newer, []byte("new"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(older, time.Now().Add(-time.Minute), time.Now().Add(-time.Minute)); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "ignore.txt"), []byte("skip"), 0o600); err != nil {
		t.Fatal(err)
	}

	logs, err := listTerminalLogsIn(root, "tab-1")
	if err != nil {
		t.Fatal(err)
	}
	if len(logs) != 2 || logs[0].Name != filepath.Base(newer) {
		t.Fatalf("unexpected logs: %+v", logs)
	}
	content, err := readTerminalLogIn(root, "tab-1", logs[0].Name)
	if err != nil || content.Content != "new" || content.Truncated {
		t.Fatalf("unexpected content: %+v, %v", content, err)
	}
	if _, err := readTerminalLogIn(root, "tab-1", "../secret.jsonl"); err == nil {
		t.Fatal("expected traversal rejection")
	}
}

func TestTerminalLogDirUsesConnectionIDAsSingleDirectory(t *testing.T) {
	root := t.TempDir()
	dir := terminalLogDir(root, "connection/demo")
	if want := filepath.Join(root, "connection_demo"); dir != want {
		t.Fatalf("dir = %q, want %q", dir, want)
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
}

func TestTerminalLogsGroupedBySavedConnectionAcrossTabs(t *testing.T) {
	root := t.TempDir()
	for _, session := range []struct {
		tab  string
		node int64
	}{
		{"tab-a", 42}, {"tab-b", 42}, {"tab-c", 43},
	} {
		connectionID := terminalLogConnectionID(session.tab, ConnectionConfig{SavedNodeID: session.node})
		path, err := terminalLogPathIn(root, connectionID, session.tab, time.Now())
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(session.tab), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	logs, err := listTerminalLogsIn(root, "42")
	if err != nil || len(logs) != 2 {
		t.Fatalf("shared connection logs: %+v, %v", logs, err)
	}
	for _, log := range logs {
		content, err := readTerminalLogIn(root, "42", log.Name)
		if err != nil || (content.Content != "tab-a" && content.Content != "tab-b") {
			t.Fatalf("unexpected connection log: %+v, %v", content, err)
		}
	}
	if got := terminalLogConnectionID("temporary-tab", ConnectionConfig{}); got != "temporary-tab" {
		t.Fatalf("unsaved connection ID = %q", got)
	}
}
