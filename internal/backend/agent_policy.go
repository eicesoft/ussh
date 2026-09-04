package backend

import (
	"regexp"
	"strings"
)

// RiskLevel 表示一条命令的风险等级。
type RiskLevel string

const (
	RiskAllow   RiskLevel = "allow"   // 只读白名单命中，可直接执行
	RiskConfirm RiskLevel = "confirm" // 未命中任何规则，需询问用户
	RiskDanger  RiskLevel = "danger"  // 命中高危特征，需红色确认
	RiskDeny    RiskLevel = "deny"    // 交互式等会挂死的命令，直接拒绝
)

var riskRank = map[RiskLevel]int{
	RiskAllow:   0,
	RiskConfirm: 1,
	RiskDanger:  2,
	RiskDeny:    3,
}

// 拆段分隔符：命令列表、管道、换行。拆开后逐段判定，避免 `echo hi; rm -rf /` 被首段带过。
var segmentSplit = regexp.MustCompile(`[;|&\n]|\|\||&&`)

// 抽取命令替换与进程替换里的内容，连同本体一起检查。
var substitutionPattern = regexp.MustCompile(`\$\([^)]*\)|` + "`" + `[^` + "`" + `]*` + "`" + `|<\\?\([^)]*\)`)

// denyCommands 会占用终端等待交互，智能体执行必然挂死，且超时后难以恢复。
var denyCommands = []string{
	"vim", "vi", "nano", "pico", "emacs", "ed",
	"top", "htop", "atop", "less", "more", "man",
	"mysql", "psql", "mongo", "redis-cli", "sqlite3",
	"ssh", "telnet", "ftp", "sftp", "scp",
	"passwd", "su", "sudoedit", "vipw", "visudo",
	"watch", "dialog", "whiptail", "nc", "ncat",
}

