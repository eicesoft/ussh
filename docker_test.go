package main

import (
	"strings"
	"testing"
)

func TestLimitRemoteCommandOutput(t *testing.T) {
	output := limitRemoteCommandOutput(strings.Repeat("x", maxRemoteCommandOutput+100))
	if len(output) > maxRemoteCommandOutput+len("\n...(输出已截断)...\n") {
		t.Fatalf("output was not bounded: %d", len(output))
	}
	if !strings.Contains(output, "输出已截断") {
		t.Fatal("truncation marker is missing")
	}
}

func TestExecRemoteCommandValidation(t *testing.T) {
	app := NewApp()
	tests := []struct {
		name    string
		tabID   string
		command string
	}{
		{name: "missing tab", command: "docker ps"},
		{name: "missing command", tabID: "tab-1"},
		{name: "nul byte", tabID: "tab-1", command: "docker\x00ps"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := app.ExecRemoteCommand(test.tabID, test.command, 1); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}
