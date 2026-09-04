// Package backend contains uSSH's application logic.
//
// The package is split by responsibility: app.go owns SSH terminal sessions and
// AI chat streaming; storage.go persists saved connections and credentials;
// sftp.go and docker.go implement remote capabilities; agent*.go implements the
// AI agent. The root main package is intentionally limited to Wails setup and
// a small binding adapter so the frontend continues to use main.App.
package backend
