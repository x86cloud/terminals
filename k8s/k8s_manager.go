package k8s

import (
	"context"
	"fmt"
	"sync"
	"terminal/core"
)

// K8sManager 管理 Kubernetes 客户端连接实例生命周期。
type K8sManager struct {
	ctx     context.Context
	clients map[string]*K8sClient
	ExecMgr *K8sExecManager
	mu      sync.RWMutex
}

// NewK8sManager 创建 K8sManager 实例。
func NewK8sManager() *K8sManager {
	return &K8sManager{
		clients: make(map[string]*K8sClient),
		ExecMgr: NewK8sExecManager(),
	}
}

// SetContext 设置上下文。
func (m *K8sManager) SetContext(ctx context.Context) {
	m.ctx = ctx
}

// Connect 建立或复用指定 serverID 的 K8s 连接。
func (m *K8sManager) Connect(cfg core.ServerConfig) (*K8sClient, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if existing, ok := m.clients[cfg.ID]; ok {
		return existing, nil
	}

	cli, err := NewK8sClient(cfg)
	if err != nil {
		return nil, err
	}

	m.clients[cfg.ID] = cli
	return cli, nil
}

// GetClient 获取已连接的客户端。
func (m *K8sManager) GetClient(serverID string) (*K8sClient, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	cli, ok := m.clients[serverID]
	if !ok {
		return nil, fmt.Errorf("Kubernetes 未连接或连接已断开: %s", serverID)
	}
	return cli, nil
}

// Disconnect 关闭并移除连接。
func (m *K8sManager) Disconnect(serverID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if cli, ok := m.clients[serverID]; ok {
		delete(m.clients, serverID)
		return cli.Close()
	}
	return nil
}

// CloseAll 关闭所有活动连接及终端会话。
func (m *K8sManager) CloseAll() {
	if m.ExecMgr != nil {
		m.ExecMgr.CloseAll()
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	for id, cli := range m.clients {
		_ = cli.Close()
		delete(m.clients, id)
	}
}
