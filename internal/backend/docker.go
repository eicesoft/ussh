package backend

import (
	"bytes"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

const (
	defaultRemoteCommandTimeout = 30 * time.Second
	maxRemoteCommandTimeout     = 5 * time.Minute
	maxRemoteCommandLength      = 64 * 1024
	maxRemoteCommandOutput      = 1 * 1024 * 1024
)

// RemoteCommandResult 是在独立 SSH session 中执行命令的结果。
// Docker 插件使用它读取远程 Docker CLI 输出，避免把查询结果写入用户终端。
type RemoteCommandResult struct {
	Output     string `json:"output"`
	ExitCode   int    `json:"exitCode"`
	TimedOut   bool   `json:"timedOut"`
	DurationMs int64  `json:"durationMs"`
}

// ExecRemoteCommand 在当前连接上创建独立 SSH session 执行命令。
// 该方法面向内置工具插件使用；调用方应自行对命令参数做严格校验和 shell 转义。
func (a *App) ExecRemoteCommand(tabId string, command string, timeoutSeconds int) (RemoteCommandResult, error) {
	var result RemoteCommandResult
	tabId = strings.TrimSpace(tabId)
	command = strings.TrimSpace(command)
	if tabId == "" {
		return result, fmt.Errorf("tabId 不能为空")
	}
	if command == "" {
		return result, fmt.Errorf("远程命令不能为空")
	}
	if len(command) > maxRemoteCommandLength {
		return result, fmt.Errorf("远程命令过长")
	}
	if strings.ContainsRune(command, '\x00') {
		return result, fmt.Errorf("远程命令包含非法字符")
	}

	timeout := defaultRemoteCommandTimeout
	if timeoutSeconds > 0 {
		maxSeconds := int(maxRemoteCommandTimeout / time.Second)
		if timeoutSeconds > maxSeconds {
			timeoutSeconds = maxSeconds
		}
		timeout = time.Duration(timeoutSeconds) * time.Second
	}

	a.mu.Lock()
	conn, ok := a.connections[tabId]
	if ok {
		client := conn.client
		a.mu.Unlock()
		return a.execRemoteCommand(client, command, timeout)
	}
	a.mu.Unlock()
	return result, fmt.Errorf("未建立 SSH 连接")
}

func (a *App) execRemoteCommand(client *ssh.Client, command string, timeout time.Duration) (RemoteCommandResult, error) {
	started := time.Now()
	session, err := client.NewSession()
	if err != nil {
		return RemoteCommandResult{}, fmt.Errorf("创建远程命令会话失败：%w", err)
	}
	defer session.Close()

	var output remoteOutputBuffer
	session.Stdout = &output
	session.Stderr = &output
	if err := session.Start(command); err != nil {
		return RemoteCommandResult{}, fmt.Errorf("启动远程命令失败：%w", err)
	}

	waitCh := make(chan error, 1)
	go func() { waitCh <- session.Wait() }()

	result := func(exitCode int, timedOut bool) RemoteCommandResult {
		return RemoteCommandResult{
			Output:     limitRemoteCommandOutput(output.String()),
			ExitCode:   exitCode,
			TimedOut:   timedOut,
			DurationMs: time.Since(started).Milliseconds(),
		}
	}

	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case waitErr := <-waitCh:
		if waitErr == nil {
			return result(0, false), nil
		}
		var exitErr *ssh.ExitError
		if errors.As(waitErr, &exitErr) {
			return result(exitErr.ExitStatus(), false), nil
		}
		return result(-1, false), fmt.Errorf("远程命令执行失败：%w", waitErr)
	case <-timer.C:
		_ = session.Close()
		// 等待 Wait 收尾，避免遗留 goroutine；异常 SSH 服务端不收尾时也不再阻塞调用方。
		select {
		case <-waitCh:
		case <-time.After(time.Second):
		}
		return result(-1, true), nil
	}
}

// remoteOutputBuffer 保护超时场景下 session.Close 与输出回调之间的并发读写。
type remoteOutputBuffer struct {
	mu        sync.Mutex
	buf       bytes.Buffer
	truncated bool
}

func (b *remoteOutputBuffer) Write(data []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	remaining := maxRemoteCommandOutput - b.buf.Len()
	if remaining > 0 {
		if len(data) > remaining {
			_, _ = b.buf.Write(data[:remaining])
			b.truncated = true
		} else {
			_, _ = b.buf.Write(data)
		}
	} else if len(data) > 0 {
		b.truncated = true
	}
	return len(data), nil
}

func (b *remoteOutputBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	output := b.buf.String()
	if b.truncated {
		return output + "\n...(输出已截断)...\n"
	}
	return output
}

func limitRemoteCommandOutput(output string) string {
	if len(output) <= maxRemoteCommandOutput {
		return output
	}
	half := maxRemoteCommandOutput / 2
	return output[:half] + "\n...(输出已截断)...\n" + output[len(output)-half:]
}
