package main

import (
	"errors"
	"testing"
)

func TestParseAction(t *testing.T) {
	cases := []struct {
		name    string
		reply   string
		want    agentAction
		wantErr error
	}{
		{
			name:  "标准动作块",
			reply: "我先看看磁盘。\n\n```ussh-action\n{\"action\":\"run\",\"cmd\":\"df -h\",\"reason\":\"查看磁盘占用\"}\n```",
			want:  agentAction{Kind: "run", Command: "df -h", Reason: "查看磁盘占用"},
		},
		{
			name:  "完成动作",
			reply: "都处理好了。\n\n```ussh-action\n{\"action\":\"done\",\"summary\":\"磁盘还剩 40G\"}\n```",
			want:  agentAction{Kind: "done", Summary: "磁盘还剩 40G"},
		},
		{
			name:  "动作块无语言标注空格",
			reply: "```ussh-action{\"action\":\"run\",\"cmd\":\"ls\"}```",
			want:  agentAction{Kind: "run", Command: "ls"},
		},
		{
			name:  "bash 围栏兜底",
			reply: "执行这条：\n\n```bash\nls -la /var/log\n```",
			want:  agentAction{Kind: "run", Command: "ls -la /var/log"},
		},
		{
			name:  "sh 围栏兜底",
			reply: "```sh\nwhoami\n```",
			want:  agentAction{Kind: "run", Command: "whoami"},
		},
		{
			name:  "多行命令合并为单行",
			reply: "```bash\ncd /var/log\nls -la\n```",
			want:  agentAction{Kind: "run", Command: "cd /var/log; ls -la"},
		},
		{
			name:  "多行命令带注释与续行",
			reply: "```bash\n# 先切目录\ncd /var/log \\\nls\n```",
			want:  agentAction{Kind: "run", Command: "cd /var/log ; ls"},
		},
		{
			name:    "纯文本无动作",
			reply:   "这是一段普通回答，没有命令。",
			wantErr: errNoAction,
		},
		{
			name:    "只有普通代码围栏但非 shell",
			reply:   "```json\n{\"a\":1}\n```",
			wantErr: errNoAction,
		},
		{
			name:    "动作块 JSON 畸形",
			reply:   "```ussh-action\n{action: run, cmd: ls}\n```",
			wantErr: errMalformedAction,
		},
		{
			name:    "动作块缺 cmd",
			reply:   "```ussh-action\n{\"action\":\"run\"}\n```",
			wantErr: errMalformedAction,
		},
		{
			name:    "未知 action",
			reply:   "```ussh-action\n{\"action\":\"explode\"}\n```",
			wantErr: errMalformedAction,
		},
		{
			name:  "action 大小写不敏感",
			reply: "```ussh-action\n{\"action\":\"RUN\",\"cmd\":\"pwd\"}\n```",
			want:  agentAction{Kind: "run", Command: "pwd"},
		},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			got, err := parseAction(testCase.reply)
			if testCase.wantErr != nil {
				if !errors.Is(err, testCase.wantErr) {
					t.Fatalf("parseAction() error = %v, want %v", err, testCase.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseAction() 意外出错：%v", err)
			}
			if got != testCase.want {
				t.Fatalf("parseAction() = %+v, want %+v", got, testCase.want)
			}
		})
	}
}

func TestParseToolCalls(t *testing.T) {
	call := func(name, args string) ToolCall {
		var item ToolCall
		item.Function.Name = name
		item.Function.Arguments = args
		return item
	}

	t.Run("run_command", func(t *testing.T) {
		got, err := parseToolCalls([]ToolCall{call("run_command", `{"cmd":"df -h","reason":"看磁盘"}`)})
		if err != nil {
			t.Fatalf("意外出错：%v", err)
		}
		if got.Kind != "run" || got.Command != "df -h" || got.Reason != "看磁盘" {
			t.Fatalf("got %+v", got)
		}
	})

	t.Run("finish", func(t *testing.T) {
		got, err := parseToolCalls([]ToolCall{call("finish", `{"summary":"完成"}`)})
		if err != nil {
			t.Fatalf("意外出错：%v", err)
		}
		if got.Kind != "done" || got.Summary != "完成" {
			t.Fatalf("got %+v", got)
		}
	})

	t.Run("空参数", func(t *testing.T) {
		if _, err := parseToolCalls([]ToolCall{call("run_command", `{}`)}); !errors.Is(err, errMalformedAction) {
			t.Fatalf("err = %v, want errMalformedAction", err)
		}
	})

	t.Run("无调用", func(t *testing.T) {
		if _, err := parseToolCalls(nil); !errors.Is(err, errNoAction) {
			t.Fatalf("err = %v, want errNoAction", err)
		}
	})

	t.Run("未知工具", func(t *testing.T) {
		if _, err := parseToolCalls([]ToolCall{call("unknown", `{}`)}); !errors.Is(err, errNoAction) {
			t.Fatalf("err = %v, want errNoAction", err)
		}
	})
}

func TestAgentTools(t *testing.T) {
	tools := agentTools()
	if len(tools) != 2 {
		t.Fatalf("工具数量 = %d, want 2", len(tools))
	}
	for _, tool := range tools {
		if tool["type"] != "function" {
			t.Errorf("工具类型错误：%v", tool["type"])
		}
		function, ok := tool["function"].(map[string]any)
		if !ok {
			t.Fatalf("工具缺少 function 定义：%v", tool)
		}
		if function["name"] != "run_command" && function["name"] != "finish" {
			t.Errorf("未预期的工具名：%v", function["name"])
		}
	}
}
