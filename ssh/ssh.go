package ssh

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"terminal/core"

	"github.com/google/uuid"
	"github.com/pkg/sftp"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	golangssh "golang.org/x/crypto/ssh"
)

// SessionInfo 是暴露给前端的会话摘要。
type SessionInfo struct {
	ID        string `json:"id"`
	ServerID  string `json:"serverId"`
	Title     string `json:"title"`
	Host      string `json:"host"`
	Port      int    `json:"port"`
	Username  string `json:"username"`
	Connected bool   `json:"connected"`
	HomeDir   string `json:"homeDir"`
}

// Session 表示一条已建立的 SSH 连接（终端 + SFTP 复用同一 client）。
type Session struct {
	id     string
	cfg    core.ServerConfig
	client *golangssh.Client

	shellMu sync.Mutex
	shell   *golangssh.Session
	stdin   io.WriteCloser

	sftpMu     sync.Mutex
	sftpClient *sftp.Client

	homeDir string

	closeOnce sync.Once
	done      chan struct{}
}

func (s *Session) Info() SessionInfo {
	return SessionInfo{
		ID:        s.id,
		ServerID:  s.cfg.ID,
		Title:     s.cfg.Label(),
		Host:      s.cfg.Host,
		Port:      s.cfg.Port,
		Username:  s.cfg.Username,
		Connected: !s.isClosed(),
		HomeDir:   s.homeDir,
	}
}

func (s *Session) isClosed() bool {
	select {
	case <-s.done:
		return true
	default:
		return false
	}
}

// sftpConn 惰性创建 SFTP 子系统连接。
func (s *Session) sftpConn() (*sftp.Client, error) {
	s.sftpMu.Lock()
	defer s.sftpMu.Unlock()
	if s.sftpClient != nil {
		return s.sftpClient, nil
	}
	if s.isClosed() {
		return nil, errors.New("会话已断开")
	}
	client, err := sftp.NewClient(s.client, sftp.MaxConcurrentRequestsPerFile(16))
	if err != nil {
		return nil, fmt.Errorf("打开 SFTP 通道失败: %w", err)
	}
	s.sftpClient = client
	return client, nil
}

func (s *Session) close() {
	s.closeOnce.Do(func() {
		close(s.done)
		s.sftpMu.Lock()
		if s.sftpClient != nil {
			_ = s.sftpClient.Close()
			s.sftpClient = nil
		}
		s.sftpMu.Unlock()

		s.shellMu.Lock()
		if s.stdin != nil {
			_ = s.stdin.Close()
		}
		if s.shell != nil {
			_ = s.shell.Close()
		}
		s.shellMu.Unlock()

		if s.client != nil {
			_ = s.client.Close()
		}
	})
}

// SessionManager 管理所有活动会话。
type SessionManager struct {
	mu       sync.RWMutex
	sessions map[string]*Session
	ctx      context.Context
}

func NewSessionManager() *SessionManager {
	return &SessionManager{sessions: make(map[string]*Session)}
}

func (m *SessionManager) SetContext(ctx context.Context) {
	m.ctx = ctx
}

func (m *SessionManager) Get(id string) (*Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.sessions[id]
	if !ok {
		return nil, fmt.Errorf("会话不存在: %s", id)
	}
	if s.isClosed() {
		return nil, errors.New("会话已断开，请重新连接")
	}
	return s, nil
}

func (m *SessionManager) List() []SessionInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]SessionInfo, 0, len(m.sessions))
	for _, s := range m.sessions {
		out = append(out, s.Info())
	}
	return out
}

func (m *SessionManager) Remove(id string) {
	m.mu.Lock()
	s := m.sessions[id]
	delete(m.sessions, id)
	m.mu.Unlock()
	if s != nil {
		s.close()
	}
}

func (m *SessionManager) CloseAll() {
	m.mu.Lock()
	all := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		all = append(all, s)
	}
	m.sessions = make(map[string]*Session)
	m.mu.Unlock()
	for _, s := range all {
		s.close()
	}
}

