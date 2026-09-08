package backend

import (
	"bufio"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type loggingInput struct {
	logger *terminalLogger
}

func (w loggingInput) Write(data []byte) (int, error) {
	echo := string(data)
	if strings.HasSuffix(echo, "\r") {
		echo += "\n"
	}
	if err := w.logger.writeOutput("stdout", echo); err != nil {
		return 0, err
	}
	return len(data), nil
}

func (w loggingInput) Close() error { return nil }

func TestSendInputLogsBeforePTYEcho(t *testing.T) {
	logger, path := testTerminalLogger(t)
	app := NewApp()
	app.connections["tab-1"] = &sshConnection{input: loggingInput{logger: logger}, logger: logger}

	if err := app.SendInput("tab-1", "ls\r"); err != nil {
		t.Fatal(err)
	}
	if err := logger.closeWithError(errors.New("test complete")); err != nil {
		t.Fatal(err)
	}

	records := readLogRecords(t, path)
	if len(records) != 3 {
		t.Fatalf("record count = %d, want 3: %+v", len(records), records)
	}
	if records[1].Type != "input" || records[1].Content != "ls\r" || records[1].CommandID != 1 {
		t.Fatalf("input should precede PTY echo: %+v", records[1])
	}
	if records[2].Type != "session_end" {
		t.Fatalf("PTY echo should not be logged as output: %+v", records[2])
	}
}

func testTerminalLogger(t *testing.T) (*terminalLogger, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "session.jsonl")
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	l := &terminalLogger{file: file, writer: bufio.NewWriter(file), sessionID: "tab-1", server: "example", host: "example", port: 22, username: "alice", startedAt: time.Unix(1, 0).UTC()}
	if err := l.writeLocked(terminalLogRecord{Type: "session_start"}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = l.closeWithError(nil) })
	return l, path
}

func readLogRecords(t *testing.T, path string) []terminalLogRecord {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	var records []terminalLogRecord
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		var record terminalLogRecord
		if err := json.Unmarshal(scanner.Bytes(), &record); err != nil {
			t.Fatal(err)
		}
		records = append(records, record)
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	return records
}

func TestSafeLogName(t *testing.T) {
	if got := safeLogName("server/name with spaces"); got != "server_name with spaces" {
		t.Fatalf("got %q", got)
	}
	if got := safeLogName("../"); got != "unknown" {
		t.Fatalf("got %q", got)
	}
}

func TestTerminalLogConnectionDirectories(t *testing.T) {
	root := t.TempDir()
	started := time.Date(2026, 9, 7, 10, 20, 30, 0, time.Local)
	path, err := terminalLogPathIn(root, "123", "session-456", started)
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(root, "123", "20260907-102030-session-456.jsonl")
	if path != want {
		t.Fatalf("path = %q, want %q", path, want)
	}
	if info, err := os.Stat(filepath.Dir(path)); err != nil || !info.IsDir() {
		t.Fatalf("missing directory: %v", err)
	}
	other, err := terminalLogPathIn(root, "123", "session-789", started)
	if err != nil || other == path || filepath.Dir(other) != filepath.Dir(path) {
		t.Fatalf("reconnected session path: %q, %v", other, err)
	}
}

func TestTerminalLoggerWritesCommandContentBlocks(t *testing.T) {
	logger, path := testTerminalLogger(t)
	if err := logger.writeInput("echo hello\n"); err != nil {
		t.Fatal(err)
	}
	if err := logger.writeOutput("stdout", "hello\r\n"); err != nil {
		t.Fatal(err)
	}
	if err := logger.writeInput("exit\n"); err != nil {
		t.Fatal(err)
	}
	if err := logger.closeWithError(nil); err != nil {
		t.Fatal(err)
	}

	records := readLogRecords(t, path)
	if len(records) != 5 {
		t.Fatalf("record count = %d, want 5", len(records))
	}
	if records[1].Type != "input" || records[1].CommandID != 1 || records[1].Content != "echo hello\n" {
		t.Fatalf("unexpected input: %+v", records[1])
	}
	if records[2].Type != "output" || records[2].CommandID != 1 || records[2].Stream != "stdout" {
		t.Fatalf("unexpected output: %+v", records[2])
	}
	if records[3].CommandID != 2 || !strings.Contains(records[3].Content, "exit") {
		t.Fatalf("unexpected second input: %+v", records[3])
	}
	if records[4].Type != "session_end" || records[4].SessionID != "tab-1" {
		t.Fatalf("unexpected end: %+v", records[4])
	}
	if records[1].Sequence != 1 || records[2].Sequence != 2 || records[3].Sequence != 3 {
		t.Fatalf("sequence not monotonic")
	}
}

