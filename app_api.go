package main

import (
	"terminal/proto"
)

// ---------- HTTP API & WebSocket 调试 ----------

func (a *App) ApiRequest(req proto.ApiRequest) (proto.ApiResponse, error) {
	return proto.HttpApiRequest(req)
}

func (a *App) WsConnect(req proto.WsConnectRequest) (proto.WsConnectResult, error) {
	return a.wsMgr.WsConnect(req)
}

func (a *App) WsSend(id string, message string) error {
	return a.wsMgr.WsSend(id, message)
}

func (a *App) WsClose(id string) {
	a.wsMgr.WsClose(id)
}
