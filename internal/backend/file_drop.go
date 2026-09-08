package backend

import (
	"context"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// installFileDrop 使用 Wails 自带的原生拖放桥接。它在 macOS 上由 WailsWebView
// 子类处理，避免对 WKWebView 做不安全的方法替换。
func installFileDrop(ctx context.Context, handler func(files []LocalUploadFile)) {
	if ctx == nil || handler == nil {
		return
	}
	runtime.OnFileDrop(ctx, func(_ int, _ int, paths []string) {
		if files := localUploadFiles(paths); len(files) > 0 {
			handler(files)
		}
	})
}

func localUploadFiles(paths []string) []LocalUploadFile {
	files := make([]LocalUploadFile, 0, len(paths))
	for _, localPath := range paths {
		info, err := os.Stat(localPath)
		if err != nil {
			continue
		}
		if info.Mode().IsRegular() {
			files = append(files, LocalUploadFile{Path: localPath, Name: info.Name(), RelativePath: info.Name(), Size: info.Size()})
			continue
		}
		if !info.IsDir() {
			continue
		}
		root := filepath.Dir(localPath)
		_ = filepath.WalkDir(localPath, func(filePath string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil || entry.IsDir() || !entry.Type().IsRegular() {
				return nil
			}
			fileInfo, err := entry.Info()
			if err != nil {
				return nil
			}
			relativePath, err := filepath.Rel(root, filePath)
			if err != nil {
				return nil
			}
			files = append(files, LocalUploadFile{Path: filePath, Name: entry.Name(), RelativePath: filepath.ToSlash(relativePath), Size: fileInfo.Size()})
			return nil
		})
	}
	return files
}

// emitFilesDropped 向文件传输插件发送拖入文件列表。
func (a *App) emitFilesDropped(files []LocalUploadFile) {
	if a.ctx == nil {
		return
	}
	runtime.EventsEmit(a.ctx, "local-files-dropped", files)
}
