package main

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/zalando/go-keyring"
	_ "modernc.org/sqlite"
)

type SavedNode struct {
	ID       int64  `json:"id"`
	ParentID int64  `json:"parentId"`
	Type     string `json:"type"`
	Name     string `json:"name"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	AuthType string `json:"authType"`
}

// CredentialView 仅暴露"是否已保存"的标记，不返回明文。
// 前端拿到这个视图后仅能展示"已保存密码"等 UI 状态。
type CredentialView struct {
	HasPassword   bool `json:"hasPassword"`
	HasPrivateKey bool `json:"hasPrivateKey"`
	HasPassphrase bool `json:"hasPassphrase"`
	HasKeyFile    bool `json:"hasKeyFile"`
}

// SavedCredential 是写入 keyring 的明文结构，仅在内存中存在；
// 任何时候都不应被序列化或落盘。
type SavedCredential struct {
	Password   string `json:"password"`
	PrivateKey string `json:"privateKey"`
	Passphrase string `json:"passphrase"`
	KeyFile    string `json:"keyFile"`
}

const (
	AuthPassword = "password"
	AuthKey      = "key"
	AuthKeyFile  = "keyfile"

	keyringService = "uSSH"
)

// ErrCredentialUnavailable 标识 keyring 不可用的错误。
var ErrCredentialUnavailable = errors.New("系统密钥环不可用，凭证将无法持久化")

func credentialAccount(nodeID int64) string { return fmt.Sprintf("node-%d", nodeID) }

func openStore() (*sql.DB, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("无法定位本地配置目录：%w", err)
	}
	dir := filepath.Join(configDir, "uSSH")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("无法创建本地数据目录：%w", err)
	}
	db, err := sql.Open("sqlite", filepath.Join(dir, "connections.db"))
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS connection_nodes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		parent_id INTEGER NOT NULL DEFAULT 0,
		type TEXT NOT NULL CHECK(type IN ('folder', 'ssh')),
		name TEXT NOT NULL,
		host TEXT NOT NULL DEFAULT '',
		port INTEGER NOT NULL DEFAULT 22,
		username TEXT NOT NULL DEFAULT '',
		auth_type TEXT NOT NULL DEFAULT 'password',
		created_at INTEGER NOT NULL
	)`); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("无法初始化连接库：%w", err)
	}
	if err := ensureColumn(db, "connection_nodes", "auth_type", "TEXT NOT NULL DEFAULT 'password'"); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

// ensureColumn 在表上检测列是否存在，缺失则 ALTER TABLE ADD。
func ensureColumn(db *sql.DB, table, column, definition string) error {
	rows, err := db.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return err
		}
		if name == column {
			return nil
		}
	}
	_, err = db.Exec(`ALTER TABLE ` + table + ` ADD COLUMN ` + column + ` ` + definition)
	return err
}

// setKeyring 在 keyring 不可用时返回友好错误，不静默吞掉。
func setKeyring(account, value string) error {
	err := keyring.Set(keyringService, account, value)
	if err == nil {
		return nil
	}
	if errors.Is(err, keyring.ErrUnsupportedPlatform) {
		return ErrCredentialUnavailable
	}
	return err
}

func getKeyring(account string) (string, error) {
	v, err := keyring.Get(keyringService, account)
	if err == nil {
		return v, nil
	}
	if errors.Is(err, keyring.ErrNotFound) {
		return "", nil
	}
	if errors.Is(err, keyring.ErrUnsupportedPlatform) {
		return "", ErrCredentialUnavailable
	}
	return "", err
}

func deleteKeyring(account string) error {
	err := keyring.Delete(keyringService, account)
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return err
	}
	return nil
}

