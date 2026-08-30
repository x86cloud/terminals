package docker

import (
	"context"
	"fmt"
	"sync"
	"terminal/core"
)

// DockerManager 管理 Docker 客户端连接生命周期。
type DockerManager struct {
	ctx     context.Context
	clients map[string]*DockerClient
	mu      sync.RWMutex
}

// NewDockerManager 创建 DockerManager 实例。
func NewDockerManager() *DockerManager {
	return &DockerManager{
		clients: make(map[string]*DockerClient),
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

// Disconnect 关闭并移除连接。
func (m *DockerManager) Disconnect(serverID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

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
	}
}
