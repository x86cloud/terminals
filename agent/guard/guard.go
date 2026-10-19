package guard

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"terminal/agent/events"
	"terminal/agent/store"
)

var HighRiskCommandPatterns = []string{
	"rm -rf /",
	"rm -rf /*",
	"mkfs",
	"dd if=",
	":(){ :|:& };:",
	"> /dev/sd",
	"reboot",
	"shutdown",
	"init 0",
	"poweroff",
}

type PermissionLevel string

const (
	LevelAllow     PermissionLevel = "allow"
	LevelConfirm   PermissionLevel = "confirm"
	LevelForbidden PermissionLevel = "forbidden"
)

type contextKey string

const ContextKeyPlanningMode contextKey = "is_planning_mode"

func WithPlanningMode(ctx context.Context, isPlanning bool) context.Context {
	return context.WithValue(ctx, ContextKeyPlanningMode, isPlanning)
}

func IsPlanningMode(ctx context.Context) bool {
	if ctx == nil {
		return false
	}
	v, ok := ctx.Value(ContextKeyPlanningMode).(bool)
	return ok && v
}

type ToolRule struct {
	ToolName    string
	Level       PermissionLevel
	Description string
	AuditFunc   func(ctx context.Context, input string) (PermissionLevel, string)
}

// HitlDecision represents user's approval response
type HitlDecision struct {
	Approved bool   `json:"approved"`
	Reason   string `json:"reason,omitempty"`
}

// HitlRequest represents an in-flight human approval request
type HitlRequest struct {
	ConfirmID  string            `json:"confirm_id"`
	SessionID  string            `json:"session_id"`
	TraceID    string            `json:"trace_id,omitempty"`
	ToolName   string            `json:"tool_name"`
	ToolDesc   string            `json:"tool_desc"`
	Input      string            `json:"input"`
	RiskDetail string            `json:"risk_detail"`
	CreatedAt  int64             `json:"created_at"`
	ResponseCh chan HitlDecision `json:"-"`
}

// HitlManager handles synchronous human-in-the-loop approvals with zero timeout
type HitlManager struct {
	mu       sync.RWMutex
	pending  sync.Map // confirmID -> *HitlRequest
	eventBus *events.EventBus
}

func NewHitlManager(eb *events.EventBus) *HitlManager {
	return &HitlManager{
		eventBus: eb,
	}
}

func (m *HitlManager) RequestApproval(ctx context.Context, sessionID, traceID, toolName, toolDesc, input, riskDetail string) (bool, string, error) {
	confirmID := fmt.Sprintf("hitl_%d", time.Now().UnixNano())
	req := &HitlRequest{
		ConfirmID:  confirmID,
		SessionID:  sessionID,
		TraceID:    traceID,
		ToolName:   toolName,
		ToolDesc:   toolDesc,
		Input:      input,
		RiskDetail: riskDetail,
		CreatedAt:  time.Now().UnixMilli(),
		ResponseCh: make(chan HitlDecision, 1),
	}

	m.pending.Store(confirmID, req)
	defer m.pending.Delete(confirmID)

	if m.eventBus != nil {
		m.eventBus.Emit(events.Event{
			Type:      events.EventHitlConfirm,
			SessionID: sessionID,
			TraceID:   traceID,
			Payload: events.HitlConfirmPayload{
				ConfirmID:  confirmID,
				SessionID:  sessionID,
				TraceID:    traceID,
				ToolName:   toolName,
				ToolDesc:   toolDesc,
				Input:      input,
				RiskDetail: riskDetail,
			},
		})
	}

	// Wait indefinitely for user approval, rejection, or context cancellation (NO TIMEOUT)
	select {
	case <-ctx.Done():
		return false, "", ctx.Err()
	case dec := <-req.ResponseCh:
		return dec.Approved, dec.Reason, nil
	}
}

func (m *HitlManager) ResolveApproval(confirmID string, approved bool, reason string) bool {
	val, ok := m.pending.Load(confirmID)
	if !ok {
		return false
	}
	req, ok := val.(*HitlRequest)
	if !ok {
		return false
	}

	trimmedReason := strings.TrimSpace(reason)
	select {
	case req.ResponseCh <- HitlDecision{Approved: approved, Reason: trimmedReason}:
		return true
	default:
		return false
	}
}

