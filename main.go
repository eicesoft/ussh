package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()
	// GPU 加速开关仅在创建窗口时生效：Windows 走 --disable-gpu，Linux 走 WebkitGpuPolicy，macOS 由系统管理。
	gpuDisabled := loadGpuDisabled()
	gpuPolicy := linux.WebviewGpuPolicyOnDemand
	if gpuDisabled {
		gpuPolicy = linux.WebviewGpuPolicyNever
	}
	err := wails.Run(&options.App{
		Title:     "uSSH",
		Width:     1280,
		Height:    820,
		MinWidth:  920,
		MinHeight: 620,
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		// 让前端的圆角外侧透出桌面背景，而不是由原生窗口填充颜色。
		BackgroundColour: &options.RGBA{R: 0, G: 0, B: 0, A: 0},
		Mac: &mac.Options{
			WebviewIsTransparent: true,
		},
		Windows: &windows.Options{
			WebviewGpuIsDisabled: gpuDisabled,
		},
		Linux: &linux.Options{
			WebviewGpuPolicy: gpuPolicy,
		},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
