package backend

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/creack/pty"
)

// localSession 是一次本地 PTY 会话：用户本机的交互式 shell，输出走与 SSH
// 完全相同的 terminal-output / terminal-status 事件，前端无需区分。
type localSession struct {
	cmd    *exec.Cmd
	pty    *os.File
	logger *terminalLogger
}

// StartLocalTerminal 在本机启动一个交互式 shell 并绑定到 tabId。
// Shell 选择用户默认 SHELL，退化到 zsh / bash / sh；工作目录为用户主目录。
func (a *App) StartLocalTerminal(tabId string, size TerminalSize) (string, error) {
	if strings.TrimSpace(tabId) == "" {
		return "", fmt.Errorf("tabId 不能为空")
	}
	if runtime.GOOS == "windows" {
		return "", fmt.Errorf("当前平台暂不支持本地终端")
	}
	a.mu.Lock()
	_, sshExists := a.connections[tabId]
	a.mu.Unlock()
	if sshExists {
		return "", fmt.Errorf("该标签已有活动连接")
	}
	a.localMu.Lock()
	_, localExists := a.localTerms[tabId]
	a.localMu.Unlock()
	if localExists {
		return "", fmt.Errorf("该标签已有活动连接")
	}
	shell, err := resolveLocalShell()
	if err != nil {
		return "", err
	}
	if size.Columns < 1 {
		size.Columns = 100
	}
	if size.Rows < 1 {
		size.Rows = 28
	}

	cmd := exec.Command(shell)
	// GUI 启动的应用环境常缺少 UTF-8 locale，shell 与命令行工具的
	// 中文/符号输出会乱码；未配置时补一个安全默认值。
	env := os.Environ()
	if !hasUTF8Locale() {
		env = append(env, "LANG=en_US.UTF-8", "LC_CTYPE=en_US.UTF-8")
	}
	cmd.Env = append(env, "TERM=xterm-256color")
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		cmd.Dir = home
	}
	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Rows: uint16(size.Rows), Cols: uint16(size.Columns)})
	if err != nil {
		return "", fmt.Errorf("无法启动本地终端：%w", err)
	}
	logger, logErr := a.newTerminalLogger(tabId, ConnectionConfig{Host: "local", Username: os.Getenv("USER")})
	if logErr != nil {
		fmt.Printf("无法创建终端日志：%v\n", logErr)
	}
	sess := &localSession{cmd: cmd, pty: ptmx, logger: logger}
	a.localMu.Lock()
	if _, exists := a.localTerms[tabId]; exists {
		a.localMu.Unlock()
		_ = ptmx.Close()
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		if logger != nil {
			_ = logger.closeWithError(nil)
		}
		return "", fmt.Errorf("该标签已有活动连接")
	}
	a.localTerms[tabId] = sess
	a.localMu.Unlock()

	go a.pumpLocalOutput(tabId, sess)
	go a.watchLocalSession(tabId, sess)
	return "已启动本地终端", nil
}

// hasUTF8Locale 报告当前环境是否已配置 UTF-8 locale（LANG 或 LC_ALL）。
func hasUTF8Locale() bool {
	for _, key := range []string{"LC_ALL", "LANG"} {
		value := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
		if strings.Contains(value, "utf-8") || strings.Contains(value, "utf8") {
			return true
		}
	}
	return false
}

// resolveLocalShell 按 SHELL 环境变量优先，其次常见系统 shell，返回第一个可用路径。
func resolveLocalShell() (string, error) {
	candidates := []string{strings.TrimSpace(os.Getenv("SHELL")), "/bin/zsh", "/bin/bash", "/bin/sh"}
	for _, candidate := range candidates {
		if candidate == "" {
			continue
		}
		if path, err := exec.LookPath(candidate); err == nil {
			return path, nil
		}
	}
	return "", fmt.Errorf("未找到可用的本地 shell")
}

