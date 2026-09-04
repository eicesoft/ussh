package backend

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// appFileConfig 是 app.json 的结构，只保存"窗口创建时就需要"的启动级配置。
type appFileConfig struct {
	GpuAcceleration *bool  `json:"gpuAcceleration,omitempty"`
	BackdropType    string `json:"backdropType,omitempty"`
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
	cfg := readAppConfig()
	cfg.GpuAcceleration = &enabled
	return writeAppConfig(cfg)
}

// SetBackdropType 持久化背景材质；macOS 上立即生效，Windows/Linux 在下次启动时生效。
func (a *App) SetBackdropType(material string) error {
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
