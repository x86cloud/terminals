package services

import (
	"context"
	"sync"
	"terminal/agent"
	"terminal/core"
	"terminal/db"
	"terminal/mongo"
	"terminal/proto"
	"terminal/redis"
	"terminal/ssh"
)

type Container struct {
	Store     *core.Store
	Sessions  *ssh.SessionManager
	Transfers *ssh.TransferManager
	RedisMgr  *redis.RedisManager
	MqttMgr   *proto.MqttManager
	MongoMgr  *mongo.MongoManager
	WsMgr     *proto.WsManager
	MysqlMgr  *db.MysqlManagerEx
	SqliteMgr *db.SqliteManager
}

var (
	GlobalContainer *Container
	once            sync.Once
)

func GetContainer() *Container {
	once.Do(func() {
		store, err := core.NewStore()
		if err != nil {
			store = &core.Store{}
		}
		GlobalContainer = &Container{
			Store:     store,
			Sessions:  ssh.NewSessionManager(),
			Transfers: ssh.NewTransferManager(),
			RedisMgr:  redis.NewRedisManager(),
			MqttMgr:   proto.NewMqttManager(),
			MongoMgr:  mongo.NewMongoManager(),
			WsMgr:     proto.NewWsManager(),
			MysqlMgr:  db.NewMysqlManagerEx(),
			SqliteMgr: db.NewSqliteManager(),
		}
	})
	return GlobalContainer
}

func (c *Container) Startup(ctx context.Context) {
	c.Sessions.SetContext(ctx)
	c.Transfers.SetContext(ctx)
	c.MqttMgr.SetContext(ctx)
	c.WsMgr.SetContext(ctx)
	c.MongoMgr.SetContext(ctx)
	c.SqliteMgr.SetContext(ctx)
	c.MysqlMgr.SetContext(ctx)
	agent.DefaultManager.SetContext(ctx)
	agent.DefaultRuntime.SetManagers(c.Sessions, c.RedisMgr, c.MysqlMgr, c.MongoMgr, c.SqliteMgr, c.MqttMgr)

	if c.Store != nil {
		settings := c.Store.GetSettings()
		_ = agent.DefaultRuntime.InitOrUpdate(settings)
	}
}

func (c *Container) Shutdown(ctx context.Context) {
	c.Sessions.CloseAll()
	c.RedisMgr.CloseAll()
	c.MysqlMgr.CloseAll()
	c.MqttMgr.CloseAll()
	c.MongoMgr.CloseAll()
	c.SqliteMgr.CloseAll()
	c.WsMgr.CloseAll()
}
