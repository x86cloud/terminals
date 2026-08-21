package tools

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"terminal/agent/guard"
	"terminal/ssh"

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
	SessionID string `json:"session_id" jsonschema:"description=要查询的目标 SSH 会话 ID 或服务器名称，如留空则自动使用当前激活的会话"`
}

type SSHExecCommandInput struct {
	SessionID string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID 或服务器名称，如留空则自动使用当前激活的会话"`
	Command   string `json:"command" jsonschema:"description=要在远程服务器上执行的 Shell 命令行"`
}

type SSHExecCommandOutput struct {
	SessionID string `json:"session_id"`
	Command   string `json:"command"`
	Output    string `json:"output"`
}

type SSHListDirInput struct {
	SessionID string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID 或服务器名称，如留空则自动使用当前激活的会话"`
	Path      string `json:"path" jsonschema:"description=远程服务器目标目录路径，留空或 ~ 表示家目录"`
}

type SSHReadFileInput struct {
	SessionID string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID 或服务器名称，如留空则自动使用当前激活的会话"`
	Path      string `json:"path" jsonschema:"description=要读取的远程文件路径"`
}

type SSHWriteFileInput struct {
	SessionID string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID 或服务器名称，如留空则自动使用当前激活的会话"`
	Path      string `json:"path" jsonschema:"description=要写入的远程文件路径"`
	Content   string `json:"content" jsonschema:"description=要写入的文本内容"`
}

type SSHDeleteFileInput struct {
	SessionID string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID 或服务器名称，如留空则自动使用当前激活的会话"`
	Path      string `json:"path" jsonschema:"description=要删除的远程文件或文件夹路径"`
}

type SSHDownloadFileInput struct {
	SessionID  string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID 或服务器名称，如留空则自动使用当前激活的会话"`
	RemotePath string `json:"remote_path" jsonschema:"description=要下载的远程文件路径"`
	LocalName  string `json:"local_name" jsonschema:"description=保存至本地工作目录的文件名，留空则默认保持原文件名"`
}

type SSHUploadFileInput struct {
	SessionID  string `json:"session_id" jsonschema:"description=目标 SSH 会话 ID 或服务器名称，如留空则自动使用当前激活的会话"`
	LocalPath  string `json:"local_path" jsonschema:"description=本地工作目录中的文件路径（可以是相对路径）"`
	RemotePath string `json:"remote_path" jsonschema:"description=目标远程服务器保存路径"`
}

