package main

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"
)

type ConnectionConfig struct {
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	PrivateKey string `json:"privateKey"`
	Passphrase string `json:"passphrase"`
	KeyFile    string `json:"keyFile"`
	// AuthType 决定如何组装 ssh.AuthMethod：
	//   "password" 用 Password；"key" 用 PrivateKey+Passphrase；"keyfile" 读 KeyFile 内容+Passphrase。
	AuthType string `json:"authType"`
	// SavedNodeID > 0 时，从 keyring 加载凭证覆盖上面字段。
	SavedNodeID int64 `json:"savedNodeId"`
}

type TerminalSize struct {
	Columns int `json:"columns"`
	Rows    int `json:"rows"`
}

// ToolCall 描述模型发起的一次工具调用。增量拼接时 Arguments 逐步追加。
type ToolCall struct {
	Index    int    `json:"index,omitempty"`
	ID       string `json:"id,omitempty"`
	Type     string `json:"type,omitempty"`
	Function struct {
		Name      string `json:"name,omitempty"`
		Arguments string `json:"arguments,omitempty"`
	} `json:"function,omitempty"`
}

type AIChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	// 以下字段供智能体的 function calling 模式使用，普通聊天不带。
	ToolCallID string     `json:"tool_call_id,omitempty"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	Name       string     `json:"name,omitempty"`
}

type sshConnection struct {
	client  *ssh.Client
	session *ssh.Session
	input   io.WriteCloser
}

// App owns the active SSH terminal sessions, keyed by tabId.
type App struct {
	ctx         context.Context
	mu          sync.Mutex
	connections map[string]*sshConnection
	db          *sql.DB
	aiMu        sync.Mutex
	aiRequests  map[string]context.CancelFunc
	// taps 让 Go 侧也能收到终端输出（智能体靠它读回命令结果）。
	// 回调必须非阻塞，否则会拖死 SSH 读循环。
	tapMu   sync.Mutex
	taps    map[string][]tapEntry
	tapSeq  int64
	// agentRuns 保证同一终端同一时刻只有一条智能体命令在跑。
	agentMu   sync.Mutex
	agentRuns map[string]bool
	// agentApprovals 保存等待用户授权的通道，key 为 requestID。
	agentApprovals map[string]chan string
	// sendInputForTest 仅由单测替换，用于在不建立真实 SSH 连接的前提下驱动智能体。
	sendInputForTest func(tabId string, data string) error
	// emitForTest 仅由单测替换，用于捕获事件；运行时为 nil，走真实 runtime.EventsEmit。
	emitForTest func(event string, payload map[string]any)
}

func (a *App) emitEvent(event string, payload map[string]any) {
	if a.emitForTest != nil {
		a.emitForTest(event, payload)
		return
	}
	runtime.EventsEmit(a.ctx, event, payload)
}

// writeToTerminal 向终端写入数据，单测可借 sendInputForTest 接管。
func (a *App) writeToTerminal(tabId string, data string) error {
	if a.sendInputForTest != nil {
		return a.sendInputForTest(tabId, data)
	}
	return a.SendInput(tabId, data)
}

func NewApp() *App {
	return &App{
		connections:    map[string]*sshConnection{},
		aiRequests:     map[string]context.CancelFunc{},
		taps:           map[string][]tapEntry{},
		agentRuns:      map[string]bool{},
		agentApprovals: map[string]chan string{},
	}
}
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// macOS 上背景材质由窗口内注入的 NSVisualEffectView 实现，窗口就绪后应用。
	applyWindowMaterial(loadBackdropType())
	if db, err := openStore(); err == nil {
		a.db = db
	} else {
		fmt.Printf("无法打开本地连接库：%v\n", err)
	}
}
func (a *App) shutdown(ctx context.Context) {
	a.aiMu.Lock()
	for requestID, cancel := range a.aiRequests {
		cancel()
		delete(a.aiRequests, requestID)
	}
	a.aiMu.Unlock()

	a.mu.Lock()
	conns := make([]*sshConnection, 0, len(a.connections))
	for _, c := range a.connections {
		conns = append(conns, c)
	}
	a.connections = map[string]*sshConnection{}
	a.mu.Unlock()
	for _, c := range conns {
		_ = c.session.Close()
		_ = c.client.Close()
	}
	if a.db != nil {
		_ = a.db.Close()
	}
}

// Connect opens an interactive SSH shell under the given tabId.
func (a *App) Connect(tabId string, config ConnectionConfig, size TerminalSize) (string, error) {
	if strings.TrimSpace(tabId) == "" {
		return "", fmt.Errorf("tabId 不能为空")
	}
	a.mu.Lock()
	if _, exists := a.connections[tabId]; exists {
		a.mu.Unlock()
		return "", fmt.Errorf("该标签已有活动连接")
	}
	a.mu.Unlock()

	if strings.TrimSpace(config.Host) == "" || strings.TrimSpace(config.Username) == "" {
		return "", fmt.Errorf("请填写主机地址和用户名")
	}
	if config.Port == 0 {
		config.Port = 22
	}
	if size.Columns < 1 {
		size.Columns = 100
	}
	if size.Rows < 1 {
		size.Rows = 28
	}

	// 若指定了 SavedNodeID，从 keyring 加载凭证并合并到 config。
	if config.SavedNodeID > 0 {
		authType := config.AuthType
		if authType == "" {
			authType = AuthPassword
		}
		cred, err := a.loadCredential(config.SavedNodeID, authType)
		if err != nil {
			return "", err
		}
		if cred.Password != nil && *cred.Password != "" {
			config.Password = *cred.Password
		}
		if cred.PrivateKey != nil && *cred.PrivateKey != "" {
			config.PrivateKey = *cred.PrivateKey
		}
		if cred.Passphrase != nil && *cred.Passphrase != "" {
			config.Passphrase = *cred.Passphrase
		}
		if cred.KeyFile != nil && *cred.KeyFile != "" {
			config.KeyFile = *cred.KeyFile
		}
		config.AuthType = authType
	}
	if config.AuthType == "" {
		config.AuthType = AuthPassword
	}

	auth, err := a.authMethod(config)
	if err != nil {
		return "", err
	}
	sshConfig := &ssh.ClientConfig{
		User:            config.Username,
		Auth:            []ssh.AuthMethod{auth},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         12 * time.Second,
	}
	address := net.JoinHostPort(strings.TrimSpace(config.Host), strconv.Itoa(config.Port))
	client, err := ssh.Dial("tcp", address, sshConfig)
	if err != nil {
		return "", fmt.Errorf("无法连接到 %s：%w", address, err)
	}
	session, err := client.NewSession()
	if err != nil {
		client.Close()
		return "", err
	}
	input, err := session.StdinPipe()
	if err != nil {
		session.Close()
		client.Close()
		return "", err
	}
	session.Stdout = terminalEventWriter{app: a, tabId: tabId}
	session.Stderr = terminalEventWriter{app: a, tabId: tabId}
	modes := ssh.TerminalModes{ssh.ECHO: 1, ssh.TTY_OP_ISPEED: 14400, ssh.TTY_OP_OSPEED: 14400}
	if err := session.RequestPty("xterm-256color", size.Rows, size.Columns, modes); err != nil {
		session.Close()
		client.Close()
		return "", fmt.Errorf("无法请求终端：%w", err)
	}
	if err := session.Shell(); err != nil {
		session.Close()
		client.Close()
		return "", fmt.Errorf("无法启动远程终端：%w", err)
	}

	conn := &sshConnection{client: client, session: session, input: input}
	a.mu.Lock()
	a.connections[tabId] = conn
	a.mu.Unlock()
	go a.watchSession(tabId, session)
	return fmt.Sprintf("已连接到 %s", address), nil
}

// loadCredential 按 authType 加载 keyring 中的对应字段（仅返回当前认证需要的字段）。
func (a *App) loadCredential(nodeID int64, authType string) (SavedCredential, error) {
	base := credentialAccount(nodeID)
	cred := SavedCredential{}
	switch authType {
	case AuthPassword:
		pwd, err := getKeyring(base + ":password")
		if err != nil {
			return cred, err
		}
		cred.Password = &pwd
	case AuthKey:
		key, err := getKeyring(base + ":privateKey")
		if err != nil {
			return cred, err
		}
		phrase, err := getKeyring(base + ":passphrase")
		if err != nil {
			return cred, err
		}
		cred.PrivateKey = &key
		cred.Passphrase = &phrase
	case AuthKeyFile:
		path, err := getKeyring(base + ":keyFile")
		if err != nil {
			return cred, err
		}
		phrase, err := getKeyring(base + ":passphrase")
		if err != nil {
			return cred, err
		}
		cred.KeyFile = &path
		cred.Passphrase = &phrase
	default:
		return cred, fmt.Errorf("不支持的认证方式：%s", authType)
	}
	return cred, nil
}

func (a *App) authMethod(config ConnectionConfig) (ssh.AuthMethod, error) {
	switch config.AuthType {
	case AuthKey:
		key, err := a.resolvePrivateKey(config.PrivateKey, config.KeyFile, config.Passphrase)
		if err != nil {
			return nil, err
		}
		return ssh.PublicKeys(key), nil
	case AuthKeyFile:
		if strings.TrimSpace(config.KeyFile) == "" {
			return nil, fmt.Errorf("未指定私钥文件路径")
		}
		key, err := a.resolvePrivateKey("", config.KeyFile, config.Passphrase)
		if err != nil {
			return nil, err
		}
		return ssh.PublicKeys(key), nil
	case AuthPassword, "":
		if config.Password == "" {
			return nil, fmt.Errorf("请输入密码，或选择私钥认证")
		}
		return ssh.Password(config.Password), nil
	default:
		return nil, fmt.Errorf("不支持的认证方式：%s", config.AuthType)
	}
}

// resolvePrivateKey 在 inline 私钥和文件路径之间二选一。
// inline 非空时优先使用 inline；否则读取文件路径内容。
func (a *App) resolvePrivateKey(inline, filePath, passphrase string) (ssh.Signer, error) {
	material := strings.TrimSpace(inline)
	if material == "" {
		if strings.TrimSpace(filePath) == "" {
			return nil, fmt.Errorf("未提供私钥内容或文件路径")
		}
		data, err := os.ReadFile(filePath)
		if err != nil {
			return nil, fmt.Errorf("无法读取私钥文件：%w", err)
		}
		material = string(data)
	}
	if passphrase != "" {
		return ssh.ParsePrivateKeyWithPassphrase([]byte(material), []byte(passphrase))
	}
	return ssh.ParsePrivateKey([]byte(material))
}

// PickPrivateKeyFile 弹出系统原生文件选择对话框。
// SSH 私钥常使用 id_rsa、id_ed25519 等无扩展名文件；macOS 的扩展名筛选会将它们置灰，
// 因此这里不设置文件筛选，并显示隐藏的 .ssh 目录。
func (a *App) PickPrivateKeyFile() (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("Wails 上下文尚未就绪")
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:           "选择 SSH 私钥文件",
		ShowHiddenFiles: true,
	})
	if err != nil {
		return "", err
	}
	return path, nil
}

func (a *App) watchSession(tabId string, session *ssh.Session) {
	err := session.Wait()
	a.mu.Lock()
	if a.connections[tabId] != nil && a.connections[tabId].session == session {
		delete(a.connections, tabId)
	}
	a.mu.Unlock()
	if err != nil {
		runtime.EventsEmit(a.ctx, "terminal-status", map[string]string{"tabId": tabId, "message": fmt.Sprintf("会话已结束：%v", err)})
	} else {
		runtime.EventsEmit(a.ctx, "terminal-status", map[string]string{"tabId": tabId, "message": "会话已结束"})
	}
}

func (a *App) SendInput(tabId string, input string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	conn, ok := a.connections[tabId]
	if !ok {
		return fmt.Errorf("未建立 SSH 连接")
	}
	_, err := conn.input.Write([]byte(input))
	return err
}

func (a *App) ResizeTerminal(tabId string, size TerminalSize) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	conn, ok := a.connections[tabId]
	if !ok || size.Columns < 1 || size.Rows < 1 {
		return nil
	}
	return conn.session.WindowChange(size.Rows, size.Columns)
}

func (a *App) Disconnect(tabId string) error {
	a.mu.Lock()
	conn, ok := a.connections[tabId]
	if ok {
		delete(a.connections, tabId)
	}
	a.mu.Unlock()
	if !ok {
		return nil
	}
	_ = conn.session.Close()
	return conn.client.Close()
}

type terminalEventWriter struct {
	app   *App
	tabId string
}

func (w terminalEventWriter) Write(data []byte) (int, error) {
	runtime.EventsEmit(w.app.ctx, "terminal-output", map[string]any{"tabId": w.tabId, "data": string(data)})
	w.app.dispatchTap(w.tabId, data)
	return len(data), nil
}

// tapEntry 带自增 token，让注销时能定位到自己（Go 的函数值不可比较）。
type tapEntry struct {
	token int64
	fn    func([]byte)
}

// addTap 注册一个终端输出旁路，返回移除函数（可重复调用）。
func (a *App) addTap(tabId string, fn func([]byte)) func() {
	a.tapMu.Lock()
	if a.taps == nil {
		a.taps = map[string][]tapEntry{}
	}
	a.tapSeq++
	token := a.tapSeq
	a.taps[tabId] = append(a.taps[tabId], tapEntry{token: token, fn: fn})
	a.tapMu.Unlock()

	var once sync.Once
	return func() {
		once.Do(func() {
			a.tapMu.Lock()
			remaining := a.taps[tabId][:0]
			for _, item := range a.taps[tabId] {
				if item.token != token {
					remaining = append(remaining, item)
				}
			}
			if len(remaining) == 0 {
				delete(a.taps, tabId)
			} else {
				a.taps[tabId] = remaining
			}
			a.tapMu.Unlock()
		})
	}
}

// dispatchTap 把终端输出转发给所有旁路消费者。
// 这里复制一份切片后在锁外调用，避免回调里再触碰 taps 造成死锁。
func (a *App) dispatchTap(tabId string, data []byte) {
	a.tapMu.Lock()
	list := make([]func([]byte), 0, len(a.taps[tabId]))
	for _, entry := range a.taps[tabId] {
		list = append(list, entry.fn)
	}
	a.tapMu.Unlock()
	for _, fn := range list {
		fn(data)
	}
}

// FetchModels 从 OpenAI 兼容的 /models 端点获取模型列表。
func (a *App) FetchModels(baseURL, apiKey string) ([]string, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return nil, fmt.Errorf("Base URL 不能为空")
	}
	req, err := http.NewRequestWithContext(a.ctx, http.MethodGet, baseURL+"/models", nil)
	if err != nil {
		return nil, fmt.Errorf("构造请求失败：%w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求模型列表失败：%w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("服务器返回状态码 %d", resp.StatusCode)
	}
	var body struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("解析模型列表失败：%w", err)
	}
	models := make([]string, 0, len(body.Data))
	for _, m := range body.Data {
		if m.ID != "" {
			models = append(models, m.ID)
		}
	}
	if len(models) == 0 {
		return nil, fmt.Errorf("未获取到任何模型")
	}
	return models, nil
}

// StartAIChat 在 Go 端代理 OpenAI 兼容的流式聊天请求，避免 WebView 的 CORS 限制。
// token、done、error 通过 Wails 事件回传给前端；requestID 用于区分并取消请求。
func (a *App) StartAIChat(requestID, baseURL, apiKey, model string, messages []AIChatMessage) error {
	requestID = strings.TrimSpace(requestID)
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	model = strings.TrimSpace(model)
	if requestID == "" {
		return fmt.Errorf("requestID 不能为空")
	}
	if baseURL == "" {
		return fmt.Errorf("Base URL 不能为空")
	}
	if model == "" {
		return fmt.Errorf("模型不能为空")
	}
	if len(messages) == 0 {
		return fmt.Errorf("聊天内容不能为空")
	}

	requestContext := a.ctx
	if requestContext == nil {
		requestContext = context.Background()
	}
	requestContext, cancel := context.WithCancel(requestContext)
	a.aiMu.Lock()
	if a.aiRequests == nil {
		a.aiRequests = map[string]context.CancelFunc{}
	}
	if previous, exists := a.aiRequests[requestID]; exists {
		previous()
	}
	a.aiRequests[requestID] = cancel
	a.aiMu.Unlock()

	go func() {
		defer func() {
			a.aiMu.Lock()
			delete(a.aiRequests, requestID)
			a.aiMu.Unlock()
		}()

		err := streamAIChat(requestContext, baseURL, apiKey, model, messages, func(token string) {
			runtime.EventsEmit(a.ctx, "ai-chat-token", map[string]string{
				"requestId": requestID,
				"token":     token,
			})
		})
		if err != nil {
			if errors.Is(err, context.Canceled) {
				runtime.EventsEmit(a.ctx, "ai-chat-done", map[string]any{
					"requestId": requestID,
					"stopped":   true,
				})
				return
			}
			runtime.EventsEmit(a.ctx, "ai-chat-error", map[string]string{
				"requestId": requestID,
				"error":     err.Error(),
			})
			return
		}
		runtime.EventsEmit(a.ctx, "ai-chat-done", map[string]string{"requestId": requestID})
	}()
	return nil
}

// StopAIChat 取消指定的 AI 聊天请求。
func (a *App) StopAIChat(requestID string) error {
	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return nil
	}
	a.aiMu.Lock()
	cancel := a.aiRequests[requestID]
	a.aiMu.Unlock()
	if cancel != nil {
		cancel()
	}
	return nil
}

func streamAIChat(ctx context.Context, baseURL, apiKey, model string, messages []AIChatMessage, onToken func(string)) error {
	payload, err := json.Marshal(struct {
		Model    string          `json:"model"`
		Messages []AIChatMessage `json:"messages"`
		Stream   bool            `json:"stream"`
	}{Model: model, Messages: messages, Stream: true})
	if err != nil {
		return fmt.Errorf("构造 AI 请求失败：%w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("构造 AI 请求失败：%w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(apiKey) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	}

	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("请求 AI 服务失败：%w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 32*1024))
		var detail struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
			Message string `json:"message"`
		}
		_ = json.Unmarshal(body, &detail)
		message := detail.Error.Message
		if message == "" {
			message = detail.Message
		}
		if message == "" {
			message = strings.TrimSpace(string(body))
		}
		if message == "" {
			message = fmt.Sprintf("服务器返回状态码 %d", resp.StatusCode)
		}
		return fmt.Errorf("AI 服务请求失败：%s", message)
	}

	if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return fmt.Errorf("读取 AI 响应失败：%w", err)
		}
		var completion struct {
			Choices []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			} `json:"choices"`
		}
		if err := json.Unmarshal(body, &completion); err != nil {
			return fmt.Errorf("解析 AI 响应失败：%w", err)
		}
		if len(completion.Choices) > 0 && completion.Choices[0].Message.Content != "" {
			onToken(completion.Choices[0].Message.Content)
		}
		return nil
	}

	return scanSSEStream(resp.Body, func(chunk sseChunk) {
		if chunk.Content != "" {
			onToken(chunk.Content)
		}
	})
}

// sseChunk 覆盖 /chat/completions 流式响应里我们关心的字段。
// content 供普通聊天使用，tool_calls 与 finish_reason 供智能体的 function calling 模式使用。
type sseChunk struct {
	Content      string     // delta.content 或 message.content，已按优先级合并
	ToolCalls    []ToolCall // delta.tool_calls 或 message.tool_calls
	FinishReason string
}

// scanSSEStream 逐行解析 SSE，把每个 data 块交给 onChunk。
// 普通聊天与智能体共用这一份解析，避免两条路径的解析逻辑漂移。
func scanSSEStream(body io.Reader, onChunk func(sseChunk)) error {
	type choice struct {
		Delta struct {
			Content   string     `json:"content"`
			ToolCalls []ToolCall `json:"tool_calls"`
		} `json:"delta"`
		Message struct {
			Content   string     `json:"content"`
			ToolCalls []ToolCall `json:"tool_calls"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	}

	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 4096), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" || data == "[DONE]" {
			continue
		}
		// payload 必须每轮新建：复用同一结构体时 json.Unmarshal 不会清空
		// 切片字段，tool_calls 会被反复追加。
		var payload struct {
			Choices []choice `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &payload); err != nil {
			continue
		}
		if len(payload.Choices) == 0 {
			continue
		}
		choice := payload.Choices[0]
		chunk := sseChunk{
			Content:      choice.Delta.Content,
			ToolCalls:    choice.Delta.ToolCalls,
			FinishReason: choice.FinishReason,
		}
		if chunk.Content == "" {
			chunk.Content = choice.Message.Content
		}
		if len(chunk.ToolCalls) == 0 {
			chunk.ToolCalls = choice.Message.ToolCalls
		}
		onChunk(chunk)
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("读取 AI 流式响应失败：%w", err)
	}
	return nil
}
