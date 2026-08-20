//go:build !windows

package shell

import (
	"context"
	"os/exec"
	"syscall"
)

// newOSCommand creates a Unix/Linux/macOS-specific exec.Cmd using Bash (or Sh fallback).
func newOSCommand(ctx context.Context, command string) *exec.Cmd {
	var cmd *exec.Cmd
	if bashPath, err := exec.LookPath("/bin/bash"); err == nil && bashPath != "" {
		cmd = exec.CommandContext(ctx, bashPath, "-c", command)
	} else if bashPath, err := exec.LookPath("bash"); err == nil && bashPath != "" {
		cmd = exec.CommandContext(ctx, bashPath, "-c", command)
	} else {
		cmd = exec.CommandContext(ctx, "/bin/sh", "-c", command)
	}

	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
	}
	return cmd
}

// killProcessTree terminates the process group on Unix platforms.
func killProcessTree(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	pid := cmd.Process.Pid
	if pid > 0 {
		_ = syscall.Kill(-pid, syscall.SIGKILL)
	}
	_ = cmd.Process.Kill()
}