func RegisterSSHTools(bus *ToolBus, sm *ssh.SessionManager, wm *WorkspaceManager) error {
	if sm == nil {
		return nil
	}

	resolveSession := func(sessionID string) (*ssh.Session, error) {
		if sessionID != "" {
			if sess, err := sm.Get(sessionID); err == nil {
				return sess, nil
			}
			sessions := sm.List()
			for _, s := range sessions {
				if s.Connected && (strings.EqualFold(s.ID, sessionID) ||
					strings.EqualFold(s.Title, sessionID) ||
					strings.EqualFold(s.Host, sessionID) ||
					strings.Contains(strings.ToLower(s.Title), strings.ToLower(sessionID)) ||
					strings.Contains(strings.ToLower(s.Host), strings.ToLower(sessionID))) {
					return sm.Get(s.ID)
				}
			}
		}
		sessions := sm.List()
		for _, s := range sessions {
			if s.Connected {
				return sm.Get(s.ID)
			}
		}
		return nil, fmt.Errorf("当前没有处于已连通状态的 SSH 会话")
	}

	// 1. ssh_list_sessions
	listSessionsTool, err := utils.InferTool("ssh_list_sessions", "列出当前已连接并可用的远程 SSH 会话",
		func(ctx context.Context, input *SSHListSessionsInput) (*SSHListSessionsOutput, error) {
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
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "ssh_list_sessions",
			Description: "列出当前已连接并可用的远程 SSH 会话",
			BaseTool:    listSessionsTool,
			Level:       guard.LevelAllow,
		})
	}

	// 2. ssh_get_system_info
	sysInfoTool, err := utils.InferTool("ssh_get_system_info", "获取远程服务器 CPU/内存/磁盘及运行时间概况",
		func(ctx context.Context, input *SSHGetSystemInfoInput) (any, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return nil, err
			}
			return sm.GetDashboardStats(sess.Info().ID)
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "ssh_get_system_info",
			Description: "获取远程服务器 CPU/内存/磁盘及运行时间概况",
			BaseTool:    sysInfoTool,
			Level:       guard.LevelAllow,
		})
	}

	// 3. ssh_exec_command
	execCmdTool, err := utils.InferTool("ssh_exec_command", "在远程服务器上执行 Shell 命令行",
		func(ctx context.Context, input *SSHExecCommandInput) (*SSHExecCommandOutput, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return nil, err
			}
			out, err := sess.ExecCombined(input.Command)
			if err != nil {
				return nil, fmt.Errorf("执行远程命令失败: %w", err)
			}
			return &SSHExecCommandOutput{
				SessionID: sess.Info().ID,
				Command:   input.Command,
				Output:    out,
			}, nil
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "ssh_exec_command",
			Description: "在远程服务器上执行 Shell 命令行",
			BaseTool:    execCmdTool,
			Level:       guard.LevelConfirm,
		})
	}

	// 4. ssh_list_dir
	listDirTool, err := utils.InferTool("ssh_list_dir", "查看远程服务器上的目录和文件列表",
		func(ctx context.Context, input *SSHListDirInput) (any, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return nil, err
			}
			targetPath := input.Path
			if targetPath == "" || targetPath == "~" {
				targetPath = sess.Info().HomeDir
			}
			return sm.ListDir(sess.Info().ID, targetPath)
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "ssh_list_dir",
			Description: "查看远程服务器上的目录和文件列表",
			BaseTool:    listDirTool,
			Level:       guard.LevelAllow,
		})
	}

	// 5. ssh_read_file
	readFileTool, err := utils.InferTool("ssh_read_file", "读取远程服务器上的指定文本文件内容",
		func(ctx context.Context, input *SSHReadFileInput) (string, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return "", err
			}
			cmd := fmt.Sprintf("cat %s", ssh.NormalizeRemote(input.Path))
			content, err := sess.ExecCombined(cmd)
			if err != nil {
				return "", err
			}
			if len(content) > 200000 {
				content = content[:200000] + "\n...(远程文件内容过长，已被截断)"
			}
			return content, nil
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "ssh_read_file",
			Description: "读取远程服务器上的指定文本文件内容",
			BaseTool:    readFileTool,
			Level:       guard.LevelAllow,
		})
	}

	// 6. ssh_write_file
	writeFileTool, err := utils.InferTool("ssh_write_file", "在远程服务器上写入或修改文件",
		func(ctx context.Context, input *SSHWriteFileInput) (string, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return "", err
			}
			encoded := base64.StdEncoding.EncodeToString([]byte(input.Content))
			cmd := fmt.Sprintf("echo %s | base64 -d > %s", encoded, ssh.NormalizeRemote(input.Path))
			if _, err := sess.ExecCombined(cmd); err != nil {
				return "", fmt.Errorf("写入远程文件失败: %w", err)
			}
			return fmt.Sprintf("成功向远程文件 [%s] 写入 %d 字节", input.Path, len(input.Content)), nil
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "ssh_write_file",
			Description: "在远程服务器上写入或修改文件",
			BaseTool:    writeFileTool,
			Level:       guard.LevelConfirm,
		})
	}

	// 7. ssh_delete_file
	deleteFileTool, err := utils.InferTool("ssh_delete_file", "在远程服务器上删除指定文件或目录",
		func(ctx context.Context, input *SSHDeleteFileInput) (string, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return "", err
			}
			if err := sm.RemoveRemotePath(sess.Info().ID, input.Path); err != nil {
				return "", fmt.Errorf("删除远程文件失败: %w", err)
			}
			return fmt.Sprintf("成功删除远程路径 [%s]", input.Path), nil
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "ssh_delete_file",
			Description: "在远程服务器上删除指定文件或目录",
			BaseTool:    deleteFileTool,
			Level:       guard.LevelConfirm,
		})
	}

	// 8. ssh_download_file
	downloadFileTool, err := utils.InferTool("ssh_download_file", "从远程服务器下载文件至本地工作目录",
		func(ctx context.Context, input *SSHDownloadFileInput) (string, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return "", err
			}
			cmd := fmt.Sprintf("cat %s", ssh.NormalizeRemote(input.RemotePath))
			content, err := sess.ExecCombined(cmd)
			if err != nil {
				return "", fmt.Errorf("读取远程文件失败: %w", err)
			}
			fileName := input.LocalName
			if fileName == "" {
				fileName = filepath.Base(input.RemotePath)
			}
			localFullPath, err := wm.ResolvePath(fileName)
			if err != nil {
				return "", err
			}
			if err := os.WriteFile(localFullPath, []byte(content), 0o644); err != nil {
				return "", fmt.Errorf("保存本地文件失败: %w", err)
			}
			return fmt.Sprintf("成功将远程文件 [%s] 下载至本地 [%s]", input.RemotePath, fileName), nil
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "ssh_download_file",
			Description: "从远程服务器下载文件至本地工作目录",
			BaseTool:    downloadFileTool,
			Level:       guard.LevelAllow,
		})
	}

	// 9. ssh_upload_file
	uploadFileTool, err := utils.InferTool("ssh_upload_file", "上传本地工作目录中的文件至远程服务器",
		func(ctx context.Context, input *SSHUploadFileInput) (string, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return "", err
			}
			localFullPath, err := wm.ResolvePath(input.LocalPath)
			if err != nil {
				return "", err
			}
			data, err := os.ReadFile(localFullPath)
			if err != nil {
				return "", fmt.Errorf("读取本地文件失败: %w", err)
			}
			encoded := base64.StdEncoding.EncodeToString(data)
			cmd := fmt.Sprintf("echo %s | base64 -d > %s", encoded, ssh.NormalizeRemote(input.RemotePath))
			if _, err := sess.ExecCombined(cmd); err != nil {
				return "", fmt.Errorf("上传远程文件失败: %w", err)
			}
			return fmt.Sprintf("成功将本地文件 [%s] 上传至远程服务器 [%s]", input.LocalPath, input.RemotePath), nil
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "ssh_upload_file",
			Description: "上传本地工作目录中的文件至远程服务器",
			BaseTool:    uploadFileTool,
			Level:       guard.LevelConfirm,
		})
	}

	// 10. ssh_list_processes
	processesTool, err := utils.InferTool("ssh_list_processes", "查看远程服务器上运行的进程列表",
		func(ctx context.Context, input *SSHGetSystemInfoInput) (any, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return nil, err
			}
			return sm.GetProcessList(sess.Info().ID)
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "ssh_list_processes",
			Description: "查看远程服务器上运行的进程列表",
			BaseTool:    processesTool,
			Level:       guard.LevelAllow,
		})
	}

	// 11. ssh_list_containers
	containersTool, err := utils.InferTool("ssh_list_containers", "查看远程服务器上的 Docker 容器列表",
		func(ctx context.Context, input *SSHGetSystemInfoInput) (any, error) {
			sess, err := resolveSession(input.SessionID)
			if err != nil {
				return nil, err
			}
			return sm.GetDockerContainerList(sess.Info().ID)
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "ssh_list_containers",
			Description: "查看远程服务器上的 Docker 容器列表",
			BaseTool:    containersTool,
			Level:       guard.LevelAllow,
		})
	}

	return nil
}
