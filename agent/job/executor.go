package job

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"terminal/ssh"
)

// JobExecutor 真实执行一个作业指令，产出增量输出。
type JobExecutor interface {
	Execute(ctx context.Context, spec ExecSpec, emitOutput func(line string)) error
}

type ExecSpec struct {
	Target     string            `json:"target"` // "local" | "ssh"
	Session    string            `json:"session"`
	Command    string            `json:"command"`
	Cwd        string            `json:"cwd"`
	Shell      string            `json:"shell"`
	TimeoutSec int               `json:"timeout_sec"`
	Env        map[string]string `json:"env"`
}

type WorkspaceDirProvider interface {
	GetDir() string
}

// LocalExecutor —— 本地 Shell 执行
type LocalExecutor struct {
	wm WorkspaceDirProvider
}

func NewLocalExecutor(wm WorkspaceDirProvider) *LocalExecutor {
	return &LocalExecutor{wm: wm}
}

func (e *LocalExecutor) Execute(ctx context.Context, spec ExecSpec, emitOutput func(string)) error {
	trimmedCmd := strings.TrimSpace(spec.Command)
	if trimmedCmd == "" {
		return errors.New("执行命令不能为空")
	}

	// 1. 确定工作目录
	cwd := spec.Cwd
	if cwd == "" && e.wm != nil {
		cwd = e.wm.GetDir()
	}
	if cwd != "" {
		absCwd, err := filepath.Abs(cwd)
		if err == nil {
			cwd = absCwd
		}
	}

	// 2. 解析 Shell 命令
	shellProg, shellArgs := resolveLocalShell(spec.Shell, trimmedCmd)

	cmd := exec.CommandContext(ctx, shellProg, shellArgs...)
	if cwd != "" {
		cmd.Dir = cwd
	}

	// 3. 合并环境变量
	cmd.Env = mergeEnv(spec.Env)

	// 4. 创建管道
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("创建 stdout 管道失败: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("创建 stderr 管道失败: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("启动进程失败: %w", err)
	}

	pid := 0
	if cmd.Process != nil {
		pid = cmd.Process.Pid
	}

	// 5. 双管道按行合并读取
	doneCh := make(chan struct{})
	go func() {
		defer close(doneCh)
		reader := io.MultiReader(stdout, stderr)
		scanner := bufio.NewScanner(reader)
		// 允许单行最长 64KB
		buf := make([]byte, 64*1024)
		scanner.Buffer(buf, 1024*1024)

		lineCount := 0
		const maxLines = 2000
		for scanner.Scan() {
			lineCount++
			if lineCount <= maxLines {
				emitOutput(scanner.Text())
			} else if lineCount == maxLines+1 {
				emitOutput("⚠️ [输出过长，已截断后续输出...]")
			}
		}
	}()

	waitErr := cmd.Wait()
	<-doneCh

	// 如果上下文取消或超时，在 Windows 下额外杀进程树
	if ctx.Err() != nil && pid > 0 && runtime.GOOS == "windows" {
		killProcessTreeWindows(pid)
	}

	if ctx.Err() == context.DeadlineExceeded {
		return fmt.Errorf("作业执行超时 (超过 %d 秒)", spec.TimeoutSec)
	}
	if ctx.Err() == context.Canceled {
		return errors.New("作业已被主动取消 (Killed)")
	}

	return waitErr
}

func resolveLocalShell(customShell, command string) (string, []string) {
	if customShell != "" {
		if strings.EqualFold(customShell, "powershell") || strings.EqualFold(customShell, "pwsh") {
			return "powershell", []string{"-NoProfile", "-NonInteractive", "-Command", command}
		}
		if strings.EqualFold(customShell, "cmd") || strings.EqualFold(customShell, "cmd.exe") {
			return "cmd.exe", []string{"/c", command}
		}
		if strings.EqualFold(customShell, "bash") || strings.EqualFold(customShell, "sh") {
			return customShell, []string{"-c", command}
		}
		return customShell, []string{"-c", command}
	}

	if runtime.GOOS == "windows" {
		return "powershell", []string{"-NoProfile", "-NonInteractive", "-Command", command}
	}
	return "bash", []string{"-c", command}
}

func mergeEnv(customEnv map[string]string) []string {
	baseEnv := os.Environ()
	if len(customEnv) == 0 {
		return baseEnv
	}
	envMap := make(map[string]string)
	for _, env := range baseEnv {
		parts := strings.SplitN(env, "=", 2)
		if len(parts) == 2 {
			envMap[parts[0]] = parts[1]
		}
	}
	for k, v := range customEnv {
		envMap[k] = v
	}
	result := make([]string, 0, len(envMap))
	for k, v := range envMap {
		result = append(result, fmt.Sprintf("%s=%s", k, v))
	}
	return result
}

func killProcessTreeWindows(pid int) {
	if pid <= 0 {
		return
	}
	killCmd := exec.Command("taskkill", "/PID", strconv.Itoa(pid), "/T", "/F")
	_ = killCmd.Run()
}

// SSHExecutor —— 远程 SSH 执行
type SSHExecutor struct {
	sm *ssh.SessionManager
}

func NewSSHExecutor(sm *ssh.SessionManager) *SSHExecutor {
	return &SSHExecutor{sm: sm}
}

func (e *SSHExecutor) Execute(ctx context.Context, spec ExecSpec, emitOutput func(string)) error {
	trimmedCmd := strings.TrimSpace(spec.Command)
	if trimmedCmd == "" {
		return errors.New("远程执行命令不能为空")
	}

	if e.sm == nil {
		return errors.New("SSH 会话管理器未初始化")
	}

	// 1. 解析 SSH Session
	sess, err := resolveSSHSession(e.sm, spec.Session)
	if err != nil {
		return err
	}

	// 2. 执行远程命令
	out, err := sess.ExecCombinedWithContext(ctx, trimmedCmd)
	if err != nil && out == "" {
		return fmt.Errorf("远程执行失败: %w", err)
	}

	// 3. 输出拆分推送
	lines := strings.Split(out, "\n")
	for _, line := range lines {
		tLine := strings.TrimRight(line, "\r")
		if strings.TrimSpace(tLine) != "" {
			emitOutput(tLine)
		}
	}

	return err
}

func resolveSSHSession(sm *ssh.SessionManager, sessionIDOrName string) (*ssh.Session, error) {
	activeSess := sm.List()
	if len(activeSess) == 0 {
		return nil, errors.New("当前暂无已连通的 SSH 会话，请先在 SSH 终端建立连接")
	}

	trimmed := strings.TrimSpace(sessionIDOrName)
	if trimmed != "" {
		if sess, err := sm.Get(trimmed); err == nil && sess != nil {
			return sess, nil
		}
		for _, info := range activeSess {
			if strings.EqualFold(info.ID, trimmed) || strings.EqualFold(info.Title, trimmed) || strings.EqualFold(info.Host, trimmed) {
				if sess, err := sm.Get(info.ID); err == nil && sess != nil {
					return sess, nil
				}
			}
		}
	}

	if len(activeSess) == 1 {
		if sess, err := sm.Get(activeSess[0].ID); err == nil && sess != nil {
			return sess, nil
		}
	}

	return nil, fmt.Errorf("未找到匹配的 SSH 会话 [%s]，当前活跃会话数: %d", sessionIDOrName, len(activeSess))
}