func buildAuthMethods(cfg core.ServerConfig) ([]golangssh.AuthMethod, error) {
	var methods []golangssh.AuthMethod

	if cfg.AuthType == "key" {
		keyData, err := readPrivateKey(cfg.PrivateKey)
		if err != nil {
			return nil, err
		}
		var signer golangssh.Signer
		if strings.TrimSpace(cfg.Passphrase) != "" {
			signer, err = golangssh.ParsePrivateKeyWithPassphrase(keyData, []byte(cfg.Passphrase))
		} else {
			signer, err = golangssh.ParsePrivateKey(keyData)
		}
		if err != nil {
			return nil, fmt.Errorf("解析私钥失败: %w", err)
		}
		methods = append(methods, golangssh.PublicKeys(signer))
	}

	if cfg.Password != "" {
		methods = append(methods, golangssh.Password(cfg.Password))
		methods = append(methods, golangssh.KeyboardInteractive(
			func(user, instruction string, questions []string, echos []bool) ([]string, error) {
				answers := make([]string, len(questions))
				for i := range questions {
					answers[i] = cfg.Password
				}
				return answers, nil
			}))
	}

	if len(methods) == 0 {
		return nil, errors.New("缺少认证信息：请填写密码或选择私钥")
	}
	return methods, nil
}

func readPrivateKey(value string) ([]byte, error) {
	trimmed := strings.TrimSpace(value)
	if strings.Contains(trimmed, "PRIVATE KEY") {
		return []byte(trimmed), nil
	}
	data, err := os.ReadFile(trimmed)
	if err != nil {
		return nil, fmt.Errorf("读取私钥文件失败: %w", err)
	}
	return data, nil
}

// Connect 建立 SSH 连接并启动交互式 shell。
func (m *SessionManager) Connect(cfg core.ServerConfig, cols, rows int) (SessionInfo, error) {
	if err := cfg.Validate(); err != nil {
		return SessionInfo{}, err
	}
	auths, err := buildAuthMethods(cfg)
	if err != nil {
		return SessionInfo{}, err
	}

	clientCfg := &golangssh.ClientConfig{
		User: cfg.Username,
		Auth: auths,
		// 桌面客户端场景下不做 known_hosts 校验，避免首次连接失败。
		HostKeyCallback: golangssh.InsecureIgnoreHostKey(),
		Timeout:         15 * time.Second,
	}

	conn, err := net.DialTimeout("tcp", cfg.Addr(), 15*time.Second)
	if err != nil {
		return SessionInfo{}, fmt.Errorf("连接 %s 失败: %w", cfg.Addr(), err)
	}
	c, chans, reqs, err := golangssh.NewClientConn(conn, cfg.Addr(), clientCfg)
	if err != nil {
		_ = conn.Close()
		return SessionInfo{}, fmt.Errorf("SSH 握手失败: %w", err)
	}
	client := golangssh.NewClient(c, chans, reqs)

	session := &Session{
		id:     uuid.NewString(),
		cfg:    cfg,
		client: client,
		done:   make(chan struct{}),
	}

	if err := m.startShell(session, cols, rows); err != nil {
		session.close()
		return SessionInfo{}, err
	}

	session.homeDir = m.detectHome(session)

	m.mu.Lock()
	m.sessions[session.id] = session
	m.mu.Unlock()

	go m.keepAlive(session)

	return session.Info(), nil
}

func (m *SessionManager) detectHome(s *Session) string {
	if client, err := s.sftpConn(); err == nil {
		if wd, err := client.Getwd(); err == nil && wd != "" {
			return wd
		}
	}
	return "/"
}

func (m *SessionManager) keepAlive(s *Session) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-s.done:
			return
		case <-ticker.C:
			if _, _, err := s.client.SendRequest("keepalive@openssh.com", true, nil); err != nil {
				m.handleDisconnect(s, "连接已断开")
				return
			}
		}
	}
}

