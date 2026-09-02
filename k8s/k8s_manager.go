package k8s

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"terminal/core"
)

// K8sManager 管理 Kubernetes 客户端连接实例生命周期。
type K8sManager struct {
	ctx     context.Context
	clients map[string]*K8sClient
	configs map[string]core.ServerConfig
	ExecMgr *K8sExecManager
	mu      sync.RWMutex
}

// NewK8sManager 创建 K8sManager 实例。
func NewK8sManager() *K8sManager {
	return &K8sManager{
		clients: make(map[string]*K8sClient),
		configs: make(map[string]core.ServerConfig),
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

	m.configs[cfg.ID] = cfg

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

// ListConnections 列出当前所有已建立连接的 Kubernetes 集群实例。
func (m *K8sManager) ListConnections() []map[string]any {
	m.mu.RLock()
	defer m.mu.RUnlock()

	list := make([]map[string]any, 0, len(m.clients))
	for id, cli := range m.clients {
		cfg := m.configs[id]
		list = append(list, map[string]any{
			"id":        id,
			"name":      cfg.Name,
			"auth_mode": cfg.K8sAuthMode,
			"context":   cfg.K8sContext,
			"target":    cli.targetInfo,
			"namespace": cfg.K8sNamespace,
		})
	}
	return list
}

// ResolveID 根据 serverID 或别名解析目标 Kubernetes 连接 ID。
func (m *K8sManager) ResolveID(idOrName string) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	trimmed := strings.TrimSpace(idOrName)
	if trimmed != "" {
		if _, ok := m.clients[trimmed]; ok {
			return trimmed, nil
		}
		for id := range m.clients {
			cfg := m.configs[id]
			if strings.EqualFold(cfg.Name, trimmed) || strings.EqualFold(cfg.K8sContext, trimmed) || strings.EqualFold(id, trimmed) {
				return id, nil
			}
		}
	}

	if len(m.clients) == 1 {
		for id := range m.clients {
			return id, nil
		}
	}
	if len(m.clients) == 0 {
		return "", errors.New("当前暂无已连接的 Kubernetes 集群，请先在界面中连接 Kubernetes 集群")
	}
	return "", fmt.Errorf("存在多个活跃的 Kubernetes 连接，请指定明确的 server_id (当前活跃连接数: %d)", len(m.clients))
}

// Disconnect 关闭并移除连接。
func (m *K8sManager) Disconnect(serverID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.configs, serverID)
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
		delete(m.configs, id)
	}
}
