package main

import (
	"context"
	"fmt"
	"io"
	"net"
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

// App owns the active SSH terminal session.
type App struct {
	ctx        context.Context
	mu         sync.Mutex
	connection *sshConnection
}

func NewApp() *App                          { return &App{} }
func (a *App) startup(ctx context.Context)  { a.ctx = ctx }
func (a *App) shutdown(ctx context.Context) { a.Disconnect() }

// Connect opens an interactive SSH shell. Authentication supports passwords and PEM private keys.
func (a *App) Connect(config ConnectionConfig, size TerminalSize) (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.connection != nil {
		return "", fmt.Errorf("已有活动连接，请先断开")
	}
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
	auth, err := authMethod(config)
	if err != nil {
		return "", err
	}
	sshConfig := &ssh.ClientConfig{User: config.Username, Auth: []ssh.AuthMethod{auth}, HostKeyCallback: ssh.InsecureIgnoreHostKey(), Timeout: 12 * time.Second}
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
	session.Stdout, session.Stderr = terminalEventWriter{app: a}, terminalEventWriter{app: a}
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
	a.connection = &sshConnection{client: client, session: session, input: input}
	go a.watchSession(session)
	return fmt.Sprintf("已连接到 %s", address), nil
}

func authMethod(config ConnectionConfig) (ssh.AuthMethod, error) {
	if strings.TrimSpace(config.PrivateKey) != "" {
		var signer ssh.Signer
		var err error
		if config.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(config.PrivateKey), []byte(config.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey([]byte(config.PrivateKey))
		}
		if err != nil {
			return nil, fmt.Errorf("私钥无效：%w", err)
		}
		return ssh.PublicKeys(signer), nil
	}
	if config.Password == "" {
		return nil, fmt.Errorf("请输入密码，或粘贴私钥")
	}
	return ssh.Password(config.Password), nil
}
func (a *App) watchSession(session *ssh.Session) {
	err := session.Wait()
	a.mu.Lock()
	if a.connection != nil && a.connection.session == session {
		a.connection = nil
	}
	a.mu.Unlock()
	if err != nil {
		runtime.EventsEmit(a.ctx, "terminal-status", fmt.Sprintf("会话已结束：%v", err))
	} else {
		runtime.EventsEmit(a.ctx, "terminal-status", "会话已结束")
	}
}
func (a *App) SendInput(input string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.connection == nil {
		return fmt.Errorf("未建立 SSH 连接")
	}
	_, err := a.connection.input.Write([]byte(input))
	return err
}
func (a *App) ResizeTerminal(size TerminalSize) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.connection == nil || size.Columns < 1 || size.Rows < 1 {
		return nil
	}
	return a.connection.session.WindowChange(size.Rows, size.Columns)
}
func (a *App) Disconnect() error {
	a.mu.Lock()
	connection := a.connection
	a.connection = nil
	a.mu.Unlock()
	if connection == nil {
		return nil
	}
	connection.session.Close()
	return connection.client.Close()
}

type terminalEventWriter struct{ app *App }

func (w terminalEventWriter) Write(data []byte) (int, error) {
	runtime.EventsEmit(w.app.ctx, "terminal-output", string(data))
	return len(data), nil
}
