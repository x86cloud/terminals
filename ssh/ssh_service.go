package ssh

import (
	"errors"
	"fmt"
	"strings"
)

// ---------- Systemd 服务管理 ----------

type SSHServiceInfo struct {
	Name        string `json:"name"`
	Load        string `json:"load"`
	Active      string `json:"active"`
	Sub         string `json:"sub"`
	Description string `json:"description"`
}

func (m *SessionManager) GetServiceList(sessionID string) ([]SSHServiceInfo, error) {
	s, err := m.Get(sessionID)
	if err != nil {
		return nil, err
	}
	return s.getServiceList()
}

func (m *SessionManager) ControlService(sessionID string, serviceName string, action string) error {
	s, err := m.Get(sessionID)
	if err != nil {
		return err
	}
	return s.controlService(serviceName, action)
}

func (m *SessionManager) GetServiceLogs(sessionID string, serviceName string) (string, error) {
	s, err := m.Get(sessionID)
	if err != nil {
		return "", err
	}
	return s.getServiceLogs(serviceName)
}

func (s *Session) controlService(serviceName string, action string) error {
	serviceName = strings.TrimSpace(serviceName)
	if serviceName == "" {
		return errors.New("服务名称不能为空")
	}
	switch action {
	case "start", "stop", "restart":
	default:
		return fmt.Errorf("不支持的服务指令: %s", action)
	}

	cmd := fmt.Sprintf("systemctl %s %s 2>&1", action, serviceName)
	out, err := s.ExecCombined(cmd)
	if err != nil {
		if len(out) > 0 {
			return fmt.Errorf("服务指令执行失败: %s", strings.TrimSpace(out))
		}
		return fmt.Errorf("服务指令执行失败: %w", err)
	}
	return nil
}

func (s *Session) getServiceLogs(serviceName string) (string, error) {
	serviceName = strings.TrimSpace(serviceName)
	if serviceName == "" {
		return "", errors.New("服务名称不能为空")
	}

	cmd := fmt.Sprintf("journalctl -u %s -n 100 --no-pager 2>&1 || systemctl status %s 2>&1", serviceName, serviceName)
	out, err := s.ExecCombined(cmd)
	if err != nil && len(out) == 0 {
		return "", fmt.Errorf("获取服务日志失败: %w", err)
	}
	if strings.TrimSpace(out) == "" {
		return "（暂无此服务的 journalctl 日志输出）", nil
	}
	return out, nil
}

func (s *Session) getServiceList() ([]SSHServiceInfo, error) {
	cmd := `LC_ALL=C LANG=C systemctl list-units --type=service --all --no-legend --no-pager 2>/dev/null`
	raw, err := s.ExecCombined(cmd)
	if err != nil && len(raw) == 0 {
		return nil, fmt.Errorf("读取 Systemd 服务列表失败: %w", err)
	}

	var services []SSHServiceInfo
	for _, line := range strings.Split(raw, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		fields := strings.Fields(trimmed)

		// 剥除开头的符号/圆点（如 "●", "*"）
		for len(fields) > 0 {
			first := fields[0]
			if strings.HasSuffix(first, ".service") || strings.Contains(first, ".") {
				break
			}
			fields = fields[1:]
		}

		if len(fields) < 4 {
			continue
		}

		unitName := fields[0]
		loadState := strings.ToLower(fields[1])
		activeState := strings.ToLower(fields[2])
		subState := strings.ToLower(fields[3])

		var desc string
		if len(fields) >= 5 {
			desc = strings.Join(fields[4:], " ")
		}

		services = append(services, SSHServiceInfo{
			Name:        unitName,
			Load:        loadState,
			Active:      activeState,
			Sub:         subState,
			Description: desc,
		})
	}

	return services, nil
}
