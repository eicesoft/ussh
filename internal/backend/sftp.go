package backend

import (
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
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

type SftpDownloadProgress struct {
	RemotePath      string `json:"remotePath"`
	DownloadedBytes int64  `json:"downloadedBytes"`
	TotalBytes      int64  `json:"totalBytes"`
}

// LocalUploadFile 是从本机原生文件选择器选中的上传源文件。
type LocalUploadFile struct {
	Path         string `json:"path"`
	Name         string `json:"name"`
	RelativePath string `json:"relativePath"`
	Size         int64  `json:"size"`
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

// SftpUpload 将本机文件直接流式上传到远端，避免 WebView 文件选择器遗漏点文件。
func (a *App) SftpUpload(tabId string, localPath string, remotePath string) error {
	src, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("打开本地文件失败：%w", err)
	}
	defer src.Close()

	client, err := a.sftpClient(tabId)
	if err != nil {
		return err
	}
	defer client.Close()

	dst, err := client.Create(remotePath)
	if err != nil {
		return fmt.Errorf("创建远程文件失败：%w", err)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return fmt.Errorf("上传文件失败：%w", err)
	}
	return nil
}

// PickUploadFiles 使用系统原生选择器选择上传源文件，并显式显示 .env 等点文件。
func (a *App) PickUploadFiles() ([]LocalUploadFile, error) {
	if a.ctx == nil {
		return nil, fmt.Errorf("Wails 上下文尚未就绪")
	}
	paths, err := pickUploadFilesPaths(a.ctx, "选择要上传的文件")
	if err != nil {
		return nil, err
	}
	files := make([]LocalUploadFile, 0, len(paths))
	for _, localPath := range paths {
		info, err := os.Stat(localPath)
		if err != nil {
			return nil, fmt.Errorf("读取本地文件信息失败：%w", err)
		}
		if !info.Mode().IsRegular() {
			continue
		}
		files = append(files, LocalUploadFile{Path: localPath, Name: info.Name(), Size: info.Size()})
	}
	return files, nil
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

// SftpDownload 把远程文件或目录递归流式拷贝到本地 localPath。
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
	total, err := sftpDownloadSize(client, remotePath)
	if err != nil {
		return 0, err
	}
	var downloaded int64
	report := func(delta int64) {
		downloaded += delta
		runtime.EventsEmit(a.ctx, "sftp-download-progress", SftpDownloadProgress{remotePath, downloaded, total})
	}
	report(0)
	return sftpDownload(client, remotePath, localPath, report)
}

func sftpDownloadSize(client *sftp.Client, remotePath string) (int64, error) {
	stat, err := client.Stat(remotePath)
	if err != nil {
		return 0, fmt.Errorf("获取远程文件信息失败：%w", err)
	}
	if !stat.IsDir() {
		return stat.Size(), nil
	}
	entries, err := client.ReadDir(remotePath)
	if err != nil {
		return 0, fmt.Errorf("读取远程目录失败：%w", err)
	}
	var total int64
	for _, entry := range entries {
		size, err := sftpDownloadSize(client, path.Join(remotePath, entry.Name()))
		if err != nil {
			return total, err
		}
		total += size
	}
	return total, nil
}

type downloadProgressWriter struct {
	writer io.Writer
	report func(int64)
}

func (w downloadProgressWriter) Write(p []byte) (int, error) {
	n, err := w.writer.Write(p)
	if n > 0 {
		w.report(int64(n))
	}
	return n, err
}

func sftpDownload(client *sftp.Client, remotePath string, localPath string, report func(int64)) (int64, error) {
	stat, err := client.Stat(remotePath)
	if err != nil {
		return 0, fmt.Errorf("获取远程文件信息失败：%w", err)
	}
	if stat.IsDir() {
		if err := os.MkdirAll(localPath, 0o755); err != nil {
			return 0, fmt.Errorf("创建本地目录失败：%w", err)
		}
		entries, err := client.ReadDir(remotePath)
		if err != nil {
			return 0, fmt.Errorf("读取远程目录失败：%w", err)
		}
		var total int64
		for _, entry := range entries {
			written, err := sftpDownload(client, path.Join(remotePath, entry.Name()), filepath.Join(localPath, entry.Name()), report)
			if err != nil {
				return total, err
			}
			total += written
		}
		return total, nil
	}

	src, err := client.Open(remotePath)
	if err != nil {
		return 0, fmt.Errorf("打开远程文件失败：%w", err)
	}
	defer src.Close()

	if err := os.MkdirAll(filepath.Dir(localPath), 0o755); err != nil {
		return 0, fmt.Errorf("创建本地目录失败：%w", err)
	}

	dst, err := os.Create(localPath)
	if err != nil {
		return 0, fmt.Errorf("创建本地文件失败：%w", err)
	}
	defer dst.Close()

	written, err := io.Copy(downloadProgressWriter{dst, report}, src)
	if err != nil {
		return written, fmt.Errorf("下载失败：%w", err)
	}
	return written, nil
}

// PickDownloadDirectory 弹出系统目录选择器，作为单个或多个下载项的本地根目录。
func (a *App) PickDownloadDirectory() (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("Wails 上下文尚未就绪")
	}
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:                "选择下载目录",
		CanCreateDirectories: true,
	})
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
