package services

import (
	"errors"
	"terminal/core"
	"terminal/logger"
	"terminal/ssh"
)

type SshService struct{}

func NewSshService() *SshService {
	return &SshService{}
}

func (s *SshService) ListSessions() []ssh.SessionInfo {
	return GetContainer().Sessions.List()
}

func (s *SshService) Connect(serverID string, cols int, rows int) (ssh.SessionInfo, error) {
	c := GetContainer()
	cfg, ok := c.Store.Get(serverID)
	if !ok {
		err := errors.New("服务器配置不存在")
		logger.Errorf("SSH 连接失败: 服务器配置不存在 [ServerID=%s]", serverID)
		return ssh.SessionInfo{}, err
	}
	logger.Infof("正在发起 SSH 连接: ServerID=%s, 名称=%s, 主机=%s:%d, 用户=%s, 尺寸=%dx%d", cfg.ID, cfg.Name, cfg.Host, cfg.Port, cfg.Username, cols, rows)
	sess, err := c.Sessions.Connect(cfg, cols, rows)
	if err != nil {
		logger.Errorf("SSH 连接建立失败 [ServerID=%s, 主机=%s:%d]: %v", serverID, cfg.Host, cfg.Port, err)
		return ssh.SessionInfo{}, err
	}
	logger.Infof("SSH 连接成功: SessionID=%s, ServerID=%s, 主机=%s:%d", sess.ID, serverID, cfg.Host, cfg.Port)
	return sess, nil
}

func (s *SshService) ConnectWithConfig(cfg core.ServerConfig, cols int, rows int) (ssh.SessionInfo, error) {
	logger.Infof("使用临时配置发起 SSH 连接: 主机=%s:%d, 用户=%s, 尺寸=%dx%d", cfg.Host, cfg.Port, cfg.Username, cols, rows)
	sess, err := GetContainer().Sessions.Connect(cfg, cols, rows)
	if err != nil {
		logger.Errorf("SSH 临时连接失败 [主机=%s:%d]: %v", cfg.Host, cfg.Port, err)
		return ssh.SessionInfo{}, err
	}
	logger.Infof("SSH 临时连接建立成功: SessionID=%s, 主机=%s:%d", sess.ID, cfg.Host, cfg.Port)
	return sess, nil
}

func (s *SshService) Disconnect(sessionID string) error {
	logger.Infof("断开 SSH 会话: SessionID=%s", sessionID)
	GetContainer().Sessions.Remove(sessionID)
	core.EmitEvent("session:closed", sessionID)
	return nil
}

func (s *SshService) SendInput(sessionID string, data string) error {
	// 高频键盘击键流不记录 data 明文，仅在异常时记录
	if err := GetContainer().Sessions.Write(sessionID, data); err != nil {
		logger.Errorf("SSH 写入输入流失败 [SessionID=%s]: %v", sessionID, err)
		return err
	}
	return nil
}

func (s *SshService) ResizeTerminal(sessionID string, cols int, rows int) error {
	if err := GetContainer().Sessions.Resize(sessionID, cols, rows); err != nil {
		logger.Warnf("SSH 终端尺寸调整失败 [SessionID=%s, %dx%d]: %v", sessionID, cols, rows, err)
		return err
	}
	return nil
}

func (s *SshService) TerminalAttach(sessionID string, cols int, rows int) error {
	logger.Infof("Attach SSH 终端会话: SessionID=%s", sessionID)
	if cols > 0 && rows > 0 {
		_ = GetContainer().Sessions.Resize(sessionID, cols, rows)
	}
	if err := GetContainer().Sessions.Attach(sessionID); err != nil {
		logger.Errorf("Attach SSH 终端失败 [SessionID=%s]: %v", sessionID, err)
		return err
	}
	return nil
}

func (s *SshService) SSHDashboardStats(sessionID string) (*ssh.SSHDashboardInfo, error) {
	stats, err := GetContainer().Sessions.GetDashboardStats(sessionID)
	if err != nil {
		logger.Errorf("获取 SSH 仪表盘统计信息失败 [SessionID=%s]: %v", sessionID, err)
		return nil, err
	}
	return stats, nil
}

func (s *SshService) SSHProcessList(sessionID string) ([]ssh.SSHProcessInfo, error) {
	procs, err := GetContainer().Sessions.GetProcessList(sessionID)
	if err != nil {
		logger.Errorf("获取远程进程列表失败 [SessionID=%s]: %v", sessionID, err)
		return nil, err
	}
	return procs, nil
}

func (s *SshService) SSHKillProcess(sessionID string, pid int) error {
	logger.Infof("终止远程进程 [SessionID=%s, PID=%d]", sessionID, pid)
	if err := GetContainer().Sessions.KillProcess(sessionID, pid); err != nil {
		logger.Errorf("终止远程进程失败 [SessionID=%s, PID=%d]: %v", sessionID, pid, err)
		return err
	}
	return nil
}

func (s *SshService) SSHServiceList(sessionID string) ([]ssh.SSHServiceInfo, error) {
	list, err := GetContainer().Sessions.GetServiceList(sessionID)
	if err != nil {
		logger.Errorf("获取远程系统服务列表失败 [SessionID=%s]: %v", sessionID, err)
		return nil, err
	}
	return list, nil
}

func (s *SshService) SSHControlService(sessionID string, serviceName string, action string) error {
	logger.Infof("控制远程系统服务 [SessionID=%s, Service=%s, Action=%s]", sessionID, serviceName, action)
	if err := GetContainer().Sessions.ControlService(sessionID, serviceName, action); err != nil {
		logger.Errorf("控制远程系统服务失败 [SessionID=%s, Service=%s, Action=%s]: %v", sessionID, serviceName, action, err)
		return err
	}
	return nil
}

func (s *SshService) SSHServiceLogs(sessionID string, serviceName string) (string, error) {
	logs, err := GetContainer().Sessions.GetServiceLogs(sessionID, serviceName)
	if err != nil {
		logger.Errorf("获取远程服务日志失败 [SessionID=%s, Service=%s]: %v", sessionID, serviceName, err)
		return "", err
	}
	return logs, nil
}

func (s *SshService) SSHCronList(sessionID string) ([]ssh.SSHCronItem, error) {
	items, err := GetContainer().Sessions.GetCronList(sessionID)
	if err != nil {
		logger.Errorf("获取 Cron 列表失败 [SessionID=%s]: %v", sessionID, err)
		return nil, err
	}
	return items, nil
}

func (s *SshService) SSHSaveCronList(sessionID string, items []ssh.SSHCronItem) error {
	logger.Infof("保存远程 Cron 任务列表 [SessionID=%s, Count=%d]", sessionID, len(items))
	if err := GetContainer().Sessions.SaveCronList(sessionID, items); err != nil {
		logger.Errorf("保存远程 Cron 任务列表失败 [SessionID=%s]: %v", sessionID, err)
		return err
	}
	return nil
}

func (s *SshService) SSHRunCronCommand(sessionID string, command string) (string, error) {
	logger.Infof("执行远程 Cron 命令 [SessionID=%s, Command=%s]", sessionID, command)
	out, err := GetContainer().Sessions.RunCronCommand(sessionID, command)
	if err != nil {
		logger.Errorf("执行远程 Cron 命令失败 [SessionID=%s]: %v", sessionID, err)
		return "", err
	}
	return out, nil
}
