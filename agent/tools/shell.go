package tools

import (
	"context"
	"errors"
	"io"
	"strings"
	"time"

	"terminal/agent/events"
	"terminal/agent/guard"
	"terminal/agent/shell"

	"github.com/cloudwego/eino/adk/filesystem"
	"github.com/cloudwego/eino/components/tool/utils"
)

type ExecuteCommandInput struct {
	Command string `json:"command" jsonschema:"description=要执行的命令行指令字符串（例如：'npm run build'、'go test ./...'、'git status'等）"`
	Cwd     string `json:"cwd,omitempty" jsonschema:"description=可选的工作目录绝对或相对路径。留空时默认使用当前绑定的工作区目录"`
}

func RegisterLocalShellTool(bus *ToolBus, wm *WorkspaceManager) error {
	const toolDesc = "在本地宿主机上执行命令行/Shell指令（Windows系统自适应PowerShell/CMD，Linux/macOS系统自适应Bash/SH）。" +
		"适用于执行构建编译、运行单元测试、执行脚本工具、检查系统与环境状态等操作。"

	shellTool, err := utils.InferTool("execute", toolDesc,
		func(ctx context.Context, input *ExecuteCommandInput) (any, error) {
			cwd := input.Cwd
			if cwd == "" && wm != nil {
				cwd = wm.GetDir()
			}
			sessionID := SessionIDFromContext(ctx)

			// Synchronous execution with real-time stream relay to eventBus
			sh := shell.NewLocalStreamingShell(cwd)
			sr, err := sh.ExecuteStreaming(ctx, &filesystem.ExecuteRequest{
				Command:            input.Command,
				RunInBackendGround: false,
			})
			if err != nil {
				return nil, err
			}
			defer sr.Close()

			var outBuilder strings.Builder
			var exitCode *int
			var isTruncated bool

			callID := CallIDFromContext(ctx)
			traceID := TraceIDFromContext(ctx)

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
						// Live stream output to eventBus so user sees live output in UI!
						if bus != nil && bus.eventBus != nil && sessionID != "" {
							bus.eventBus.Emit(events.Event{
								Type:      events.EventToolEvent,
								SessionID: sessionID,
								TraceID:   traceID,
								Payload: events.ToolEventPayload{
									CallID:   callID,
									ToolName: "execute",
									Input:    input.Command,
									Output:   outBuilder.String(),
								},
							})
						}
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
		})
	if err != nil {
		return err
	}

	bus.Register(&RegisteredTool{
		Name:        "execute",
		Description: toolDesc,
		BaseTool:    shellTool,
		Level:       guard.LevelAllow,
		Timeout:     60 * time.Second,
	})

	return nil
}