// pumpLocalOutput 把 PTY 输出转发给前端，顺序与 SSH 的 terminalEventWriter 一致：
// 先记日志，再推事件，最后走 tap（智能体旁路）。
func (a *App) pumpLocalOutput(tabId string, sess *localSession) {
	buf := make([]byte, 8192)
	for {
		n, err := sess.pty.Read(buf)
		if n > 0 {
			data := string(buf[:n])
			if sess.logger != nil {
				if logErr := sess.logger.writeOutput("stdout", data); logErr != nil {
					fmt.Printf("写入终端日志失败：%v\n", logErr)
				}
			}
			a.emitEvent("terminal-output", map[string]any{"tabId": tabId, "data": data})
			a.dispatchTap(tabId, buf[:n])
		}
		if err != nil {
			return
		}
	}
}

// watchLocalSession 等待本地 shell 退出，收尾日志并通知前端，会话清理幂等。
func (a *App) watchLocalSession(tabId string, sess *localSession) {
	err := sess.cmd.Wait()
	a.localMu.Lock()
	if current, ok := a.localTerms[tabId]; ok && current == sess {
		delete(a.localTerms, tabId)
	}
	a.localMu.Unlock()
	if sess.logger != nil {
		_ = sess.logger.closeWithError(err)
	}
	if err != nil {
		a.emitEvent("terminal-status", map[string]any{"tabId": tabId, "message": fmt.Sprintf("本地终端已结束：%v", err)})
	} else {
		a.emitEvent("terminal-status", map[string]any{"tabId": tabId, "message": "本地终端已结束"})
	}
}

// sendLocalInput 向本地 PTY 写入用户输入；无本地会话时返回通用错误。
func (a *App) sendLocalInput(tabId string, input string) error {
	a.localMu.Lock()
	sess, ok := a.localTerms[tabId]
	a.localMu.Unlock()
	if !ok {
		return fmt.Errorf("未建立连接")
	}
	// 先记录输入，再写入 PTY。PTY 开启 ECHO 时，shell 回显可能在 Write
	// 返回前就到达；若顺序相反，回显会被日志排到输入块之前。
	if sess.logger != nil {
		if logErr := sess.logger.writeInput(input); logErr != nil {
			fmt.Printf("写入终端日志失败：%v\n", logErr)
		}
	}
	_, err := sess.pty.Write([]byte(input))
	return err
}

// resizeLocalTerminal 调整本地 PTY 尺寸；无本地会话时按 SSH 的静默语义返回 nil。
func (a *App) resizeLocalTerminal(tabId string, size TerminalSize) error {
	a.localMu.Lock()
	sess, ok := a.localTerms[tabId]
	a.localMu.Unlock()
	if !ok || size.Columns < 1 || size.Rows < 1 {
		return nil
	}
	return pty.Setsize(sess.pty, &pty.Winsize{Rows: uint16(size.Rows), Cols: uint16(size.Columns)})
}

// disconnectLocal 关闭本地会话并从映射移除；日志收尾与状态事件由 watch 负责。
func (a *App) disconnectLocal(tabId string) bool {
	a.localMu.Lock()
	sess, ok := a.localTerms[tabId]
	if ok {
		delete(a.localTerms, tabId)
	}
	a.localMu.Unlock()
	if !ok {
		return false
	}
	_ = sess.pty.Close()
	if sess.cmd.Process != nil {
		_ = sess.cmd.Process.Kill()
	}
	return true
}

// localSystemInfo 在本地 shell 中执行与 SSH 相同的探测命令，解析逻辑复用。
func (a *App) localSystemInfo(tabId string) (SystemInfo, error) {
	a.localMu.Lock()
	_, ok := a.localTerms[tabId]
	a.localMu.Unlock()
	if !ok {
		return SystemInfo{}, fmt.Errorf("未建立 SSH 连接")
	}
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, "sh", "-c", systemInfoCommand).CombinedOutput()
	if err != nil {
		return SystemInfo{}, fmt.Errorf("读取本地系统信息失败：%w", err)
	}
	return parseSystemInfo(SystemInfo{Host: "localhost", Username: os.Getenv("USER")}, string(output))
}

// hasLocalSession 报告指定标签是否有存活的本地会话。
func (a *App) hasLocalSession(tabId string) bool {
	a.localMu.Lock()
	defer a.localMu.Unlock()
	_, ok := a.localTerms[tabId]
	return ok
}