func TestTerminalLoggerBuffersKeystrokesUntilEnter(t *testing.T) {
	logger, path := testTerminalLogger(t)
	for _, key := range []string{"p", "w", "d"} {
		if err := logger.writeInput(key); err != nil {
			t.Fatal(err)
		}
	}
	if records := readLogRecords(t, path); len(records) != 1 {
		t.Fatalf("keystrokes were written early: %+v", records)
	}
	if err := logger.writeInput("\r"); err != nil {
		t.Fatal(err)
	}
	if err := logger.writeOutput("stdout", "/home/alice\r\n"); err != nil {
		t.Fatal(err)
	}
	if err := logger.closeWithError(nil); err != nil {
		t.Fatal(err)
	}

	records := readLogRecords(t, path)
	if len(records) != 4 {
		t.Fatalf("record count = %d, want 4", len(records))
	}
	if records[1].Type != "input" || records[1].Content != "pwd\r" || records[1].CommandID != 1 {
		t.Fatalf("unexpected input: %+v", records[1])
	}
	if records[2].Type != "output" || records[2].Content != "/home/alice\r\n" || records[2].CommandID != 1 {
		t.Fatalf("unexpected output: %+v", records[2])
	}
}

func TestTerminalLoggerLogsOnlyFinalEditedInput(t *testing.T) {
	logger, path := testTerminalLogger(t)
	for _, key := range []string{"e", "c", "h", "o", " ", "o", "l", "d", "\b", "\b", "n", "e", "w", "\r"} {
		if err := logger.writeInput(key); err != nil {
			t.Fatal(err)
		}
	}
	if err := logger.closeWithError(nil); err != nil {
		t.Fatal(err)
	}
	records := readLogRecords(t, path)
	if len(records) != 3 || records[1].Type != "input" || records[1].Content != "echo onew\r" {
		t.Fatalf("unexpected edited input records: %+v", records)
	}
}

func TestTerminalLoggerSkipsEmptyInputLines(t *testing.T) {
	logger, path := testTerminalLogger(t)
	for _, key := range []string{"\r", "\n", "\r\n"} {
		if err := logger.writeInput(key); err != nil {
			t.Fatal(err)
		}
	}
	if err := logger.closeWithError(nil); err != nil {
		t.Fatal(err)
	}
	if records := readLogRecords(t, path); len(records) != 2 {
		t.Fatalf("empty input lines were logged: %+v", records)
	}
}

func TestTerminalLoggerDoesNotRecordPTYEchoAsOutput(t *testing.T) {
	logger, path := testTerminalLogger(t)
	for _, key := range []string{"l", "l"} {
		if err := logger.writeInput(key); err != nil {
			t.Fatal(err)
		}
		if err := logger.writeOutput("stdout", key); err != nil {
			t.Fatal(err)
		}
	}
	if err := logger.writeInput("\r"); err != nil {
		t.Fatal(err)
	}
	if err := logger.writeOutput("stdout", "\r\n"); err != nil {
		t.Fatal(err)
	}
	if err := logger.writeOutput("stdout", "Listing\r\n"); err != nil {
		t.Fatal(err)
	}
	if err := logger.closeWithError(nil); err != nil {
		t.Fatal(err)
	}

	records := readLogRecords(t, path)
	if len(records) != 4 {
		t.Fatalf("record count = %d, want 4: %+v", len(records), records)
	}
	if records[1].Type != "input" || records[1].Content != "ll\r" || records[1].CommandID != 1 {
		t.Fatalf("unexpected input: %+v", records[1])
	}
	if records[2].Type != "output" || records[2].Content != "Listing\r\n" || records[2].CommandID != 1 {
		t.Fatalf("PTY echo should not be logged as output: %+v", records[2])
	}
}

