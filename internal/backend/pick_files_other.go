//go:build !darwin

package backend

import (
	"context"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// pickUploadFilesPaths 在 Windows/Linux 上直接使用 Wails 原生对话框，
// 这两个平台 ShowHiddenFiles 按预期工作。
func pickUploadFilesPaths(ctx context.Context, title string) ([]string, error) {
	return runtime.OpenMultipleFilesDialog(ctx, runtime.OpenDialogOptions{
		Title:           title,
		ShowHiddenFiles: true,
	})
}