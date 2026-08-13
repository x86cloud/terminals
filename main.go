package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:     "xClient",
		Width:     1360,
		Height:    860,
		MinWidth:  960,
		MinHeight: 600,
		Frameless: true,
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId: "xclient-single-instance-key",
			OnSecondInstanceLaunch: func(secondInstanceData options.SecondInstanceData) {
				if app.ctx != nil {
					runtime.WindowUnminimise(app.ctx)
					runtime.Show(app.ctx)
				}
			},
		},
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 238, G: 241, B: 246, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		DragAndDrop: &options.DragAndDrop{
			// 允许从系统文件管理器拖入文件并拿到真实路径
			EnableFileDrop: true,
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			Theme:                windows.SystemDefault,
			CustomTheme: &windows.ThemeSettings{
				DarkModeTitleBar:           windows.RGB(20, 22, 25),
				DarkModeTitleBarInactive:   windows.RGB(20, 22, 25),
				DarkModeTitleText:          windows.RGB(225, 228, 234),
				DarkModeTitleTextInactive:  windows.RGB(146, 153, 166),
				DarkModeBorder:             windows.RGB(56, 60, 71),
				DarkModeBorderInactive:     windows.RGB(56, 60, 71),
				LightModeTitleBar:          windows.RGB(238, 241, 246),
				LightModeTitleBarInactive:  windows.RGB(238, 241, 246),
				LightModeTitleText:         windows.RGB(31, 39, 51),
				LightModeTitleTextInactive: windows.RGB(107, 118, 134),
				LightModeBorder:            windows.RGB(212, 219, 230),
				LightModeBorderInactive:    windows.RGB(212, 219, 230),
			},
		},
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