func (m *HitlManager) ListPending() []*HitlRequest {
	var list []*HitlRequest
	m.pending.Range(func(key, value any) bool {
		if req, ok := value.(*HitlRequest); ok {
			list = append(list, req)
		}
		return true
	})
	return list
}

type PolicyGuard struct {
	mu                    sync.RWMutex
	enableGuard           bool
	blockHighRiskCommands bool
	workspaceDir          string
	rules                 map[string]ToolRule
	store                 *store.Store
	hitlMgr               *HitlManager
}

func NewPolicyGuard(enableGuard, blockHighRiskCommands bool, st *store.Store) *PolicyGuard {
	g := &PolicyGuard{
		enableGuard:           enableGuard,
		blockHighRiskCommands: blockHighRiskCommands,
		rules:                 make(map[string]ToolRule),
		store:                 st,
	}
	g.initDefaultRules()
	return g
}

func (g *PolicyGuard) SetHitlManager(hm *HitlManager) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.hitlMgr = hm
}

func (g *PolicyGuard) HitlManager() *HitlManager {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.hitlMgr
}

func (g *PolicyGuard) SetEnableGuard(enable bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.enableGuard = enable
}

func (g *PolicyGuard) SetBlockHighRiskCommands(block bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.blockHighRiskCommands = block
}

func (g *PolicyGuard) SetWorkspaceDir(dir string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.workspaceDir = dir
}

func (g *PolicyGuard) WorkspaceDir() string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.workspaceDir
}

