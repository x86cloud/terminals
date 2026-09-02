package services

import (
	"context"
	"sync"
	"terminal/agent"
	"terminal/core"
	"terminal/db"
	"terminal/docker"
	"terminal/k8s"
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
	MysqlMgr    *db.MysqlManagerEx
	PostgresMgr *db.PostgresManager
	SqliteMgr   *db.SqliteManager
	DockerMgr   *docker.DockerManager
	K8sMgr      *k8s.K8sManager
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
			Store:       store,
			Sessions:    ssh.NewSessionManager(),
			Transfers:   ssh.NewTransferManager(),
			RedisMgr:    redis.NewRedisManager(),
			MqttMgr:     proto.NewMqttManager(),
			MongoMgr:    mongo.NewMongoManager(),
			WsMgr:       proto.NewWsManager(),
			MysqlMgr:    db.NewMysqlManagerEx(),
			PostgresMgr: db.NewPostgresManager(),
			SqliteMgr:   db.NewSqliteManager(),
			DockerMgr:   docker.NewDockerManager(),
			K8sMgr:      k8s.NewK8sManager(),
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
	c.DockerMgr.SetContext(ctx)
	c.K8sMgr.SetContext(ctx)
	agent.DefaultManager.SetContext(ctx)
	agent.DefaultRuntime.SetManagers(c.Sessions, c.RedisMgr, c.MysqlMgr, c.PostgresMgr, c.MongoMgr, c.SqliteMgr, c.MqttMgr, c.DockerMgr, c.K8sMgr)

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
	c.DockerMgr.CloseAll()
	c.K8sMgr.CloseAll()
}
