package main

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

	"github.com/google/uuid"
	"github.com/pkg/sftp"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"
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
	cfg    ServerConfig
	client *ssh.Client

	shellMu sync.Mutex
	shell   *ssh.Session
	stdin   io.WriteCloser

	sftpMu     sync.Mutex
	sftpClient *sftp.Client

	homeDir string

	closeOnce sync.Once
	done      chan struct{}
}

func (s *Session) info() SessionInfo {
	return SessionInfo{
		ID:        s.id,
		ServerID:  s.cfg.ID,
		Title:     s.cfg.label(),
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

func (m *SessionManager) setContext(ctx context.Context) {
	m.ctx = ctx
}

func (m *SessionManager) get(id string) (*Session, error) {
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

func (m *SessionManager) list() []SessionInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]SessionInfo, 0, len(m.sessions))
	for _, s := range m.sessions {
		out = append(out, s.info())
	}
	return out
}

func (m *SessionManager) remove(id string) {
	m.mu.Lock()
	s := m.sessions[id]
	delete(m.sessions, id)
	m.mu.Unlock()
	if s != nil {
		s.close()
	}
}

func (m *SessionManager) closeAll() {
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

func buildAuthMethods(cfg ServerConfig) ([]ssh.AuthMethod, error) {
	var methods []ssh.AuthMethod

	if cfg.AuthType == authTypeKey {
		keyData, err := readPrivateKey(cfg.PrivateKey)
		if err != nil {
			return nil, err
		}
		var signer ssh.Signer
		if strings.TrimSpace(cfg.Passphrase) != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(keyData, []byte(cfg.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey(keyData)
		}
		if err != nil {
			return nil, fmt.Errorf("解析私钥失败: %w", err)
		}
		methods = append(methods, ssh.PublicKeys(signer))
	}

	if cfg.Password != "" {
		methods = append(methods, ssh.Password(cfg.Password))
		methods = append(methods, ssh.KeyboardInteractive(
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
func (m *SessionManager) Connect(cfg ServerConfig, cols, rows int) (SessionInfo, error) {
	if err := cfg.validate(); err != nil {
		return SessionInfo{}, err
	}
	auths, err := buildAuthMethods(cfg)
	if err != nil {
		return SessionInfo{}, err
	}

	clientCfg := &ssh.ClientConfig{
		User: cfg.Username,
		Auth: auths,
		// 桌面客户端场景下不做 known_hosts 校验，避免首次连接失败。
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         15 * time.Second,
	}

	conn, err := net.DialTimeout("tcp", cfg.addr(), 15*time.Second)
	if err != nil {
		return SessionInfo{}, fmt.Errorf("连接 %s 失败: %w", cfg.addr(), err)
	}
	c, chans, reqs, err := ssh.NewClientConn(conn, cfg.addr(), clientCfg)
	if err != nil {
		_ = conn.Close()
		return SessionInfo{}, fmt.Errorf("SSH 握手失败: %w", err)
	}
	client := ssh.NewClient(c, chans, reqs)

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

	return session.info(), nil
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
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.ICRNL:         1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
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
	s, err := m.get(sessionID)
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
	s, err := m.get(sessionID)
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

// ---------- SSH 仪表盘指标数据结构与拉取解析 ----------

type SSHDiskInfo struct {
	Mount        string  `json:"mount"`
	Filesystem   string  `json:"filesystem"`
	FsType       string  `json:"fsType"`
	Total        uint64  `json:"total"`
	Used         uint64  `json:"used"`
	Available    uint64  `json:"available"`
	UsagePercent float64 `json:"usagePercent"`
	IsVirtual    bool    `json:"isVirtual"`
}

type SSHCPUInfo struct {
	UsagePercent float64   `json:"usagePercent"`
	Cores        int       `json:"cores"`
	LoadAvg      []float64 `json:"loadAvg"`
}

type SSHMemInfo struct {
	Total        uint64  `json:"total"`
	Used         uint64  `json:"used"`
	Free         uint64  `json:"free"`
	Available    uint64  `json:"available"`
	UsagePercent float64 `json:"usagePercent"`
	SwapTotal    uint64  `json:"swapTotal"`
	SwapUsed     uint64  `json:"swapUsed"`
}

type SSHNetInfo struct {
	Name       string `json:"name"`
	IP         string `json:"ip"`
	RxBytes    uint64 `json:"rxBytes"`
	TxBytes    uint64 `json:"txBytes"`
	IsLoopback bool   `json:"isLoopback"`
	IsVirtual  bool   `json:"isVirtual"`
}

type SSHDashboardInfo struct {
	Hostname string        `json:"hostname"`
	OS       string        `json:"os"`
	Uptime   string        `json:"uptime"`
	CPU      SSHCPUInfo    `json:"cpu"`
	Mem      SSHMemInfo    `json:"mem"`
	Disks    []SSHDiskInfo `json:"disks"`
	Nets     []SSHNetInfo  `json:"nets"`
}

func (m *SessionManager) GetDashboardStats(sessionID string) (*SSHDashboardInfo, error) {
	s, err := m.get(sessionID)
	if err != nil {
		return nil, err
	}
	return s.getDashboardInfo()
}

func (s *Session) execCombined(cmd string) (string, error) {
	if s.isClosed() || s.client == nil {
		return "", errors.New("会话已断开")
	}
	sess, err := s.client.NewSession()
	if err != nil {
		return "", fmt.Errorf("创建 SSH Session 失败: %w", err)
	}
	defer sess.Close()
	out, err := sess.CombinedOutput(cmd)
	if err != nil && len(out) == 0 {
		return "", err
	}
	return string(out), nil
}

func parseProcStatCpu(line string) (total uint64, idle uint64) {
	fields := strings.Fields(line)
	if len(fields) < 5 || fields[0] != "cpu" {
		return 0, 0
	}
	var sum uint64
	for i := 1; i < len(fields); i++ {
		var val uint64
		fmt.Sscanf(fields[i], "%d", &val)
		sum += val
		if i == 4 || i == 5 { // idle & iowait
			idle += val
		}
	}
	return sum, idle
}

func formatUptime(upStr string, procUptime string) string {
	if procUptime != "" {
		fields := strings.Fields(procUptime)
		if len(fields) > 0 {
			var sec float64
			if _, err := fmt.Sscanf(fields[0], "%f", &sec); err == nil && sec > 0 {
				totalSec := int(sec)
				days := totalSec / 86400
				hours := (totalSec % 86400) / 3600
				mins := (totalSec % 3600) / 60
				if days > 0 {
					return fmt.Sprintf("%d天 %d小时 %d分", days, hours, mins)
				}
				if hours > 0 {
					return fmt.Sprintf("%d小时 %d分", hours, mins)
				}
				return fmt.Sprintf("%d分", mins)
			}
		}
	}

	if idx := strings.Index(upStr, " up "); idx != -1 {
		part := upStr[idx+4:]
		if lIdx := strings.Index(part, "load average"); lIdx != -1 {
			part = part[:lIdx]
		}
		part = strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(part), ","))
		subParts := strings.Split(part, ",")
		var kept []string
		for _, sp := range subParts {
			trimmed := strings.TrimSpace(sp)
			if strings.Contains(trimmed, "user") {
				continue
			}
			if trimmed != "" {
				kept = append(kept, trimmed)
			}
		}
		if len(kept) > 0 {
			return strings.Join(kept, ", ")
		}
	}

	return upStr
}

func (s *Session) getDashboardInfo() (*SSHDashboardInfo, error) {
	cmd := `LC_ALL=C LANG=C sh -c '
echo "===HOSTNAME==="; hostname 2>/dev/null || uname -n
echo "===UNAME==="; uname -sr 2>/dev/null
echo "===UPTIME==="; uptime 2>/dev/null
echo "===PROCUPTIME==="; cat /proc/uptime 2>/dev/null
echo "===STAT1==="; cat /proc/stat 2>/dev/null | head -n 1
sleep 0.2
echo "===STAT2==="; cat /proc/stat 2>/dev/null | head -n 1
echo "===CPUINFO==="; grep -c "^processor" /proc/cpuinfo 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null
echo "===MEMINFO==="; cat /proc/meminfo 2>/dev/null
echo "===DF==="; df -P -k -T 2>/dev/null || df -P -k 2>/dev/null
echo "===NETDEV==="; cat /proc/net/dev 2>/dev/null
echo "===IPADDR==="; ip -4 -o addr show 2>/dev/null || ifconfig 2>/dev/null
'`
	raw, err := s.execCombined(cmd)
	if err != nil && len(raw) == 0 {
		return nil, fmt.Errorf("获取仪表盘数据失败: %w", err)
	}

	info := &SSHDashboardInfo{
		CPU:   SSHCPUInfo{LoadAvg: []float64{0, 0, 0}, Cores: 1},
		Disks: []SSHDiskInfo{},
		Nets:  []SSHNetInfo{},
	}

	sections := make(map[string][]string)
	var currentSection string
	for _, line := range strings.Split(raw, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "===") && strings.HasSuffix(trimmed, "===") {
			currentSection = strings.Trim(trimmed, "=")
			continue
		}
		if currentSection != "" {
			sections[currentSection] = append(sections[currentSection], line)
		}
	}

	if lines, ok := sections["HOSTNAME"]; ok && len(lines) > 0 {
		info.Hostname = strings.TrimSpace(lines[0])
	}
	if lines, ok := sections["UNAME"]; ok && len(lines) > 0 {
		info.OS = strings.TrimSpace(lines[0])
	}
	var upRawStr, procUpStr string
	if lines, ok := sections["UPTIME"]; ok && len(lines) > 0 {
		upRawStr = strings.TrimSpace(lines[0])
		if idx := strings.Index(upRawStr, "load average:"); idx != -1 {
			loadPart := upRawStr[idx+len("load average:"):]
			parts := strings.Split(loadPart, ",")
			for i, p := range parts {
				if i >= 3 {
					break
				}
				var val float64
				fmt.Sscanf(strings.TrimSpace(p), "%f", &val)
				info.CPU.LoadAvg[i] = val
			}
		}
	}
	if lines, ok := sections["PROCUPTIME"]; ok && len(lines) > 0 {
		procUpStr = strings.TrimSpace(lines[0])
	}
	info.Uptime = formatUptime(upRawStr, procUpStr)
	if lines, ok := sections["CPUINFO"]; ok && len(lines) > 0 {
		var cores int
		if _, err := fmt.Sscanf(strings.TrimSpace(lines[0]), "%d", &cores); err == nil && cores > 0 {
			info.CPU.Cores = cores
		}
	}
	stat1Lines := sections["STAT1"]
	stat2Lines := sections["STAT2"]
	if len(stat1Lines) > 0 && len(stat2Lines) > 0 {
		t1, i1 := parseProcStatCpu(stat1Lines[0])
		t2, i2 := parseProcStatCpu(stat2Lines[0])
		if t2 > t1 {
			diffTotal := float64(t2 - t1)
			diffIdle := float64(i2 - i1)
			usage := (1.0 - (diffIdle / diffTotal)) * 100.0
			if usage < 0 {
				usage = 0
			}
			if usage > 100 {
				usage = 100
			}
			info.CPU.UsagePercent = usage
		}
	}

	if lines, ok := sections["MEMINFO"]; ok {
		var memTotal, memFree, memAvail, buffers, cached, swapTotal, swapFree uint64
		hasMemAvail := false
		for _, line := range lines {
			parts := strings.Fields(line)
			if len(parts) < 2 {
				continue
			}
			key := strings.TrimSuffix(parts[0], ":")
			var val uint64
			fmt.Sscanf(parts[1], "%d", &val)
			val = val * 1024

			switch key {
			case "MemTotal":
				memTotal = val
			case "MemFree":
				memFree = val
			case "MemAvailable":
				memAvail = val
				hasMemAvail = true
			case "Buffers":
				buffers = val
			case "Cached":
				cached = val
			case "SwapTotal":
				swapTotal = val
			case "SwapFree":
				swapFree = val
			}
		}

		if !hasMemAvail {
			memAvail = memFree + buffers + cached
		}
		info.Mem.Total = memTotal
		info.Mem.Available = memAvail
		if memTotal > memAvail {
			info.Mem.Used = memTotal - memAvail
		} else {
			info.Mem.Used = 0
		}
		info.Mem.Free = memFree
		if memTotal > 0 {
			info.Mem.UsagePercent = (float64(info.Mem.Used) / float64(memTotal)) * 100.0
		}
		info.Mem.SwapTotal = swapTotal
		if swapTotal > swapFree {
			info.Mem.SwapUsed = swapTotal - swapFree
		}
	}

	if lines, ok := sections["DF"]; ok {
		for i, line := range lines {
			if i == 0 || strings.TrimSpace(line) == "" {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) < 5 {
				continue
			}

			var fs, fsType, mount string
			var totalBlocks, usedBlocks, availBlocks uint64
			var usagePct float64

			if len(fields) >= 7 {
				fs = fields[0]
				fsType = fields[1]
				fmt.Sscanf(fields[2], "%d", &totalBlocks)
				fmt.Sscanf(fields[3], "%d", &usedBlocks)
				fmt.Sscanf(fields[4], "%d", &availBlocks)
				pctStr := strings.TrimSuffix(fields[5], "%")
				fmt.Sscanf(pctStr, "%f", &usagePct)
				mount = fields[6]
			} else if len(fields) >= 6 {
				fs = fields[0]
				fsType = "unknown"
				fmt.Sscanf(fields[1], "%d", &totalBlocks)
				fmt.Sscanf(fields[2], "%d", &usedBlocks)
				fmt.Sscanf(fields[3], "%d", &availBlocks)
				pctStr := strings.TrimSuffix(fields[4], "%")
				fmt.Sscanf(pctStr, "%f", &usagePct)
				mount = fields[5]
			} else {
				continue
			}

			if totalBlocks == 0 {
				continue
			}

			totalBytes := totalBlocks * 1024
			usedBytes := usedBlocks * 1024
			availBytes := availBlocks * 1024

			isVirt := isVirtualFs(fs, fsType, mount)

			info.Disks = append(info.Disks, SSHDiskInfo{
				Mount:        mount,
				Filesystem:   fs,
				FsType:       fsType,
				Total:        totalBytes,
				Used:         usedBytes,
				Available:    availBytes,
				UsagePercent: usagePct,
				IsVirtual:    isVirt,
			})
		}
	}

	// Nets parsing
	netMap := make(map[string]*SSHNetInfo)

	if lines, ok := sections["IPADDR"]; ok {
		for _, line := range lines {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" {
				continue
			}
			fields := strings.Fields(trimmed)
			if len(fields) >= 4 && (fields[2] == "inet" || fields[2] == "inet6") {
				ifName := strings.TrimSuffix(fields[1], ":")
				ipAddr := fields[3]
				if idx := strings.Index(ipAddr, "/"); idx != -1 {
					ipAddr = ipAddr[:idx]
				}
				if _, exists := netMap[ifName]; !exists {
					netMap[ifName] = &SSHNetInfo{
						Name:       ifName,
						IP:         ipAddr,
						IsLoopback: ifName == "lo" || strings.HasPrefix(ifName, "lo") || ipAddr == "127.0.0.1",
						IsVirtual:  isVirtualNet(ifName),
					}
				} else {
					netMap[ifName].IP = ipAddr
				}
			}
		}
	}

	if lines, ok := sections["NETDEV"]; ok {
		for _, line := range lines {
			if !strings.Contains(line, ":") {
				continue
			}
			parts := strings.SplitN(line, ":", 2)
			if len(parts) < 2 {
				continue
			}
			ifName := strings.TrimSpace(parts[0])
			fields := strings.Fields(parts[1])
			if len(fields) >= 9 {
				var rxBytes, txBytes uint64
				fmt.Sscanf(fields[0], "%d", &rxBytes)
				fmt.Sscanf(fields[8], "%d", &txBytes)

				if netItem, exists := netMap[ifName]; exists {
					netItem.RxBytes = rxBytes
					netItem.TxBytes = txBytes
				} else {
					netMap[ifName] = &SSHNetInfo{
						Name:       ifName,
						IP:         "-",
						RxBytes:    rxBytes,
						TxBytes:    txBytes,
						IsLoopback: ifName == "lo" || strings.HasPrefix(ifName, "lo"),
						IsVirtual:  isVirtualNet(ifName),
					}
				}
			}
		}
	}

	for _, netItem := range netMap {
		info.Nets = append(info.Nets, *netItem)
	}

	return info, nil
}

func isVirtualFs(fs, fsType, mount string) bool {
	virtTypes := []string{"tmpfs", "devtmpfs", "overlay", "squashfs", "sysfs", "proc", "cgroup", "shm", "devpts", "securityfs", "pstore", "autofs", "hugetlbfs", "mqueue"}
	fsTypeLower := strings.ToLower(fsType)
	for _, vt := range virtTypes {
		if fsTypeLower == vt {
			return true
		}
	}
	mountLower := strings.ToLower(mount)
	if strings.HasPrefix(mountLower, "/dev/shm") ||
		strings.HasPrefix(mountLower, "/run") ||
		strings.HasPrefix(mountLower, "/sys") ||
		strings.HasPrefix(mountLower, "/proc") ||
		strings.HasPrefix(mountLower, "/dev/mqueue") ||
		strings.HasPrefix(mountLower, "/snap") {
		return true
	}
	return false
}

func isVirtualNet(name string) bool {
	virtPrefixes := []string{"docker", "veth", "br-", "flannel", "cni", "virbr", "tun", "tap", "kube"}
	for _, p := range virtPrefixes {
		if strings.HasPrefix(name, p) {
			return true
		}
	}
	return false
}

// ---------- 进程管理 ----------

type SSHProcessInfo struct {
	PID     int     `json:"pid"`
	User    string  `json:"user"`
	CPU     float64 `json:"cpu"`
	Mem     float64 `json:"mem"`
	Rss     uint64  `json:"rss"`
	Command string  `json:"command"`
}

func (m *SessionManager) GetProcessList(sessionID string) ([]SSHProcessInfo, error) {
	s, err := m.get(sessionID)
	if err != nil {
		return nil, err
	}
	return s.getProcessList()
}

func (m *SessionManager) KillProcess(sessionID string, pid int) error {
	s, err := m.get(sessionID)
	if err != nil {
		return err
	}
	return s.killProcess(pid)
}

func (s *Session) killProcess(pid int) error {
	if pid <= 0 {
		return errors.New("无效的 PID")
	}
	cmd := fmt.Sprintf("kill -9 %d", pid)
	out, err := s.execCombined(cmd)
	if err != nil {
		if len(out) > 0 {
			return fmt.Errorf("结束进程失败: %s", strings.TrimSpace(out))
		}
		return fmt.Errorf("结束进程失败: %w", err)
	}
	return nil
}

func (s *Session) getProcessList() ([]SSHProcessInfo, error) {
	cmd := `LC_ALL=C LANG=C ps aux --sort=-%cpu 2>/dev/null || LC_ALL=C LANG=C ps aux 2>/dev/null`
	raw, err := s.execCombined(cmd)
	if err != nil && len(raw) == 0 {
		return nil, fmt.Errorf("读取进程列表失败: %w", err)
	}

	var procs []SSHProcessInfo
	lines := strings.Split(raw, "\n")
	if len(lines) <= 1 {
		return procs, nil
	}

	for i := 1; i < len(lines); i++ {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 11 {
			continue
		}

		var pid int
		var cpu, mem float64
		var rssKb uint64

		user := fields[0]
		fmt.Sscanf(fields[1], "%d", &pid)
		fmt.Sscanf(fields[2], "%f", &cpu)
		fmt.Sscanf(fields[3], "%f", &mem)
		fmt.Sscanf(fields[5], "%d", &rssKb)

		if pid <= 0 {
			continue
		}

		command := strings.Join(fields[10:], " ")

		procs = append(procs, SSHProcessInfo{
			PID:     pid,
			User:    user,
			CPU:     cpu,
			Mem:     mem,
			Rss:     rssKb * 1024,
			Command: command,
		})

		if len(procs) >= 100 {
			break
		}
	}

	return procs, nil
}
