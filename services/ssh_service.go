package services

import (
	"errors"
	"terminal/core"
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
		return ssh.SessionInfo{}, errors.New("服务器配置不存在")
	}
	return c.Sessions.Connect(cfg, cols, rows)
}

func (s *SshService) ConnectWithConfig(cfg core.ServerConfig, cols int, rows int) (ssh.SessionInfo, error) {
	return GetContainer().Sessions.Connect(cfg, cols, rows)
}

func (s *SshService) Disconnect(sessionID string) error {
	GetContainer().Sessions.Remove(sessionID)
	core.EmitEvent("session:closed", sessionID)
	return nil
}

func (s *SshService) SendInput(sessionID string, data string) error {
	return GetContainer().Sessions.Write(sessionID, data)
}

func (s *SshService) ResizeTerminal(sessionID string, cols int, rows int) error {
	return GetContainer().Sessions.Resize(sessionID, cols, rows)
}

func (s *SshService) SSHDashboardStats(sessionID string) (*ssh.SSHDashboardInfo, error) {
	return GetContainer().Sessions.GetDashboardStats(sessionID)
}

func (s *SshService) SSHProcessList(sessionID string) ([]ssh.SSHProcessInfo, error) {
	return GetContainer().Sessions.GetProcessList(sessionID)
}

func (s *SshService) SSHKillProcess(sessionID string, pid int) error {
	return GetContainer().Sessions.KillProcess(sessionID, pid)
}

func (s *SshService) SSHServiceList(sessionID string) ([]ssh.SSHServiceInfo, error) {
	return GetContainer().Sessions.GetServiceList(sessionID)
}

func (s *SshService) SSHControlService(sessionID string, serviceName string, action string) error {
	return GetContainer().Sessions.ControlService(sessionID, serviceName, action)
}

func (s *SshService) SSHServiceLogs(sessionID string, serviceName string) (string, error) {
	return GetContainer().Sessions.GetServiceLogs(sessionID, serviceName)
}

func (s *SshService) SSHCronList(sessionID string) ([]ssh.SSHCronItem, error) {
	return GetContainer().Sessions.GetCronList(sessionID)
}

func (s *SshService) SSHSaveCronList(sessionID string, items []ssh.SSHCronItem) error {
	return GetContainer().Sessions.SaveCronList(sessionID, items)
}

func (s *SshService) SSHRunCronCommand(sessionID string, command string) (string, error) {
	return GetContainer().Sessions.RunCronCommand(sessionID, command)
}

func (s *SshService) SSHDockerContainerList(sessionID string) ([]ssh.SSHDockerContainer, error) {
	return GetContainer().Sessions.GetDockerContainerList(sessionID)
}

func (s *SshService) SSHDockerControlContainer(sessionID string, containerID string, action string) error {
	return GetContainer().Sessions.ControlDockerContainer(sessionID, containerID, action)
}

func (s *SshService) SSHDockerContainerLogs(sessionID string, containerID string, tail int) (string, error) {
	return GetContainer().Sessions.GetDockerContainerLogs(sessionID, containerID, tail)
}

func (s *SshService) SSHDockerImageList(sessionID string) ([]ssh.SSHDockerImage, error) {
	return GetContainer().Sessions.GetDockerImageList(sessionID)
}

func (s *SshService) SSHDockerRemoveImage(sessionID string, imageID string) error {
	return GetContainer().Sessions.RemoveDockerImage(sessionID, imageID)
}

func (s *SshService) SSHDockerPullImage(sessionID string, imageName string) (string, error) {
	return GetContainer().Sessions.PullDockerImage(sessionID, imageName)
}

