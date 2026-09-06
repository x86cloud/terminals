package agent

import (
	"context"
	"sync"

	"terminal/agent/ask"
	"terminal/agent/events"
	"terminal/agent/executor"
	"terminal/agent/guard"
	"terminal/agent/memory"
	"terminal/agent/planner"
	"terminal/agent/router"
	"terminal/agent/skills"
	"terminal/agent/store"
	"terminal/agent/tools"
	"terminal/agent/verifier"
	"terminal/agent/workflow"
	"terminal/core"
	"terminal/db"
	"terminal/docker"
	"terminal/k8s"
	"terminal/mongo"
	"terminal/proto"
	"terminal/redis"
	"terminal/ssh"
)

type AgentRuntime struct {
	mu  sync.RWMutex
	ctx context.Context
	cfg core.AppSettings

	session *Session

	Store        *store.Store
	EventBus     *events.EventBus
	Guard        *guard.PolicyGuard
	Router       *router.ModelRouter
	Memory       *memory.MemorySystem
	ToolBus      *tools.ToolBus
	WorkspaceMgr *tools.WorkspaceManager
	WorkflowEng  *workflow.WorkflowEngine
	SkillsReg    *skills.SkillsRegistry
	Planner      *planner.Planner
	PlanGate     *planner.PlanGate
	Executor     *executor.Executor
	Verifier     *verifier.Verifier
	AskMgr       *ask.AskManager
	HitlMgr      *guard.HitlManager

	sshMgr      *ssh.SessionManager
	redisMgr    *redis.RedisManager
	mysqlMgr    *db.MysqlManagerEx
	postgresMgr *db.PostgresManager
	mongoMgr    *mongo.MongoManager
	sqliteMgr   *db.SqliteManager
	mqttMgr     *proto.MqttManager
	dockerMgr   *docker.DockerManager
	k8sMgr      *k8s.K8sManager
}

var DefaultRuntime = NewAgentRuntime()

func NewAgentRuntime() *AgentRuntime {
	defaultCfg := core.DefaultAppSettings()
	st, _ := store.GetStore()
	eb := events.DefaultEventBus
	g := guard.NewPolicyGuard(defaultCfg.AiEnablePermissionGuard, defaultCfg.AiBlockHighRiskCommands, st)
	hitlMgr := guard.NewHitlManager(eb)
	g.SetHitlManager(hitlMgr)
	r := router.NewModelRouter()
	mem := memory.NewMemorySystem(st)
	tb := tools.NewToolBus(g, eb)
	wm := tools.NewWorkspaceManager("")
	wf := workflow.NewWorkflowEngine(eb)
	sk := skills.NewSkillsRegistry(st)
	pl := planner.NewPlanner(r, g, eb)
	pg := planner.NewPlanGate()
	vr := verifier.NewVerifier(r)
	ex := executor.NewExecutor(tb, vr, eb)
	askMgr := ask.NewAskManager(eb)
	ex.SetManagers(wf, askMgr)

	defaultSession := NewSession("ai_agent_default", "AI 助手", wm.GetDir(), defaultCfg)

	rt := &AgentRuntime{
		session:      defaultSession,
		cfg:          defaultCfg,
		Store:        st,
		EventBus:     eb,
		Guard:        g,
		Router:       r,
		Memory:       mem,
		ToolBus:      tb,
		WorkspaceMgr: wm,
		WorkflowEng:  wf,
		SkillsReg:    sk,
		Planner:      pl,
		PlanGate:     pg,
		Executor:     ex,
		Verifier:     vr,
		AskMgr:       askMgr,
		HitlMgr:      hitlMgr,
	}

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
	pgm *db.PostgresManager,
	mgm *mongo.MongoManager,
	sq *db.SqliteManager,
	mq *proto.MqttManager,
	dkm *docker.DockerManager,
	km *k8s.K8sManager,
) {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	rt.sshMgr = sm
	rt.redisMgr = rm
	rt.mysqlMgr = mm
	rt.postgresMgr = pgm
	rt.mongoMgr = mgm
	rt.sqliteMgr = sq
	rt.mqttMgr = mq
	rt.dockerMgr = dkm
	rt.k8sMgr = km

	// Register all multi-protocol tools
	_ = tools.RegisterWorkspaceTools(rt.ToolBus, rt.WorkspaceMgr)
	_ = tools.RegisterLocalShellTool(rt.ToolBus, rt.WorkspaceMgr)
	if rt.cfg.AiEnableWebSearch {
		_ = tools.RegisterWebSearchTool(rt.ToolBus)
	}
	_ = tools.RegisterSSHTools(rt.ToolBus, sm, rt.WorkspaceMgr)
	_ = tools.RegisterDatabaseTools(rt.ToolBus, tools.DatabaseManagers{
		RedisMgr:    rm,
		MysqlMgr:    mm,
		PostgresMgr: pgm,
		MongoMgr:    mgm,
		SqliteMgr:   sq,
	})
	_ = tools.RegisterDockerTools(rt.ToolBus, dkm)
	_ = tools.RegisterK8sTools(rt.ToolBus, km)
	_ = tools.RegisterMqttTools(rt.ToolBus, mq)
	_ = tools.RegisterHttpTools(rt.ToolBus)
	_ = tools.RegisterOrchestrationTools(rt.ToolBus, tools.OrchestrationManagers{
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

	// Wire policy guard and high-risk command blocking
	if rt.Guard != nil {
		rt.Guard.SetEnableGuard(cfg.AiEnablePermissionGuard)
		rt.Guard.SetBlockHighRiskCommands(cfg.AiBlockHighRiskCommands)
	}

	// Wire dynamic web search tool availability
	if rt.ToolBus != nil {
		if cfg.AiEnableWebSearch {
			_ = tools.RegisterWebSearchTool(rt.ToolBus)
		} else {
			rt.ToolBus.Unregister("web_search")
		}
	}

	// Update active session with refreshed configuration
	if rt.session != nil {
		rt.session.mu.Lock()
		rt.session.Settings = cfg
		rt.session.mu.Unlock()
	}

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

func (rt *AgentRuntime) GetSession() *Session {
	rt.mu.RLock()
	defer rt.mu.RUnlock()
	return rt.session
}

func (rt *AgentRuntime) GetOrCreateSession(id string) *Session {
	return rt.GetSession()
}
