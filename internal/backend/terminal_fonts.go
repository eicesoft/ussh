package backend

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

// ListAvailableTerminalFonts 返回当前用户可选的字体族。优先使用系统字体服务，
// 缺失时再扫描用户字体目录；界面仍允许手动输入未被识别的字体名称。
func (a *App) ListAvailableTerminalFonts() []string {
	fonts := fontNamesFromFontconfig()
	if len(fonts) == 0 && runtime.GOOS == "darwin" {
		fonts = fontNamesFromMacOS()
	}
	if runtime.GOOS == "windows" {
		fonts = append(fonts, fontNamesFromWindowsRegistry()...)
	}
	fonts = append(fonts, fontNamesFromUserDirectories()...)
	return uniqueSortedFontNames(fonts)
}

func fontNamesFromFontconfig() []string {
	output, err := exec.Command("fc-list", "--format=%{family}\\n").Output()
	if err != nil {
		return nil
	}
	return strings.FieldsFunc(string(output), func(r rune) bool { return r == '\n' || r == ',' })
}

func fontNamesFromMacOS() []string {
	output, err := exec.Command("system_profiler", "SPFontsDataType", "-json").Output()
	if err != nil {
		return nil
	}
	var profile struct {
		Fonts []struct {
			Name string `json:"_name"`
		} `json:"SPFontsDataType"`
	}
	if json.Unmarshal(output, &profile) != nil {
		return nil
	}
	fonts := make([]string, 0, len(profile.Fonts))
	for _, font := range profile.Fonts {
		fonts = append(fonts, font.Name)
	}
	return fonts
}

func fontNamesFromWindowsRegistry() []string {
	const command = "$p=Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'; $p.PSObject.Properties | Where-Object {$_.Name -notmatch '^PS'} | ForEach-Object {$_.Name -replace ' \\(TrueType\\)$',''}"
	output, err := exec.Command("powershell.exe", "-NoProfile", "-Command", command).Output()
	if err != nil {
		return nil
	}
	return strings.Split(string(output), "\n")
}

func fontNamesFromUserDirectories() []string {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	dirs := []string{filepath.Join(home, ".fonts"), filepath.Join(home, ".local", "share", "fonts")}
	switch runtime.GOOS {
	case "darwin":
		dirs = append(dirs, filepath.Join(home, "Library", "Fonts"))
	case "windows":
		if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
			dirs = append(dirs, filepath.Join(localAppData, "Microsoft", "Windows", "Fonts"))
		}
	}
	var fonts []string
	for _, dir := range dirs {
		_ = filepath.WalkDir(dir, func(path string, entry os.DirEntry, err error) error {
			if err != nil || entry.IsDir() {
				return nil
			}
			extension := strings.ToLower(filepath.Ext(path))
			if extension == ".ttf" || extension == ".otf" || extension == ".ttc" || extension == ".woff" || extension == ".woff2" {
				fonts = append(fonts, strings.TrimSuffix(filepath.Base(path), extension))
			}
			return nil
		})
	}
	return fonts
}

func uniqueSortedFontNames(fonts []string) []string {
	seen := map[string]bool{}
	result := make([]string, 0, len(fonts))
	for _, font := range fonts {
		font = strings.TrimSpace(font)
		if font == "" || seen[strings.ToLower(font)] {
			continue
		}
		seen[strings.ToLower(font)] = true
		result = append(result, font)
	}
	sort.Slice(result, func(i, j int) bool { return strings.ToLower(result[i]) < strings.ToLower(result[j]) })
	return result
}
