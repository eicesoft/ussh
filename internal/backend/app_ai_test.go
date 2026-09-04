package backend

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStreamAIChatReadsSSEAndForwardsRequest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if r.URL.Path != "/chat/completions" {
			t.Errorf("path = %s, want /chat/completions", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer secret" {
			t.Errorf("authorization = %q, want Bearer secret", got)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = fmt.Fprint(w,
			"data: {\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\n",
			"data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n",
			"data: [DONE]\n\n",
		)
	}))
	defer server.Close()

	var output strings.Builder
	err := streamAIChat(
		context.Background(),
		server.URL,
		"secret",
		"demo",
		[]AIChatMessage{{Role: "user", Content: "say hello"}},
		func(token string) { _, _ = output.WriteString(token) },
	)
	if err != nil {
		t.Fatalf("streamAIChat() error = %v", err)
	}
	if got := output.String(); got != "hello world" {
		t.Fatalf("output = %q, want hello world", got)
	}
}
