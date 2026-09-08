package tools

import (
	"context"
	"sync"
)

type ActiveConnectionInfo struct {
	Protocol  string `json:"protocol"`            // ssh, redis, mysql, postgres, mongo, sqlite, docker, k8s, mqtt
	ID        string `json:"id"`                  // 连接 ID / Session ID
	Name      string `json:"name"`                // 会话/连接名称
	Host      string `json:"host,omitempty"`      // 主机地址
	Port      int    `json:"port,omitempty"`      // 端口
	Database  string `json:"database,omitempty"`  // 数据库名 / Redis DB
	Namespace string `json:"namespace,omitempty"` // K8s 命名空间
	Username  string `json:"username,omitempty"`  // 连接用户
	Path      string `json:"path,omitempty"`      // SQLite 路径
}

type activeConnContextKey struct{}

var (
	activeConnMu     sync.RWMutex
	globalActiveConn *ActiveConnectionInfo
)

func SetActiveConnection(info *ActiveConnectionInfo) {
	activeConnMu.Lock()
	defer activeConnMu.Unlock()
	globalActiveConn = info
}

func GetActiveConnection() *ActiveConnectionInfo {
	activeConnMu.RLock()
	defer activeConnMu.RUnlock()
	if globalActiveConn == nil {
		return nil
	}
	cpy := *globalActiveConn
	return &cpy
}

func WithActiveConnection(ctx context.Context, info *ActiveConnectionInfo) context.Context {
	return context.WithValue(ctx, activeConnContextKey{}, info)
}

func ActiveConnectionFromContext(ctx context.Context) *ActiveConnectionInfo {
	if ctx != nil {
		if v, ok := ctx.Value(activeConnContextKey{}).(*ActiveConnectionInfo); ok && v != nil {
			return v
		}
	}
	return GetActiveConnection()
}