func TestTerminalLoggerFlushesOutputAfterQuietPeriod(t *testing.T) {
	logger, path := testTerminalLogger(t)
	if err := logger.writeOutput("stdout", "welcome\r\n"); err != nil {
		t.Fatal(err)
	}
	time.Sleep(terminalOutputFlushDelay + 100*time.Millisecond)
	records := readLogRecords(t, path)
	if len(records) != 2 || records[1].Type != "output" || records[1].Content != "welcome\r\n" {
		t.Fatalf("output was not flushed: %+v", records)
	}
}

func TestTerminalLoggerRedrawnInput(t *testing.T) {
	for _, redraw := range []string{"\bls", "\x1b[1Dls"} {
		t.Run(redraw, func(t *testing.T) {
			logger, path := testTerminalLogger(t)
			logger.writeInput("l")
			logger.writeOutput("stdout", "l")
			logger.writeInput("s")
			// SSH may split a cursor sequence or its replacement text anywhere.
			for _, b := range []byte(redraw) {
				logger.writeOutput("stdout", string(b))
			}
			logger.mu.Lock()
			logger.flushOutputLocked()
			logger.mu.Unlock()
			if got := readLogRecords(t, path); len(got) != 1 {
				t.Fatalf("echo was recorded before Enter: %+v", got)
			}
			logger.writeInput("\r")
			logger.writeOutput("stdout", "\r\nls is real output\r\n")
			logger.closeWithError(nil)
			got := readLogRecords(t, path)
			if len(got) != 4 || got[1].Content != "ls\r" || got[2].Content != "ls is real output\r\n" {
				t.Fatalf("unexpected records: %+v", got)
			}
		})
	}
}

func TestTerminalLoggerDelayedRedrawEcho(t *testing.T) {
	for _, keys := range [][]string{{"l", "l"}, {"ll"}} {
		for _, chunks := range [][]string{{"l\bll"}, {"l", "\b", "l", "l"}} {
			logger, path := testTerminalLogger(t)
			for _, key := range keys {
				if err := logger.writeInput(key); err != nil {
					t.Fatal(err)
				}
			}
			for _, chunk := range chunks {
				if err := logger.writeOutput("stdout", chunk); err != nil {
					t.Fatal(err)
				}
			}
			if err := logger.writeInput("\r"); err != nil {
				t.Fatal(err)
			}
			if err := logger.writeOutput("stdout", "\r\nListing\r\n"); err != nil {
				t.Fatal(err)
			}
			if err := logger.closeWithError(nil); err != nil {
				t.Fatal(err)
			}
			got := readLogRecords(t, path)
			if len(got) != 4 || got[1].Type != "input" || got[2].Content != "Listing\r\n" {
				t.Fatalf("keys=%q chunks=%q: echo recorded before input: %+v", keys, chunks, got)
			}
		}
	}
}

func TestTerminalLoggerRedrawBeforeEnterEcho(t *testing.T) {
	logger, path := testTerminalLogger(t)
	logger.writeInput("l")
	logger.writeInput("l")
	logger.writeInput("\r")
	logger.writeOutput("stdout", "l\bll\r\nll is real output\r\n")
	logger.closeWithError(nil)
	got := readLogRecords(t, path)
	if len(got) != 4 || got[2].Content != "ll is real output\r\n" {
		t.Fatalf("unexpected records: %+v", got)
	}
}

func TestTerminalLoggerPreservesUnmatchedRedraw(t *testing.T) {
	logger, path := testTerminalLogger(t)
	logger.writeInput("l")
	logger.writeInput("l")
	logger.writeOutput("stdout", "l\b")
	logger.writeOutput("stdout", "server notice\r\n")
	logger.writeInput("\r")
	logger.closeWithError(nil)
	got := readLogRecords(t, path)
	if len(got) != 4 || got[1].Content != "l\bserver notice\r\n" {
		t.Fatalf("unmatched output was lost: %+v", got)
	}
}
