package backend

import (
	"os/exec"
	"strings"
	"testing"
)

func TestSystemInfoCommandReportsMemory(t *testing.T) {
	output, err := exec.Command("sh", "-c", systemInfoCommand).CombinedOutput()
	if err != nil {
		t.Fatalf("systemInfoCommand 执行失败：%v\n输出：%s", err, output)
	}
	info, err := parseSystemInfo(SystemInfo{}, string(output))
	if err != nil {
		t.Fatalf("系统信息解析失败：%v\n输出：%s", err, output)
	}
	memory := strings.TrimSpace(info.Memory)
	if memory == "" || !strings.HasSuffix(memory, "%") {
		t.Fatalf("内存信息格式无效：%q，输出：%s", memory, output)
	}
}

func TestParseSystemInfo(t *testing.T) {
	info, err := parseSystemInfo(SystemInfo{Host: "10.0.0.8", Port: 2222, Username: "ops"}, `noise before block
__USSH_INFO_BEGIN__
hostname=db-prod-01
os=Ubuntu 24.04.1 LTS
load=0.42
memory=37%
kernel=6.8.0-31-generic
architecture=x86_64
shell=/bin/bash
cwd=/srv/app
uptime=up 3 days, 4 hours
__USSH_INFO_END__
noise after block`)
	if err != nil {
		t.Fatalf("parseSystemInfo() error = %v", err)
	}
	if info.Host != "10.0.0.8" || info.Port != 2222 || info.Username != "ops" {
		t.Fatalf("连接元数据被覆盖：%+v", info)
	}
	for name, gotWant := range map[string][2]string{
		"hostname":     {info.Hostname, "db-prod-01"},
		"os":           {info.OS, "Ubuntu 24.04.1 LTS"},
		"load":         {info.Load, "0.42"},
		"memory":       {info.Memory, "37%"},
		"kernel":       {info.Kernel, "6.8.0-31-generic"},
		"architecture": {info.Architecture, "x86_64"},
		"shell":        {info.Shell, "/bin/bash"},
		"cwd":          {info.Cwd, "/srv/app"},
		"uptime":       {info.Uptime, "up 3 days, 4 hours"},
	} {
		if gotWant[0] != gotWant[1] {
			t.Errorf("%s = %q, want %q", name, gotWant[0], gotWant[1])
		}
	}
}

func TestParseSystemInfoRejectsIncompleteOutput(t *testing.T) {
	if _, err := parseSystemInfo(SystemInfo{}, "__USSH_INFO_BEGIN__\nhostname=test\n"); err == nil {
		t.Fatal("不完整的系统信息不应解析成功")
	}
}
