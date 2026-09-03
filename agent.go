package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	// 授权等待上限：用户长时间不回应按拒绝处理，避免智能体永久挂起。
	approvalTimeout = 5 * time.Minute

	defaultMaxSteps      = 12
	maxAllowedSteps      = 30
	maxCommandTimeoutSec = 300
)

// AgentOptions 智能体运行参数，由设置页下发。
type AgentOptions struct {
	AutoApproveReadonly bool `json:"autoApproveReadonly"`
	UseTools            bool `json:"useTools"`
	MaxSteps            int  `json:"maxSteps"`
	CommandTimeoutSec   int  `json:"commandTimeoutSec"`
}

// AgentContext 当前终端的机器信息，注入系统提示词。
type AgentContext struct {
	Host         string `json:"host"`
	Username     string `json:"username"`
	Hostname     string `json:"hostname"`
	OS           string `json:"os"`
	Kernel       string `json:"kernel"`
	Architecture string `json:"architecture"`
	Shell        string `json:"shell"`
	Cwd          string `json:"cwd"`
	Uptime       string `json:"uptime"`
}

// AgentRequest 启动一次智能体任务。
type AgentRequest struct {
	RequestID string          `json:"requestId"`
	TabID     string          `json:"tabId"`
	BaseURL   string          `json:"baseURL"`
	APIKey    string          `json:"apiKey"`
	Model     string          `json:"model"`
	Messages  []AIChatMessage `json:"messages"`
	Context   AgentContext    `json:"context"`
	Options   AgentOptions    `json:"options"`
}

// StartAgent 启动一次智能体任务。与 StartAIChat 一样立即返回，后续通过事件推送。
func (a *App) StartAgent(req AgentRequest) error {
	req.RequestID = strings.TrimSpace(req.RequestID)
	req.BaseURL = strings.TrimRight(strings.TrimSpace(req.BaseURL), "/")
	req.Model = strings.TrimSpace(req.Model)
	req.TabID = strings.TrimSpace(req.TabID)

	switch {
	case req.RequestID == "":
		return fmt.Errorf("requestID 不能为空")
	case req.BaseURL == "":
		return fmt.Errorf("Base URL 不能为空")
	case req.Model == "":
		return fmt.Errorf("模型不能为空")
	case req.TabID == "":
		return fmt.Errorf("未选择终端")
	case len(req.Messages) == 0:
		return fmt.Errorf("任务内容不能为空")
	}
	if !a.hasConnection(req.TabID) {
		return fmt.Errorf("该终端未连接")
	}

	requestContext := a.ctx
	if requestContext == nil {
		requestContext = context.Background()
	}
	requestContext, cancel := context.WithCancel(requestContext)

	a.aiMu.Lock()
	if a.aiRequests == nil {
		a.aiRequests = map[string]context.CancelFunc{}
	}
	if previous, exists := a.aiRequests[req.RequestID]; exists {
		previous()
	}
	a.aiRequests[req.RequestID] = cancel
	a.aiMu.Unlock()

	go func() {
		defer func() {
			a.aiMu.Lock()
			delete(a.aiRequests, req.RequestID)
			a.aiMu.Unlock()
			a.releaseApproval(req.RequestID)
		}()

		err := a.runAgentLoop(requestContext, req)
		if err != nil {
			if errors.Is(err, context.Canceled) {
				a.emitAgent("ai-agent-done", req.RequestID, map[string]any{"stopped": true})
				return
			}
			a.emitAgent("ai-agent-error", req.RequestID, map[string]any{"error": err.Error()})
			return
		}
		a.emitAgent("ai-agent-done", req.RequestID, map[string]any{})
	}()
	return nil
}

// StopAgent 取消一次智能体任务。
func (a *App) StopAgent(requestID string) error {
	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return nil
	}
	a.aiMu.Lock()
	cancel := a.aiRequests[requestID]
	a.aiMu.Unlock()
	if cancel != nil {
		cancel()
	}
	// 可能正阻塞在等待授权，唤醒它让它尽快退出。
	a.resolveApproval(requestID, "deny")
	return nil
}

// ResolveApproval 回应用户的授权决定：allow / deny / allow_all。
func (a *App) ResolveApproval(requestID, decision string) error {
	if !a.resolveApproval(strings.TrimSpace(requestID), strings.TrimSpace(decision)) {
		return nil
	}
	return nil
}

func (a *App) resolveApproval(requestID, decision string) bool {
	a.aiMu.Lock()
	channel := a.agentApprovals[requestID]
	a.aiMu.Unlock()
	if channel == nil {
		return false
	}
	select {
	case channel <- decision:
		return true
	default:
		return false
	}
}

