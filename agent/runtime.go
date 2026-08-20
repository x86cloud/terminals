package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"terminal/agent/ask"
	"terminal/agent/events"
	"terminal/agent/executor"
	"terminal/agent/guard"
	"terminal/agent/job"
	"terminal/agent/memory"
	"terminal/agent/planner"
	"terminal/agent/router"
	"terminal/agent/skills"
	"terminal/agent/store"
	"terminal/agent/subagent"
	"terminal/agent/tools"
	"terminal/agent/verifier"
	"terminal/agent/workflow"
	"terminal/core"
	"terminal/db"
	"terminal/mongo"
	"terminal/proto"
	"terminal/redis"
	"terminal/ssh"

	"github.com/cloudwego/eino/schema"
)

type AgentRuntime struct {
	mu       sync.RWMutex
	ctx      context.Context
	cfg      core.AppSettings
	sessions map[string]*Session
	activeID string

	Store        *store.Store
	EventBus     *events.EventBus
	Guard        *guard.PolicyGuard
	Router       *router.ModelRouter
	Memory       *memory.MemorySystem
	ToolBus      *tools.ToolBus
	WorkspaceMgr *tools.WorkspaceManager
	JobMgr       *job.JobManager
	SubagentM    *subagent.SubagentManager
	WorkflowEng  *workflow.WorkflowEngine
	SkillsReg    *skills.SkillsRegistry
	Planner      *planner.Planner
	PlanGate     *planner.PlanGate
	Executor     *executor.Executor
	Verifier     *verifier.Verifier
	AskMgr       *ask.AskManager

	sshMgr    *ssh.SessionManager
	redisMgr  *redis.RedisManager
	mysqlMgr  *db.MysqlManagerEx
	mongoMgr  *mongo.MongoManager
	sqliteMgr *db.SqliteManager
	mqttMgr   *proto.MqttManager
}

var DefaultRuntime = NewAgentRuntime()

func NewAgentRuntime() *AgentRuntime {
	st, _ := store.GetStore()
	eb := events.DefaultEventBus
	g := guard.NewPolicyGuard(true, true, st)
	r := router.NewModelRouter()
	mem := memory.NewMemorySystem(st)
	tb := tools.NewToolBus(g, eb)
	wm := tools.NewWorkspaceManager("")
	jm := job.NewJobManager(st, eb)
	sm := subagent.NewSubagentManager(st, eb, nil)
	wf := workflow.NewWorkflowEngine(eb)
	sk := skills.NewSkillsRegistry(st)
	pl := planner.NewPlanner(r, g, eb)
	pg := planner.NewPlanGate()
	vr := verifier.NewVerifier(r)
	ex := executor.NewExecutor(tb, vr, eb)
	askMgr := ask.NewAskManager(eb)
	ex.SetManagers(jm, sm, wf, askMgr)

	rt := &AgentRuntime{
		sessions:     make(map[string]*Session),
		activeID:     "ai_agent_default",
		Store:        st,
		EventBus:     eb,
		Guard:        g,
		Router:       r,
		Memory:       mem,
		ToolBus:      tb,
		WorkspaceMgr: wm,
		JobMgr:       jm,
		SubagentM:    sm,
		WorkflowEng:  wf,
		SkillsReg:    sk,
		Planner:      pl,
		PlanGate:     pg,
		Executor:     ex,
		Verifier:     vr,
		AskMgr:       askMgr,
	}

	// Register subagent runner with autonomous tool execution loop
	sm.SetRunner(func(ctx context.Context, subID, prompt string) (string, error) {
		res, err := r.Resolve(ctx, router.RoleDefault)
		if err != nil {
			return "", err
		}

		toolsList := tb.List()
		var toolDesc strings.Builder
		toolDesc.WriteString("【可用工具列表】:\n")
		for _, t := range toolsList {
			toolDesc.WriteString(fmt.Sprintf("- %s: %s\n", t.Name, t.Description))
		}

		sysPrompt := fmt.Sprintf(`你是一个专注于单一运维排障与数据分析的专业子代理 (Subagent)。
你可以分析任务并直接回答，或在必要时直接调用系统工具。
%s
若需调用工具，请直接输出相应工具指令。最终请给出清晰、结构化的结论报告。`, toolDesc.String())

		schemaMsgs := []*schema.Message{
			schema.SystemMessage(sysPrompt),
			schema.UserMessage(prompt),
		}

		// Tool calling loop: max 4 rounds
		for round := 0; round < 4; round++ {
			if ctx.Err() != nil {
				return "", ctx.Err()
			}
			out, err := res.Model.Generate(ctx, schemaMsgs)
			if err != nil {
				return "", err
			}
			if out == nil {
				break
			}

			if len(out.ToolCalls) == 0 {
				return out.Content, nil
			}

			schemaMsgs = append(schemaMsgs, out)
			for _, tc := range out.ToolCalls {
				toolRes := tb.Invoke(ctx, subID, "subagent_"+subID, tc.Function.Name, tc.Function.Arguments)
				var outStr string
				if toolRes.OK {
					if s, ok := toolRes.Data.(string); ok {
						outStr = s
					} else {
						b, _ := json.Marshal(toolRes.Data)
						outStr = string(b)
					}
				} else {
					outStr = fmt.Sprintf("Error: %s", toolRes.Error)
				}
				schemaMsgs = append(schemaMsgs, schema.ToolMessage(outStr, tc.ID))
			}
		}

		finalOut, err := res.Model.Generate(ctx, schemaMsgs)
		if err == nil && finalOut != nil {
			return finalOut.Content, nil
		}
		return "", err
	})

	return rt
}

