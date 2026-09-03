package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// scriptedLLM 按轮次回放预设的 SSE 响应，并记录收到的请求。
type scriptedLLM struct {
	server   *httptest.Server
	mu       sync.Mutex
	requests []map[string]any
	replies  []string
	round    int
}

// newScriptedLLM 每轮回复由 SSE 片段组成，片段写法：
//   - "text:xxx"  → 一个 content delta
//   - "tool:run:cmd" → 一个 run_command 工具调用
//   - "tool:finish:summary" → 一个 finish 工具调用
func newScriptedLLM(t *testing.T, rounds []string) *scriptedLLM {
	t.Helper()
	fake := &scriptedLLM{replies: rounds}
	fake.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		fake.mu.Lock()
		fake.requests = append(fake.requests, body)
		index := fake.round
		fake.round++
		reply := ""
		if index < len(fake.replies) {
			reply = fake.replies[index]
		}
		fake.mu.Unlock()

		w.Header().Set("Content-Type", "text/event-stream")
		flusher, _ := w.(http.Flusher)
		for _, part := range strings.Split(reply, "|") {
			if part == "" {
				continue
			}
			var chunk string
			switch {
			case strings.HasPrefix(part, "text:"):
				chunk = `{"choices":[{"delta":{"content":` + mustJSON(part[5:]) + `}}]}`
			case strings.HasPrefix(part, "tool:run:"):
				args, _ := json.Marshal(map[string]string{"cmd": part[9:]})
				chunk = `{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function",` +
					`"function":{"name":"run_command","arguments":` + mustJSON(string(args)) + `}}]}}]}`
			case strings.HasPrefix(part, "tool:finish:"):
				args, _ := json.Marshal(map[string]string{"summary": part[12:]})
				chunk = `{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_2","type":"function",` +
					`"function":{"name":"finish","arguments":` + mustJSON(string(args)) + `}}]}}]}`
			}
			if chunk == "" {
				continue
			}
			_, _ = w.Write([]byte("data: " + chunk + "\n\n"))
			if flusher != nil {
				flusher.Flush()
			}
		}
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	t.Cleanup(fake.server.Close)
	return fake
}

func (f *scriptedLLM) requestCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.requests)
}

func (f *scriptedLLM) lastRequest() map[string]any {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.requests) == 0 {
		return nil
	}
	return f.requests[len(f.requests)-1]
}

func mustJSON(value string) string {
	encoded, err := json.Marshal(value)
	if err != nil {
		return `""`
	}
	return string(encoded)
}

// eventRecorder 捕获智能体发出的全部事件，供测试断言。
type eventRecorder struct {
	mu     sync.Mutex
	events []recordedEvent
}

type recordedEvent struct {
	name    string
	payload map[string]any
}

func (r *eventRecorder) record(event string, payload map[string]any) {
	r.mu.Lock()
	r.events = append(r.events, recordedEvent{name: event, payload: payload})
	r.mu.Unlock()
}

func (r *eventRecorder) names() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	names := make([]string, 0, len(r.events))
	for _, item := range r.events {
		names = append(names, item.name)
	}
	return names
}

func (r *eventRecorder) find(name string) []map[string]any {
	r.mu.Lock()
	defer r.mu.Unlock()
	var matched []map[string]any
	for _, item := range r.events {
		if item.name == name {
			matched = append(matched, item.payload)
		}
	}
	return matched
}

func (r *eventRecorder) has(name string) bool {
	return len(r.find(name)) > 0
}

// newAgentTestApp 造一个带假终端的 App，命令执行由 onCommand 模拟。
func newAgentTestApp(t *testing.T, tabId string, onCommand func(command string) string) (*App, *eventRecorder) {
	t.Helper()
	app := NewApp()
	recorder := &eventRecorder{}
	app.emitForTest = recorder.record

	app.mu.Lock()
	app.connections[tabId] = &sshConnection{}
	app.mu.Unlock()

	app.sendInputForTest = func(_ string, data string) error {
		marker := extractMarker(data)
		output := ""
		if onCommand != nil {
			output = onCommand(data)
		}
		go app.dispatchTap(tabId, []byte("\r\n"+marker+":0\r\n"+output))
		return nil
	}
	t.Cleanup(func() {
		app.mu.Lock()
		delete(app.connections, tabId)
		app.mu.Unlock()
	})
	return app, recorder
}

