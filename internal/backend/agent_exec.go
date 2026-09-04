package backend

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	// maxOutputBytes 单条命令回传给模型的输出上限，超出中间截断。
	maxOutputBytes = 32 * 1024
	// defaultCommandTimeout 单条命令默认超时。
	defaultCommandTimeout = 30 * time.Second
	// maxCommandTimeout 允许配置的最大超时。
	maxCommandTimeout = 300 * time.Second
	// settleQuiet 收到结束哨兵后再静置一小段，收尾多余的换行与提示符。
	settleQuiet = 150 * time.Millisecond
)

// ANSI 转义序列，PTY 输出里全是这些噪音。
var (
	ansiCSI     = regexp.MustCompile("\x1b\\[[0-9;?]*[a-zA-Z]")
	ansiOSC     = regexp.MustCompile("\x1b\\][^\x07\x1b]*(\x07|\x1b\\\\)")
	ansiCharset = regexp.MustCompile("\x1b[()][0-9A-Za-z]")
	ansiOther   = regexp.MustCompile("\x1b[=>78M]")
)

// CommandResult 一次命令执行的完整结果。
type CommandResult struct {
	Step       int    `json:"step"`
	Command    string `json:"command"`
	Output     string `json:"output"`
	ExitCode   int    `json:"exitCode"`
	TimedOut   bool   `json:"timedOut"`
	DurationMs int64  `json:"durationMs"`
}

// errSessionGone 终端会话已断开。
var errSessionGone = errors.New("终端会话已断开")

// errAlreadyRunning 同一终端已有命令在执行。
var errAlreadyRunning = errors.New("该终端已有命令在执行")

// runViaPTY 在已有交互式 shell 上执行命令并读回输出与退出码。
//
// 由于 PTY 没有命令边界，这里用一对哨兵包裹真实命令：先打印起始标记，
// 执行后打印带退出码的结束标记。等待方在 tap 流里寻找结束哨兵即可判定完成。
func (a *App) runViaPTY(tabId string, command string, step int, timeout time.Duration) (CommandResult, error) {
	start := time.Now()
	if !a.hasConnection(tabId) {
		return CommandResult{Step: step, Command: command, ExitCode: -1}, errSessionGone
	}
	if !a.tryAcquireRun(tabId) {
		return CommandResult{Step: step, Command: command, ExitCode: -1}, errAlreadyRunning
	}
	defer a.releaseRun(tabId)

	nonce, err := randomNonce()
	if err != nil {
		return CommandResult{Step: step, Command: command, ExitCode: -1}, err
	}
	beginMarker := "__USSH_BEGIN_" + nonce + "__"
	endMarker := "__USSH_END_" + nonce + "__"
	endPattern := regexp.MustCompile(`(?m)^\s*` + endMarker + `:(-?\d+)\s*$`)

	// 载荷：起始标记 → 用户命令 → 退出码结束标记。
	// 用 printf 而非 echo，避免不同 shell 内置 echo 对转义的处理差异。
	payload := fmt.Sprintf(
		"printf '\\n%s\\n'; %s; __USSH_R=$?; printf '\\n%s:%%s\\n' \"$__USSH_R\"",
		beginMarker, strings.TrimSpace(command), endMarker,
	)

	var (
		mu       sync.Mutex
		buffer   strings.Builder
		finished sync.Once
		done     = make(chan struct{})
		exitCode = -1
		matched  bool
	)

	remove := a.addTap(tabId, func(data []byte) {
		mu.Lock()
		buffer.Write(data)
		snapshot := buffer.String()
		already := matched
		mu.Unlock()
		if already {
			return
		}
		match := endPattern.FindStringSubmatch(snapshot)
		if match == nil {
			return
		}
		mu.Lock()
		if !matched {
			matched = true
			if parsed, err := fmt.Sscanf(match[1], "%d", &exitCode); err != nil || parsed != 1 {
				exitCode = -1
			}
			finished.Do(func() { close(done) })
		}
		mu.Unlock()
	})
	defer remove()

	// sendInputForTest 仅用于单测替换发送行为，运行时为 nil。
	if err := a.writeToTerminal(tabId, payload+"\r"); err != nil {
		return CommandResult{Step: step, Command: command, ExitCode: -1}, err
	}

	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case <-done:
		// 再多收一小段时间，把尾随的换行与新提示符一并吃掉。
		time.Sleep(settleQuiet)
	case <-timer.C:
		// 超时：发 Ctrl-C 尝试把终端交还给用户，避免命令继续占用 shell。
		_ = a.writeToTerminal(tabId, "\x03")
		time.Sleep(settleQuiet)
		mu.Lock()
		snapshot, code := buffer.String(), exitCode
		mu.Unlock()
		return CommandResult{
			Step:       step,
			Command:    command,
			Output:     extractOutput(snapshot, beginMarker, endPattern),
			ExitCode:   code,
			TimedOut:   true,
			DurationMs: time.Since(start).Milliseconds(),
		}, nil
	}

	mu.Lock()
	snapshot := buffer.String()
	mu.Unlock()

	return CommandResult{
		Step:       step,
		Command:    command,
		Output:     extractOutput(snapshot, beginMarker, endPattern),
		ExitCode:   exitCode,
		DurationMs: time.Since(start).Milliseconds(),
	}, nil
}

// extractOutput 从 PTY 原始流里截出真实输出。
// echo 开启时我们自己敲的载荷会先回显一遍，因此取最后一个起始标记作为边界。
func extractOutput(raw string, beginMarker string, endPattern *regexp.Regexp) string {
	cleaned := stripANSI(raw)

	start := strings.LastIndex(cleaned, beginMarker)
	if start < 0 {
		// 没等到起始标记，说明输出不完整，能拿到多少给多少。
		return limitOutput(strings.TrimSpace(cleaned))
	}
	rest := cleaned[start+len(beginMarker):]

	if endMatch := endPattern.FindStringIndex(rest); endMatch != nil {
		rest = rest[:endMatch[0]]
	}
	return limitOutput(strings.TrimSpace(rest))
}

func stripANSI(input string) string {
	output := ansiOSC.ReplaceAllString(input, "")
	output = ansiCSI.ReplaceAllString(output, "")
	output = ansiCharset.ReplaceAllString(output, "")
	output = ansiOther.ReplaceAllString(output, "")
	// 归一化换行，并丢掉孤立的回车（PTY 里大量用于行内覆盖）。
	output = strings.ReplaceAll(output, "\r\n", "\n")
	output = strings.ReplaceAll(output, "\r", "\n")
	return output
}

func limitOutput(output string) string {
	if len(output) <= maxOutputBytes {
		return output
	}
	half := maxOutputBytes / 2
	return output[:half] + "\n...(已截断)...\n" + output[len(output)-half:]
}

func randomNonce() (string, error) {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", fmt.Errorf("生成随机标记失败：%w", err)
	}
	return hex.EncodeToString(buf[:]), nil
}

func (a *App) hasConnection(tabId string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	_, ok := a.connections[tabId]
	return ok
}

// tryAcquireRun 串行化同一终端上的智能体命令，避免两条命令在同一 shell 里串扰。
func (a *App) tryAcquireRun(tabId string) bool {
	a.agentMu.Lock()
	defer a.agentMu.Unlock()
	if a.agentRuns == nil {
		a.agentRuns = map[string]bool{}
	}
	if a.agentRuns[tabId] {
		return false
	}
	a.agentRuns[tabId] = true
	return true
}

func (a *App) releaseRun(tabId string) {
	a.agentMu.Lock()
	delete(a.agentRuns, tabId)
	a.agentMu.Unlock()
}
