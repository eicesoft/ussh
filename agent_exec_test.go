package main

import (
	"strings"
	"testing"
	"time"
)

// fakeSender 让测试能在不建立真实 SSH 连接的情况下驱动 runViaPTY。
type fakeSender struct {
	app      *App
	tabId    string
	sent     []string
	sendErr  error
	onSend   func(data string)
	hasConn  bool
	response func(command string) string
}

func (f *fakeSender) install() {
	f.app.mu.Lock()
	f.app.connections[f.tabId] = &sshConnection{}
	f.app.mu.Unlock()
}

func (f *fakeSender) uninstall() {
	f.app.mu.Lock()
	delete(f.app.connections, f.tabId)
	f.app.mu.Unlock()
}

// sendInput 替代 App.SendInput：记录输入，并按需回放命令输出。
func (f *fakeSender) sendInput(tabId string, data string) error {
	f.sent = append(f.sent, data)
	if f.sendErr != nil {
		return f.sendErr
	}
	if f.onSend != nil {
		go f.onSend(data)
	}
	return nil
}

// TestRunViaPTYExtractsOutput 验证 echo、ANSI、提示符都被正确剥离，且退出码被解析。
func TestRunViaPTYExtractsOutput(t *testing.T) {
	app := NewApp()
	sender := &fakeSender{app: app, tabId: "tab-test"}
	sender.install()
	defer sender.uninstall()

	var payload string
	sender.onSend = func(data string) {
		payload = data
		marker := extractMarker(data)
		begin := strings.Replace(marker, "__USSH_END_", "__USSH_BEGIN_", 1)
		// 模拟真实 PTY 的三段式输出：
		// 1) shell 回显我们敲入的整行（BEGIN 标记在这里第一次出现）
		// 2) printf 真正执行，打出 BEGIN 标记 + 命令输出
		// 3) 结束哨兵带退出码 + 新提示符
		echo := "\x1b[32m" + strings.ReplaceAll(data, "\r", "\r\n") + "\x1b[0m\r\n"
		run := "\r\n" + begin + "\r\nFilesystem Size Used Avail Use%\r\n/dev/sda1 100G 60G 40G 60%\r\n"
		tail := "\r\n" + marker + ":0\r\nuser@host:~$\x1b[K "
		app.dispatchTap(sender.tabId, []byte(echo+run+tail))
	}

	result, err := runWithSender(app, sender, "df -h", 1, 5*time.Second)
	if err != nil {
		t.Fatalf("runViaPTY 出错：%v", err)
	}
	if !strings.Contains(payload, "df -h") {
		t.Errorf("发送内容未包含原命令：%q", payload)
	}
	if result.ExitCode != 0 {
		t.Errorf("ExitCode = %d, want 0", result.ExitCode)
	}
	if result.TimedOut {
		t.Error("不应超时")
	}
	if result.Output != "Filesystem Size Used Avail Use%\n/dev/sda1 100G 60G 40G 60%" {
		t.Errorf("Output = %q，回显或 ANSI 未清洗干净", result.Output)
	}
	if result.Step != 1 {
		t.Errorf("Step = %d, want 1", result.Step)
	}
}

// TestRunViaPTYCapturesExitCode 验证非 0 退出码能被正确读回。
func TestRunViaPTYCapturesExitCode(t *testing.T) {
	for _, code := range []int{1, 2, 127} {
		app := NewApp()
		sender := &fakeSender{app: app, tabId: "tab-exit"}
		sender.install()

		sender.onSend = func(data string) {
			marker := extractMarker(data)
			app.dispatchTap(sender.tabId, []byte("ls: cannot access '/nope': No such file or directory\r\n\r\n"+marker+":"+itoa(code)+"\r\n$ "))
		}

		result, err := runWithSender(app, sender, "ls /nope", 2, 5*time.Second)
		sender.uninstall()
		if err != nil {
			t.Fatalf("code=%d runViaPTY 出错：%v", code, err)
		}
		if result.ExitCode != code {
			t.Errorf("ExitCode = %d, want %d", result.ExitCode, code)
		}
		if !strings.Contains(result.Output, "No such file") {
			t.Errorf("Output = %q，应包含错误信息", result.Output)
		}
	}
}

