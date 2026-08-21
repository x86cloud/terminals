package tools

import (
	"context"
	"fmt"
	"time"

	"terminal/agent/guard"
	"terminal/agent/job"
	"terminal/agent/shell"

	"github.com/cloudwego/eino/adk/filesystem"
	"github.com/cloudwego/eino/components/tool/utils"
)

type ExecuteCommandInput struct {
	Command         string `json:"command" jsonschema:"description=要执行的命令行指令字符串（例如：'npm run build'、'go test ./...'、'git status'等）"`
	Cwd             string `json:"cwd,omitempty" jsonschema:"description=可选的工作目录绝对或相对路径。留空时默认使用当前绑定的工作区目录"`
	RunInBackground bool   `json:"run_in_background,omitempty" jsonschema:"description=是否在后台作为长任务运行（如启动Web服务、持续日志监听、大型构建等）。为true时命令不会阻塞等待退出，而是自动托管至工作台【作业】面板后台执行并立即返回job_id"`
}

func RegisterLocalShellTool(bus *ToolBus, wm *WorkspaceManager, jm *job.JobManager) error {
	const toolDesc = "在本地宿主机上执行命令行/Shell指令（Windows系统自适应PowerShell/CMD，Linux/macOS系统自适应Bash/SH）。" +
		"适用于执行构建编译、运行单元测试、执行脚本工具、检查系统与环境状态等操作。" +
		"若命令属于长时间运行的后台服务或监听任务，请将 run_in_background 设为 true，任务将自动挂载至工作台后台作业中持续运行与追踪。"

	shellTool, err := utils.InferTool("execute", toolDesc,
		func(ctx context.Context, input *ExecuteCommandInput) (any, error) {
			cwd := input.Cwd
			if cwd == "" && wm != nil {
				cwd = wm.GetDir()
			}
			sessionID := SessionIDFromContext(ctx)

			// If background execution is requested and JobManager is available, submit as managed background job
			if input.RunInBackground && jm != nil {
				jobID, err := jm.SubmitExec(ctx, sessionID, "shell_cmd", job.ExecSpec{
					Target:     "local",
					Command:    input.Command,
					Cwd:        cwd,
					TimeoutSec: 1800,
				}, "本地后台命令执行", input.Command)
				if err != nil {
					return nil, err
				}
				return map[string]any{
					"job_id":    jobID,
					"message":   fmt.Sprintf("命令已成功提交至后台作业执行 (Job ID: %s)，您可在工作台【作业】面板实时查看输出流或管理生命周期", jobID),
					"status":    "running",
					"command":   input.Command,
					"directory": cwd,
				}, nil
			}

			sh := shell.NewLocalStreamingShell(cwd)
			resp, err := sh.Execute(ctx, &filesystem.ExecuteRequest{
				Command:            input.Command,
				RunInBackendGround: input.RunInBackground,
			})
			if err != nil {
				return nil, err
			}
			return resp, nil
		})
	if err != nil {
		return err
	}

	bus.Register(&RegisteredTool{
		Name:        "execute",
		Description: toolDesc,
		BaseTool:    shellTool,
		Level:       guard.LevelConfirm,
		Timeout:     5 * time.Minute,
	})

	return nil
}
