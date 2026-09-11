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
	// 读操作类：直接放行
	g.rules["ssh_get_system_info"] = ToolRule{ToolName: "ssh_get_system_info", Level: LevelAllow, Description: "查看远程服务器 CPU/内存/磁盘与负载"}
	g.rules["ssh_list_dir"] = ToolRule{ToolName: "ssh_list_dir", Level: LevelAllow, Description: "查看远程服务器文件目录"}
	g.rules["ssh_read_file"] = ToolRule{ToolName: "ssh_read_file", Level: LevelAllow, Description: "读取远程服务器文件内容"}
	g.rules["ssh_download_file"] = ToolRule{ToolName: "ssh_download_file", Level: LevelAllow, Description: "下载远程服务器文件至本地工作目录"}
	g.rules["ssh_list_containers"] = ToolRule{ToolName: "ssh_list_containers", Level: LevelAllow, Description: "查看远程服务器 Docker 容器"}
	// 写操作类：需人工审批 (HITL)
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

func (g *PolicyGuard) auditShellCommand(ctx context.Context, input string) (PermissionLevel, string) {
	g.mu.RLock()
	blockHighRisk := g.blockHighRiskCommands
	g.mu.RUnlock()

	clean := strings.ToLower(strings.TrimSpace(input))

	var obj struct {
		Command string `json:"command"`
		Cmd     string `json:"cmd"`
	}
	if err := json.Unmarshal([]byte(input), &obj); err == nil {
		if obj.Command != "" {
			clean += " " + strings.ToLower(obj.Command)
		}
		if obj.Cmd != "" {
			clean += " " + strings.ToLower(obj.Cmd)
		}
	}

	if blockHighRisk {
		for _, pattern := range HighRiskCommandPatterns {
			if strings.Contains(clean, pattern) {
				return LevelForbidden, fmt.Sprintf("命令中包含高危危险指令关键字: %s", pattern)
			}
		}
	}

	return LevelConfirm, "执行本地/远程 Shell 命令行可能改变系统状态，需人工审批确认"
}

