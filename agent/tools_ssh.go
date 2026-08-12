package agent

import (
	"context"
	"fmt"
	"strings"
	"terminal/ssh"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/components/tool/utils"
)

type SSHListSessionsInput struct{}

type SSHSessionItem struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
}

type SSHListSessionsOutput struct {
	Sessions []SSHSessionItem `json:"sessions"`
}

type SSHGetSystemInfoInput struct {
	SessionID string `json:"session_id" jsonschema:"description=要查询的目标 SSH 会话 ID，如留空则自动使用当前激活的会话"`
}

type SSHExecCommandInput struct {
	SessionID string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID，如留空则自动使用当前激活的会话"`
	Command   string `json:"command" jsonschema:"description=要在远程服务器上执行的 Shell 命令行"`
}

type SSHExecCommandOutput struct {
	SessionID string `json:"session_id"`
	Command   string `json:"command"`
	Output    string `json:"output"`
}

func BuildSSHTools(sm *ssh.SessionManager, wm *WorkspaceManager) ([]tool.BaseTool, error) {
	if sm == nil {
		return nil, nil
	}

	// 1. ssh_list_sessions
	listSessionsTool, err := utils.InferTool("ssh_list_sessions", "查看当前客户端中所有已连通激活的远程 SSH 会话列表",
		func(ctx context.Context, input *SSHListSessionsInput) (*SSHListSessionsOutput, error) {
			if wm != nil {
				wm.EmitToolStart("ssh_list_sessions", "正在查询激活的 SSH 远程会话列表...")
			}
			sessions := sm.List()
			var items []SSHSessionItem
			for _, s := range sessions {
				if s.Connected {
					items = append(items, SSHSessionItem{
						ID:       s.ID,
						Title:    s.Title,
						Host:     s.Host,
						Port:     s.Port,
						Username: s.Username,
					})
				}
			}
			return &SSHListSessionsOutput{Sessions: items}, nil
		})
	if err != nil {
		return nil, err
	}

	// Helper to resolve session
	resolveSession := func(sessionID string) (*ssh.Session, error) {
		if sessionID != "" {
			return sm.Get(sessionID)
		}
		sessions := sm.List()
		for _, s := range sessions {
			if s.Connected {
				return sm.Get(s.ID)
			}
		}
		return nil, fmt.Errorf("当前没有已连通的 SSH 会话，请先在终端连接远程服务器")
	}

	// 2. ssh_get_system_info
	getSysInfoTool, err := utils.InferTool("ssh_get_system_info", "查询远程 SSH 服务器的 CPU、内存、磁盘与负载等系统概况指标",
		func(ctx context.Context, input *SSHGetSystemInfoInput) (string, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return "", err
			}
			info := sess.Info()
			if wm != nil {
				wm.EmitToolStart("ssh_get_system_info", fmt.Sprintf("正在获取服务器 [%s] 系统性能概况...", info.Title))
			}
			metrics, err := sm.GetDashboardStats(info.ID)
			if err != nil {
				return "", fmt.Errorf("获取系统概况失败: %w", err)
			}
			memUsedMB := metrics.Mem.Used / 1024 / 1024
			memTotalMB := metrics.Mem.Total / 1024 / 1024
			loadStr := "未知"
			if len(metrics.CPU.LoadAvg) > 0 {
				loadStr = fmt.Sprintf("%.2f, %.2f, %.2f", metrics.CPU.LoadAvg[0], metrics.CPU.LoadAvg[1], metrics.CPU.LoadAvg[2])
			}
			return fmt.Sprintf("服务器 [%s (%s)] 系统概况:\n主机名: %s | OS: %s | 运行时长: %s\nCPU 使用率: %.1f%% (%d 核心)\n内存: %dMB / %dMB (使用率 %.1f%%)\n平均负载: %s",
				info.Title, info.Host, metrics.Hostname, metrics.OS, metrics.Uptime, metrics.CPU.UsagePercent, metrics.CPU.Cores, memUsedMB, memTotalMB, metrics.Mem.UsagePercent, loadStr), nil
		})
	if err != nil {
		return nil, err
	}

	// 3. ssh_exec_command
	execCmdTool, err := utils.InferTool("ssh_exec_command", "在远程 SSH 服务器上执行 Shell 命令行并获取输出（受权限审查模块监管与二次确认）",
		func(ctx context.Context, input *SSHExecCommandInput) (*SSHExecCommandOutput, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return nil, err
			}
			info := sess.Info()
			cmd := strings.TrimSpace(input.Command)
			if cmd == "" {
				return nil, fmt.Errorf("命令不能为空")
			}
			if wm != nil {
				wm.EmitToolStart("ssh_exec_command", fmt.Sprintf("正在在 [%s] 执行命令: %s", info.Title, cmd))
			}
			out, err := sess.ExecCombined(cmd)
			if err != nil && out == "" {
				return nil, fmt.Errorf("执行命令失败: %w", err)
			}
			if len(out) > 50000 {
				out = out[:50000] + "\n...(输出过长已被截断)"
			}
			return &SSHExecCommandOutput{
				SessionID: info.ID,
				Command:   cmd,
				Output:    out,
			}, nil
		})
	if err != nil {
		return nil, err
	}

	return []tool.BaseTool{listSessionsTool, getSysInfoTool, execCmdTool}, nil
}
