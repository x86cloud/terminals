package k8s

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"
	"time"
	"terminal/core"

	"github.com/google/uuid"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"
)

// K8sTerminalSizeQueue 实现 remotecommand.TerminalSizeQueue 接口。
type K8sTerminalSizeQueue struct {
	sizeChan chan remotecommand.TerminalSize
}

// Next 获取下一个终端尺寸。
func (q *K8sTerminalSizeQueue) Next() *remotecommand.TerminalSize {
	size, ok := <-q.sizeChan
	if !ok {
		return nil
	}
	return &size
}

// Push 动态更新终端窗口大小。
func (q *K8sTerminalSizeQueue) Push(cols, rows int) {
	if cols <= 0 || rows <= 0 {
		return
	}
	select {
	case q.sizeChan <- remotecommand.TerminalSize{Width: uint16(cols), Height: uint16(rows)}:
	default:
	}
}

// K8sExecSession 维护单个 Pod 容器的交互式终端执行会话。
type K8sExecSession struct {
	id          string
	serverID    string
	namespace   string
	podName     string
	container   string
	command     string
	stdinWriter *io.PipeWriter
	sizeQueue   *K8sTerminalSizeQueue
	cancel      context.CancelFunc
	closed      bool
	closeOnce   sync.Once
	mu          sync.Mutex
}

// Write 写入终端输入数据。
func (s *K8sExecSession) Write(data string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed || s.stdinWriter == nil {
		return errors.New("终端会话已关闭")
	}
	_, err := s.stdinWriter.Write([]byte(data))
	return err
}

// Resize 调整终端行列尺寸。
func (s *K8sExecSession) Resize(cols, rows int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed || s.sizeQueue == nil {
		return nil
	}
	s.sizeQueue.Push(cols, rows)
	return nil
}

// Close 关闭终端会话并释放资源。
func (s *K8sExecSession) Close() error {
	s.closeOnce.Do(func() {
		s.mu.Lock()
		s.closed = true
		if s.stdinWriter != nil {
			_ = s.stdinWriter.Close()
		}
		if s.sizeQueue != nil {
			close(s.sizeQueue.sizeChan)
		}
		if s.cancel != nil {
			s.cancel()
		}
		s.mu.Unlock()
	})
	return nil
}

// k8sOutputWriter 将输出数据 Base64 编码后通过 Wails 事件广播给前端。
type k8sOutputWriter struct {
	sessionID string
}

func (w *k8sOutputWriter) Write(p []byte) (n int, err error) {
	if len(p) > 0 {
		payload := base64.StdEncoding.EncodeToString(p)
		core.EmitEvent("k8s:terminal:data:"+w.sessionID, payload)
	}
	return len(p), nil
}

// K8sExecManager 管理全局 Kubernetes 容器终端会话。
type K8sExecManager struct {
	sessions map[string]*K8sExecSession
	mu       sync.RWMutex
}

// NewK8sExecManager 创建 K8sExecManager。
func NewK8sExecManager() *K8sExecManager {
	return &K8sExecManager{
		sessions: make(map[string]*K8sExecSession),
	}
}

// StartExec 启动一个容器交互终端会话。
func (m *K8sExecManager) StartExec(k8sCli *K8sClient, namespace, podName, container, command string, cols, rows int) (string, error) {
	if k8sCli == nil {
		return "", errors.New("Kubernetes 客户端未连接")
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

	execID := uuid.New().String()

	stdinReader, stdinWriter := io.Pipe()
	sizeQueue := &K8sTerminalSizeQueue{
		sizeChan: make(chan remotecommand.TerminalSize, 10),
	}
	sizeQueue.Push(cols, rows)

	ctx, cancel := context.WithCancel(context.Background())

	session := &K8sExecSession{
		id:          execID,
		serverID:    k8sCli.cfg.ID,
		namespace:   namespace,
		podName:     podName,
		container:   container,
		command:     command,
		stdinWriter: stdinWriter,
		sizeQueue:   sizeQueue,
		cancel:      cancel,
	}

	m.mu.Lock()
	m.sessions[execID] = session
	m.mu.Unlock()

	req := k8sCli.Clientset().CoreV1().RESTClient().Post().
		Resource("pods").
		Name(podName).
		Namespace(namespace).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: container,
			Command:   []string{command},
			Stdin:     true,
			Stdout:    true,
			Stderr:    true,
			TTY:       true,
		}, scheme.ParameterCodec)

	executor, err := remotecommand.NewSPDYExecutor(k8sCli.RestConfig(), "POST", req.URL())
	if err != nil {
		session.Close()
		m.remove(execID)
		return "", fmt.Errorf("创建远程执行 SPDY Executor 失败: %w", err)
	}

	go func() {
		defer func() {
			session.Close()
			m.remove(execID)
			core.EmitEvent("k8s:terminal:closed:"+execID, "容器会话已退出")
		}()

		// 给予前端 IPC 返回与事件订阅挂载一个微小准备窗口，避免初始 prompt 丢失
		time.Sleep(50 * time.Millisecond)

		outWriter := &k8sOutputWriter{sessionID: execID}
		streamErr := executor.StreamWithContext(ctx, remotecommand.StreamOptions{
			Stdin:             stdinReader,
			Stdout:            outWriter,
			Stderr:            outWriter,
			Tty:               true,
			TerminalSizeQueue: sizeQueue,
		})
		if streamErr != nil && !errors.Is(streamErr, context.Canceled) {
			errMsg := fmt.Sprintf("\r\n[终端错误: %v]\r\n", streamErr)
			outWriter.Write([]byte(errMsg))
		}
	}()

	return execID, nil
}

// Write 发送输入数据到指定终端会话。
func (m *K8sExecManager) Write(execID string, data string) error {
	m.mu.RLock()
	s, ok := m.sessions[execID]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("终端会话不存在或已断开: %s", execID)
	}
	return s.Write(data)
}

// Resize 调整指定终端会话尺寸。
func (m *K8sExecManager) Resize(execID string, cols, rows int) error {
	m.mu.RLock()
	s, ok := m.sessions[execID]
	m.mu.RUnlock()
	if !ok {
		return nil
	}
	return s.Resize(cols, rows)
}

// Close 关闭并注销终端会话。
func (m *K8sExecManager) Close(execID string) error {
	m.mu.Lock()
	s, ok := m.sessions[execID]
	delete(m.sessions, execID)
	m.mu.Unlock()
	if ok && s != nil {
		return s.Close()
	}
	return nil
}

func (m *K8sExecManager) remove(execID string) {
	m.mu.Lock()
	delete(m.sessions, execID)
	m.mu.Unlock()
}

// CloseAll 关闭所有活动终端会话。
func (m *K8sExecManager) CloseAll() {
	m.mu.Lock()
	sessions := make([]*K8sExecSession, 0, len(m.sessions))
	for _, s := range m.sessions {
		sessions = append(sessions, s)
	}
	m.sessions = make(map[string]*K8sExecSession)
	m.mu.Unlock()

	for _, s := range sessions {
		_ = s.Close()
	}
}
