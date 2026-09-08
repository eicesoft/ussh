package backend

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/google/uuid"
)

// terminalLogRecord 是 JSONL 中的一个独立内容块，保留终端原始内容（包括 ANSI 控制序列）。
type terminalLogRecord struct {
	Type      string    `json:"type"`
	SessionID string    `json:"session_id"`
	TabID     string    `json:"tab_id"`
	Server    string    `json:"server"`
	Host      string    `json:"host"`
	Port      int       `json:"port"`
	Username  string    `json:"username"`
	StartedAt time.Time `json:"started_at"`
	Timestamp time.Time `json:"timestamp"`
	Sequence  uint64    `json:"sequence,omitempty"`
	CommandID uint64    `json:"command_id,omitempty"`
	Stream    string    `json:"stream,omitempty"`
	Content   string    `json:"content,omitempty"`
	Error     string    `json:"error,omitempty"`
}

type terminalLogger struct {
	mu                                sync.Mutex
	file                              *os.File
	writer                            *bufio.Writer
	sessionID, server, host, username string
	tabID                             string
	port                              int
	startedAt                         time.Time
	sequence, commandID               uint64
	inputBuffer                       string
	echoBuffer                        string
	redrawCandidates                  []string
	redrawEchoBytes                   int
	redrawPending                     string
	outputBuffer                      string
	outputStream                      string
	outputFlushTimer                  *time.Timer
	closed                            bool
}

const (
	maxTerminalLogViewBytes     = 4 * 1024 * 1024
	maxTerminalOutputBlockBytes = 64 * 1024
	terminalOutputFlushDelay    = 200 * time.Millisecond
	// terminalLogLocalID 是所有本地终端共享的日志目录连接 ID，
	// 让本地会话日志积累在同一个目录下，日志列表可看到历史记录。
	terminalLogLocalID = "local"
)

// TerminalLogFile 是日志列表中供界面选择的安全文件描述。
type TerminalLogFile struct {
	Name       string    `json:"name"`
	Size       int64     `json:"size"`
	ModifiedAt time.Time `json:"modifiedAt"`
}

// TerminalLogContent 是一个日志文件的只读内容。超过视图上限时只返回开头部分。
type TerminalLogContent struct {
	Name      string `json:"name"`
	Content   string `json:"content"`
	Truncated bool   `json:"truncated"`
}

func safeLogName(value string) string {
	value = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || strings.ContainsRune(`/\:*?"<>|`, r) {
			return '_'
		}
		return r
	}, strings.TrimSpace(value))
	value = strings.Trim(value, ". _-")
	if value == "" {
		return "unknown"
	}
	return value
}

// Saved connections share a directory across tabs and sessions.
// Unsaved connections have no persistent ID, so retain their tab directory.
func terminalLogConnectionID(tabID string, config ConnectionConfig) string {
	if config.SavedNodeID > 0 {
		return strconv.FormatInt(config.SavedNodeID, 10)
	}
	return tabID
}

func terminalLogPath(connectionID, sessionID string, startedAt time.Time) (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("无法定位终端日志目录：%w", err)
	}
	return terminalLogPathIn(filepath.Join(configDir, "uSSH", "terminal-logs"), connectionID, sessionID, startedAt)
}

func terminalLogPathIn(root, connectionID, sessionID string, startedAt time.Time) (string, error) {
	dir := terminalLogDir(root, connectionID)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("无法创建终端日志目录：%w", err)
	}
	name := fmt.Sprintf("%s-%s.jsonl", startedAt.Local().Format("20060102-150405"), safeLogName(sessionID))
	return filepath.Join(dir, name), nil
}

func terminalLogDir(root, connectionID string) string {
	return filepath.Join(root, safeLogName(connectionID))
}

func validTerminalLogFileName(name string) bool {
	return name == filepath.Base(name) && name == safeLogName(name) && strings.HasSuffix(name, ".jsonl")
}

func (a *App) ListTerminalLogs(connectionID string) ([]TerminalLogFile, error) {
	settings, err := a.GetTerminalLogSettings()
	if err != nil {
		return nil, err
	}
	return listTerminalLogsIn(settings.SavePath, connectionID)
}

