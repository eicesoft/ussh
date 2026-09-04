package backend

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
)

// agentAction 模型要求的一次动作。
type agentAction struct {
	Kind    string // "run" | "done"
	Command string
	Reason  string
	Summary string
}

// errNoAction 表示模型这轮只是自然语言回复，没有要求执行动作。
var errNoAction = errors.New("模型未要求执行命令")

// errMalformedAction 表示识别到了动作块但内容不合法，需要让模型重试。
var errMalformedAction = errors.New("动作格式不合法")

// 围栏解析：优先 ussh-action，其次常见 shell 语言块。
var (
	actionFence = regexp.MustCompile("(?s)```ussh-action\\s*\\n?(.*?)```")
	// 兜底：模型可能直接用 ```bash 输出命令。
	shellFence = regexp.MustCompile("(?s)```(?:bash|sh|shell|zsh|fish|cmd|bat|powershell|pwsh|console)\\s*\\n(.*?)```")
)

// parseAction 从模型的一轮回复里解析动作。
// 返回 errNoAction 表示没有动作，循环可以结束。
func parseAction(reply string) (agentAction, error) {
	if match := actionFence.FindStringSubmatch(reply); match != nil {
		return parseActionJSON(strings.TrimSpace(match[1]))
	}

	// 兜底：普通 shell 代码块。多条命令合并为一次执行，保持 shell 语义。
	if match := shellFence.FindStringSubmatch(reply); match != nil {
		command := strings.TrimSpace(match[1])
		if command == "" {
			return agentAction{}, errNoAction
		}
		return agentAction{Kind: "run", Command: collapseCommand(command)}, nil
	}

	return agentAction{}, errNoAction
}

func parseActionJSON(raw string) (agentAction, error) {
	var payload struct {
		Action  string `json:"action"`
		Command string `json:"cmd"`
		Reason  string `json:"reason"`
		Summary string `json:"summary"`
	}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return agentAction{}, errMalformedAction
	}
	switch strings.ToLower(strings.TrimSpace(payload.Action)) {
	case "run":
		command := strings.TrimSpace(payload.Command)
		if command == "" {
			return agentAction{}, errMalformedAction
		}
		return agentAction{
			Kind:    "run",
			Command: collapseCommand(command),
			Reason:  strings.TrimSpace(payload.Reason),
		}, nil
	case "done", "finish", "answer":
		return agentAction{Kind: "done", Summary: strings.TrimSpace(payload.Summary)}, nil
	default:
		return agentAction{}, errMalformedAction
	}
}

// collapseCommand 把多行命令压成单行。
// PTY 是逐行提交的，多行脚本会在第一行就被执行掉，这里用 `;` 连接以保持顺序语义。
func collapseCommand(command string) string {
	lines := strings.Split(command, "\n")
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		// 丢掉注释行与续行符。
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		kept = append(kept, strings.TrimSuffix(trimmed, "\\"))
	}
	return strings.Join(kept, "; ")
}

// parseToolCalls 处理 function calling 模式下模型返回的 tool_calls。
func parseToolCalls(calls []ToolCall) (agentAction, error) {
	if len(calls) == 0 {
		return agentAction{}, errNoAction
	}
	call := calls[0]
	switch call.Function.Name {
	case "run_command":
		var args struct {
			Command string `json:"cmd"`
			Reason  string `json:"reason"`
		}
		if err := json.Unmarshal([]byte(call.Function.Arguments), &args); err != nil {
			return agentAction{}, errMalformedAction
		}
		command := strings.TrimSpace(args.Command)
		if command == "" {
			return agentAction{}, errMalformedAction
		}
		return agentAction{Kind: "run", Command: collapseCommand(command), Reason: args.Reason}, nil
	case "finish":
		var args struct {
			Summary string `json:"summary"`
		}
		_ = json.Unmarshal([]byte(call.Function.Arguments), &args)
		return agentAction{Kind: "done", Summary: args.Summary}, nil
	default:
		return agentAction{}, errNoAction
	}
}

// agentTools 是 function calling 模式下声明给模型的工具。
func agentTools() []map[string]any {
	return []map[string]any{
		{
			"type": "function",
			"function": map[string]any{
				"name":        "run_command",
				"description": "在当前终端执行一条 shell 命令，并返回输出与退出码。命令必须单行，不要使用交互式命令。",
				"parameters": map[string]any{
					"type":     "object",
					"required": []string{"cmd"},
					"properties": map[string]any{
						"cmd":    map[string]any{"type": "string", "description": "要执行的单行 shell 命令"},
						"reason": map[string]any{"type": "string", "description": "为什么执行这条命令"},
					},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "finish",
				"description": "任务已完成或无需再执行命令，给出最终总结。",
				"parameters": map[string]any{
					"type":     "object",
					"required": []string{"summary"},
					"properties": map[string]any{
						"summary": map[string]any{"type": "string", "description": "给用户的最终答复"},
					},
				},
			},
		},
	}
}