func newAgentRequest(serverURL, tabId string) AgentRequest {
	return AgentRequest{
		RequestID: "req-1",
		TabID:     tabId,
		BaseURL:   serverURL,
		Model:     "test-model",
		Messages:  []AIChatMessage{{Role: "user", Content: "看看磁盘"}},
		Context:   AgentContext{Host: "web-01", Username: "root"},
		Options:   AgentOptions{AutoApproveReadonly: true, MaxSteps: 5, CommandTimeoutSec: 5},
	}
}

// numericEqual 事件载荷经 JSON 往返后数字可能变成 float64，这里做类型无关比较。
func numericEqual(value any, want int) bool {
	switch typed := value.(type) {
	case int:
		return typed == want
	case float64:
		return int(typed) == want
	case int64:
		return int(typed) == want
	default:
		return false
	}
}

// TestAgentLoopEmitsDoneAction 验证 done 动作会把总结单独推给界面，
// 因为界面已不再渲染原始动作 JSON，总结丢失就再也看不到了。
func TestAgentLoopEmitsDoneAction(t *testing.T) {
	fake := newScriptedLLM(t, []string{
		"text:都处理好了。|text:```ussh-action\n{\"action\":\"done\",\"summary\":\"磁盘空间充足\"}\n```",
	})
	app, recorder := newAgentTestApp(t, "tab-done", nil)

	if err := app.runAgentLoop(context.Background(), newAgentRequest(fake.server.URL, "tab-done")); err != nil {
		t.Fatalf("runAgentLoop 出错：%v", err)
	}
	if fake.requestCount() != 1 {
		t.Fatalf("模型调用次数 = %d, want 1（done 应立即结束）", fake.requestCount())
	}
	actions := recorder.find("ai-agent-action")
	if len(actions) != 1 {
		t.Fatalf("ai-agent-action 次数 = %d, want 1", len(actions))
	}
	if actions[0]["action"] != "done" {
		t.Errorf("ai-agent-action.action = %v, want done", actions[0]["action"])
	}
	if actions[0]["summary"] != "磁盘空间充足" {
		t.Errorf("ai-agent-action.summary = %v, want 磁盘空间充足", actions[0]["summary"])
	}
}

// TestAgentLoopRunsCommandAndFinishes 验证：执行命令 → 结果回填 → 模型给出总结后结束。
func TestAgentLoopRunsCommandAndFinishes(t *testing.T) {
	fake := newScriptedLLM(t, []string{
		"text:我来查看磁盘占用。|text:```ussh-action\n{\"action\":\"run\",\"cmd\":\"df -h\"}\n```",
		"text:磁盘还剩 40G，够用。",
	})
	app, recorder := newAgentTestApp(t, "tab-loop", func(data string) string {
		if !strings.Contains(data, "df -h") {
			t.Errorf("未执行预期命令：%q", data)
		}
		return "/dev/sda1 100G 60G 40G 60%"
	})

	req := newAgentRequest(fake.server.URL, "tab-loop")
	if err := app.runAgentLoop(context.Background(), req); err != nil {
		t.Fatalf("runAgentLoop 出错：%v", err)
	}
	if fake.requestCount() != 2 {
		t.Fatalf("模型调用次数 = %d, want 2（命令一轮 + 总结一轮）", fake.requestCount())
	}

	// 第二轮请求里应带上命令的输出，证明结果确实回填给了模型。
	last := fake.lastRequest()
	messages, _ := last["messages"].([]any)
	joined := ""
	for _, item := range messages {
		message, _ := item.(map[string]any)
		if content, ok := message["content"].(string); ok {
			joined += content + "\n"
		}
	}
	if !strings.Contains(joined, "/dev/sda1 100G 60G 40G 60%") {
		t.Error("命令输出未回填给模型")
	}
	if !strings.Contains(joined, "退出码 0") {
		t.Error("回填内容缺少退出码")
	}
	// 系统提示词必须注入机器上下文。
	if !strings.Contains(joined, "root@web-01") {
		t.Error("系统提示词缺少主机信息")
	}

	// 事件契约：文本流式输出、命令、结果都应发出来。
	if !recorder.has("ai-agent-text") {
		t.Error("未发出 ai-agent-text")
	}
	commands := recorder.find("ai-agent-action")
	if len(commands) != 1 {
		t.Fatalf("ai-agent-action 次数 = %d, want 1", len(commands))
	}
	if commands[0]["cmd"] != "df -h" {
		t.Errorf("ai-agent-action.cmd = %v, want df -h", commands[0]["cmd"])
	}
	if commands[0]["action"] != "run" {
		t.Errorf("ai-agent-action.action = %v, want run", commands[0]["action"])
	}
	if commands[0]["level"] != string(RiskAllow) {
		t.Errorf("df -h 应判为只读，got %v", commands[0]["level"])
	}
	results := recorder.find("ai-agent-result")
	if len(results) != 1 {
		t.Fatalf("ai-agent-result 次数 = %d, want 1", len(results))
	}
	if !numericEqual(results[0]["exitCode"], 0) {
		t.Errorf("exitCode = %v (%T), want 0", results[0]["exitCode"], results[0]["exitCode"])
	}
	if !strings.Contains(results[0]["output"].(string), "/dev/sda1") {
		t.Errorf("result.output 未包含命令输出：%v", results[0]["output"])
	}
}

