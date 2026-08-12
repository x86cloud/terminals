package agent

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
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

type SSHListDirInput struct {
	SessionID string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID，如留空则自动使用当前激活的会话"`
	Path      string `json:"path" jsonschema:"description=远程服务器目标目录路径，留空或 ~ 表示家目录"`
}

type SSHReadFileInput struct {
	SessionID string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID，如留空则自动使用当前激活的会话"`
	Path      string `json:"path" jsonschema:"description=要读取的远程文件路径"`
}

type SSHWriteFileInput struct {
	SessionID string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID，如留空则自动使用当前激活的会话"`
	Path      string `json:"path" jsonschema:"description=要写入的远程文件路径"`
	Content   string `json:"content" jsonschema:"description=要写入的文本内容"`
}

type SSHDeleteFileInput struct {
	SessionID string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID，如留空则自动使用当前激活的会话"`
	Path      string `json:"path" jsonschema:"description=要删除的远程文件或文件夹路径"`
}

type SSHDownloadFileInput struct {
	SessionID  string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID，如留空则自动使用当前激活的会话"`
	RemotePath string `json:"remote_path" jsonschema:"description=要下载的远程文件路径"`
	LocalName  string `json:"local_name" jsonschema:"description=保存至本地工作目录的文件名，留空则默认保持原文件名"`
}

type SSHUploadFileInput struct {
	SessionID  string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID，如留空则自动使用当前激活的会话"`
	LocalPath  string `json:"local_path" jsonschema:"description=本地工作目录中的文件路径（可以是相对路径）"`
	RemotePath string `json:"remote_path" jsonschema:"description=目标远程服务器保存路径"`
}

