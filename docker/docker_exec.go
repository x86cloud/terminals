package docker

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"strings"
	"sync"
	"terminal/core"

	"github.com/docker/docker/api/types/container"
	"github.com/google/uuid"
)

// DockerExecSession 维护单个 Docker 容器的交互式 TTY 终端执行会话。
type DockerExecSession struct {
	id          string
	serverID    string
	containerID string
	execID      string
	conn        net.Conn
	cancel      context.CancelFunc
	closed      bool
	closeOnce   sync.Once
	mu          sync.Mutex
}

// Write 写入用户输入的终端字符数据。
func (s *DockerExecSession) Write(data string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed || s.conn == nil {
		return errors.New("终端会话已关闭")
	}
	_, err := s.conn.Write([]byte(data))
	return err
}

// Close 关闭终端会话并释放连接与上下文。
func (s *DockerExecSession) Close() error {
	s.closeOnce.Do(func() {
		s.mu.Lock()
		s.closed = true
		if s.conn != nil {
			_ = s.conn.Close()
		}
		if s.cancel != nil {
			s.cancel()
		}
		s.mu.Unlock()
	})
	return nil
}

// DockerExecManager 管理全局 Docker 容器终端交互会话。
type DockerExecManager struct {
	sessions map[string]*DockerExecSession
	mu       sync.RWMutex
}

// NewDockerExecManager 创建 DockerExecManager。
func NewDockerExecManager() *DockerExecManager {
	return &DockerExecManager{
		sessions: make(map[string]*DockerExecSession),
	}
}

// StartExec 启动一个容器交互终端会话。
func (m *DockerExecManager) StartExec(dockerCli *DockerClient, containerID, command string, cols, rows int) (string, error) {
	if dockerCli == nil || dockerCli.cli == nil {
		return "", errors.New("Docker 客户端未连接")
	}
	if strings.TrimSpace(command) == "" {
		command = "/bin/sh"
	}
	if cols <= 0 {
		cols = 120
	}
	if rows <= 0 {
		rows = 32
	}

	ctx, cancel := context.WithCancel(context.Background())

	// 1. 创建 Exec 任务（开启 Tty 与输入输出流）
	execConfig := container.ExecOptions{
		AttachStdin:  true,
		AttachStdout: true,
		AttachStderr: true,
		Tty:          true,
		Cmd:          []string{command},
	}

	execCreateResp, err := dockerCli.cli.ContainerExecCreate(ctx, containerID, execConfig)
	if err != nil {
		cancel()
		return "", fmt.Errorf("创建容器 Exec 任务失败: %w", err)
	}

	// 2. 附加并建立流通道
	attachResp, err := dockerCli.cli.ContainerExecAttach(ctx, execCreateResp.ID, container.ExecAttachOptions{
		Tty: true,
	})
	if err != nil {
		cancel()
		return "", fmt.Errorf("附加容器终端流失败: %w", err)
	}

	// 3. 初始尺寸设定
	_ = dockerCli.cli.ContainerExecResize(ctx, execCreateResp.ID, container.ResizeOptions{
		Height: uint(rows),
		Width:  uint(cols),
	})

	sessionID := uuid.New().String()
	session := &DockerExecSession{
		id:          sessionID,
		serverID:    dockerCli.cfg.ID,
		containerID: containerID,
		execID:      execCreateResp.ID,
		conn:        attachResp.Conn,
		cancel:      cancel,
	}

	m.mu.Lock()
	m.sessions[sessionID] = session
	m.mu.Unlock()

	// 4. 后台循环读取容器 TTY 输出并通过 Wails 事件广播给前端
	go func() {
		defer func() {
			session.Close()
			m.remove(sessionID)
			core.EmitEvent("docker:terminal:closed:"+sessionID, "容器会话已退出")
		}()

		buf := make([]byte, 4096)
		for {
			n, err := attachResp.Reader.Read(buf)
			if n > 0 {
				payload := base64.StdEncoding.EncodeToString(buf[:n])
				core.EmitEvent("docker:terminal:data:"+sessionID, payload)
			}
			if err != nil {
				break
			}
		}
	}()

	return sessionID, nil
}

// Write 写入终端输入数据。
func (m *DockerExecManager) Write(sessionID, data string) error {
	m.mu.RLock()
	s, ok := m.sessions[sessionID]
	m.mu.RUnlock()
	if !ok {
		return errors.New("会话不存在或已关闭")
	}
	return s.Write(data)
}

// Resize 调整终端行列尺寸。
func (m *DockerExecManager) Resize(dockerCli *DockerClient, sessionID string, cols, rows int) error {
	m.mu.RLock()
	s, ok := m.sessions[sessionID]
	m.mu.RUnlock()
	if !ok {
		return errors.New("会话不存在")
	}
	if dockerCli == nil || dockerCli.cli == nil || s.execID == "" {
		return nil
	}
	if cols <= 0 || rows <= 0 {
		return nil
	}
	return dockerCli.cli.ContainerExecResize(context.Background(), s.execID, container.ResizeOptions{
		Height: uint(rows),
		Width:  uint(cols),
	})
}

// Close 关闭指定终端会话。
func (m *DockerExecManager) Close(sessionID string) error {
	m.mu.RLock()
	s, ok := m.sessions[sessionID]
	m.mu.RUnlock()
	if !ok {
		return nil
	}
	return s.Close()
}

func (m *DockerExecManager) remove(sessionID string) {
	m.mu.Lock()
	delete(m.sessions, sessionID)
	m.mu.Unlock()
}

// CloseAll 关闭所有终端会话。
func (m *DockerExecManager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, s := range m.sessions {
		_ = s.Close()
		delete(m.sessions, id)
	}
}
