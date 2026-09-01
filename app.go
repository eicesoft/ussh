package main

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"net"
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
}

func NewApp() *App { return &App{connections: map[string]*sshConnection{}} }
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if db, err := openStore(); err == nil {
		a.db = db
	} else {
		fmt.Printf("无法打开本地连接库：%v\n", err)
	}
}
func (a *App) shutdown(ctx context.Context) {
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
		if cred.Password != "" {
			config.Password = cred.Password
		}
		if cred.PrivateKey != "" {
			config.PrivateKey = cred.PrivateKey
		}
		if cred.Passphrase != "" {
			config.Passphrase = cred.Passphrase
		}
		if cred.KeyFile != "" {
			config.KeyFile = cred.KeyFile
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
		cred.Password = pwd
	case AuthKey:
		key, err := getKeyring(base + ":privateKey")
		if err != nil {
			return cred, err
		}
		phrase, err := getKeyring(base + ":passphrase")
		if err != nil {
			return cred, err
		}
		cred.PrivateKey = key
		cred.Passphrase = phrase
	case AuthKeyFile:
		path, err := getKeyring(base + ":keyFile")
		if err != nil {
			return cred, err
		}
		phrase, err := getKeyring(base + ":passphrase")
		if err != nil {
			return cred, err
		}
		cred.KeyFile = path
		cred.Passphrase = phrase
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
	return len(data), nil
}
