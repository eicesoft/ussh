package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// appConfigPath 返回应用级配置文件路径，与连接库同目录（UserConfigDir/uSSH/app.json）。
func appConfigPath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("无法定位本地配置目录：%w", err)
	}
	return filepath.Join(configDir, "uSSH", "app.json"), nil
}

// loadGpuDisabled 读取 GPU 加速开关，供启动时配置 webview。
// 文件缺失、解析失败或字段缺省时一律视为启用（返回 false）。
func loadGpuDisabled() bool {
	path, err := appConfigPath()
	if err != nil {
		return false
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	var cfg struct {
		GpuAcceleration *bool `json:"gpuAcceleration"`
	}
	if json.Unmarshal(data, &cfg) != nil || cfg.GpuAcceleration == nil {
		return false
	}
	return !*cfg.GpuAcceleration
}

// SetGpuAcceleration 持久化 GPU 加速开关，窗口创建时读取，重启后生效。
func (a *App) SetGpuAcceleration(enabled bool) error {
	path, err := appConfigPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("无法创建本地配置目录：%w", err)
	}
	data, err := json.MarshalIndent(map[string]bool{"gpuAcceleration": enabled}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o600)
}
