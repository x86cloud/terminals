package shell

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/cloudwego/eino/adk/filesystem"
	"github.com/cloudwego/eino/schema"
)

const (
	// maxOutputBytes caps output at 1MB to prevent buffer explosion
	maxOutputBytes = 1024 * 1024
)

// LocalStreamingShell provides cross-platform streaming shell execution supporting Windows, Linux and macOS.
type LocalStreamingShell struct {
	mu  sync.RWMutex
	cwd string
}

// Ensure LocalStreamingShell implements filesystem.StreamingShell and filesystem.Shell
var (
	_ filesystem.StreamingShell = (*LocalStreamingShell)(nil)
	_ filesystem.Shell          = (*LocalStreamingShell)(nil)
)

// NewLocalStreamingShell creates a new LocalStreamingShell instance with the specified working directory.
func NewLocalStreamingShell(cwd string) *LocalStreamingShell {
	return &LocalStreamingShell{
		cwd: cwd,
	}
}

// SetCwd updates the current working directory.
func (s *LocalStreamingShell) SetCwd(cwd string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cwd = cwd
}

// GetCwd returns the current working directory.
func (s *LocalStreamingShell) GetCwd() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.cwd != "" {
		if fi, err := os.Stat(s.cwd); err == nil && fi.IsDir() {
			return s.cwd
		}
	}
	// Fallback to current working directory
	if wd, err := os.Getwd(); err == nil {
		return wd
	}
	return ""
}

// buildCommand creates the platform-appropriate exec.Cmd for the given command string.
func (s *LocalStreamingShell) buildCommand(ctx context.Context, command string) *exec.Cmd {
	trimmed := strings.TrimSpace(command)
	cmd := newOSCommand(ctx, trimmed)

	if cwd := s.GetCwd(); cwd != "" {
		cmd.Dir = cwd
	}

	return cmd
}

// Execute executes a command synchronously and returns the complete result.
func (s *LocalStreamingShell) Execute(ctx context.Context, input *filesystem.ExecuteRequest) (*filesystem.ExecuteResponse, error) {
	if input == nil || strings.TrimSpace(input.Command) == "" {
		return nil, errors.New("command cannot be empty")
	}

	sr, err := s.ExecuteStreaming(ctx, input)
	if err != nil {
		return nil, err
	}
	defer sr.Close()

	var outBuilder strings.Builder
	var exitCode *int
	var isTruncated bool

	for {
		resp, err := sr.Recv()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, err
		}
		if resp != nil {
			if resp.Output != "" {
				outBuilder.WriteString(resp.Output)
			}
			if resp.ExitCode != nil {
				exitCode = resp.ExitCode
			}
			if resp.Truncated {
				isTruncated = true
			}
		}
	}

	if exitCode == nil {
		zero := 0
		exitCode = &zero
	}

	return &filesystem.ExecuteResponse{
		Output:    outBuilder.String(),
		ExitCode:  exitCode,
		Truncated: isTruncated,
	}, nil
}

// ExecuteStreaming executes a command and streams output line by line to a StreamReader.
func (s *LocalStreamingShell) ExecuteStreaming(ctx context.Context, input *filesystem.ExecuteRequest) (*schema.StreamReader[*filesystem.ExecuteResponse], error) {
	if input == nil || strings.TrimSpace(input.Command) == "" {
		return nil, errors.New("command cannot be empty")
	}

	cmd := s.buildCommand(ctx, input.Command)

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		_ = stdoutPipe.Close()
		return nil, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		_ = stdoutPipe.Close()
		_ = stderrPipe.Close()
		return nil, fmt.Errorf("failed to start command: %w", err)
	}

	sr, sw := schema.Pipe[*filesystem.ExecuteResponse](32)

	// Background execution mode
	if input.RunInBackendGround {
		go func() {
			defer func() {
				_ = stdoutPipe.Close()
				_ = stderrPipe.Close()
			}()

			done := make(chan struct{})
			go func() {
				// Drain pipes in background
				var wg sync.WaitGroup
				wg.Add(2)
				go func() {
					defer wg.Done()
					_, _ = io.Copy(io.Discard, stdoutPipe)
				}()
				go func() {
					defer wg.Done()
					_, _ = io.Copy(io.Discard, stderrPipe)
				}()
				wg.Wait()
				_ = cmd.Wait()
				close(done)
			}()

			select {
			case <-done:
			case <-ctx.Done():
				killProcessTree(cmd)
			}
		}()

		go func() {
			defer sw.Close()
			zero := 0
			sw.Send(&filesystem.ExecuteResponse{
				Output:   "command started in background\n",
				ExitCode: &zero,
			}, nil)
		}()

		return sr, nil
	}

	// Foreground streaming execution mode
	go func() {
		defer func() {
			_ = stdoutPipe.Close()
			_ = stderrPipe.Close()
			sw.Close()
		}()

		var totalBytes int64
		var truncated atomic.Bool

		var wg sync.WaitGroup
		wg.Add(2)

		readPipe := func(r io.Reader, isStderr bool) {
			defer wg.Done()
			reader := bufio.NewReader(r)
			for {
				line, err := reader.ReadString('\n')
				if line != "" {
					cur := atomic.AddInt64(&totalBytes, int64(len(line)))
					if cur > maxOutputBytes {
						if !truncated.Swap(true) {
							sw.Send(&filesystem.ExecuteResponse{
								Output:    "\n[Output truncated: exceeded 1MB limit]\n",
								Truncated: true,
							}, nil)
						}
					} else if !truncated.Load() {
						select {
						case <-ctx.Done():
							killProcessTree(cmd)
							return
						default:
							sw.Send(&filesystem.ExecuteResponse{
								Output: line,
							}, nil)
						}
					}
				}
				if err != nil {
					break
				}
			}
		}

		go readPipe(stdoutPipe, false)
		go readPipe(stderrPipe, true)

		// Wait for I/O completion or context cancellation
		ioDone := make(chan struct{})
		go func() {
			wg.Wait()
			close(ioDone)
		}()

		select {
		case <-ioDone:
		case <-ctx.Done():
			killProcessTree(cmd)
			sw.Send(nil, ctx.Err())
			return
		}

		// Wait for process exit and determine exit code
		waitErr := cmd.Wait()
		var exitCode int
		if waitErr != nil {
			var exitError *exec.ExitError
			if errors.As(waitErr, &exitError) {
				exitCode = exitError.ExitCode()
			} else {
				exitCode = 1
			}
		}

		sw.Send(&filesystem.ExecuteResponse{
			ExitCode:  &exitCode,
			Truncated: truncated.Load(),
		}, nil)
	}()

	return sr, nil
}