func listTerminalLogsIn(root, connectionID string) ([]TerminalLogFile, error) {
	entries, err := os.ReadDir(terminalLogDir(root, connectionID))
	if errors.Is(err, os.ErrNotExist) {
		return []TerminalLogFile{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("无法读取终端日志目录：%w", err)
	}
	logs := make([]TerminalLogFile, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !validTerminalLogFileName(entry.Name()) {
			continue
		}
		info, err := entry.Info()
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		logs = append(logs, TerminalLogFile{Name: entry.Name(), Size: info.Size(), ModifiedAt: info.ModTime()})
	}
	sort.Slice(logs, func(i, j int) bool { return logs[i].ModifiedAt.After(logs[j].ModifiedAt) })
	return logs, nil
}

func (a *App) ReadTerminalLog(connectionID, name string) (TerminalLogContent, error) {
	settings, err := a.GetTerminalLogSettings()
	if err != nil {
		return TerminalLogContent{}, err
	}
	return readTerminalLogIn(settings.SavePath, connectionID, name)
}

func (a *App) DeleteTerminalLog(connectionID, name string) error {
	if a.isActiveLogFile(name) {
		return nil
	}
	settings, err := a.GetTerminalLogSettings()
	if err != nil {
		return err
	}
	if !validTerminalLogFileName(name) {
		return fmt.Errorf("无效的终端日志文件名")
	}
	if err := os.Remove(filepath.Join(terminalLogDir(settings.SavePath, connectionID), name)); err != nil {
		return fmt.Errorf("无法删除终端日志：%w", err)
	}
	return nil
}

// isActiveLogFile 检查指定文件名是否属于当前正在记录的活跃会话（SSH 或本地），
// 避免误删正在写入的日志。
func (a *App) isActiveLogFile(name string) bool {
	a.mu.Lock()
	for _, conn := range a.connections {
		if conn.logger == nil || conn.logger.file == nil {
			continue
		}
		if filepath.Base(conn.logger.file.Name()) == name {
			a.mu.Unlock()
			return true
		}
	}
	a.mu.Unlock()
	a.localMu.Lock()
	defer a.localMu.Unlock()
	for _, sess := range a.localTerms {
		if sess.logger == nil || sess.logger.file == nil {
			continue
		}
		if filepath.Base(sess.logger.file.Name()) == name {
			return true
		}
	}
	return false
}

func readTerminalLogIn(root, connectionID, name string) (TerminalLogContent, error) {
	if !validTerminalLogFileName(name) {
		return TerminalLogContent{}, fmt.Errorf("无效的终端日志文件名")
	}
	path := filepath.Join(terminalLogDir(root, connectionID), name)
	file, err := os.Open(path)
	if err != nil {
		return TerminalLogContent{}, fmt.Errorf("无法打开终端日志：%w", err)
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxTerminalLogViewBytes+1))
	if err != nil {
		return TerminalLogContent{}, fmt.Errorf("无法读取终端日志：%w", err)
	}
	truncated := len(data) > maxTerminalLogViewBytes
	if truncated {
		data = data[:maxTerminalLogViewBytes]
	}
	return TerminalLogContent{Name: name, Content: string(data), Truncated: truncated}, nil
}

func (a *App) newTerminalLogger(tabID string, config ConnectionConfig) (*terminalLogger, error) {
	return a.newTerminalLoggerFor(tabID, terminalLogConnectionID(tabID, config), config)
}

func (a *App) newTerminalLoggerFor(tabID, connectionID string, config ConnectionConfig) (*terminalLogger, error) {
	settings, err := a.GetTerminalLogSettings()
	if err != nil {
		return nil, err
	}
	if !settings.Enabled {
		return nil, nil
	}
	id, err := uuid.NewRandom()
	if err != nil {
		return nil, err
	}
	startedAt := time.Now().UTC()
	sessionID := id.String()
	path, err := terminalLogPathIn(settings.SavePath, connectionID, sessionID, startedAt)
	if err != nil {
		return nil, err
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return nil, fmt.Errorf("无法创建终端日志文件：%w", err)
	}
	logger := &terminalLogger{file: file, writer: bufio.NewWriter(file), sessionID: sessionID, tabID: tabID,
		server: strings.TrimSpace(config.Host), host: strings.TrimSpace(config.Host), port: config.Port,
		username: config.Username, startedAt: startedAt}
	if err := logger.writeLocked(terminalLogRecord{Type: "session_start"}); err != nil {
		_ = file.Close()
		return nil, err
	}
	return logger, nil
}