func (g *PolicyGuard) initDefaultRules() {
	// 1. Workspace / Coding File Tools
	g.rules["read_file"] = ToolRule{ToolName: "read_file", Level: LevelAllow, Description: "读取工作区文件内容"}
	g.rules["create_file"] = ToolRule{ToolName: "create_file", Level: LevelAllow, Description: "在工作区新建代码文件"}
	g.rules["apply_file_patch"] = ToolRule{ToolName: "apply_file_patch", Level: LevelAllow, Description: "在工作区应用局部代码 Patch 补丁"}
	g.rules["list_dir"] = ToolRule{ToolName: "list_dir", Level: LevelAllow, Description: "查看工作区文件目录"}
	g.rules["search_files"] = ToolRule{ToolName: "search_files", Level: LevelAllow, Description: "搜索工作区文件与关键字"}
	g.rules["move_file"] = ToolRule{ToolName: "move_file", Level: LevelAllow, Description: "移动或重命名工作区文件"}
	g.rules["delete_file"] = ToolRule{ToolName: "delete_file", Level: LevelConfirm, Description: "删除工作区文件或目录"}
	g.rules["execute"] = ToolRule{
		ToolName:    "execute",
		Level:       LevelConfirm,
		Description: "在本地宿主机执行命令行/Shell指令",
		AuditFunc:   g.auditShellCommand,
	}

	// 2. Web search
	g.rules["web_search"] = ToolRule{ToolName: "web_search", Level: LevelAllow, Description: "互联网网页与新闻检索"}

	// 3. SSH Tools
	g.rules["ssh_get_system_info"] = ToolRule{ToolName: "ssh_get_system_info", Level: LevelAllow, Description: "查看远程服务器 CPU/内存/磁盘与负载"}
	g.rules["ssh_list_dir"] = ToolRule{ToolName: "ssh_list_dir", Level: LevelAllow, Description: "查看远程服务器文件目录"}
	g.rules["ssh_read_file"] = ToolRule{ToolName: "ssh_read_file", Level: LevelAllow, Description: "读取远程服务器文件内容"}
	g.rules["ssh_download_file"] = ToolRule{ToolName: "ssh_download_file", Level: LevelAllow, Description: "下载远程服务器文件至本地工作目录"}
	g.rules["ssh_list_containers"] = ToolRule{ToolName: "ssh_list_containers", Level: LevelAllow, Description: "查看远程服务器 Docker 容器"}

	g.rules["ssh_write_file"] = ToolRule{ToolName: "ssh_write_file", Level: LevelConfirm, Description: "在远程服务器写入或修改文件"}
	g.rules["ssh_delete_file"] = ToolRule{ToolName: "ssh_delete_file", Level: LevelConfirm, Description: "在远程服务器删除文件或目录"}
	g.rules["ssh_upload_file"] = ToolRule{ToolName: "ssh_upload_file", Level: LevelConfirm, Description: "上传本地文件至远程服务器"}
	g.rules["ssh_exec_command"] = ToolRule{
		ToolName:    "ssh_exec_command",
		Level:       LevelConfirm,
		Description: "在远程服务器执行 Shell 命令行",
		AuditFunc:   g.auditShellCommand,
	}

	// 4. Database tools
	g.rules["db_redis_keys"] = ToolRule{ToolName: "db_redis_keys", Level: LevelAllow, Description: "查询 Redis 键列表"}
	g.rules["db_redis_get"] = ToolRule{ToolName: "db_redis_get", Level: LevelAllow, Description: "读取 Redis 键值"}
	g.rules["db_redis_info"] = ToolRule{ToolName: "db_redis_info", Level: LevelAllow, Description: "查看 Redis 状态"}
	g.rules["db_redis_slowlog"] = ToolRule{ToolName: "db_redis_slowlog", Level: LevelAllow, Description: "查看 Redis 慢日志"}

	g.rules["db_mysql_databases"] = ToolRule{ToolName: "db_mysql_databases", Level: LevelAllow, Description: "查看 MySQL 数据库"}
	g.rules["db_mysql_tables"] = ToolRule{ToolName: "db_mysql_tables", Level: LevelAllow, Description: "查看 MySQL 数据表"}
	g.rules["db_mysql_query"] = ToolRule{
		ToolName:    "db_mysql_query",
		Level:       LevelAllow,
		Description: "执行 MySQL 数据库 SQL 语句",
		AuditFunc:   g.auditSQLQuery,
	}
	g.rules["db_mysql_schema"] = ToolRule{ToolName: "db_mysql_schema", Level: LevelAllow, Description: "查看 MySQL 表结构"}
	g.rules["db_mysql_status"] = ToolRule{ToolName: "db_mysql_status", Level: LevelAllow, Description: "查看 MySQL 指标"}
	g.rules["db_mysql_processlist"] = ToolRule{ToolName: "db_mysql_processlist", Level: LevelAllow, Description: "查看 MySQL 线程"}

	g.rules["db_mongo_find"] = ToolRule{ToolName: "db_mongo_find", Level: LevelAllow, Description: "查询 MongoDB 集合文档"}
	g.rules["db_mongo_aggregate"] = ToolRule{ToolName: "db_mongo_aggregate", Level: LevelAllow, Description: "执行 MongoDB 聚合查询"}
	g.rules["db_mongo_health"] = ToolRule{ToolName: "db_mongo_health", Level: LevelAllow, Description: "查看 MongoDB 健康状态"}

	g.rules["db_sqlite_list_tables"] = ToolRule{ToolName: "db_sqlite_list_tables", Level: LevelAllow, Description: "查看 SQLite 数据表"}
	g.rules["db_sqlite_schema"] = ToolRule{ToolName: "db_sqlite_schema", Level: LevelAllow, Description: "查看 SQLite 表结构"}
	g.rules["db_sqlite_query"] = ToolRule{
		ToolName:    "db_sqlite_query",
		Level:       LevelAllow,
		Description: "执行 SQLite 数据库 SQL 语句",
		AuditFunc:   g.auditSQLQuery,
	}

	g.rules["db_postgres_databases"] = ToolRule{ToolName: "db_postgres_databases", Level: LevelAllow, Description: "查看 PostgreSQL 数据库"}
	g.rules["db_postgres_tables"] = ToolRule{ToolName: "db_postgres_tables", Level: LevelAllow, Description: "查看 PostgreSQL 数据表"}
	g.rules["db_postgres_query"] = ToolRule{
		ToolName:    "db_postgres_query",
		Level:       LevelAllow,
		Description: "执行 PostgreSQL 数据库 SQL 语句",
		AuditFunc:   g.auditSQLQuery,
	}

	// 5. Docker & Kubernetes tools
	g.rules["docker_execute"] = ToolRule{
		ToolName:    "docker_execute",
		Level:       LevelAllow,
		Description: "执行 Docker CLI 状态查询与基础运维指令 (明确不支持部署/下线操作)",
		AuditFunc:   g.auditDockerCommand,
	}
	g.rules["docker_exec"] = ToolRule{
		ToolName:    "docker_exec",
		Level:       LevelAllow,
		Description: "在 Docker 容器内部流式执行命令",
		AuditFunc:   g.auditContainerExecCommand,
	}
	g.rules["docker_orchestrate"] = ToolRule{
		ToolName:    "docker_orchestrate",
		Level:       LevelConfirm,
		Description: "Docker Compose 声明式多服务容器栈编排部署、下线销毁与方案查询",
		AuditFunc:   g.auditDockerOrchestrate,
	}

	g.rules["k8s_kubectl_execute"] = ToolRule{
		ToolName:    "k8s_kubectl_execute",
		Level:       LevelAllow,
		Description: "执行 Kubectl CLI 状态查询与运维指令 (明确不支持部署/下线操作)",
		AuditFunc:   g.auditKubectlCommand,
	}
	g.rules["kubectl_exec"] = ToolRule{
		ToolName:    "kubectl_exec",
		Level:       LevelConfirm,
		Description: "在 Kubernetes Pod 容器内部流式执行命令",
		AuditFunc:   g.auditContainerExecCommand,
	}
	g.rules["k8s_exec"] = ToolRule{
		ToolName:    "k8s_exec",
		Level:       LevelConfirm,
		Description: "在 Kubernetes Pod 容器内部流式执行命令",
		AuditFunc:   g.auditContainerExecCommand,
	}
	g.rules["k8s_orchestrate"] = ToolRule{
		ToolName:    "k8s_orchestrate",
		Level:       LevelConfirm,
		Description: "Kubernetes YAML 编排部署、下线与历史记录查看",
		AuditFunc:   g.auditK8sOrchestrate,
	}

	// 6. Protocol & Orchestration tools
	g.rules["mqtt_publish"] = ToolRule{ToolName: "mqtt_publish", Level: LevelAllow, Description: "发布 MQTT 消息"}
	g.rules["mqtt_subscribe_once"] = ToolRule{ToolName: "mqtt_subscribe_once", Level: LevelAllow, Description: "单次订阅 MQTT 消息"}
	g.rules["http_request"] = ToolRule{ToolName: "http_request", Level: LevelAllow, Description: "发送全功能 HTTP/HTTPS 网络请求 (支持全方法、请求体与 Header)"}
	g.rules["api_manager"] = ToolRule{
		ToolName:    "api_manager",
		Level:       LevelAllow,
		Description: "管理 API 调试工具中的接口树与分组 (增删改查)",
		AuditFunc:   g.auditApiManager,
	}

	g.rules["skill_load"] = ToolRule{ToolName: "skill_load", Level: LevelAllow, Description: "加载技能包 SOP"}
	g.rules["skill_list"] = ToolRule{ToolName: "skill_list", Level: LevelAllow, Description: "列出可用技能包"}

	g.rules["wiki_list"] = ToolRule{ToolName: "wiki_list", Level: LevelAllow, Description: "查看 Wiki 知识库目录清单与摘要"}
	g.rules["wiki_read"] = ToolRule{ToolName: "wiki_read", Level: LevelAllow, Description: "读取 Wiki 文档完整内容"}
	g.rules["wiki_write"] = ToolRule{ToolName: "wiki_write", Level: LevelAllow, Description: "创建新 Wiki 文档或全量覆写"}
	g.rules["wiki_update"] = ToolRule{ToolName: "wiki_update", Level: LevelAllow, Description: "增量修补/融合更新已有 Wiki 文档"}

	g.rules["ask_user"] = ToolRule{ToolName: "ask_user", Level: LevelAllow, Description: "向用户发起交互询问"}
}