func (a *App) registerApproval(requestID string) chan string {
	channel := make(chan string, 1)
	a.aiMu.Lock()
	if a.agentApprovals == nil {
		a.agentApprovals = map[string]chan string{}
	}
	a.agentApprovals[requestID] = channel
	a.aiMu.Unlock()
	return channel
}

func (a *App) releaseApproval(requestID string) {
	a.aiMu.Lock()
	delete(a.agentApprovals, requestID)
	a.aiMu.Unlock()
}

// runAgentLoop 驱动「生成 → 鉴权 → 执行 → 观测 → 再决策」循环。
func (a *App) runAgentLoop(ctx context.Context, req AgentRequest) error {
	options := normalizeOptions(req.Options)
	messages := []AIChatMessage{{Role: "system", Content: buildSystemPrompt(req.Context, options)}}
	messages = append(messages, req.Messages...)

	for step := 1; step <= options.MaxSteps; step++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		a.emitAgent("ai-agent-step", req.RequestID, map[string]any{"step": step, "status": "thinking"})

		reply, calls, err := a.chatOnce(ctx, req, messages, options, func(token string) {
			a.emitAgent("ai-agent-text", req.RequestID, map[string]any{"token": token})
		})
		if err != nil {
			return err
		}
		messages = append(messages, AIChatMessage{Role: "assistant", Content: reply, ToolCalls: calls})

		action, err := resolveAction(reply, calls)
		if err != nil {
			if errors.Is(err, errNoAction) {
				return nil
			}
			// 格式不合法：把错误反馈给模型重试，计入步数。
			messages = append(messages, AIChatMessage{
				Role:    "user",
				Content: "你的上一条回复无法解析：" + err.Error() + "。请严格按要求格式输出。",
			})
			continue
		}
		if action.Kind == "done" {
			// 总结写在围栏里，界面不再渲染原始 JSON，这里单独把结论推给前端展示。
			a.emitAgent("ai-agent-action", req.RequestID, map[string]any{
				"step": step, "action": "done", "summary": action.Summary,
			})
			return nil
		}

		level, reason := classifyCommand(action.Command)
		allowed, err := a.authorize(ctx, req, step, action, level, reason, options)
		if err != nil {
			return err
		}
		if !allowed {
			messages = append(messages, AIChatMessage{
				Role:    "user",
				Content: fmt.Sprintf("用户拒绝执行命令 `%s`（%s）。请换一种方式，不要再重复该命令。", action.Command, reason),
			})
			continue
		}

		// 界面按 step 把执行条插入到对应位置，原始动作 JSON 不再展示给用户。
		a.emitAgent("ai-agent-action", req.RequestID, map[string]any{
			"step": step, "action": "run", "cmd": action.Command, "reason": action.Reason, "level": string(level),
		})

		result, err := a.runViaPTY(req.TabID, action.Command, step, time.Duration(options.CommandTimeoutSec)*time.Second)
		if err != nil {
			if errors.Is(err, errSessionGone) {
				return fmt.Errorf("终端已断开，任务终止")
			}
			return err
		}
		a.emitAgent("ai-agent-result", req.RequestID, map[string]any{
			"step":       step,
			"command":    result.Command,
			"output":     result.Output,
			"exitCode":   result.ExitCode,
			"timedOut":   result.TimedOut,
			"durationMs": result.DurationMs,
		})

		messages = append(messages, buildObservation(action, result, options))
	}
	return nil
}

// resolveAction 统一两种模式的动作来源。
func resolveAction(reply string, calls []ToolCall) (agentAction, error) {
	if len(calls) > 0 {
		return parseToolCalls(calls)
	}
	return parseAction(reply)
}

// buildObservation 把执行结果整理成给模型的反馈。
func buildObservation(action agentAction, result CommandResult, options AgentOptions) AIChatMessage {
	var builder strings.Builder
	builder.WriteString(fmt.Sprintf("已执行命令 `%s`，退出码 %d", result.Command, result.ExitCode))
	if result.TimedOut {
		builder.WriteString(fmt.Sprintf("，执行超时（%d 秒）已中断，以下是中断前的部分输出", options.CommandTimeoutSec))
	}
	builder.WriteString("：\n")
	if strings.TrimSpace(result.Output) == "" {
		builder.WriteString("(无输出)\n")
	} else {
		builder.WriteString(result.Output)
		builder.WriteString("\n")
	}
	if result.ExitCode != 0 {
		builder.WriteString("命令执行失败，请分析原因并换一种方式，不要原样重试。")
	}
	content := builder.String()

	if options.UseTools {
		return AIChatMessage{Role: "tool", Content: content, ToolCallID: action.Command}
	}
	return AIChatMessage{Role: "user", Content: content}
}

