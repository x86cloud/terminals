package ssh

import (
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
)

// ---------- Crontab 定时任务管理 ----------

type SSHCronItem struct {
	ID         string `json:"id"`
	Expression string `json:"expression"`
	Command    string `json:"command"`
	Enabled    bool   `json:"enabled"`
	Comment    string `json:"comment"`
}

func (m *SessionManager) GetCronList(sessionID string) ([]SSHCronItem, error) {
	s, err := m.Get(sessionID)
	if err != nil {
		return nil, err
	}
	return s.getCronList()
}

func (m *SessionManager) SaveCronList(sessionID string, items []SSHCronItem) error {
	s, err := m.Get(sessionID)
	if err != nil {
		return err
	}
	return s.saveCronList(items)
}

func (m *SessionManager) RunCronCommand(sessionID string, command string) (string, error) {
	s, err := m.Get(sessionID)
	if err != nil {
		return "", err
	}
	return s.runCronCommand(command)
}

func (s *Session) runCronCommand(command string) (string, error) {
	command = strings.TrimSpace(command)
	if command == "" {
		return "", errors.New("命令不能为空")
	}
	out, err := s.ExecCombined(command + " 2>&1")
	if err != nil && len(out) == 0 {
		return "", fmt.Errorf("执行试运行命令失败: %w", err)
	}
	if strings.TrimSpace(out) == "" {
		return "（命令运行成功，无标准输出）", nil
	}
	return out, nil
}

func (s *Session) getCronList() ([]SSHCronItem, error) {
	cmd := `crontab -l 2>&1`
	raw, err := s.ExecCombined(cmd)
	if err != nil && (strings.Contains(raw, "no crontab for") || len(strings.TrimSpace(raw)) == 0) {
		return []SSHCronItem{}, nil
	}
	if err != nil && len(raw) > 0 {
		return nil, fmt.Errorf("读取 Crontab 失败: %s", strings.TrimSpace(raw))
	}

	var items []SSHCronItem
	var lastComment string

	lines := strings.Split(raw, "\n")
	for idx, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			lastComment = ""
			continue
		}

		if strings.HasPrefix(trimmed, "#") {
			uncommented := strings.TrimSpace(strings.TrimPrefix(trimmed, "#"))
			fields := strings.Fields(uncommented)
			if len(fields) >= 6 && isCronExpression(fields[:5]) {
				expr := strings.Join(fields[:5], " ")
				command := strings.Join(fields[5:], " ")
				items = append(items, SSHCronItem{
					ID:         fmt.Sprintf("cron-%d", idx),
					Expression: expr,
					Command:    command,
					Enabled:    false,
					Comment:    lastComment,
				})
				lastComment = ""
			} else {
				lastComment = uncommented
			}
			continue
		}

		fields := strings.Fields(trimmed)
		if len(fields) >= 6 && isCronExpression(fields[:5]) {
			expr := strings.Join(fields[:5], " ")
			command := strings.Join(fields[5:], " ")
			items = append(items, SSHCronItem{
				ID:         fmt.Sprintf("cron-%d", idx),
				Expression: expr,
				Command:    command,
				Enabled:    true,
				Comment:    lastComment,
			})
			lastComment = ""
		} else {
			lastComment = trimmed
		}
	}

	return items, nil
}

func (s *Session) saveCronList(items []SSHCronItem) error {
	var lines []string
	for _, item := range items {
		if item.Comment != "" {
			lines = append(lines, fmt.Sprintf("# %s", item.Comment))
		}
		if item.Expression != "" && item.Command != "" {
			if item.Enabled {
				lines = append(lines, fmt.Sprintf("%s %s", item.Expression, item.Command))
			} else {
				lines = append(lines, fmt.Sprintf("# %s %s", item.Expression, item.Command))
			}
		}
	}

	cronContent := strings.Join(lines, "\n")
	if len(lines) > 0 {
		cronContent += "\n"
	}

	encoded := base64.StdEncoding.EncodeToString([]byte(cronContent))
	cmd := fmt.Sprintf("sh -c 'echo %s | base64 -d | crontab - 2>&1'", encoded)

	out, err := s.ExecCombined(cmd)
	if err != nil {
		if len(out) > 0 {
			return fmt.Errorf("更新 Crontab 失败: %s", strings.TrimSpace(out))
		}
		return fmt.Errorf("更新 Crontab 失败: %w", err)
	}
	return nil
}

func isCronExpression(fields []string) bool {
	if len(fields) < 5 {
		return false
	}
	for _, f := range fields {
		if f == "" {
			return false
		}
		for _, r := range f {
			if !(r == '*' || r == '/' || r == '-' || r == ',' || (r >= '0' && r <= '9')) {
				return false
			}
		}
	}
	return true
}