func (a *App) ListConnectionNodes() ([]SavedNode, error) {
	if a.db == nil {
		return nil, fmt.Errorf("本地连接库尚未就绪")
	}
	rows, err := a.db.Query(`SELECT id, parent_id, type, name, host, port, username, auth_type FROM connection_nodes ORDER BY type DESC, name COLLATE NOCASE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	nodes := []SavedNode{}
	for rows.Next() {
		var node SavedNode
		if err := rows.Scan(&node.ID, &node.ParentID, &node.Type, &node.Name, &node.Host, &node.Port, &node.Username, &node.AuthType); err != nil {
			return nil, err
		}
		nodes = append(nodes, node)
	}
	return nodes, rows.Err()
}

func (a *App) CreateFolder(parentID int64, name string) (SavedNode, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return SavedNode{}, fmt.Errorf("请输入文件夹名称")
	}
	return a.createNode(SavedNode{ParentID: parentID, Type: "folder", Name: name, Port: 22, AuthType: AuthPassword})
}

// CreateSSHLink 仅保存元数据。凭证（密码/私钥/私钥密码/私钥文件）走 SetCredential 写入 keyring。
func (a *App) CreateSSHLink(parentID int64, node SavedNode) (SavedNode, error) {
	node.ParentID, node.Type = parentID, "ssh"
	node.Name = strings.TrimSpace(node.Name)
	node.Host = strings.TrimSpace(node.Host)
	node.Username = strings.TrimSpace(node.Username)
	if node.Name == "" || node.Host == "" || node.Username == "" {
		return SavedNode{}, fmt.Errorf("请填写名称、主机地址和用户名")
	}
	if node.Port == 0 {
		node.Port = 22
	}
	if node.AuthType == "" {
		node.AuthType = AuthPassword
	}
	switch node.AuthType {
	case AuthPassword, AuthKey, AuthKeyFile:
	default:
		return SavedNode{}, fmt.Errorf("不支持的认证方式：%s", node.AuthType)
	}
	return a.createNode(node)
}

// UpdateSSHLink 更新元数据。
func (a *App) UpdateSSHLink(id int64, parentID int64, node SavedNode) (SavedNode, error) {
	if a.db == nil {
		return SavedNode{}, fmt.Errorf("本地连接库尚未就绪")
	}
	var existingType string
	if err := a.db.QueryRow(`SELECT type FROM connection_nodes WHERE id = ?`, id).Scan(&existingType); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return SavedNode{}, fmt.Errorf("节点不存在")
		}
		return SavedNode{}, err
	}
	if existingType != "ssh" {
		return SavedNode{}, fmt.Errorf("只能编辑 SSH 节点")
	}
	node.Name = strings.TrimSpace(node.Name)
	node.Host = strings.TrimSpace(node.Host)
	node.Username = strings.TrimSpace(node.Username)
	if node.Name == "" || node.Host == "" || node.Username == "" {
		return SavedNode{}, fmt.Errorf("请填写名称、主机地址和用户名")
	}
	if node.Port == 0 {
		node.Port = 22
	}
	if node.AuthType == "" {
		node.AuthType = AuthPassword
	}
	switch node.AuthType {
	case AuthPassword, AuthKey, AuthKeyFile:
	default:
		return SavedNode{}, fmt.Errorf("不支持的认证方式：%s", node.AuthType)
	}
	res, err := a.db.Exec(`UPDATE connection_nodes SET parent_id = ?, name = ?, host = ?, port = ?, username = ?, auth_type = ? WHERE id = ?`,
		parentID, node.Name, node.Host, node.Port, node.Username, node.AuthType, id)
	if err != nil {
		return SavedNode{}, err
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		return SavedNode{}, fmt.Errorf("节点不存在")
	}
	return SavedNode{
		ID: id, ParentID: parentID, Type: "ssh",
		Name: node.Name, Host: node.Host, Port: node.Port,
		Username: node.Username, AuthType: node.AuthType,
	}, nil
}

// DeleteSSHLink 删除节点并清理对应 keyring 条目。
func (a *App) DeleteSSHLink(id int64) error {
	if a.db == nil {
		return fmt.Errorf("本地连接库尚未就绪")
	}
	res, err := a.db.Exec(`DELETE FROM connection_nodes WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if affected, _ := res.RowsAffected(); affected == 0 {
		return fmt.Errorf("节点不存在")
	}
	if err := a.clearAllCredentialSlots(id); err != nil {
		return fmt.Errorf("清理凭证失败：%w", err)
	}
	return nil
}

func (a *App) clearAllCredentialSlots(id int64) error {
	base := credentialAccount(id)
	for _, slot := range []string{"password", "privateKey", "passphrase", "keyFile"} {
		if err := deleteKeyring(base + ":" + slot); err != nil {
			return err
		}
	}
	return nil
}

// GetCredential 返回"是否已保存"视图，不返回明文。
func (a *App) GetCredential(nodeID int64) (CredentialView, error) {
	view := CredentialView{}
	base := credentialAccount(nodeID)
	if v, err := getKeyring(base + ":password"); err != nil {
		return view, err
	} else if v != "" {
		view.HasPassword = true
	}
	if v, err := getKeyring(base + ":privateKey"); err != nil {
		return view, err
	} else if v != "" {
		view.HasPrivateKey = true
	}
	if v, err := getKeyring(base + ":passphrase"); err != nil {
		return view, err
	} else if v != "" {
		view.HasPassphrase = true
	}
	if v, err := getKeyring(base + ":keyFile"); err != nil {
		return view, err
	} else if v != "" {
		view.HasKeyFile = true
	}
	return view, nil
}

// SetCredential 把整张凭证写入 keyring。
// 每个字段独立槽位；空字符串表示"删除该槽位"。
func (a *App) SetCredential(nodeID int64, cred SavedCredential) error {
	base := credentialAccount(nodeID)
	if err := a.writeSlot(base+":password", cred.Password); err != nil {
		return err
	}
	if err := a.writeSlot(base+":privateKey", cred.PrivateKey); err != nil {
		return err
	}
	if err := a.writeSlot(base+":passphrase", cred.Passphrase); err != nil {
		return err
	}
	if err := a.writeSlot(base+":keyFile", cred.KeyFile); err != nil {
		return err
	}
	return nil
}

func (a *App) writeSlot(account, value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return deleteKeyring(account)
	}
	return setKeyring(account, value)
}