// auditShellCommand 接入 Shell AST 深度安全审计引擎
func (g *PolicyGuard) auditShellCommand(ctx context.Context, input string) (PermissionLevel, string) {
	g.mu.RLock()
	blockHighRisk := g.blockHighRiskCommands
	wsDir := g.workspaceDir
	g.mu.RUnlock()

	lvl, reason := AuditShellAST(ctx, input, blockHighRisk, wsDir)
	if lvl == LevelForbidden {
		return LevelForbidden, reason
	}

	// 宿主机与远程 SSH Shell 执行非高危指令统一进入人工审批确认 (LevelConfirm)
	return LevelConfirm, "执行本地/远程 Shell 命令行可能改变系统状态，需人工审批确认"
}

// auditSQLQuery 接入 SQL AST 深度安全审计引擎
func (g *PolicyGuard) auditSQLQuery(ctx context.Context, input string) (PermissionLevel, string) {
	g.mu.RLock()
	blockHighRisk := g.blockHighRiskCommands
	g.mu.RUnlock()

	return AuditSQLAST(ctx, input, blockHighRisk)
}

func isPlanModeForbidden(toolName string, input string) bool {
	writeTools := map[string]bool{
		"create_file":        true,
		"apply_file_patch":   true,
		"move_file":          true,
		"delete_file":        true,
		"execute":            true,
		"ssh_write_file":     true,
		"ssh_delete_file":    true,
		"ssh_upload_file":    true,
		"ssh_exec_command":   true,
		"wiki_write":         true,
		"wiki_update":        true,
		"docker_execute":     true,
		"docker_orchestrate": true,
		"k8s_apply":          true,
		"k8s_delete":         true,
		"k8s_orchestrate":    true,
		"k8s_exec":           true,
	}
	if writeTools[toolName] {
		return true
	}

	// 针对数据库执行写操作 SQL 使用 AST 进行精准检测
	if strings.HasPrefix(toolName, "db_") && strings.HasSuffix(toolName, "_query") {
		lvl, _ := AuditSQLAST(context.Background(), input, false)
		if lvl != LevelAllow {
			return true
		}
	}

	// 针对 api_management 进行检查
	if toolName == "api_management" || toolName == "api_manager" {
		var payload struct {
			Action string `json:"action"`
		}
		if err := json.Unmarshal([]byte(input), &payload); err == nil {
			act := strings.ToLower(strings.TrimSpace(payload.Action))
			if act == "create" || act == "save" || act == "update" || act == "delete" || act == "import" {
				return true
			}
		}
	}

	return false
}

