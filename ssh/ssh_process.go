package ssh

import (
	"errors"
	"fmt"
	"strings"
)

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
	s, err := m.Get(sessionID)
	if err != nil {
		return nil, err
	}
	return s.getProcessList()
}

func (m *SessionManager) KillProcess(sessionID string, pid int) error {
	s, err := m.Get(sessionID)
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
	out, err := s.ExecCombined(cmd)
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
	raw, err := s.ExecCombined(cmd)
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
