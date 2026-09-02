//go:build !darwin

package main

// applyWindowMaterial 仅 macOS 支持，其他平台背景材质在窗口创建时由
// main.go 的 Windows/Linux 选项决定，不做运行时切换。
func applyWindowMaterial(material string) {}
