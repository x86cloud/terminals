package agent

import (
	"context"
	"fmt"
	"sync"
	"time"

	"terminal/agent/memory"
	"terminal/agent/router"
	"terminal/agent/skills"
	"terminal/agent/tools"
	"terminal/core"

	localbk "github.com/cloudwego/eino-ext/adk/backend/local"
	"github.com/cloudwego/eino/adk"
	"github.com/cloudwego/eino/adk/middlewares/skill"
	"github.com/cloudwego/eino/compose"
)

type SessionState string

const (
	SessionStateIdle            SessionState = "idle"
	SessionStatePlanning        SessionState = "planning"
	SessionStateWaitingApproval SessionState = "waiting_approval"
	SessionStateExecuting       SessionState = "executing"
	SessionStateVerifying       SessionState = "verifying"
	SessionStateDone            SessionState = "done"
	SessionStateFailed          SessionState = "failed"
	SessionStateStopped         SessionState = "stopped"
)

type Session struct {
	ID        string
	Title     string
	State     SessionState
	Workspace string
	Settings  core.AppSettings
	CreatedAt time.Time
	UpdatedAt time.Time

	runner     *adk.Runner
	workingMem *memory.WorkingMemory
	cancelFunc context.CancelFunc
	mu         sync.RWMutex
}

func NewSession(id, title, workspace string, settings core.AppSettings) *Session {
	now := time.Now()
	if id == "" {
		id = "ai_agent_default"
	}
	if title == "" {
		title = "新会话"
	}
	return &Session{
		ID:         id,
		Title:      title,
		State:      SessionStateIdle,
		Workspace:  workspace,
		Settings:   settings,
		CreatedAt:  now,
		UpdatedAt:  now,
		workingMem: memory.NewWorkingMemory(settings.AiMaxContextTokens),
	}
}

func (s *Session) BuildRunner(ctx context.Context, routerInstance *router.ModelRouter, toolBus *tools.ToolBus) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	resolved, err := routerInstance.Resolve(ctx, router.RoleDefault)
	if err != nil {
		return err
	}

	einoTools := toolBus.ConvertToEinoTools(s.ID)

	// Determine local skills directory
	skillsDir := skills.GetDefaultSkillsDir()
	if DefaultRuntime != nil && DefaultRuntime.SkillsReg != nil {
		if d := DefaultRuntime.SkillsReg.GetSkillsDir(); d != "" {
			skillsDir = d
		}
	}

	var handlers []adk.ChatModelAgentMiddleware

	// Initialize local filesystem backend and skill middleware
	localBackend, err := localbk.NewBackend(ctx, &localbk.Config{})
	if err != nil {
		return fmt.Errorf("创建 local fs backend 失败: %w", err)
	}

	skillBackend, err := skill.NewBackendFromFilesystem(ctx, &skill.BackendFromFilesystemConfig{
		Backend: localBackend,
		BaseDir: skillsDir,
	})
	if err != nil {
		return fmt.Errorf("创建 skill backend 失败: %w", err)
	}

	skillMiddleware, err := skill.NewMiddleware(ctx, &skill.Config{Backend: skillBackend})
	if err != nil {
		return fmt.Errorf("创建 skill middleware 失败: %w", err)
	}

	handlers = append(handlers, skillMiddleware)
	instruction := s.Settings.AiSystemPrompt
	if instruction == "" {
		instruction = "你是一个功能完备的专业 AI 研发与运维助手，具备对本地工作区文件读写、多协议连接管理、命令行执行、后台长任务托管与子代理并发协作能力。"
	}
	instruction += "\n\n## 工作台协作与执行指引\n" +
		"1. **命令行执行与后台作业**：\n" +
		"   - 针对即时执行的命令（如构建检查、测试、状态探测等），调用 `execute`（默认同步执行并返回输出）；\n" +
		"   - 针对长时间运行的构建、服务启动、日志监听等任务，务必在 `execute` 中指定 `run_in_background: true` 或调用 `job_submit`，任务将自动挂载至工作台【作业】面板进行可视化追踪与管理；\n" +
		"2. **子代理并发委派**：\n" +
		"   - 当面对复杂的多分支问题、多机器并发排障、多代码库独立检索等场景时，主动调用 `subagent_spawn` 工具将子任务委派给独立的子代理并发推演；\n" +
		"   - 子代理独立运行并向工作台【子代理】面板上报进展，完成后主代理汇总结果；\n" +
		"3. **工作区与代码修改**：\n" +
		"   - 优先使用 `read_file` 查看代码，使用 `create_file` 创建新文件，使用 `apply_file_patch` 精准更新代码片段。\n"

	adkAgent, err := adk.NewChatModelAgent(ctx, &adk.ChatModelAgentConfig{
		Name:        "xclient_agent_" + s.ID,
		Description: "xClient AI Multi-Protocol Assistant",
		Instruction: instruction,
		Model:       resolved.Model,
		ToolsConfig: adk.ToolsConfig{
			ToolsNodeConfig: compose.ToolsNodeConfig{
				Tools: einoTools,
			},
		},
		Handlers:      handlers,
		MaxIterations: 100,
	})
	if err != nil {
		return err
	}

	runner := adk.NewRunner(ctx, adk.RunnerConfig{
		Agent:           adkAgent,
		EnableStreaming: true,
	})

	s.runner = runner
	return nil
}

func (s *Session) GetRunner() *adk.Runner {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.runner
}

func (s *Session) SetCancel(cancel context.CancelFunc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cancelFunc = cancel
}

func (s *Session) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancelFunc != nil {
		s.cancelFunc()
	}
	s.State = SessionStateStopped

	if DefaultRuntime != nil {
		if DefaultRuntime.JobMgr != nil {
			DefaultRuntime.JobMgr.KillBySession(s.ID)
		}
		if DefaultRuntime.SubagentM != nil {
			DefaultRuntime.SubagentM.InterruptBySession(s.ID)
		}
	}
}

func (s *Session) WorkingMemory() *memory.WorkingMemory {
	return s.workingMem
}