func (rt *AgentRuntime) SetContext(ctx context.Context) {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	rt.ctx = ctx
	rt.EventBus.SetContext(ctx)
}

func (rt *AgentRuntime) SetManagers(
	sm *ssh.SessionManager,
	rm *redis.RedisManager,
	mm *db.MysqlManagerEx,
	mgm *mongo.MongoManager,
	sq *db.SqliteManager,
	mq *proto.MqttManager,
) {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	rt.sshMgr = sm
	rt.redisMgr = rm
	rt.mysqlMgr = mm
	rt.mongoMgr = mgm
	rt.sqliteMgr = sq
	rt.mqttMgr = mq

	// Register job execution engines (Local & SSH)
	rt.JobMgr.RegisterExecutor("local", job.NewLocalExecutor(rt.WorkspaceMgr))
	rt.JobMgr.RegisterExecutor("ssh", job.NewSSHExecutor(sm))

	// Register all multi-protocol tools
	_ = tools.RegisterWorkspaceTools(rt.ToolBus, rt.WorkspaceMgr)
	_ = tools.RegisterLocalShellTool(rt.ToolBus, rt.WorkspaceMgr, rt.JobMgr)
	_ = tools.RegisterWebSearchTool(rt.ToolBus)
	_ = tools.RegisterSSHTools(rt.ToolBus, sm, rt.WorkspaceMgr)
	_ = tools.RegisterDatabaseTools(rt.ToolBus, tools.DatabaseManagers{
		RedisMgr:  rm,
		MysqlMgr:  mm,
		MongoMgr:  mgm,
		SqliteMgr: sq,
	})
	_ = tools.RegisterMqttTools(rt.ToolBus, mq)
	_ = tools.RegisterHttpTools(rt.ToolBus)
	_ = tools.RegisterOrchestrationTools(rt.ToolBus, tools.OrchestrationManagers{
		JobMgr:      rt.JobMgr,
		SubagentM:   rt.SubagentM,
		SkillsReg:   rt.SkillsReg,
		MemorySys:   rt.Memory,
		WorkflowEng: rt.WorkflowEng,
		AskMgr:      rt.AskMgr,
	})
}

func (rt *AgentRuntime) InitOrUpdate(cfg core.AppSettings) error {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	rt.cfg = cfg

	// Update router default model profile
	rt.Router.SetProfile(router.RoleDefault, router.ModelProfile{
		BaseURL:         cfg.AiBaseURL,
		APIKey:          cfg.AiAPIKey,
		Model:           cfg.AiModel,
		Temperature:     float32(cfg.AiTemperature),
		EnableThinking:  cfg.AiEnableThinking,
		ReasoningEffort: cfg.AiReasoningEffort,
	})

	if cfg.AiWorkspaceDir != "" {
		rt.WorkspaceMgr.SetDir(cfg.AiWorkspaceDir)
	}

	if rt.Verifier != nil {
		rt.Verifier.SetEnabled(cfg.AiEnableVerifier)
	}
	if rt.Executor != nil {
		rt.Executor.SetMaxParallel(cfg.AiMaxParallel)
	}

	return nil
}

func (rt *AgentRuntime) GetOrCreateSession(id string) *Session {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	if id == "" {
		id = "ai_agent_default"
	}

	if s, ok := rt.sessions[id]; ok {
		return s
	}

	// Try load from DB
	title := "新会话"
	workspace := rt.WorkspaceMgr.GetDir()
	if rt.Store != nil {
		if dbSess, err := rt.Store.GetSession(id); err == nil && dbSess != nil {
			title = dbSess.Title
			if dbSess.Workspace != "" {
				workspace = dbSess.Workspace
			}
		}
	}

	s := NewSession(id, title, workspace, rt.cfg)
	rt.sessions[id] = s
	return s
}