// TestRunViaPTYTimeout 验证超时后返回部分输出并标记 TimedOut，不视为致命错误。
func TestRunViaPTYTimeout(t *testing.T) {
	app := NewApp()
	sender := &fakeSender{app: app, tabId: "tab-timeout"}
	sender.install()
	defer sender.uninstall()

	sender.onSend = func(data string) {
		app.dispatchTap(sender.tabId, []byte("partial output before hang\r\n"))
		// 故意不回哨兵，模拟挂起。
	}

	result, err := runWithSender(app, sender, "sleep 100", 1, 300*time.Millisecond)
	if err != nil {
		t.Fatalf("超时不应返回错误：%v", err)
	}
	if !result.TimedOut {
		t.Error("TimedOut 应为 true")
	}
	if !strings.Contains(result.Output, "partial output") {
		t.Errorf("Output = %q，应保留超时前已收到的部分输出", result.Output)
	}
	// 超时必须发 Ctrl-C 把终端交还给用户。
	if len(sender.sent) < 2 || sender.sent[len(sender.sent)-1] != "\x03" {
		t.Errorf("超时后未发送 Ctrl-C，sent = %q", sender.sent)
	}
}

// TestRunViaPTYRejectsConcurrent 验证同一终端不会并发跑两条命令。
func TestRunViaPTYRejectsConcurrent(t *testing.T) {
	app := NewApp()
	sender := &fakeSender{app: app, tabId: "tab-concurrent"}
	sender.install()
	defer sender.uninstall()

	app.agentRuns["tab-concurrent"] = true
	_, err := runWithSender(app, sender, "ls", 1, time.Second)
	if err == nil {
		t.Fatal("并发执行应被拒绝")
	}
	delete(app.agentRuns, "tab-concurrent")

	// 释放后应恢复正常。
	sender.onSend = func(data string) {
		marker := extractMarker(data)
		app.dispatchTap(sender.tabId, []byte("\r\n"+marker+":0\r\n"))
	}
	if _, err := runWithSender(app, sender, "ls", 1, 3*time.Second); err != nil {
		t.Fatalf("释放后应可执行：%v", err)
	}
}

// TestRunViaPTYNoConnection 验证会话不存在时快速失败。
func TestRunViaPTYNoConnection(t *testing.T) {
	app := NewApp()
	sender := &fakeSender{app: app, tabId: "tab-missing"}
	_, err := runWithSender(app, sender, "ls", 1, time.Second)
	if err == nil {
		t.Fatal("无连接时应返回错误")
	}
}

// TestStripANSI 验证各类转义序列都被剥离。
func TestStripANSI(t *testing.T) {
	cases := map[string]string{
		"\x1b[32mgreen\x1b[0m":                  "green",
		"\x1b[1;31mbold red\x1b[0m":             "bold red",
		"a\r\nb":                                "a\nb",
		"line1\rline2":                          "line1\nline2",
		"\x1b]0;title\x07prompt":                "prompt",
		"\x1b(Bplain":                           "plain",
		"\x1b[2J\x1b[Hclean":                    "clean",
		"\x1b[K\x1b[?25ltext":                   "text",
	}
	for input, want := range cases {
		if got := stripANSI(input); got != want {
			t.Errorf("stripANSI(%q) = %q, want %q", input, got, want)
		}
	}
}

// TestLimitOutput 验证超长输出被中间截断。
func TestLimitOutput(t *testing.T) {
	long := strings.Repeat("x", maxOutputBytes*2)
	result := limitOutput(long)
	if len(result) >= len(long) {
		t.Error("超长输出应被截断")
	}
	if !strings.Contains(result, "已截断") {
		t.Error("截断应带标记")
	}
	if got := limitOutput("short"); got != "short" {
		t.Errorf("短输出不应被改动，got %q", got)
	}
}

// runWithSender 用假的 SendInput 驱动一次 runViaPTY。
// 通过替换 connections 里的 input 无法绕过真实写入，这里改由测试直接注入 tap 数据，
// 因此用一层包装：临时把 App 的发送行为替换为 sender.sendInput。
func runWithSender(app *App, sender *fakeSender, command string, step int, timeout time.Duration) (CommandResult, error) {
	original := app.sendInputForTest
	app.sendInputForTest = sender.sendInput
	defer func() { app.sendInputForTest = original }()
	return app.runViaPTY(sender.tabId, command, step, timeout)
}

// extractMarker 从载荷里取出结束哨兵名，供测试回放输出。
func extractMarker(payload string) string {
	const key = "__USSH_END_"
	index := strings.Index(payload, key)
	if index < 0 {
		return ""
	}
	rest := payload[index+len(key):]
	if end := strings.Index(rest, "__"); end >= 0 {
		return key + rest[:end] + "__"
	}
	return ""
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	negative := value < 0
	if negative {
		value = -value
	}
	var digits []byte
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	if negative {
		return "-" + string(digits)
	}
	return string(digits)
}