// denyPatterns 交互式或破坏性极强的组合。
var denyPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?m)^\s*sudo\s+-i\b`),
	regexp.MustCompile(`(?m)^\s*sudo\s+-s\b`),
	regexp.MustCompile(`\btail\s+.*-f\b`),
	regexp.MustCompile(`\bjournalctl\b.*\s-f\b`),
	regexp.MustCompile(`(?m)^\s*python[0-9.]*\s*$`),
	regexp.MustCompile(`(?m)^\s*(bash|sh|zsh|fish)\s*$`),
	// fork bomb
	regexp.MustCompile(`:\\(\\)\\{.*\|`),
	regexp.MustCompile(`:\(\)\{.*\|`),
}

// dangerPatterns 高危写操作，必须弹窗确认。
var dangerPatterns = []*regexp.Regexp{
	// 删除与磁盘
	regexp.MustCompile(`\brm\b[^\n]*(-\w*[rf]|-rf?|-fr?)\b`),
	regexp.MustCompile(`\brm\s+.*--(recursive|force|no-preserve-root)`),
	regexp.MustCompile(`\brmdir\b`),
	regexp.MustCompile(`\bdd\b.*\bof=`),
	regexp.MustCompile(`\bmk(fs|fs\.\w+|2fs|ext[234]|swap)\b`),
	regexp.MustCompile(`\b(fdisk|parted|cfdisk|sfdisk|gdisk)\b`),
	regexp.MustCompile(`\b(shutdown|reboot|halt|poweroff|init\s+[06])\b`),
	regexp.MustCompile(`\b(umount|mount)\b`),
	regexp.MustCompile(`\bswapoff\b`),
	// 权限与身份
	regexp.MustCompile(`\b(chmod|chown|chgrp)\b`),
	regexp.MustCompile(`\b(sudo|su)\b`),
	regexp.MustCompile(`\b(setfacl|chattr|setcap)\b`),
	// 进程与调度
	regexp.MustCompile(`\b(kill|killall|pkill|xkill)\b`),
	regexp.MustCompile(`\bcrontab\b`),
	regexp.MustCompile(`(?m)^\s*at\s+`),
	regexp.MustCompile(`\bsystemctl\s+(stop|restart|disable|mask|daemon-reload|enable)\b`),
	regexp.MustCompile(`\bservice\s+\S+\s+(stop|restart)\b`),
	// 网络与内核
	regexp.MustCompile(`\b(iptables|ip6tables|nftables|ufw|firewall-cmd)\b`),
	regexp.MustCompile(`\bsysctl\s+-w\b`),
	regexp.MustCompile(`\bmodprobe\b`),
	// 输出重定向（覆盖文件内容）
	regexp.MustCompile(`(?m)[^\\]>>?\s*[^\s]`),
	// 管道喂解释器 / 远程执行
	regexp.MustCompile(`\|\s*(sudo\s+)?(sh|bash|zsh|dash|ksh|csh)\b`),
	regexp.MustCompile(`\|\s*(sudo\s+)?(python[0-9.]*|perl|ruby|php|node|lua)\b`),
	regexp.MustCompile(`\b(curl|wget)\b[^\n]*\|\s*(sudo\s+)?(sh|bash|zsh|python[0-9.]*|perl)\b`),
	regexp.MustCompile(`\bbase64\b[^\n]*(-d|--decode)`),
	// 版本控制破坏性操作
	regexp.MustCompile(`\bgit\s+reset\s+--hard\b`),
	regexp.MustCompile(`\bgit\s+clean\s+-[^\s]*f`),
	regexp.MustCompile(`\bgit\s+push\b[^\n]*(--force|-f\b)`),
	regexp.MustCompile(`\bgit\s+(checkout|restore)\s+(\.|--\s+\.)`),
	regexp.MustCompile(`\bgit\s+stash\s+(drop|clear)\b`),
	// 容器与编排
	regexp.MustCompile(`\bdocker\s+(rm|rmi|prune|system)\b`),
	regexp.MustCompile(`\bdocker\s+system\s+prune\b`),
	regexp.MustCompile(`\bkubectl\s+(delete|apply|scale|patch|replace|drain|cordon)\b`),
	regexp.MustCompile(`\bdocker-compose\s+(down|rm)\b`),
	// 包管理写操作
	regexp.MustCompile(`\bapt(-get)?\s+(install|remove|purge|autoremove)\b`),
	regexp.MustCompile(`\b(yum|dnf)\s+(install|remove|erase|update)\b`),
	regexp.MustCompile(`\bpacman\s+-[RS]`),
	regexp.MustCompile(`\b(pip|pip3)\s+install\b`),
	regexp.MustCompile(`\bnpm\s+(install|uninstall|update)\b`),
	regexp.MustCompile(`\byarn\s+(add|remove)\b`),
	regexp.MustCompile(`\bgem\s+install\b`),
	// 数据库写操作
	regexp.MustCompile(`\b(DROP|DELETE|TRUNCATE|UPDATE)\s+`),
	// 服务与文件写入
	regexp.MustCompile(`\b(tee|install\s+-m)\b`),
	regexp.MustCompile(`\bcp\b[^\n]*\s/etc/`),
}

// allowRules 只读白名单：段首命令 + 可选的子命令白名单 + 需排除的危险参数。
type allowRule struct {
	command  string
	subcmds  []string // 为空表示允许所有子命令
	denyArgs []string // 命中这些参数则不再视为只读
}

var allowRules = []allowRule{
	{command: "ls"},
	{command: "ll"},
	{command: "la"},
	// cd 本身没有副作用，且智能体依赖它维持多步之间的工作目录（复用同一 shell）。
	{command: "cd"},
	{command: "pushd"},
	{command: "popd"},
	{command: "cat"},
	{command: "head"},
	{command: "tail", denyArgs: []string{"-f", "--follow", "-F"}},
	{command: "grep"},
	{command: "egrep"},
	{command: "fgrep"},
	{command: "zgrep"},
	{command: "rg"},
	{command: "ag"},
	{command: "ack"},
	{command: "find", denyArgs: []string{"-delete", "-exec", "-execdir", "-ok", "-fprintf"}},
	{command: "which"},
	{command: "whereis"},
	{command: "type"},
	{command: "file"},
	{command: "stat"},
	{command: "wc"},
	{command: "sort"},
	{command: "uniq"},
	{command: "cut"},
	{command: "tr"},
	{command: "nl"},
	{command: "awk"},
	{command: "sed", denyArgs: []string{"-i", "--in-place"}},
	{command: "df"},
	{command: "du"},
	{command: "free"},
	{command: "uptime"},
	{command: "uname"},
	{command: "hostname"},
	{command: "whoami"},
	{command: "who"},
	{command: "w"},
	{command: "id"},
	{command: "groups"},
	{command: "date"},
	{command: "cal"},
	{command: "env"},
	{command: "printenv"},
	{command: "pwd"},
	{command: "history"},
	{command: "ps"},
	{command: "pgrep"},
	{command: "top", denyArgs: []string{"-b"}}, // -b 是批处理模式，但 top 默认交互，这里保守 deny
	{command: "ss"},
	{command: "netstat"},
	{command: "lsof"},
	{command: "ip"},
	{command: "ifconfig"},
	{command: "ping"},
	{command: "traceroute"},
	{command: "dig"},
	{command: "nslookup"},
	{command: "curl", denyArgs: []string{"-o", "-O", "--output"}},
	{command: "wget", denyArgs: []string{"-O", "-o", "--output-document"}},
	{command: "echo"},
	{command: "printf"},
	{command: "basename"},
	{command: "dirname"},
	{command: "readlink"},
	{command: "realpath"},
	{command: "md5sum"},
	{command: "sha1sum"},
	{command: "sha256sum"},
	{command: "diff"},
	{command: "xxd"},
	{command: "od"},
	{command: "strings"},
	{command: "tree"},
	{command: "less", denyArgs: []string{"*"}}, // 分页器默认交互
	{command: "git", subcmds: []string{"status", "log", "diff", "branch", "show", "remote", "rev-parse", "describe", "ls-files", "config", "tag"}},
	{command: "systemctl", subcmds: []string{"status", "list-units", "list-unit-files", "is-active", "is-enabled", "show", "cat"}},
	{command: "journalctl", denyArgs: []string{"-f", "--follow"}},
	{command: "docker", subcmds: []string{"ps", "logs", "images", "inspect", "stats", "version", "info", "top", "port", "diff"}},
	{command: "docker-compose", subcmds: []string{"ps", "logs", "config", "images", "top"}},
	{command: "kubectl", subcmds: []string{"get", "describe", "logs", "version", "cluster-info", "top", "explain", "config"}},
	{command: "nginx", denyArgs: []string{"-s"}},
	{command: "php", denyArgs: []string{"-r"}},
	{command: "node", denyArgs: []string{"-e", "--eval"}},
	{command: "python", denyArgs: []string{"-c"}},
	{command: "python3", denyArgs: []string{"-c"}},
	{command: "go", subcmds: []string{"version", "env", "list", "vet", "test"}},
	{command: "java", denyArgs: []string{"-jar"}},
	{command: "make", denyArgs: []string{"install", "clean"}},
	{command: "tar", denyArgs: []string{"-x", "--extract"}},
	{command: "zip", denyArgs: []string{"*"}},
	{command: "gzip", denyArgs: []string{"*"}},
	{command: "gunzip", denyArgs: []string{"*"}},
	{command: "test"},
	{command: "true"},
	{command: "false"},
}

// classifyCommand 判定命令的风险等级，返回等级与命中原因。
// 这是安全边界，必须在 Go 端执行：前端判定可被提示词注入的模型绕过。
func classifyCommand(command string) (RiskLevel, string) {
	trimmed := strings.TrimSpace(command)
	if trimmed == "" {
		return RiskDeny, "空命令"
	}

	// 命令本体 + 所有命令替换内容一起参与检查。
	subjects := []string{trimmed}
	for _, match := range substitutionPattern.FindAllString(trimmed, -1) {
		inner := strings.TrimSpace(match)
		inner = strings.TrimSuffix(strings.TrimPrefix(inner, "$("), ")")
		inner = strings.TrimPrefix(inner, "<(")
		inner = strings.Trim(inner, "`")
		if strings.TrimSpace(inner) != "" {
			subjects = append(subjects, strings.TrimSpace(inner))
		}
	}

	worst := RiskAllow
	reason := ""
	for _, subject := range subjects {
		level, why := classifySingle(subject)
		if riskRank[level] > riskRank[worst] {
			worst = level
			reason = why
		}
	}
	if reason == "" {
		reason = "未命中任何规则，需人工确认"
	}
	return worst, reason
}