func (m *SessionManager) startShell(s *Session, cols, rows int) error {
	if cols <= 0 {
		cols = 120
	}
	if rows <= 0 {
		rows = 32
	}
	shell, err := s.client.NewSession()
	if err != nil {
		return fmt.Errorf("创建 shell 会话失败: %w", err)
	}
	modes := golangssh.TerminalModes{
		golangssh.ECHO:          1,
		golangssh.ICRNL:         1,
		golangssh.TTY_OP_ISPEED: 14400,
		golangssh.TTY_OP_OSPEED: 14400,
	}
	if err := shell.RequestPty("xterm-256color", rows, cols, modes); err != nil {
		_ = shell.Close()
		return fmt.Errorf("申请 PTY 失败: %w", err)
	}
	stdin, err := shell.StdinPipe()
	if err != nil {
		_ = shell.Close()
		return err
	}
	stdout, err := shell.StdoutPipe()
	if err != nil {
		_ = shell.Close()
		return err
	}
	stderr, err := shell.StderrPipe()
	if err != nil {
		_ = shell.Close()
		return err
	}
	if err := shell.Shell(); err != nil {
		_ = shell.Close()
		return fmt.Errorf("启动远程 shell 失败: %w", err)
	}

	s.shellMu.Lock()
	s.shell = shell
	s.stdin = stdin
	s.shellMu.Unlock()

	go m.pumpOutput(s, stdout)
	go m.pumpOutput(s, stderr)
	go func() {
		_ = shell.Wait()
		m.handleDisconnect(s, "远程 shell 已退出")
	}()
	return nil
}

func (m *SessionManager) pumpOutput(s *Session, r io.Reader) {
	buf := make([]byte, 32*1024)
	for {
		n, err := r.Read(buf)
		if n > 0 && m.ctx != nil {
			payload := base64.StdEncoding.EncodeToString(buf[:n])
			wruntime.EventsEmit(m.ctx, "terminal:data:"+s.id, payload)
		}
		if err != nil {
			return
		}
	}
}

func (m *SessionManager) handleDisconnect(s *Session, reason string) {
	if s.isClosed() {
		return
	}
	s.close()
	if m.ctx != nil {
		wruntime.EventsEmit(m.ctx, "terminal:closed:"+s.id, reason)
		wruntime.EventsEmit(m.ctx, "session:closed", s.id)
	}
}

func (m *SessionManager) Write(sessionID, data string) error {
	s, err := m.Get(sessionID)
	if err != nil {
		return err
	}
	s.shellMu.Lock()
	defer s.shellMu.Unlock()
	if s.stdin == nil {
		return errors.New("终端未就绪")
	}
	_, err = s.stdin.Write([]byte(data))
	return err
}

func (m *SessionManager) Resize(sessionID string, cols, rows int) error {
	s, err := m.Get(sessionID)
	if err != nil {
		return err
	}
	if cols <= 0 || rows <= 0 {
		return nil
	}
	s.shellMu.Lock()
	defer s.shellMu.Unlock()
	if s.shell == nil {
		return nil
	}
	return s.shell.WindowChange(rows, cols)
}

func (s *Session) ExecCombined(cmd string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	return s.ExecCombinedWithContext(ctx, cmd)
}

func (s *Session) ExecCombinedWithContext(ctx context.Context, cmd string) (string, error) {
	if s.isClosed() || s.client == nil {
		return "", errors.New("会话已断开")
	}
	sess, err := s.client.NewSession()
	if err != nil {
		return "", fmt.Errorf("创建 SSH Session 失败: %w", err)
	}

	execCtx := ctx
	var cancel context.CancelFunc
	if _, ok := execCtx.Deadline(); !ok {
		execCtx, cancel = context.WithTimeout(ctx, 60*time.Second)
		defer cancel()
	}

	type execResult struct {
		out []byte
		err error
	}
	resChan := make(chan execResult, 1)

	go func() {
		safeCmd := fmt.Sprintf("exec 0</dev/null; %s", cmd)
		out, err := sess.CombinedOutput(safeCmd)
		resChan <- execResult{out: out, err: err}
	}()

	select {
	case res := <-resChan:
		sess.Close()
		if res.err != nil && len(res.out) == 0 {
			return "", res.err
		}
		return string(res.out), nil

	case <-execCtx.Done():
		sess.Signal(golangssh.SIGKILL)
		sess.Close()
		if errors.Is(execCtx.Err(), context.DeadlineExceeded) {
			return "", fmt.Errorf("命令执行超时 (超过 60 秒上限)，已终止在服务器上运行: %s", cmd)
		}
		return "", fmt.Errorf("命令执行已被中断: %w", execCtx.Err())
	}
}