// TestAgentLoopStopsAtMaxSteps 验证步数上限生效，不会无限循环。
func TestAgentLoopStopsAtMaxSteps(t *testing.T) {
	rounds := make([]string, 0, 10)
	for i := 0; i < 10; i++ {
		rounds = append(rounds, "text:继续。|text:```ussh-action\n{\"action\":\"run\",\"cmd\":\"pwd\"}\n```")
	}
	fake := newScriptedLLM(t, rounds)
	app, _ := newAgentTestApp(t, "tab-max", nil)

	req := newAgentRequest(fake.server.URL, "tab-max")
	req.Options.MaxSteps = 3
	if err := app.runAgentLoop(context.Background(), req); err != nil {
		t.Fatalf("runAgentLoop 出错：%v", err)
	}
	if got := fake.requestCount(); got != 3 {
		t.Fatalf("模型调用次数 = %d, want 3（受 MaxSteps 限制）", got)
	}
}

// TestAgentLoopDeniesInteractiveCommand 验证交互式命令被拒绝且不执行。
func TestAgentLoopDeniesInteractiveCommand(t *testing.T) {
	fake := newScriptedLLM(t, []string{
		"text:用编辑器打开看看。|text:```ussh-action\n{\"action\":\"run\",\"cmd\":\"vim /etc/hosts\"}\n```",
		"text:那我改用 cat。",
	})
	executed := false
	app, recorder := newAgentTestApp(t, "tab-deny", func(string) string {
		executed = true
		return ""
	})

	if err := app.runAgentLoop(context.Background(), newAgentRequest(fake.server.URL, "tab-deny")); err != nil {
		t.Fatalf("runAgentLoop 出错：%v", err)
	}
	if executed {
		t.Error("交互式命令不应被执行")
	}
	if denied := recorder.find("ai-agent-denied"); len(denied) != 1 {
		t.Errorf("ai-agent-denied 次数 = %d, want 1", len(denied))
	}
	if recorder.has("ai-agent-action") {
		t.Error("被拒绝的命令不应发出 ai-agent-action")
	}
	if recorder.has("ai-agent-approval") {
		t.Error("被拒绝的命令不应请求授权")
	}
	// 拒绝原因必须回传给模型。
	last := fake.lastRequest()
	messages, _ := last["messages"].([]any)
	joined := ""
	for _, item := range messages {
		message, _ := item.(map[string]any)
		if content, ok := message["content"].(string); ok {
			joined += content + "\n"
		}
	}
	if !strings.Contains(joined, "拒绝执行") {
		t.Error("拒绝原因未回传给模型")
	}
}

