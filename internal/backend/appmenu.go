package backend

import (
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

func BuildApplicationMenu(app *App) *menu.Menu {
	applicationMenu := menu.NewMenu()
	softwareMenu := applicationMenu.AddSubmenu("uSSH")
	softwareMenu.AddText("关于 uSSH", nil, func(_ *menu.CallbackData) {
		if app.ctx != nil {
			runtime.EventsEmit(app.ctx, "show-about")
		}
	})
	softwareMenu.AddText("设置", keys.CmdOrCtrl(","), func(_ *menu.CallbackData) {
		if app.ctx != nil {
			runtime.EventsEmit(app.ctx, "show-settings")
		}
	})
	softwareMenu.AddSeparator()
	softwareMenu.AddText("退出", nil, func(_ *menu.CallbackData) {
		if app.ctx != nil {
			runtime.Quit(app.ctx)
		}
	})
	applicationMenu.Append(menu.EditMenu())
	return applicationMenu
}