// ClearCredential 清理某节点的所有 keyring 条目。
func (a *App) ClearCredential(nodeID int64) error {
	return a.clearAllCredentialSlots(nodeID)
}

// MoveNode 把 id 节点移到 parentID 之下；不允许把节点移入自身或后代中以避免循环。
func (a *App) MoveNode(id int64, parentID int64) (SavedNode, error) {
	if a.db == nil {
		return SavedNode{}, fmt.Errorf("本地连接库尚未就绪")
	}
	if id == parentID {
		return SavedNode{}, fmt.Errorf("不能将节点移入自身")
	}
	if parentID != 0 && a.isDescendant(parentID, id) {
		return SavedNode{}, fmt.Errorf("不能将节点移入其后代文件夹")
	}
	res, err := a.db.Exec(`UPDATE connection_nodes SET parent_id = ? WHERE id = ?`, parentID, id)
	if err != nil {
		return SavedNode{}, err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return SavedNode{}, fmt.Errorf("节点不存在")
	}
	var node SavedNode
	if err := a.db.QueryRow(`SELECT id, parent_id, type, name, host, port, username, auth_type FROM connection_nodes WHERE id = ?`, id).
		Scan(&node.ID, &node.ParentID, &node.Type, &node.Name, &node.Host, &node.Port, &node.Username, &node.AuthType); err != nil {
		return SavedNode{}, err
	}
	return node, nil
}

// isDescendant 判断 candidate 是否为 ancestor 的后代（包含自身）。
func (a *App) isDescendant(candidate int64, ancestor int64) bool {
	current := candidate
	for current != 0 {
		if current == ancestor {
			return true
		}
		var parent int64
		if err := a.db.QueryRow(`SELECT parent_id FROM connection_nodes WHERE id = ?`, current).Scan(&parent); err != nil {
			return false
		}
		if parent == current {
			return false
		}
		current = parent
	}
	return false
}

func (a *App) createNode(node SavedNode) (SavedNode, error) {
	if a.db == nil {
		return SavedNode{}, fmt.Errorf("本地连接库尚未就绪")
	}
	if node.AuthType == "" {
		node.AuthType = AuthPassword
	}
	result, err := a.db.Exec(`INSERT INTO connection_nodes(parent_id, type, name, host, port, username, auth_type, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
		node.ParentID, node.Type, node.Name, node.Host, node.Port, node.Username, node.AuthType, time.Now().Unix())
	if err != nil {
		return SavedNode{}, err
	}
	node.ID, err = result.LastInsertId()
	return node, err
}