func BuildSSHTools(sm *ssh.SessionManager, wm *WorkspaceManager) ([]tool.BaseTool, error) {
	if sm == nil {
		return nil, nil
	}

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

	// 4. ssh_list_dir
	listDirTool, err := utils.InferTool("ssh_list_dir", "通过 SFTP 查看远程服务器指定目录下的文件与子目录结构",
		func(ctx context.Context, input *SSHListDirInput) (string, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return "", err
			}
			info := sess.Info()
			if wm != nil {
				wm.EmitToolStart("ssh_list_dir", fmt.Sprintf("正在查看 [%s] 远程目录 [%s]...", info.Title, input.Path))
			}
			listing, err := sm.ListDir(info.ID, input.Path)
			if err != nil {
				return "", err
			}
			var sb strings.Builder
			sb.WriteString(fmt.Sprintf("远程服务器 [%s] 目录 [%s] 下的内容 (%d 项):\n", info.Title, listing.Path, len(listing.Items)))
			for _, item := range listing.Items {
				typeStr := "文件"
				if item.IsDir {
					typeStr = "目录"
				} else if item.IsLink {
					typeStr = "软链接"
				}
				sb.WriteString(fmt.Sprintf("- %s [%s] (%d bytes)\n", item.Name, typeStr, item.Size))
			}
			return sb.String(), nil
		})
	if err != nil {
		return nil, err
	}

	// 5. ssh_read_file
	readFileTool, err := utils.InferTool("ssh_read_file", "通过 SFTP 读取远程服务器上的文本文件内容",
		func(ctx context.Context, input *SSHReadFileInput) (string, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return "", err
			}
			info := sess.Info()
			if wm != nil {
				wm.EmitToolStart("ssh_read_file", fmt.Sprintf("正在读取 [%s] 远程文件 [%s]...", info.Title, input.Path))
			}
			remotePath := ssh.NormalizeRemote(input.Path)
			cmd := fmt.Sprintf("cat %s", remotePath)
			content, err := sess.ExecCombined(cmd)
			if err != nil && content == "" {
				return "", fmt.Errorf("读取远程文件失败: %w", err)
			}
			if len(content) > 50000 {
				content = content[:50000] + "\n...(文件内容过长已被截断)"
			}
			return content, nil
		})
	if err != nil {
		return nil, err
	}

	// 6. ssh_write_file
	writeFileTool, err := utils.InferTool("ssh_write_file", "通过 SFTP 在远程服务器上写入或修改文件内容（受权限审查模块监管与二次确认）",
		func(ctx context.Context, input *SSHWriteFileInput) (string, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return "", err
			}
			info := sess.Info()
			if wm != nil {
				wm.EmitToolStart("ssh_write_file", fmt.Sprintf("正在在 [%s] 写入文件 [%s]...", info.Title, input.Path))
			}
			remotePath := ssh.NormalizeRemote(input.Path)
			encoded := base64.StdEncoding.EncodeToString([]byte(input.Content))
			cmd := fmt.Sprintf("echo %s | base64 -d > %s", encoded, remotePath)
			if _, err := sess.ExecCombined(cmd); err != nil {
				return "", fmt.Errorf("写入远程文件失败: %w", err)
			}
			return fmt.Sprintf("成功在服务器 [%s] 写入文件 [%s]", info.Title, input.Path), nil
		})
	if err != nil {
		return nil, err
	}

	// 7. ssh_delete_file
	deleteFileTool, err := utils.InferTool("ssh_delete_file", "通过 SFTP 在远程服务器上删除指定文件或目录（受权限审查模块监管与二次确认）",
		func(ctx context.Context, input *SSHDeleteFileInput) (string, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return "", err
			}
			info := sess.Info()
			if wm != nil {
				wm.EmitToolStart("ssh_delete_file", fmt.Sprintf("正在删除 [%s] 远程路径 [%s]...", info.Title, input.Path))
			}
			if err := sm.RemoveRemotePath(info.ID, input.Path); err != nil {
				return "", fmt.Errorf("删除远程文件失败: %w", err)
			}
			return fmt.Sprintf("成功从服务器 [%s] 删除 [%s]", info.Title, input.Path), nil
		})
	if err != nil {
		return nil, err
	}

	// 8. ssh_download_file
	downloadFileTool, err := utils.InferTool("ssh_download_file", "从远程服务器 SFTP 下载文件至本地当前工作目录（只读放行）",
		func(ctx context.Context, input *SSHDownloadFileInput) (string, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return "", err
			}
			info := sess.Info()

			wsDir := wm.GetDir()
			if wsDir == "" {
				return "", fmt.Errorf("当前未关联本地工作目录，请先在 AI Agent 页面选择工作目录")
			}

			localName := strings.TrimSpace(input.LocalName)
			if localName == "" {
				localName = filepath.Base(input.RemotePath)
			}
			localPath := filepath.Join(wsDir, localName)

			if wm != nil {
				wm.EmitToolStart("ssh_download_file", fmt.Sprintf("正在从 [%s] 下载 [%s] 到本地 [%s]...", info.Title, input.RemotePath, localName))
			}

			remotePath := ssh.NormalizeRemote(input.RemotePath)
			cmd := fmt.Sprintf("cat %s", remotePath)
			content, err := sess.ExecCombined(cmd)
			if err != nil && content == "" {
				return "", fmt.Errorf("下载远程文件失败: %w", err)
			}
			if err := os.WriteFile(localPath, []byte(content), 0o644); err != nil {
				return "", fmt.Errorf("保存文件至本地工作目录失败: %w", err)
			}

			return fmt.Sprintf("成功从远程服务器 [%s] 下载文件 [%s] 并保存至本地工作目录 [%s]", info.Title, input.RemotePath, localPath), nil
		})
	if err != nil {
		return nil, err
	}

	// 9. ssh_upload_file
	uploadFileTool, err := utils.InferTool("ssh_upload_file", "上传本地工作目录中的文件至远程服务器 SFTP（受权限审查模块监管与二次确认）",
		func(ctx context.Context, input *SSHUploadFileInput) (string, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return "", err
			}
			info := sess.Info()

			localPath, err := wm.ResolvePath(input.LocalPath)
			if err != nil {
				return "", fmt.Errorf("解析本地文件路径失败: %w", err)
			}

			contentBytes, err := os.ReadFile(localPath)
			if err != nil {
				return "", fmt.Errorf("读取本地文件失败: %w", err)
			}

			if wm != nil {
				wm.EmitToolStart("ssh_upload_file", fmt.Sprintf("正在上传本地文件 [%s] 至 [%s:%s]...", input.LocalPath, info.Title, input.RemotePath))
			}

			remotePath := ssh.NormalizeRemote(input.RemotePath)
			encoded := base64.StdEncoding.EncodeToString(contentBytes)
			cmd := fmt.Sprintf("echo %s | base64 -d > %s", encoded, remotePath)
			if _, err := sess.ExecCombined(cmd); err != nil {
				return "", fmt.Errorf("上传文件至远程服务器失败: %w", err)
			}

			return fmt.Sprintf("成功将本地文件 [%s] 上传至远程服务器 [%s] 的 [%s]", input.LocalPath, info.Title, input.RemotePath), nil
		})
	if err != nil {
		return nil, err
	}

	return []tool.BaseTool{
		listSessionsTool,
		getSysInfoTool,
		execCmdTool,
		listDirTool,
		readFileTool,
		writeFileTool,
		deleteFileTool,
		downloadFileTool,
		uploadFileTool,
	}, nil
}
