//go:build windows

package shell

import (
	"context"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
)

// newOSCommand creates an optimized Windows-specific exec.Cmd using PowerShell (or CMD fallback) with UTF-8 output encoding.
func newOSCommand(ctx context.Context, command string) *exec.Cmd {
	var cmd *exec.Cmd
	// Prepend UTF-8 output encoding so non-ASCII & Chinese characters from CLI tools are preserved cleanly
	utf8Wrapper := "$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; " + command

	if psPath, err := exec.LookPath("powershell.exe"); err == nil && psPath != "" {
		cmd = exec.CommandContext(ctx, psPath, "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", utf8Wrapper)
	} else if psPath, err := exec.LookPath("powershell"); err == nil && psPath != "" {
		cmd = exec.CommandContext(ctx, psPath, "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", utf8Wrapper)
	} else {
		cmd = exec.CommandContext(ctx, "cmd.exe", "/d", "/c", "chcp 65001 >nul && "+command)
	}

	cmd.Stdin = strings.NewReader("")
	// Ensure UTF-8 environment for Python, Node, Git, etc.
	cmd.Env = append(os.Environ(),
		"PYTHONIOENCODING=utf-8",
		"LANG=zh_CN.UTF-8",
		"LC_ALL=zh_CN.UTF-8",
	)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow: true,
	}
	return cmd
}

// killProcessTree terminates the command and all its child processes on Windows.
func killProcessTree(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	pid := cmd.Process.Pid
	if pid > 0 {
		killCmd := exec.Command("taskkill", "/PID", strconv.Itoa(pid), "/T", "/F")
		killCmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
		_ = killCmd.Run()
	}
	_ = cmd.Process.Kill()
}
