package main

import (
	"context"
	"errors"

	"terminal/agent"
	"terminal/core"
	"terminal/db"
	"terminal/mongo"
	"terminal/proto"
	"terminal/redis"
	"terminal/ssh"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App 是绑定给前端的应用门面。
type App struct {
	ctx       context.Context
	store     *core.Store
	sessions  *ssh.SessionManager
	transfers *ssh.TransferManager
	redisMgr  *redis.RedisManager
	mqttMgr   *proto.MqttManager
	mongoMgr  *mongo.MongoManager
	wsMgr     *proto.WsManager
	mysqlMgr  *db.MysqlManagerEx
}

func NewApp() *App {
	store, err := core.NewStore()
	if err != nil {
		store = &core.Store{}
	}
	return &App{
		store:     store,
		sessions:  ssh.NewSessionManager(),
		transfers: ssh.NewTransferManager(),
		redisMgr:  redis.NewRedisManager(),
		mqttMgr:   proto.NewMqttManager(),
		mongoMgr:  mongo.NewMongoManager(),
		wsMgr:     proto.NewWsManager(),
		mysqlMgr:  db.NewMysqlManagerEx(),
	}
}

func (a *App) applyNativeWindowTheme(themeMode string) {
	if a.ctx == nil {
		return
	}
	switch themeMode {
	case "dark":
		wruntime.WindowSetDarkTheme(a.ctx)
	case "light":
		wruntime.WindowSetLightTheme(a.ctx)
	default:
		wruntime.WindowSetSystemDefaultTheme(a.ctx)
	}
}

func (a *App) SetNativeTheme(themeMode string) {
	a.applyNativeWindowTheme(themeMode)
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.sessions.SetContext(ctx)
	a.transfers.SetContext(ctx)
	a.mqttMgr.SetContext(ctx)
	a.wsMgr.SetContext(ctx)
	a.mongoMgr.SetContext(ctx)
	db.SqliteMgr.SetContext(ctx)
	a.mysqlMgr.SetContext(ctx)
	agent.DefaultManager.SetContext(ctx)

	if a.store != nil {
		settings := a.store.GetSettings()
		a.applyNativeWindowTheme(settings.ThemeMode)
	}
}

func (a *App) shutdown(ctx context.Context) {
	a.sessions.CloseAll()
	a.redisMgr.CloseAll()
	a.mysqlMgr.CloseAll()
	a.mqttMgr.CloseAll()
	a.mongoMgr.CloseAll()
	db.SqliteMgr.CloseAll()
	a.wsMgr.CloseAll()
}

// ---------- 服务器配置 ----------

func (a *App) ListServers() []core.ServerConfig {
	if a.store == nil {
		return []core.ServerConfig{}
	}
	return a.store.List()
}

func (a *App) SaveServer(cfg core.ServerConfig) (core.ServerConfig, error) {
	if a.store == nil {
		return core.ServerConfig{}, errors.New("配置存储不可用")
	}
	return a.store.Save(cfg)
}

func (a *App) DeleteServer(id string) error {
	if a.store == nil {
		return errors.New("配置存储不可用")
	}
	return a.store.Delete(id)
}

// ---------- 设置持久化 ----------

func (a *App) GetAppSettings() core.AppSettings {
	if a.store == nil {
		return core.DefaultAppSettings()
	}
	return a.store.GetSettings()
}

func (a *App) SaveAppSettings(settings core.AppSettings) (core.AppSettings, error) {
	if a.store == nil {
		return settings, errors.New("配置存储不可用")
	}
	res, err := a.store.SaveSettings(settings)
	if err == nil {
		a.applyNativeWindowTheme(settings.ThemeMode)
	}
	return res, err
}

// ---------- 分组管理 ----------

func (a *App) ListGroups() []core.ServerGroup {
	if a.store == nil {
		return []core.ServerGroup{}
	}
	return a.store.ListGroups()
}

func (a *App) SaveGroup(g core.ServerGroup) (core.ServerGroup, error) {
	if a.store == nil {
		return core.ServerGroup{}, errors.New("配置存储不可用")
	}
	return a.store.SaveGroup(g)
}

func (a *App) DeleteGroup(id string) error {
	if a.store == nil {
		return errors.New("配置存储不可用")
	}
	return a.store.DeleteGroup(id)
}

func (a *App) MoveServerToGroup(serverID, groupID string) error {
	if a.store == nil {
		return errors.New("配置存储不可用")
	}
	return a.store.MoveServerToGroup(serverID, groupID)
}

// SelectPrivateKey 打开文件选择框以挑选私钥文件。
func (a *App) SelectPrivateKey() (string, error) {
	return wruntime.OpenFileDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "选择 SSH 私钥文件",
	})
}
