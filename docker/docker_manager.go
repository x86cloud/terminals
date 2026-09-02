package docker

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"terminal/core"
)

// DockerManager 管理 Docker 客户端连接生命周期。
type DockerManager struct {
	ctx     context.Context
	clients map[string]*DockerClient
	configs map[string]core.ServerConfig
	mu      sync.RWMutex
}

// NewDockerManager 创建 DockerManager 实例。
func NewDockerManager() *DockerManager {
	return &DockerManager{
		clients: make(map[string]*DockerClient),
		configs: make(map[string]core.ServerConfig),
	}
}

// SetContext 设置上下文。
func (m *DockerManager) SetContext(ctx context.Context) {
	m.ctx = ctx
}

// Connect 建立或复用指定 serverID 的 Docker 连接。
func (m *DockerManager) Connect(cfg core.ServerConfig) (*DockerClient, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.configs[cfg.ID] = cfg

	if existing, ok := m.clients[cfg.ID]; ok && !existing.closed {
		return existing, nil
	}

	cli, err := NewDockerClient(cfg)
	if err != nil {
		return nil, err
	}

	m.clients[cfg.ID] = cli
	return cli, nil
}

// GetClient 获取已连接的客户端。
func (m *DockerManager) GetClient(serverID string) (*DockerClient, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	cli, ok := m.clients[serverID]
	if !ok || cli.closed {
		return nil, fmt.Errorf("Docker 未连接或连接已断开: %s", serverID)
	}
	return cli, nil
}

// ListConnections 列出当前所有已建立连接的 Docker 实例与端点信息。
func (m *DockerManager) ListConnections() []map[string]any {
	m.mu.RLock()
	defer m.mu.RUnlock()

	list := make([]map[string]any, 0, len(m.clients))
	for id, cli := range m.clients {
		if cli.closed {
			continue
		}
		cfg := m.configs[id]
		list = append(list, map[string]any{
			"id":            id,
			"name":          cfg.Name,
			"endpoint_type": cfg.DockerEndpointType,
			"target":        cli.targetInfo,
			"host":          cfg.Host,
			"port":          cfg.Port,
		})
	}
	return list
}

// ResolveID 根据 serverID 或别名解析目标 Docker 连接 ID。
func (m *DockerManager) ResolveID(idOrName string) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	trimmed := strings.TrimSpace(idOrName)
	if trimmed != "" {
		if cli, ok := m.clients[trimmed]; ok && !cli.closed {
			return trimmed, nil
		}
		for id, cli := range m.clients {
			if cli.closed {
				continue
			}
			cfg := m.configs[id]
			if strings.EqualFold(cfg.Name, trimmed) || strings.EqualFold(cfg.Host, trimmed) || strings.EqualFold(id, trimmed) {
				return id, nil
			}
		}
	}

	var activeIDs []string
	for id, cli := range m.clients {
		if !cli.closed {
			activeIDs = append(activeIDs, id)
		}
	}

	if len(activeIDs) == 1 {
		return activeIDs[0], nil
	}
	if len(activeIDs) == 0 {
		return "", errors.New("当前暂无已连接的 Docker 实例，请先在界面中连接 Docker 实例")
	}
	return "", fmt.Errorf("存在多个活跃的 Docker 连接，请指定明确的 server_id (当前活跃连接数: %d)", len(activeIDs))
}

// Disconnect 关闭并移除连接。
func (m *DockerManager) Disconnect(serverID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.configs, serverID)
	if cli, ok := m.clients[serverID]; ok {
		delete(m.clients, serverID)
		return cli.Close()
	}
	return nil
}

// CloseAll 关闭所有活动连接。
func (m *DockerManager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, cli := range m.clients {
		_ = cli.Close()
		delete(m.clients, id)
		delete(m.configs, id)
	}
}
