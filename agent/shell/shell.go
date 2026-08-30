package shell

import (
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

// streamWriterPipe adapts io.Writer to schema.StreamWriter[*filesystem.ExecuteResponse] line by line without pipe descriptor deadlocks.
type streamWriterPipe struct {
	sw         *schema.StreamWriter[*filesystem.ExecuteResponse]
	ctx        context.Context
	totalBytes int64
	truncated  atomic.Bool
	buf        strings.Builder
	mu         sync.Mutex
}

func (w *streamWriterPipe) Write(p []byte) (n int, err error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	n = len(p)
	if n == 0 {
		return 0, nil
	}

	w.buf.Write(p)
	raw := w.buf.String()

	for {
		idx := strings.IndexByte(raw, '\n')
		if idx < 0 {
			break
		}
		line := raw[:idx+1]
		raw = raw[idx+1:]

		cur := atomic.AddInt64(&w.totalBytes, int64(len(line)))
		if cur > maxOutputBytes {
			if !w.truncated.Swap(true) {
				w.sw.Send(&filesystem.ExecuteResponse{
					Output:    "\n[Output truncated: exceeded 1MB limit]\n",
					Truncated: true,
				}, nil)
			}
		} else if !w.truncated.Load() {
			select {
			case <-w.ctx.Done():
				return n, w.ctx.Err()
			default:
				w.sw.Send(&filesystem.ExecuteResponse{
					Output: line,
				}, nil)
			}
		}
	}

	w.buf.Reset()
	if len(raw) > 0 {
		w.buf.WriteString(raw)
	}

	return n, nil
}

func (w *streamWriterPipe) Flush() {
	w.mu.Lock()
	defer w.mu.Unlock()
	remaining := w.buf.String()
	if remaining != "" && !w.truncated.Load() {
		w.sw.Send(&filesystem.ExecuteResponse{
			Output: remaining,
		}, nil)
	}
	w.buf.Reset()
}

// ExecuteStreaming executes a command and streams output line by line to a StreamReader.
func (s *LocalStreamingShell) ExecuteStreaming(ctx context.Context, input *filesystem.ExecuteRequest) (*schema.StreamReader[*filesystem.ExecuteResponse], error) {
	if input == nil || strings.TrimSpace(input.Command) == "" {
		return nil, errors.New("command cannot be empty")
	}

	cmd := s.buildCommand(ctx, input.Command)
	sr, sw := schema.Pipe[*filesystem.ExecuteResponse](64)

	// Background execution mode
	if input.RunInBackendGround {
		go func() {
			defer sw.Close()
			if err := cmd.Start(); err != nil {
				sw.Send(nil, fmt.Errorf("failed to start background command: %w", err))
				return
			}
			go func() {
				_ = cmd.Wait()
			}()
			zero := 0
			sw.Send(&filesystem.ExecuteResponse{
				Output:   "command started in background\n",
				ExitCode: &zero,
			}, nil)
		}()
		return sr, nil
	}

	outPipe := &streamWriterPipe{
		sw:  sw,
		ctx: ctx,
	}

	cmd.Stdout = outPipe
	cmd.Stderr = outPipe

	// Foreground streaming execution mode
	go func() {
		defer func() {
			outPipe.Flush()
			sw.Close()
		}()

		if err := cmd.Start(); err != nil {
			sw.Send(nil, fmt.Errorf("failed to start command: %w", err))
			return
		}

		// Monitor context cancellation
		cancelCh := make(chan struct{})
		go func() {
			select {
			case <-ctx.Done():
				killProcessTree(cmd)
			case <-cancelCh:
			}
		}()

		waitErr := cmd.Wait()
		close(cancelCh)

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
			Truncated: outPipe.truncated.Load(),
		}, nil)
	}()

	return sr, nil
}