func (l *terminalLogger) writeLocked(record terminalLogRecord) error {
	if l.closed {
		return nil
	}
	record.SessionID, record.Server, record.Host = l.sessionID, l.server, l.host
	record.TabID = l.tabID
	record.Port, record.Username, record.StartedAt = l.port, l.username, l.startedAt
	record.Timestamp = time.Now().UTC()
	if record.Type != "session_start" && record.Type != "session_end" {
		l.sequence++
		record.Sequence, record.CommandID = l.sequence, l.commandID
	}
	if err := json.NewEncoder(l.writer).Encode(record); err != nil {
		return err
	}
	return l.writer.Flush()
}

func (l *terminalLogger) writeInput(content string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.redrawPending != "" {
		// An incomplete repaint is not proven echo. Preserve it at the next
		// input boundary rather than silently discarding terminal bytes.
		if err := l.flushOutputLocked(); err != nil {
			return err
		}
		if err := l.writeLocked(terminalLogRecord{Type: "output", Stream: "stdout", Content: l.redrawPending}); err != nil {
			return err
		}
		l.redrawPending = ""
		l.redrawCandidates = nil
	}
	// Shell line editors can move back and repaint the entire input rather
	// than echo only the newly typed character. Only recognize exact repaints
	// of printable ASCII input; leave other terminal traffic untouched.
	if content != "" && plainTerminalInput(l.inputBuffer+content) && plainTerminalInput(l.echoBuffer) && len(l.inputBuffer)+len(content) <= 256 {
		// Pending keystrokes may arrive together before any remote echo. Match
		// their echoed prefix plus the repaint, including a batched input call.
		prefix := l.echoBuffer
		line := l.inputBuffer
		l.redrawCandidates = nil
		l.redrawEchoBytes = len(l.echoBuffer) + len(content)
		for _, key := range content {
			n := len(line)
			line += string(key)
			if n > 0 {
				suffix := content[len(line)-len(l.inputBuffer):]
				l.redrawCandidates = append(l.redrawCandidates,
					prefix+strings.Repeat("\b", n)+line+suffix,
					prefix+fmt.Sprintf("\x1b[%dD%s", n, line)+suffix)
				if n == 1 {
					l.redrawCandidates = append(l.redrawCandidates, prefix+"\x1b[D"+line+suffix)
				}
			}
			prefix += string(key)
		}
	}
	l.inputBuffer += content
	l.echoBuffer += terminalEchoForInput(content)
	for {
		line, remaining, complete := nextTerminalInputLine(l.inputBuffer)
		if !complete {
			return nil
		}
		if err := l.flushOutputLocked(); err != nil {
			return err
		}
		l.inputBuffer = remaining
		content := normalizeTerminalInputLine(line)
		// Pressing Enter on an empty prompt is not a command and should not
		// create noisy blank input blocks in the log.
		if strings.Trim(content, "\r\n") == "" {
			continue
		}
		l.commandID++
		if err := l.writeLocked(terminalLogRecord{Type: "input", Stream: "stdin", Content: content}); err != nil {
			return err
		}
	}
}

// normalizeTerminalInputLine keeps only the final command text after common
// line-editor operations. Input is emitted only once Enter arrives, so the
// log never contains the intermediate text typed before editing.
func normalizeTerminalInputLine(line string) string {
	line = strings.ReplaceAll(line, "\r\n", "\n")
	line = strings.ReplaceAll(line, "\n", "\r\n")
	if len(line) == 0 {
		return line
	}
	var out []rune
	for _, r := range line {
		switch r {
		case '\b', '\x7f':
			if len(out) > 0 {
				out = out[:len(out)-1]
			}
		case '\x15': // Ctrl-U: clear the current line.
			out = out[:0]
		case '\x17': // Ctrl-W: erase the previous word.
			for len(out) > 0 && out[len(out)-1] == ' ' {
				out = out[:len(out)-1]
			}
			for len(out) > 0 && out[len(out)-1] != ' ' {
				out = out[:len(out)-1]
			}
		default:
			out = append(out, r)
		}
	}
	return string(out)
}

