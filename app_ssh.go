package main

import (
	"errors"
	"terminal/core"
	"terminal/ssh"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// ---------- SSH 会话管理 ----------

func (a *App) ListSessions() []ssh.SessionInfo {
	return a.sessions.List()
}

// Connect 使用已保存的服务器配置建立连接。
func (a *App) Connect(serverID string, cols int, rows int) (ssh.SessionInfo, error) {
	cfg, ok := a.store.Get(serverID)
	if !ok {
		return ssh.SessionInfo{}, errors.New("服务器配置不存在")
	}
	return a.sessions.Connect(cfg, cols, rows)
}

// ConnectWithConfig 使用临时配置建立连接（不保存）。
func (a *App) ConnectWithConfig(cfg core.ServerConfig, cols int, rows int) (ssh.SessionInfo, error) {
	return a.sessions.Connect(cfg, cols, rows)
}

func (a *App) Disconnect(sessionID string) error {
	a.sessions.Remove(sessionID)
	if a.ctx != nil {
		wruntime.EventsEmit(a.ctx, "session:closed", sessionID)
	}
	return nil
}

func (a *App) SendInput(sessionID string, data string) error {
	return a.sessions.Write(sessionID, data)
}

func (a *App) ResizeTerminal(sessionID string, cols int, rows int) error {
	return a.sessions.Resize(sessionID, cols, rows)
}

// ---------- SSH 系统运维 (仪表盘/进程/服务/Cron) ----------

func (a *App) SSHDashboardStats(sessionID string) (*ssh.SSHDashboardInfo, error) {
	return a.sessions.GetDashboardStats(sessionID)
}

func (a *App) SSHProcessList(sessionID string) ([]ssh.SSHProcessInfo, error) {
	return a.sessions.GetProcessList(sessionID)
}

func (a *App) SSHKillProcess(sessionID string, pid int) error {
	return a.sessions.KillProcess(sessionID, pid)
}

func (a *App) SSHServiceList(sessionID string) ([]ssh.SSHServiceInfo, error) {
	return a.sessions.GetServiceList(sessionID)
}

func (a *App) SSHControlService(sessionID string, serviceName string, action string) error {
	return a.sessions.ControlService(sessionID, serviceName, action)
}

func (a *App) SSHServiceLogs(sessionID string, serviceName string) (string, error) {
	return a.sessions.GetServiceLogs(sessionID, serviceName)
}

func (a *App) SSHCronList(sessionID string) ([]ssh.SSHCronItem, error) {
	return a.sessions.GetCronList(sessionID)
}

func (a *App) SSHSaveCronList(sessionID string, items []ssh.SSHCronItem) error {
	return a.sessions.SaveCronList(sessionID, items)
}

func (a *App) SSHRunCronCommand(sessionID string, command string) (string, error) {
	return a.sessions.RunCronCommand(sessionID, command)
}

// ---------- Docker 运维 ----------

func (a *App) SSHDockerContainerList(sessionID string) ([]ssh.SSHDockerContainer, error) {
	return a.sessions.GetDockerContainerList(sessionID)
}

func (a *App) SSHDockerControlContainer(sessionID string, containerID string, action string) error {
	return a.sessions.ControlDockerContainer(sessionID, containerID, action)
}

func (a *App) SSHDockerContainerLogs(sessionID string, containerID string, tail int) (string, error) {
	return a.sessions.GetDockerContainerLogs(sessionID, containerID, tail)
}

func (a *App) SSHDockerImageList(sessionID string) ([]ssh.SSHDockerImage, error) {
	return a.sessions.GetDockerImageList(sessionID)
}

func (a *App) SSHDockerRemoveImage(sessionID string, imageID string) error {
	return a.sessions.RemoveDockerImage(sessionID, imageID)
}

func (a *App) SSHDockerPullImage(sessionID string, imageName string) (string, error) {
	return a.sessions.PullDockerImage(sessionID, imageName)
}
