package main

import (
	"fmt"
	"io"
	"os"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/pkg/sftp"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// SftpEntry 文件/目录条目，传给前端。
type SftpEntry struct {
	Name    string    `json:"name"`
	Path    string    `json:"path"`
	IsDir   bool      `json:"isDir"`
	Size    int64     `json:"size"`
	ModTime time.Time `json:"modTime"`
	Mode    string    `json:"mode"`
}

// SftpFileInfo 文件内容，用于读取/下载。
type SftpFileInfo struct {
	Content  []byte `json:"content"`
	Size     int64  `json:"size"`
	Filename string `json:"filename"`
}

func (a *App) sftpClient(tabId string) (*sftp.Client, error) {
	a.mu.Lock()
	conn, ok := a.connections[tabId]
	a.mu.Unlock()
	if !ok {
		return nil, fmt.Errorf("未建立 SSH 连接")
	}
	return sftp.NewClient(conn.client)
}

func (a *App) ListSftp(tabId string, dirPath string) ([]SftpEntry, error) {
	client, err := a.sftpClient(tabId)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	if dirPath == "" {
		dirPath = "."
	}

	infos, err := client.ReadDir(dirPath)
	if err != nil {
		return nil, fmt.Errorf("读取目录失败：%w", err)
	}

	entries := make([]SftpEntry, 0, len(infos))
	for _, info := range infos {
		name := info.Name()
		entries = append(entries, SftpEntry{
			Name:    name,
			Path:    path.Join(dirPath, name),
			IsDir:   info.IsDir(),
			Size:    info.Size(),
			ModTime: info.ModTime(),
			Mode:    info.Mode().String(),
		})
	}

	sort.Slice(entries, func(i, j int) bool {
		if entries[i].IsDir != entries[j].IsDir {
			return entries[i].IsDir
		}
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})

	return entries, nil
}

func (a *App) SftpRead(tabId string, filePath string) (*SftpFileInfo, error) {
	client, err := a.sftpClient(tabId)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	f, err := client.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("打开文件失败：%w", err)
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if stat.IsDir() {
		return nil, fmt.Errorf("无法读取目录内容")
	}

	// 限制读取大小，避免大文件撑爆内存。
	const maxRead = 10 * 1024 * 1024 // 10MB
	size := stat.Size()
	if size > maxRead {
		return nil, fmt.Errorf("文件过大 (%s)，暂不支持在线预览", formatSize(size))
	}

	data, err := io.ReadAll(f)
	if err != nil {
		return nil, fmt.Errorf("读取文件失败：%w", err)
	}

	return &SftpFileInfo{
		Content:  data,
		Size:     size,
		Filename: path.Base(filePath),
	}, nil
}

func (a *App) SftpWrite(tabId string, filePath string, content []byte) error {
	client, err := a.sftpClient(tabId)
	if err != nil {
		return err
	}
	defer client.Close()

	f, err := client.Create(filePath)
	if err != nil {
		return fmt.Errorf("创建文件失败：%w", err)
	}
	defer f.Close()

	_, err = f.Write(content)
	if err != nil {
		return fmt.Errorf("写入文件失败：%w", err)
	}
	return nil
}

func (a *App) SftpMkdir(tabId string, dirPath string) error {
	client, err := a.sftpClient(tabId)
	if err != nil {
		return err
	}
	defer client.Close()

	if err := client.MkdirAll(dirPath); err != nil {
		return fmt.Errorf("创建目录失败：%w", err)
	}
	return nil
}

func (a *App) SftpRemove(tabId string, targetPath string) error {
	client, err := a.sftpClient(tabId)
	if err != nil {
		return err
	}
	defer client.Close()

	stat, err := client.Stat(targetPath)
	if err != nil {
		return fmt.Errorf("获取文件信息失败：%w", err)
	}

	if stat.IsDir() {
		return a.sftpRemoveDir(client, targetPath)
	}
	return client.Remove(targetPath)
}

func (a *App) sftpRemoveDir(client *sftp.Client, dirPath string) error {
	entries, err := client.ReadDir(dirPath)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		full := path.Join(dirPath, entry.Name())
		if entry.IsDir() {
			if err := a.sftpRemoveDir(client, full); err != nil {
				return err
			}
		} else {
			if err := client.Remove(full); err != nil {
				return err
			}
		}
	}
	return client.RemoveDirectory(dirPath)
}

func (a *App) SftpRename(tabId string, oldPath string, newPath string) error {
	client, err := a.sftpClient(tabId)
	if err != nil {
		return err
	}
	defer client.Close()

	return client.Rename(oldPath, newPath)
}

func (a *App) SftpStat(tabId string, targetPath string) (*SftpEntry, error) {
	client, err := a.sftpClient(tabId)
	if err != nil {
		return nil, err
	}
	defer client.Close()

	info, err := client.Stat(targetPath)
	if err != nil {
		return nil, fmt.Errorf("获取文件信息失败：%w", err)
	}

	return &SftpEntry{
		Name:    info.Name(),
		Path:    targetPath,
		IsDir:   info.IsDir(),
		Size:    info.Size(),
		ModTime: info.ModTime(),
		Mode:    info.Mode().String(),
	}, nil
}

// SftpDownload 把远程文件流式拷贝到本地 localPath。
// 不限制大小 —— 使用 io.Copy 流式处理，不会撑爆内存。
func (a *App) SftpDownload(tabId string, remotePath string, localPath string) (int64, error) {
	if strings.TrimSpace(localPath) == "" {
		return 0, fmt.Errorf("本地路径不能为空")
	}
	client, err := a.sftpClient(tabId)
	if err != nil {
		return 0, err
	}
	defer client.Close()

	src, err := client.Open(remotePath)
	if err != nil {
		return 0, fmt.Errorf("打开远程文件失败：%w", err)
	}
	defer src.Close()

	stat, err := src.Stat()
	if err != nil {
		return 0, err
	}
	if stat.IsDir() {
		return 0, fmt.Errorf("无法下载目录")
	}

	dst, err := os.Create(localPath)
	if err != nil {
		return 0, fmt.Errorf("创建本地文件失败：%w", err)
	}
	defer dst.Close()

	written, err := io.Copy(dst, src)
	if err != nil {
		return written, fmt.Errorf("下载失败：%w", err)
	}
	return written, nil
}

// PickSavePath 弹出系统原生保存对话框，返回用户选择的本地路径。
// 用户取消时返回空字符串，nil 错误。
func (a *App) PickSavePath(defaultName string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("Wails 上下文尚未就绪")
	}
	return runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "保存文件",
		DefaultFilename: defaultName,
	})
}

func formatSize(size int64) string {
	const unit = 1024
	if size < unit {
		return fmt.Sprintf("%d B", size)
	}
	div, exp := int64(unit), 0
	for n := size / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(size)/float64(div), "KMGTPE"[exp])
}

