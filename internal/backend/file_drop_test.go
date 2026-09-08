package backend

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLocalUploadFilesIncludesDotfile(t *testing.T) {
	dir := t.TempDir()
	dotenv := filepath.Join(dir, ".env")
	if err := os.WriteFile(dotenv, []byte("TOKEN=<REDACTED>\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dir, "folder"), 0o755); err != nil {
		t.Fatal(err)
	}

	files := localUploadFiles([]string{dotenv, filepath.Join(dir, "folder")})
	if len(files) != 1 {
		t.Fatalf("got %d upload files, want 1", len(files))
	}
	if files[0].Path != dotenv || files[0].Name != ".env" {
		t.Fatalf("got %#v, want .env upload metadata", files[0])
	}
}

func TestLocalUploadFilesExpandsDroppedDirectory(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "project")
	nested := filepath.Join(root, "config")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nested, ".env"), []byte("TOKEN=<REDACTED>\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	files := localUploadFiles([]string{root})
	if len(files) != 1 {
		t.Fatalf("got %d upload files, want 1", len(files))
	}
	if files[0].RelativePath != "project/config/.env" {
		t.Fatalf("relative path = %q", files[0].RelativePath)
	}
}
