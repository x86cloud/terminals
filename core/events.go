package core

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

// EmitEvent 向前端分发全局事件
func EmitEvent(eventName string, data any) {
	app := application.Get()
	if app != nil {
		app.Event.Emit(eventName, data)
	}
}
