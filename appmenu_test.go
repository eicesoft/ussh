package main

import (
	"testing"

	"github.com/wailsapp/wails/v2/pkg/menu"
)

func TestBuildApplicationMenuIncludesEditMenu(t *testing.T) {
	applicationMenu := buildApplicationMenu(NewApp())

	for _, item := range applicationMenu.Items {
		if item.Role == menu.EditMenuRole {
			return
		}
	}

	t.Fatal("application menu does not include the standard Edit menu")
}