func (g *PolicyGuard) auditSQLQuery(ctx context.Context, input string) (PermissionLevel, string) {
	g.mu.RLock()
	blockHighRisk := g.blockHighRiskCommands
	g.mu.RUnlock()

	clean := strings.TrimSpace(input)
	if clean == "" {
		return LevelAllow, ""
	}

	var obj struct {
		SQL string `json:"sql"`
	}
	sqlText := clean
	if err := json.Unmarshal([]byte(clean), &obj); err == nil && obj.SQL != "" {
		sqlText = obj.SQL
	}

	cleanSQL := strings.TrimSpace(sqlText)
	upperSQL := strings.ToUpper(cleanSQL)

	if blockHighRisk {
		highRiskPatterns := []string{
			"DROP DATABASE",
			"DROP SCHEMA",
			"SHUTDOWN",
			"RESET MASTER",
			"ATTACH DATABASE",
			"DETACH DATABASE",
			"VACUUM INTO",
		}
		for _, pat := range highRiskPatterns {
			if strings.Contains(upperSQL, pat) {
				return LevelForbidden, fmt.Sprintf("SQL 语句中包含高危危险指令: %s", pat)
			}
		}
	}

	// 只读 SQL 直接放行
	readPrefixes := []string{"SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "PRAGMA"}
	for _, p := range readPrefixes {
		if strings.HasPrefix(upperSQL, p+" ") || upperSQL == p {
			return LevelAllow, ""
		}
	}

	// 写与结构变更 SQL 需确认
	writeKeywords := []string{"INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "REPLACE"}
	for _, kw := range writeKeywords {
		if strings.HasPrefix(upperSQL, kw+" ") || strings.Contains(upperSQL, " "+kw+" ") {
			return LevelConfirm, fmt.Sprintf("检测到数据库写/结构变更 SQL 语句 (%s)，需人工审批确认", kw)
		}
	}

	return LevelConfirm, "执行非只读 SQL 语句具有潜在数据风险，需人工审批确认"
}

func (g *PolicyGuard) auditDockerCommand(ctx context.Context, inputJSON string) (PermissionLevel, string) {
	clean := strings.TrimSpace(inputJSON)
	if clean == "" || clean == "{}" {
		return LevelAllow, ""
	}

	var obj struct {
		Command string `json:"command"`
	}
	cmdText := clean
	if err := json.Unmarshal([]byte(clean), &obj); err == nil && obj.Command != "" {
		cmdText = obj.Command
	}

	parts := strings.Fields(cmdText)
	if len(parts) > 0 && strings.EqualFold(parts[0], "docker") {
		parts = parts[1:]
	}
	if len(parts) == 0 {
		return LevelAllow, ""
	}

	sub := strings.ToLower(parts[0])

	g.mu.RLock()
	blockHighRisk := g.blockHighRiskCommands
	g.mu.RUnlock()

	if blockHighRisk {
		fullCmdUpper := strings.ToUpper(cmdText)
		if strings.Contains(fullCmdUpper, "SYSTEM PRUNE -A") || strings.Contains(fullCmdUpper, "SYSTEM PRUNE --ALL") || strings.Contains(fullCmdUpper, "RM -F $(DOCKER PS") {
			return LevelForbidden, "禁止执行高风险批量破坏性 Docker 指令"
		}
	}

	// 明确不支持部署/下线操作
	if sub == "run" || sub == "create" {
		return LevelForbidden, fmt.Sprintf("docker_execute 明确不支持部署/下线操作 (docker %s)；请使用 docker_orchestrate 工具", sub)
	}
	if sub == "compose" && len(parts) > 1 {
		subAction := strings.ToLower(parts[1])
		if subAction == "up" || subAction == "down" || subAction == "rm" {
			return LevelForbidden, fmt.Sprintf("docker_execute 明确不支持部署/下线操作 (docker compose %s)；请使用 docker_orchestrate 工具", subAction)
		}
	}

	// 只读/导出命令直接放行
	readCmds := []string{"ps", "logs", "inspect", "images", "image", "save", "volume", "network", "info", "version", "compose"}
	for _, rc := range readCmds {
		if sub == rc {
			if sub == "compose" && len(parts) > 1 && parts[1] == "restart" {
				return LevelConfirm, "执行 Docker Compose restart 操作需人工审批确认"
			}
			if sub == "image" && len(parts) > 1 && parts[1] == "rm" {
				return LevelConfirm, "删除 Docker 镜像操作需人工审批确认"
			}
			return LevelAllow, ""
		}
	}

	// 容器与镜像变更操作需确认
	confirmCmds := []string{"start", "stop", "restart", "pause", "unpause", "rm", "rmi", "kill", "pull", "load"}
	for _, cc := range confirmCmds {
		if sub == cc {
			return LevelConfirm, fmt.Sprintf("执行 Docker 容器/镜像状态变更 (%s) 需人工审批确认", cc)
		}
	}

	return LevelConfirm, "执行该 Docker 命令具有潜在状态变更风险，需人工审批确认"
}

func (g *PolicyGuard) auditDockerOrchestrate(ctx context.Context, inputJSON string) (PermissionLevel, string) {
	clean := strings.TrimSpace(inputJSON)
	if clean == "" || clean == "{}" {
		return LevelAllow, ""
	}

	var obj struct {
		Action string `json:"action"`
		Name   string `json:"name"`
	}
	if err := json.Unmarshal([]byte(clean), &obj); err == nil {
		action := strings.ToLower(strings.TrimSpace(obj.Action))
		switch action {
		case "list":
			return LevelAllow, ""
		case "apply", "up":
			detail := "执行 Docker Compose 编排部署"
			if obj.Name != "" {
				detail = fmt.Sprintf("执行 Docker Compose 编排部署 [项目: %s]", obj.Name)
			}
			return LevelConfirm, detail
		case "delete", "down":
			detail := "下线并销毁 Docker Compose 编排项目及本地记录"
			if obj.Name != "" {
				detail = fmt.Sprintf("下线并销毁 Docker Compose 编排项目及本地记录 [项目: %s]", obj.Name)
			}
			return LevelConfirm, detail
		}
	}

	return LevelConfirm, "执行 Docker Compose 编排操作需人工确认"
}

func (g *PolicyGuard) auditKubectlCommand(ctx context.Context, inputJSON string) (PermissionLevel, string) {
	clean := strings.TrimSpace(inputJSON)
	if clean == "" || clean == "{}" {
		return LevelAllow, ""
	}

	var obj struct {
		Command string `json:"command"`
	}
	cmdText := clean
	if err := json.Unmarshal([]byte(clean), &obj); err == nil && obj.Command != "" {
		cmdText = obj.Command
	}

	parts := strings.Fields(cmdText)
	if len(parts) > 0 && strings.EqualFold(parts[0], "kubectl") {
		parts = parts[1:]
	}
	if len(parts) == 0 {
		return LevelAllow, ""
	}

	sub := strings.ToLower(parts[0])

	g.mu.RLock()
	blockHighRisk := g.blockHighRiskCommands
	g.mu.RUnlock()

	if blockHighRisk {
		fullCmdUpper := strings.ToUpper(cmdText)
		if strings.Contains(fullCmdUpper, "DELETE NAMESPACE KUBE-SYSTEM") || strings.Contains(fullCmdUpper, "DELETE NS KUBE-SYSTEM") ||
			strings.Contains(fullCmdUpper, "DELETE NAMESPACE DEFAULT") || strings.Contains(fullCmdUpper, "DELETE NODE") {
			return LevelForbidden, "禁止删除核心系统命名空间或物理节点"
		}
	}

	// 明确不支持部署/下线操作
	if sub == "apply" || sub == "create" {
		return LevelForbidden, fmt.Sprintf("k8s_kubectl_execute 明确不支持部署/下线操作 (kubectl %s)；请使用 k8s_orchestrate 工具", sub)
	}
	if sub == "delete" && (strings.Contains(cmdText, "-f ") || strings.Contains(cmdText, "--filename") || strings.Contains(cmdText, "-f=")) {
		return LevelForbidden, "k8s_kubectl_execute 明确不支持部署/下线操作 (kubectl delete -f)；请使用 k8s_orchestrate 工具"
	}

	// 只读命令直接放行
	readCmds := []string{"get", "logs", "describe", "cluster-info", "version", "top", "explain"}
	for _, rc := range readCmds {
		if sub == rc {
			return LevelAllow, ""
		}
	}

	// 变更操作需确认
	confirmCmds := []string{"scale", "rollout", "delete", "patch", "cordon", "drain"}
	for _, cc := range confirmCmds {
		if sub == cc {
			return LevelConfirm, fmt.Sprintf("执行 Kubernetes 集群资源变更 (%s) 需人工审批确认", cc)
		}
	}

	return LevelConfirm, "执行该 Kubernetes 变更命令需人工审批确认"
}

func (g *PolicyGuard) auditK8sOrchestrate(ctx context.Context, inputJSON string) (PermissionLevel, string) {
	clean := strings.TrimSpace(inputJSON)
	if clean == "" || clean == "{}" {
		return LevelAllow, ""
	}

	var obj struct {
		Action    string `json:"action"`
		Name      string `json:"name"`
		YAML      string `json:"yaml"`
		Namespace string `json:"namespace"`
	}
	if err := json.Unmarshal([]byte(clean), &obj); err == nil {
		action := strings.ToLower(strings.TrimSpace(obj.Action))
		switch action {
		case "list":
			return LevelAllow, ""
		case "apply":
			detail := "执行 Kubernetes YAML 编排部署"
			if obj.Name != "" {
				detail = fmt.Sprintf("执行 Kubernetes YAML 编排部署 [%s]", obj.Name)
			}
			return LevelConfirm, detail
		case "delete":
			g.mu.RLock()
			blockHighRisk := g.blockHighRiskCommands
			g.mu.RUnlock()

			if blockHighRisk && obj.YAML != "" {
				upperYAML := strings.ToUpper(obj.YAML)
				if strings.Contains(upperYAML, "KIND: NAMESPACE") && (strings.Contains(upperYAML, "NAME: KUBE-SYSTEM") || strings.Contains(upperYAML, "NAME: DEFAULT")) {
					return LevelForbidden, "禁止删除核心系统命名空间"
				}
				if strings.Contains(upperYAML, "KIND: NODE") {
					return LevelForbidden, "禁止删除物理节点"
				}
			}

			detail := "下线/删除 Kubernetes YAML 编排资源"
			if obj.Name != "" {
				detail = fmt.Sprintf("下线/删除 Kubernetes YAML 编排资源 [%s]", obj.Name)
			}
			return LevelConfirm, detail
		}
	}

	return LevelConfirm, "执行 Kubernetes YAML 编排操作需人工确认"
}

func (g *PolicyGuard) auditContainerExecCommand(ctx context.Context, inputJSON string) (PermissionLevel, string) {
	clean := strings.TrimSpace(inputJSON)
	if clean == "" || clean == "{}" {
		return LevelAllow, ""
	}

	var obj struct {
		Command string `json:"command"`
	}
	cmdText := clean
	if err := json.Unmarshal([]byte(clean), &obj); err == nil && obj.Command != "" {
		cmdText = obj.Command
	}

	// 去除开头的 docker exec 或 kubectl exec 包装
	parts := strings.Fields(cmdText)
	if len(parts) > 0 && (strings.EqualFold(parts[0], "docker") || strings.EqualFold(parts[0], "kubectl")) {
		if len(parts) > 1 && strings.EqualFold(parts[1], "exec") {
			parts = parts[2:]
		}
	} else if len(parts) > 0 && strings.EqualFold(parts[0], "exec") {
		parts = parts[1:]
	}

	// 提取实际在容器内执行的命令
	var innerCmdParts []string
	dashDashIdx := -1
	for idx, p := range parts {
		if p == "--" {
			dashDashIdx = idx
			break
		}
	}
	if dashDashIdx != -1 && dashDashIdx+1 < len(parts) {
		innerCmdParts = parts[dashDashIdx+1:]
	} else {
		for i := 0; i < len(parts); i++ {
			p := parts[i]
			if p == "-it" || p == "-i" || p == "-t" || p == "-d" || p == "--detach" {
				continue
			}
			if (p == "-n" || p == "--namespace" || p == "-c" || p == "--container" || p == "-w" || p == "--workdir" || p == "-u" || p == "--user") && i+1 < len(parts) {
				i++
				continue
			}
			if strings.HasPrefix(p, "--namespace=") || strings.HasPrefix(p, "--container=") || strings.HasPrefix(p, "--workdir=") || strings.HasPrefix(p, "--user=") {
				continue
			}
			if strings.HasPrefix(p, "-") {
				continue
			}
			// 遇到第一个非 flag 参数即容器名/Pod名，之后的所有参数均视为容器内部指令
			if i+1 < len(parts) {
				innerCmdParts = parts[i+1:]
			}
			break
		}
	}
	if len(innerCmdParts) == 0 {
		innerCmdParts = parts
	}

	innerCmd := strings.Join(innerCmdParts, " ")
	upperCmd := strings.ToUpper(innerCmd)

	g.mu.RLock()
	blockHighRisk := g.blockHighRiskCommands
	g.mu.RUnlock()

	// 1. 高危拦截检查
	if blockHighRisk {
		highRisk := []string{"RM -RF /", "RM -FR /", "MKFS", ":(){ :|:& };:", "DD IF=/DEV", "SHUTDOWN", "REBOOT", "INIT 0"}
		for _, hr := range highRisk {
			if strings.Contains(upperCmd, hr) {
				return LevelForbidden, fmt.Sprintf("容器内 Exec 命令包含高危破坏性指令: %s", hr)
			}
		}
	}

	// 2. 只读命令直接放行
	readPrefixes := []string{"LS", "LL", "CAT", "HEAD", "TAIL", "MORE", "LESS", "GREP", "FIND", "PS", "TOP", "FREE", "DF", "DU", "ENV", "PRINTENV", "PWD", "ECHO", "WHICH", "WHEREIS", "UNAME", "HOSTNAME", "UPTIME", "PING", "CURL", "WGET", "NETSTAT", "SS", "IP", "IFCONFIG", "DATE", "WHOAMI", "ID"}
	if len(innerCmdParts) > 0 {
		firstWord := strings.ToUpper(innerCmdParts[0])
		for _, rp := range readPrefixes {
			if firstWord == rp {
				return LevelAllow, ""
			}
		}
	}

	// 3. 其它带有修改/写倾向的命令要求确认
	return LevelConfirm, fmt.Sprintf("执行容器内 Exec 命令 (%s) 具有状态变更潜在风险，需人工审批确认", strings.TrimSpace(innerCmd))
}

func (g *PolicyGuard) auditApiManager(ctx context.Context, input string) (PermissionLevel, string) {
	var payload struct {
		Action string `json:"action"`
		ID     string `json:"id"`
		Name   string `json:"name"`
	}
	if err := json.Unmarshal([]byte(input), &payload); err == nil {
		action := strings.ToLower(strings.TrimSpace(payload.Action))
		if action == "delete" {
			target := payload.ID
			if target == "" {
				target = payload.Name
			}
			return LevelConfirm, fmt.Sprintf("删除 API 接口或分组 (ID/名称: %s)", target)
		}
	}
	return LevelAllow, ""
}

func (g *PolicyGuard) Audit(ctx context.Context, sessionID, toolName, input string, defaultLevel PermissionLevel) (PermissionLevel, string) {
	g.mu.RLock()
	enabled := g.enableGuard
	g.mu.RUnlock()

	if !enabled {
		return LevelAllow, ""
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