func (g *PolicyGuard) Audit(ctx context.Context, sessionID, toolName, input string, defaultLevel PermissionLevel) (PermissionLevel, string) {
	g.mu.RLock()
	enabled := g.enableGuard
	g.mu.RUnlock()

	if !enabled {
		return LevelAllow, ""
	}

	// 规划模式 (Plan Mode)：全面阻断所有写入与破坏性操作，引导模型专注于只读调研与方案输出
	if IsPlanningMode(ctx) {
		if isPlanModeForbidden(toolName, input) {
			return LevelForbidden, "当前处于技术方案规划调研阶段，禁止执行写操作或修改操作。请继续使用只读工具进行现场调研，或直接输出技术实施方案。"
		}
	}

	rule, ok := g.rules[toolName]
	if ok {
		if rule.AuditFunc != nil {
			lvl, reason := rule.AuditFunc(ctx, input)
			if lvl == LevelForbidden || lvl == LevelConfirm {
				return lvl, reason
			}
			if lvl == LevelAllow {
				return LevelAllow, ""
			}
		}
		if rule.Level == LevelForbidden {
			return LevelForbidden, rule.Description
		}
		if rule.Level == LevelConfirm {
			return LevelConfirm, rule.Description
		}
		return LevelAllow, ""
	}

	if defaultLevel == LevelForbidden {
		return LevelForbidden, "默认策略拦截"
	}
	if defaultLevel == LevelConfirm {
		return LevelConfirm, "默认策略需确认"
	}

	return LevelAllow, ""
}