// TestAgentLoopRequiresApprovalForDanger 验证高危命令会阻塞等待授权。
func TestAgentLoopRequiresApprovalForDanger(t *testing.T) {
	fake := newScriptedLLM(t, []string{
		"text:清理旧日志。|text:```ussh-action\n{\"action\":\"run\",\"cmd\":\"rm -rf /tmp/old\"}\n```",
		"text:好的，跳过。",
	})
	executed := false
	app, recorder := newAgentTestApp(t, "tab-danger", func(string) string {
		executed = true
		return ""
	})

	req := newAgentRequest(fake.server.URL, "tab-danger")
	done := make(chan error, 1)
	go func() { done <- app.runAgentLoop(context.Background(), req) }()

	// 应进入等待授权状态。
	deadline := time.Now().Add(2 * time.Second)
	for {
		app.aiMu.Lock()
		_, waiting := app.agentApprovals[req.RequestID]
		app.aiMu.Unlock()
		if waiting || time.Now().After(deadline) {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	app.aiMu.Lock()
	_, waiting := app.agentApprovals[req.RequestID]
	app.aiMu.Unlock()
	if !waiting {
		t.Fatal("高危命令未进入等待授权状态")
	}

	if err := app.ResolveApproval(req.RequestID, "deny"); err != nil {
		t.Fatalf("ResolveApproval 出错：%v", err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("runAgentLoop 出错：%v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("授权后循环未退出")
	}
	approvals := recorder.find("ai-agent-approval")
	if len(approvals) != 1 {
		t.Fatalf("ai-agent-approval 次数 = %d, want 1", len(approvals))
	}
	if approvals[0]["level"] != string(RiskDanger) {
		t.Errorf("rm -rf 应判为高危，got %v", approvals[0]["level"])
	}
	if approvals[0]["command"] != "rm -rf /tmp/old" {
		t.Errorf("待授权命令不符：%v", approvals[0]["command"])
	}
	if executed {
		t.Error("被拒绝的命令不应执行")
	}
}

// TestAgentLoopAllowAllExecutesDanger 验证用户允许后高危命令确实执行。
func TestAgentLoopAllowAllExecutesDanger(t *testing.T) {
	fake := newScriptedLLM(t, []string{
		"text:清理旧日志。|text:```ussh-action\n{\"action\":\"run\",\"cmd\":\"rm -rf /tmp/old\"}\n```",
		"text:清理完成。",
	})
	var executed string
	app, _ := newAgentTestApp(t, "tab-allow", func(data string) string {
		executed = data
		return "removed"
	})

	req := newAgentRequest(fake.server.URL, "tab-allow")
	done := make(chan error, 1)
	go func() { done <- app.runAgentLoop(context.Background(), req) }()

	deadline := time.Now().Add(2 * time.Second)
	for {
		app.aiMu.Lock()
		_, waiting := app.agentApprovals[req.RequestID]
		app.aiMu.Unlock()
		if waiting || time.Now().After(deadline) {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if err := app.ResolveApproval(req.RequestID, "allow"); err != nil {
		t.Fatalf("ResolveApproval 出错：%v", err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("runAgentLoop 出错：%v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("授权后循环未退出")
	}
	if !strings.Contains(executed, "rm -rf /tmp/old") {
		t.Errorf("授权后命令未执行，executed = %q", executed)
	}
}

// TestAgentLoopFunctionCalling 验证 function calling 模式：工具调用被解析并回填 tool 消息。
func TestAgentLoopFunctionCalling(t *testing.T) {
	fake := newScriptedLLM(t, []string{
		"tool:run:df -h",
		"tool:finish:磁盘充足",
	})
	app, _ := newAgentTestApp(t, "tab-tools", func(data string) string {
		if !strings.Contains(data, "df -h") {
			t.Errorf("未执行预期命令：%q", data)
		}
		return "40G available"
	})

	req := newAgentRequest(fake.server.URL, "tab-tools")
	req.Options.UseTools = true
	if err := app.runAgentLoop(context.Background(), req); err != nil {
		t.Fatalf("runAgentLoop 出错：%v", err)
	}
	if got := fake.requestCount(); got != 2 {
		t.Fatalf("模型调用次数 = %d, want 2", got)
	}
	// 请求应声明 tools。
	if _, ok := fake.lastRequest()["tools"]; !ok {
		t.Error("function calling 模式未下发 tools 参数")
	}
	// 工具结果应以 role=tool 回填。
	messages, _ := fake.lastRequest()["messages"].([]any)
	found := false
	for _, item := range messages {
		message, _ := item.(map[string]any)
		if message["role"] == "tool" {
			found = true
			if !strings.Contains(message["content"].(string), "40G available") {
				t.Error("tool 消息内容不含命令输出")
			}
		}
	}
	if !found {
		t.Error("未找到 role=tool 的结果消息")
	}
}

// TestAgentLoopMalformedActionRetries 验证格式错误时提示模型重试而不是崩溃。
func TestAgentLoopMalformedActionRetries(t *testing.T) {
	fake := newScriptedLLM(t, []string{
		"text:```ussh-action\n{action: run}\n```",
		"text:好了。",
	})
	app, _ := newAgentTestApp(t, "tab-malformed", nil)

	req := newAgentRequest(fake.server.URL, "tab-malformed")
	if err := app.runAgentLoop(context.Background(), req); err != nil {
		t.Fatalf("runAgentLoop 出错：%v", err)
	}
	messages, _ := fake.lastRequest()["messages"].([]any)
	joined := ""
	for _, item := range messages {
		message, _ := item.(map[string]any)
		if content, ok := message["content"].(string); ok {
			joined += content + "\n"
		}
	}
	if !strings.Contains(joined, "无法解析") {
		t.Error("未把格式错误反馈给模型")
	}
}

// TestAgentLoopCancel 验证取消后循环立即退出。
func TestAgentLoopCancel(t *testing.T) {
	fake := newScriptedLLM(t, []string{
		"text:先看看。|text:```ussh-action\n{\"action\":\"run\",\"cmd\":\"sleep 10\"}\n```",
	})
	app, _ := newAgentTestApp(t, "tab-cancel", nil)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- app.runAgentLoop(ctx, newAgentRequest(fake.server.URL, "tab-cancel")) }()

	// 等命令发出后再取消。
	time.Sleep(200 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		if err != nil && !strings.Contains(err.Error(), "context canceled") {
			t.Fatalf("err = %v, want context canceled", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("取消后循环未退出")
	}
}

// TestNormalizeOptions 验证参数边界。
func TestNormalizeOptions(t *testing.T) {
	got := normalizeOptions(AgentOptions{})
	if got.MaxSteps != defaultMaxSteps {
		t.Errorf("MaxSteps = %d, want %d", got.MaxSteps, defaultMaxSteps)
	}
	if got.CommandTimeoutSec != int(defaultCommandTimeout.Seconds()) {
		t.Errorf("CommandTimeoutSec = %d, want %d", got.CommandTimeoutSec, int(defaultCommandTimeout.Seconds()))
	}
	got = normalizeOptions(AgentOptions{MaxSteps: 999, CommandTimeoutSec: 99999})
	if got.MaxSteps != maxAllowedSteps {
		t.Errorf("MaxSteps 未收敛到上限：%d", got.MaxSteps)
	}
	if got.CommandTimeoutSec != maxCommandTimeoutSec {
		t.Errorf("CommandTimeoutSec 未收敛到上限：%d", got.CommandTimeoutSec)
	}
}

// TestBuildSystemPrompt 验证系统提示词包含关键约束。
func TestBuildSystemPrompt(t *testing.T) {
	prompt := buildSystemPrompt(AgentContext{
		Host: "db-1", Username: "ops", Hostname: "db-prod-01", OS: "Ubuntu 22.04",
		Kernel: "6.8.0", Architecture: "aarch64", Shell: "/bin/bash", Cwd: "/srv/app", Uptime: "up 3 days",
	}, AgentOptions{MaxSteps: 8, CommandTimeoutSec: 30})
	for _, want := range []string{"ops@db-1", "db-prod-01", "Ubuntu 22.04", "6.8.0", "aarch64", "/bin/bash", "/srv/app", "up 3 days", "ussh-action", "8", "30"} {
		if !strings.Contains(prompt, want) {
			t.Errorf("系统提示词缺少 %q", want)
		}
	}
	toolPrompt := buildSystemPrompt(AgentContext{}, AgentOptions{UseTools: true, MaxSteps: 5, CommandTimeoutSec: 15})
	if !strings.Contains(toolPrompt, "run_command") {
		t.Error("function calling 模式的提示词应提到 run_command")
	}
}
