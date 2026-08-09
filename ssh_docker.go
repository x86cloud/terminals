package main

import (
	"errors"
	"fmt"
	"strings"
)

// ---------- Docker 运维管理 ----------

type SSHDockerContainer struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Image     string `json:"image"`
	Status    string `json:"status"`
	Ports     string `json:"ports"`
	CreatedAt string `json:"createdAt"`
	Running   bool   `json:"running"`
}

type SSHDockerImage struct {
	ID        string `json:"id"`
	Repo      string `json:"repo"`
	Tag       string `json:"tag"`
	Size      string `json:"size"`
	CreatedAt string `json:"createdAt"`
}

func (m *SessionManager) GetDockerContainerList(sessionID string) ([]SSHDockerContainer, error) {
	s, err := m.get(sessionID)
	if err != nil {
		return nil, err
	}
	return s.getDockerContainerList()
}

func (m *SessionManager) ControlDockerContainer(sessionID string, containerID string, action string) error {
	s, err := m.get(sessionID)
	if err != nil {
		return err
	}
	return s.controlDockerContainer(containerID, action)
}

func (m *SessionManager) GetDockerContainerLogs(sessionID string, containerID string, tail int) (string, error) {
	s, err := m.get(sessionID)
	if err != nil {
		return "", err
	}
	return s.getDockerContainerLogs(containerID, tail)
}

func (m *SessionManager) GetDockerImageList(sessionID string) ([]SSHDockerImage, error) {
	s, err := m.get(sessionID)
	if err != nil {
		return nil, err
	}
	return s.getDockerImageList()
}

func (m *SessionManager) RemoveDockerImage(sessionID string, imageID string) error {
	s, err := m.get(sessionID)
	if err != nil {
		return err
	}
	return s.removeDockerImage(imageID)
}

func (m *SessionManager) PullDockerImage(sessionID string, imageName string) (string, error) {
	s, err := m.get(sessionID)
	if err != nil {
		return "", err
	}
	return s.pullDockerImage(imageName)
}

func (s *Session) getDockerContainerList() ([]SSHDockerContainer, error) {
	cmd := `docker ps -a --format "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}\t{{.CreatedAt}}"`
	raw, err := s.execCombined(cmd)
	if err != nil {
		if len(raw) > 0 && (strings.Contains(raw, "command not found") || strings.Contains(raw, "permission denied")) {
			return nil, errors.New(strings.TrimSpace(raw))
		}
		return nil, fmt.Errorf("读取 Docker 容器失败: %w", err)
	}

	var list []SSHDockerContainer
	lines := strings.Split(raw, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) < 6 {
			continue
		}
		status := parts[3]
		running := strings.HasPrefix(strings.ToLower(status), "up")
		list = append(list, SSHDockerContainer{
			ID:        parts[0],
			Name:      parts[1],
			Image:     parts[2],
			Status:    status,
			Ports:     parts[4],
			CreatedAt: parts[5],
			Running:   running,
		})
	}
	return list, nil
}

func (s *Session) controlDockerContainer(containerID string, action string) error {
	var cmd string
	switch action {
	case "start":
		cmd = fmt.Sprintf("docker start %s", containerID)
	case "stop":
		cmd = fmt.Sprintf("docker stop %s", containerID)
	case "restart":
		cmd = fmt.Sprintf("docker restart %s", containerID)
	case "rm":
		cmd = fmt.Sprintf("docker rm -f %s", containerID)
	default:
		return errors.New("不支持的操作")
	}
	out, err := s.execCombined(cmd)
	if err != nil {
		if len(out) > 0 {
			return fmt.Errorf("操作容器失败: %s", strings.TrimSpace(out))
		}
		return fmt.Errorf("操作容器失败: %w", err)
	}
	return nil
}

func (s *Session) getDockerContainerLogs(containerID string, tail int) (string, error) {
	if tail <= 0 {
		tail = 200
	}
	cmd := fmt.Sprintf("docker logs --tail %d %s 2>&1", tail, containerID)
	out, err := s.execCombined(cmd)
	if err != nil && len(out) == 0 {
		return "", fmt.Errorf("获取容器日志失败: %w", err)
	}
	return out, nil
}

func (s *Session) getDockerImageList() ([]SSHDockerImage, error) {
	cmd := `docker images --format "{{.ID}}\t{{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"`
	raw, err := s.execCombined(cmd)
	if err != nil {
		if len(raw) > 0 {
			return nil, errors.New(strings.TrimSpace(raw))
		}
		return nil, fmt.Errorf("读取 Docker 镜像列表失败: %w", err)
	}

	var list []SSHDockerImage
	lines := strings.Split(raw, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) < 5 {
			continue
		}
		list = append(list, SSHDockerImage{
			ID:        parts[0],
			Repo:      parts[1],
			Tag:       parts[2],
			Size:      parts[3],
			CreatedAt: parts[4],
		})
	}
	return list, nil
}

func (s *Session) removeDockerImage(imageID string) error {
	cmd := fmt.Sprintf("docker rmi -f %s", imageID)
	out, err := s.execCombined(cmd)
	if err != nil {
		if len(out) > 0 {
			return fmt.Errorf("删除镜像失败: %s", strings.TrimSpace(out))
		}
		return fmt.Errorf("删除镜像失败: %w", err)
	}
	return nil
}

func (s *Session) pullDockerImage(imageName string) (string, error) {
	imageName = strings.TrimSpace(imageName)
	if imageName == "" {
		return "", errors.New("镜像名称不能为空")
	}
	cmd := fmt.Sprintf("docker pull %s 2>&1", imageName)
	out, err := s.execCombined(cmd)
	if err != nil {
		if len(out) > 0 {
			return "", fmt.Errorf("拉取镜像失败: %s", strings.TrimSpace(out))
		}
		return "", fmt.Errorf("拉取镜像失败: %w", err)
	}
	return out, nil
}