// authorize 按风险等级决定是否放行，必要时阻塞等待用户授权。
func (a *App) authorize(ctx context.Context, req AgentRequest, step int, action agentAction, level RiskLevel, reason string, options AgentOptions) (bool, error) {
	switch level {
	case RiskDeny:
		a.emitAgent("ai-agent-denied", req.RequestID, map[string]any{
			"step": step, "command": action.Command, "reason": reason,
		})
		return false, nil
	case RiskAllow:
		if options.AutoApproveReadonly {
			return true, nil
		}
	}

	channel := a.registerApproval(req.RequestID)
	defer a.releaseApproval(req.RequestID)

	a.emitAgent("ai-agent-approval", req.RequestID, map[string]any{
		"step":       step,
		"command":    action.Command,
		"reason":     action.Reason,
		"policy":     reason,
		"level":      string(level),
		"timeoutSec": int(approvalTimeout.Seconds()),
	})

	timer := time.NewTimer(approvalTimeout)
	defer timer.Stop()

	select {
	case decision := <-channel:
		switch decision {
		case "allow", "allow_all":
			return true, nil
		default:
			return false, nil
		}
	case <-timer.C:
		return false, nil
	case <-ctx.Done():
		return false, ctx.Err()
	}
}

// chatOnce 向模型发起一轮对话，返回文本与工具调用。
func (a *App) chatOnce(ctx context.Context, req AgentRequest, messages []AIChatMessage, options AgentOptions, onText func(string)) (string, []ToolCall, error) {
	payload := map[string]any{
		"model":    req.Model,
		"messages": messages,
		"stream":   true,
	}
	if options.UseTools {
		payload["tools"] = agentTools()
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", nil, fmt.Errorf("构造 AI 请求失败：%w", err)
	}
	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, req.BaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", nil, fmt.Errorf("构造 AI 请求失败：%w", err)
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(req.APIKey) != "" {
		httpRequest.Header.Set("Authorization", "Bearer "+strings.TrimSpace(req.APIKey))
	}

	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(httpRequest)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return "", nil, err
		}
		return "", nil, fmt.Errorf("请求 AI 服务失败：%w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		detail, _ := io.ReadAll(io.LimitReader(resp.Body, 32*1024))
		var parsed struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
			Message string `json:"message"`
		}
		_ = json.Unmarshal(detail, &parsed)
		message := parsed.Error.Message
		if message == "" {
			message = parsed.Message
		}
		if message == "" {
			message = strings.TrimSpace(string(detail))
		}
		if message == "" {
			message = fmt.Sprintf("服务器返回状态码 %d", resp.StatusCode)
		}
		return "", nil, fmt.Errorf("AI 服务请求失败：%s", message)
	}

	// 非流式响应直接整体返回。
	if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
		raw, err := io.ReadAll(resp.Body)
		if err != nil {
			return "", nil, fmt.Errorf("读取 AI 响应失败：%w", err)
		}
		var completion struct {
			Choices []struct {
				Message struct {
					Content   string     `json:"content"`
					ToolCalls []ToolCall `json:"tool_calls"`
				} `json:"message"`
			} `json:"choices"`
		}
		if err := json.Unmarshal(raw, &completion); err != nil {
			return "", nil, fmt.Errorf("解析 AI 响应失败：%w", err)
		}
		if len(completion.Choices) == 0 {
			return "", nil, nil
		}
		content := completion.Choices[0].Message.Content
		if content != "" {
			onText(content)
		}
		return content, completion.Choices[0].Message.ToolCalls, nil
	}

	var text strings.Builder
	// tool_calls 是增量下发的，按 index 累积。
	callsByIndex := map[int]*ToolCall{}
	var order []int

	err = scanSSEStream(resp.Body, func(chunk sseChunk) {
		if chunk.Content != "" {
			text.WriteString(chunk.Content)
			onText(chunk.Content)
		}
		for _, incoming := range chunk.ToolCalls {
			existing, ok := callsByIndex[incoming.Index]
			if !ok {
				clone := incoming
				existing = &clone
				callsByIndex[incoming.Index] = existing
				order = append(order, incoming.Index)
				continue // 首次出现已带完整内容，不能再累加一遍
			}
			if existing.ID == "" {
				existing.ID = incoming.ID
			}
			if existing.Type == "" {
				existing.Type = incoming.Type
			}
			// 增量字段：只有后续分片才累加。
			existing.Function.Name += incoming.Function.Name
			existing.Function.Arguments += incoming.Function.Arguments
		}
	})
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return "", nil, err
		}
		return "", nil, err
	}

	var calls []ToolCall
	for _, index := range order {
		calls = append(calls, *callsByIndex[index])
	}
	return text.String(), calls, nil
}

