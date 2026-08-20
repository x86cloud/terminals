package shell

import (
	"context"
	"errors"
	"io"
	"os"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/cloudwego/eino/adk/filesystem"
)

func TestLocalStreamingShell_Execute_Echo(t *testing.T) {
	ctx := context.Background()
	sh := NewLocalStreamingShell("")

	cmdStr := "echo hello_cross_platform"
	if runtime.GOOS == "windows" {
		cmdStr = "Write-Output hello_cross_platform"
	}

	resp, err := sh.Execute(ctx, &filesystem.ExecuteRequest{
		Command: cmdStr,
	})
	if err != nil {
		t.Fatalf("Execute failed: %v", err)
	}

	if resp.ExitCode == nil || *resp.ExitCode != 0 {
		t.Fatalf("Expected exit code 0, got %v", resp.ExitCode)
	}

	if !strings.Contains(strings.TrimSpace(resp.Output), "hello_cross_platform") {
		t.Fatalf("Expected output containing 'hello_cross_platform', got %q", resp.Output)
	}
}

func TestLocalStreamingShell_ExecuteStreaming(t *testing.T) {
	ctx := context.Background()
	sh := NewLocalStreamingShell("")

	cmdStr := "echo line1; echo line2; echo line3"
	if runtime.GOOS == "windows" {
		cmdStr = "Write-Output line1; Write-Output line2; Write-Output line3"
	}

	sr, err := sh.ExecuteStreaming(ctx, &filesystem.ExecuteRequest{
		Command: cmdStr,
	})
	if err != nil {
		t.Fatalf("ExecuteStreaming failed: %v", err)
	}
	defer sr.Close()

	var lines []string
	var exitCode *int

	for {
		chunk, err := sr.Recv()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			t.Fatalf("Recv failed: %v", err)
		}
		if chunk != nil {
			if chunk.Output != "" {
				lines = append(lines, strings.TrimSpace(chunk.Output))
			}
			if chunk.ExitCode != nil {
				exitCode = chunk.ExitCode
			}
		}
	}

	if exitCode == nil || *exitCode != 0 {
		t.Fatalf("Expected exit code 0, got %v", exitCode)
	}

	joined := strings.Join(lines, "\n")
	if !strings.Contains(joined, "line1") || !strings.Contains(joined, "line2") || !strings.Contains(joined, "line3") {
		t.Fatalf("Expected output containing line1, line2, line3, got %q", joined)
	}
}

func TestLocalStreamingShell_Cwd(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "shell_cwd_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	sh := NewLocalStreamingShell(tmpDir)
	if sh.GetCwd() != tmpDir {
		t.Fatalf("Expected cwd %q, got %q", tmpDir, sh.GetCwd())
	}
}

func TestLocalStreamingShell_Timeout(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()

	sh := NewLocalStreamingShell("")

	cmdStr := "sleep 5"
	if runtime.GOOS == "windows" {
		cmdStr = "Start-Sleep -Seconds 5"
	}

	start := time.Now()
	_, _ = sh.Execute(ctx, &filesystem.ExecuteRequest{
		Command: cmdStr,
	})
	duration := time.Since(start)

	if duration > 3*time.Second {
		t.Fatalf("Command did not terminate upon timeout, took %v", duration)
	}
}

func TestLocalStreamingShell_Background(t *testing.T) {
	ctx := context.Background()
	sh := NewLocalStreamingShell("")

	cmdStr := "echo background"
	if runtime.GOOS == "windows" {
		cmdStr = "Write-Output background"
	}

	resp, err := sh.Execute(ctx, &filesystem.ExecuteRequest{
		Command:            cmdStr,
		RunInBackendGround: true,
	})
	if err != nil {
		t.Fatalf("Background execution failed: %v", err)
	}

	if !strings.Contains(resp.Output, "background") {
		t.Fatalf("Expected background output notice, got %q", resp.Output)
	}
}
