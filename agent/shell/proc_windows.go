//go:build windows

package shell

import (
	"context"
	"os/exec"
	"strconv"
	"syscall"
)

// newOSCommand creates a Windows-specific exec.Cmd using PowerShell (or CMD fallback).
func newOSCommand(ctx context.Context, command string) *exec.Cmd {
	var cmd *exec.Cmd
	if psPath, err := exec.LookPath("powershell.exe"); err == nil && psPath != "" {
		cmd = exec.CommandContext(ctx, psPath, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command)
	} else if psPath, err := exec.LookPath("powershell"); err == nil && psPath != "" {
		cmd = exec.CommandContext(ctx, psPath, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command)
	} else {
		cmd = exec.CommandContext(ctx, "cmd.exe", "/c", command)
	}

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