func (a *App) emitAgent(event string, requestID string, payload map[string]any) {
	payload["requestId"] = requestID
	a.emitEvent(event, payload)
}

func normalizeOptions(options AgentOptions) AgentOptions {
	if options.MaxSteps <= 0 {
		options.MaxSteps = defaultMaxSteps
	}
	if options.MaxSteps > maxAllowedSteps {
		options.MaxSteps = maxAllowedSteps
	}
	if options.CommandTimeoutSec <= 0 {
		options.CommandTimeoutSec = int(defaultCommandTimeout.Seconds())
	}
	if options.CommandTimeoutSec > maxCommandTimeoutSec {
		options.CommandTimeoutSec = maxCommandTimeoutSec
	}
	return options
}

func buildSystemPrompt(info AgentContext, options AgentOptions) string {
	var builder strings.Builder
	builder.WriteString("你是 uSSH 内置的系统运维智能体，正在一台远程服务器上工作。\n")

	target := "未知主机"
	if info.Username != "" || info.Host != "" {
		target = strings.TrimSpace(info.Username + "@" + info.Host)
	}
	builder.WriteString(fmt.Sprintf("当前连接：%s", target))
	if info.OS != "" {
		builder.WriteString(fmt.Sprintf("，系统：%s", info.OS))
	}
	if info.Hostname != "" {
		builder.WriteString(fmt.Sprintf("，主机名：%s", info.Hostname))
	}
	if info.Kernel != "" {
		builder.WriteString(fmt.Sprintf("，内核：%s", info.Kernel))
	}
	if info.Architecture != "" {
		builder.WriteString(fmt.Sprintf("，架构：%s", info.Architecture))
	}
	if info.Shell != "" {
		builder.WriteString(fmt.Sprintf("，Shell：%s", info.Shell))
	}
	if info.Cwd != "" {
		builder.WriteString(fmt.Sprintf("，当前目录：%s", info.Cwd))
	}
	if info.Uptime != "" {
		builder.WriteString(fmt.Sprintf("，运行时间：%s", info.Uptime))
	}
	builder.WriteString("。\n\n")

	builder.WriteString("工作方式：你会收到用户的任务，每轮输出思考过程，并按需执行命令；" +
		"命令的输出与退出码会回传给你，你据此决定下一步。\n")
	builder.WriteString(fmt.Sprintf("最多执行 %d 步，单条命令超时 %d 秒。\n\n", options.MaxSteps, options.CommandTimeoutSec))

	if options.UseTools {
		builder.WriteString("请通过 run_command 工具执行命令，任务完成时调用 finish 工具给出总结。\n\n")
	} else {
		builder.WriteString("需要执行命令时，在回复末尾附加一个动作块：\n\n")
		builder.WriteString("```ussh-action\n{\"action\":\"run\",\"cmd\":\"要执行的命令\",\"reason\":\"为什么执行\"}\n```\n\n")
		builder.WriteString("任务完成时输出：\n\n```ussh-action\n{\"action\":\"done\",\"summary\":\"给用户的最终答复\"}\n```\n\n")
		builder.WriteString("只输出一个动作块，不要一次要求执行多条无关命令。\n\n")
	}

	builder.WriteString("重要限制：\n")
	builder.WriteString("- 命令必须单行，不要输出多行脚本或 heredoc。\n")
	builder.WriteString("- 禁止交互式命令（vim、top、less、tail -f、passwd、mysql 等），它们会被自动拒绝。\n")
	builder.WriteString("- 危险命令（删除、写入、权限变更、服务重启等）会弹出确认框由用户决定；被拒绝后请换策略，不要原样重试。\n")
	builder.WriteString("- 输出中的 ANSI 颜色与转义序列已被清除，回显也已剥离，你看到的就是命令的真实输出。\n")
	builder.WriteString("- 同一终端内 cd 与环境变量会保留，可直接利用上一步的工作目录。\n")
	builder.WriteString("- 退出码非 0 表示失败，请先分析原因再行动。\n")

	return builder.String()
}