func classifySingle(command string) (RiskLevel, string) {
	// 1. 先判 deny：交互式命令会直接挂死终端。
	for _, pattern := range denyPatterns {
		if pattern.MatchString(command) {
			return RiskDeny, "交互式或会挂起终端的命令"
		}
	}
	if firstToken(command) != "" {
		for _, name := range denyCommands {
			if tokenIs(firstToken(command), name) {
				return RiskDeny, "交互式命令：" + name
			}
		}
	}

	// 2. 再判 danger：写操作。
	for _, pattern := range dangerPatterns {
		if pattern.MatchString(command) {
			return RiskDanger, "命中高危规则：" + pattern.String()
		}
	}

	// 3. 逐段判定，所有段都只读才算 allow。
	segments := segmentSplit.Split(command, -1)
	if len(segments) == 0 {
		return RiskConfirm, "无法解析命令"
	}
	for _, raw := range segments {
		segment := strings.TrimSpace(raw)
		if segment == "" {
			continue
		}
		if level, why := classifySegment(segment); level != RiskAllow {
			if level == RiskDeny {
				return level, why
			}
			return RiskConfirm, why
		}
	}
	return RiskAllow, "只读命令"
}

func classifySegment(segment string) (RiskLevel, string) {
	// 段内仍可能带 deny/danger 特征（如 `cd /tmp && rm -rf *`），逐段再查一次。
	for _, pattern := range denyPatterns {
		if pattern.MatchString(segment) {
			return RiskDeny, "交互式或会挂起终端的命令"
		}
	}
	for _, pattern := range dangerPatterns {
		if pattern.MatchString(segment) {
			return RiskDanger, "命中高危规则：" + pattern.String()
		}
	}

	fields := strings.Fields(segment)
	if len(fields) == 0 {
		return RiskAllow, ""
	}
	name := baseName(fields[0])
	for _, blocked := range denyCommands {
		if name == blocked {
			return RiskDeny, "交互式命令：" + name
		}
	}

	args := fields[1:]
	for _, rule := range allowRules {
		if rule.command != name {
			continue
		}
		// denyArgs 含 "*" 表示整条命令不视为只读。
		for _, blocked := range rule.denyArgs {
			if blocked == "*" {
				return RiskConfirm, name + " 不在只读白名单内"
			}
			for _, arg := range args {
				if arg == blocked || strings.HasPrefix(arg, blocked) {
					return RiskConfirm, name + " 的参数 " + blocked + " 具有副作用"
				}
			}
		}
		if len(rule.subcmds) > 0 {
			sub := firstNonFlag(args)
			if sub == "" {
				return RiskConfirm, name + " 缺少受支持的子命令"
			}
			found := false
			for _, allowed := range rule.subcmds {
				if sub == allowed {
					found = true
					break
				}
			}
			if !found {
				return RiskConfirm, name + " " + sub + " 不在只读白名单内"
			}
		}
		return RiskAllow, ""
	}
	return RiskConfirm, name + " 不在只读白名单内"
}

// firstToken 返回命令的第一个有效词（跳过 env 前缀与变量赋值）。
func firstToken(command string) string {
	fields := strings.Fields(command)
	for index := 0; index < len(fields); index++ {
		field := fields[index]
		if strings.Contains(field, "=") && !strings.HasPrefix(field, "-") {
			continue // VAR=value 前缀
		}
		if field == "env" || field == "sudo" || field == "nice" || field == "timeout" {
			continue
		}
		return baseName(field)
	}
	return ""
}

func firstNonFlag(args []string) string {
	for _, arg := range args {
		if !strings.HasPrefix(arg, "-") {
			return arg
		}
	}
	return ""
}

func baseName(token string) string {
	token = strings.Trim(token, `"'`)
	if index := strings.LastIndex(token, "/"); index >= 0 {
		token = token[index+1:]
	}
	return token
}

func tokenIs(token, name string) bool {
	return token == name
}
