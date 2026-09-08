package backend

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// appFileConfig 保存应用级持久配置。
type appFileConfig struct {
	GpuAcceleration *bool                `json:"gpuAcceleration,omitempty"`
	BackdropType    string               `json:"backdropType,omitempty"`
	TerminalLog     *TerminalLogSettings `json:"terminalLog,omitempty"`
}

var appConfigMu sync.Mutex

type TerminalLogSettings struct {
	Enabled     bool   `json:"enabled"`
	SavePath    string `json:"savePath"`
	DefaultPath string `json:"defaultPath"`
}

func (a *App) GetTerminalLogSettings() (TerminalLogSettings, error) {
	appConfigMu.Lock()
	defer appConfigMu.Unlock()
	path, err := appConfigPath()
	if err != nil {
		return TerminalLogSettings{}, err
	}
	defaultPath := filepath.Join(filepath.Dir(path), "terminal-logs")
	settings := TerminalLogSettings{Enabled: true, SavePath: defaultPath, DefaultPath: defaultPath}
	if saved := readAppConfig().TerminalLog; saved != nil {
		settings.Enabled = saved.Enabled
		if saved.SavePath != "" {
			settings.SavePath = saved.SavePath
		}
	}
	return settings, nil
}

func (a *App) SetTerminalLogSettings(settings TerminalLogSettings) error {
	settings.SavePath = strings.TrimSpace(settings.SavePath)
	if settings.SavePath != "" && !filepath.IsAbs(settings.SavePath) {
		return fmt.Errorf("日志保存路径必须是绝对路径")
	}
	if settings.SavePath != "" {
		settings.SavePath = filepath.Clean(settings.SavePath)
	}
	settings.DefaultPath = ""
	appConfigMu.Lock()
	defer appConfigMu.Unlock()
	cfg := readAppConfig()
	cfg.TerminalLog = &settings
	return writeAppConfig(cfg)
}

func (a *App) PickTerminalLogDirectory() (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("应用尚未就绪")
	}
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "选择终端日志保存目录", CanCreateDirectories: true})
}

// appConfigPath 返回应用级配置文件路径，与连接库同目录（UserConfigDir/uSSH/app.json）。
func appConfigPath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("无法定位本地配置目录：%w", err)
	}
	return filepath.Join(configDir, "uSSH", "app.json"), nil
}

func readAppConfig() appFileConfig {
	path, err := appConfigPath()
	if err != nil {
		return appFileConfig{}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return appFileConfig{}
	}
	var cfg appFileConfig
	if json.Unmarshal(data, &cfg) != nil {
		return appFileConfig{}
	}
	return cfg
}

func writeAppConfig(cfg appFileConfig) error {
	path, err := appConfigPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("无法创建本地配置目录：%w", err)
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o600)
}

// loadGpuDisabled 读取 GPU 加速开关，供启动时配置 webview。
// 文件缺失、解析失败或字段缺省时一律视为启用（返回 false）。
func LoadGPUDisabled() bool {
	cfg := readAppConfig()
	if cfg.GpuAcceleration == nil {
		return false
	}
	return !*cfg.GpuAcceleration
}

var backdropTypes = map[string]bool{"none": true, "mica": true, "acrylic": true}

// loadBackdropType 读取背景材质；非法或缺省时默认使用亚克力。
func LoadBackdropType() string {
	cfg := readAppConfig()
	if backdropTypes[cfg.BackdropType] {
		return cfg.BackdropType
	}
	return "acrylic"
}

// SetGpuAcceleration 持久化 GPU 加速开关，窗口创建时读取，重启后生效。
func (a *App) SetGpuAcceleration(enabled bool) error {
	appConfigMu.Lock()
	defer appConfigMu.Unlock()
	cfg := readAppConfig()
	cfg.GpuAcceleration = &enabled
	return writeAppConfig(cfg)
}

// SetBackdropType 持久化背景材质；macOS 上立即生效，Windows/Linux 在下次启动时生效。
func (a *App) SetBackdropType(material string) error {
	appConfigMu.Lock()
	defer appConfigMu.Unlock()
	material = strings.ToLower(strings.TrimSpace(material))
	if !backdropTypes[material] {
		return fmt.Errorf("不支持的背景材质：%s", material)
	}
	cfg := readAppConfig()
	cfg.BackdropType = material
	if err := writeAppConfig(cfg); err != nil {
		return err
	}
	applyWindowMaterial(material)
	return nil
}