func (l *terminalLogger) writeOutput(stream, content string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if stream == "stdout" {
		content = l.consumeEchoLocked(content)
	}
	if content == "" {
		return nil
	}
	if l.outputBuffer != "" && l.outputStream != stream {
		if err := l.flushOutputLocked(); err != nil {
			return err
		}
	}
	l.outputStream = stream
	l.outputBuffer += content
	if len(l.outputBuffer) >= maxTerminalOutputBlockBytes {
		return l.flushOutputLocked()
	}
	l.scheduleOutputFlushLocked()
	return nil
}

// terminalEchoForInput returns the bytes a normal line-buffered PTY echoes for
// input. Keeping this separate from inputBuffer lets us collect keystrokes into
// one input record while removing their echo from stdout/stderr records.
func terminalEchoForInput(content string) string {
	content = strings.ReplaceAll(content, "\r\n", "\n")
	content = strings.ReplaceAll(content, "\r", "\n")
	return strings.ReplaceAll(content, "\n", "\r\n")
}

func plainTerminalInput(content string) bool {
	for _, r := range content {
		if r < 32 || r > 126 {
			return false
		}
	}
	return true
}

func (l *terminalLogger) consumeEchoLocked(content string) string {
	if len(l.redrawCandidates) > 0 {
		content = l.redrawPending + content
		l.redrawPending = ""
		for _, candidate := range l.redrawCandidates {
			if strings.HasPrefix(candidate, content) && len(content) < len(candidate) {
				l.redrawPending = content
				return ""
			}
			if strings.HasPrefix(content, candidate) {
				l.redrawCandidates = nil
				l.echoBuffer = l.echoBuffer[l.redrawEchoBytes:]
				return l.consumeEchoLocked(content[len(candidate):])
			}
		}
		l.redrawCandidates = nil
	}
	for l.echoBuffer != "" && content != "" {
		expected := l.echoBuffer
		if strings.HasPrefix(expected, content) {
			l.echoBuffer = expected[len(content):]
			return ""
		}
		if strings.HasPrefix(content, expected) {
			content = content[len(expected):]
			l.echoBuffer = ""
			continue
		}
		// 控制键、终端重绘或服务端主动输出可能不会按预期回显；
		// 不要让过期的待匹配内容影响后续真实输出。
		l.echoBuffer = ""
		break
	}
	return content
}

func (l *terminalLogger) scheduleOutputFlushLocked() {
	if l.outputFlushTimer != nil {
		l.outputFlushTimer.Stop()
	}
	l.outputFlushTimer = time.AfterFunc(terminalOutputFlushDelay, func() {
		l.mu.Lock()
		defer l.mu.Unlock()
		l.outputFlushTimer = nil
		if err := l.flushOutputLocked(); err != nil {
			fmt.Printf("写入终端日志失败：%v\n", err)
		}
	})
}

func nextTerminalInputLine(input string) (line, remaining string, complete bool) {
	index := strings.IndexAny(input, "\r\n")
	if index < 0 {
		return "", input, false
	}
	end := index + 1
	if input[index] == '\r' && len(input) > end && input[end] == '\n' {
		end++
	}
	return input[:end], input[end:], true
}

func (l *terminalLogger) flushOutputLocked() error {
	if l.outputFlushTimer != nil {
		l.outputFlushTimer.Stop()
		l.outputFlushTimer = nil
	}
	if l.outputBuffer == "" {
		return nil
	}
	err := l.writeLocked(terminalLogRecord{Type: "output", Stream: l.outputStream, Content: l.outputBuffer})
	l.outputBuffer = ""
	l.outputStream = ""
	return err
}

func (l *terminalLogger) closeWithError(sessionErr error) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.closed {
		return nil
	}
	if err := l.flushOutputLocked(); err != nil {
		return err
	}
	record := terminalLogRecord{Type: "session_end"}
	if l.redrawPending != "" {
		if err := l.writeLocked(terminalLogRecord{Type: "output", Stream: "stdout", Content: l.redrawPending}); err != nil {
			return err
		}
		l.redrawPending = ""
	}
	if sessionErr != nil {
		record.Error = sessionErr.Error()
	}
	_ = l.writeLocked(record)
	l.closed = true
	return l.file.Close()
}
