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
	g.rules["ssh_list_sessions"] = ToolRule{ToolName: "ssh_list_sessions", Level: LevelAllow, Description: "查看 SSH 会话列表"}
	g.rules["ssh_get_system_info"] = ToolRule{ToolName: "ssh_get_system_info", Level: LevelAllow, Description: "查看远程服务器 CPU/内存/磁盘与负载"}
	g.rules["ssh_list_dir"] = ToolRule{ToolName: "ssh_list_dir", Level: LevelAllow, Description: "查看远程服务器文件目录"}
	g.rules["ssh_read_file"] = ToolRule{ToolName: "ssh_read_file", Level: LevelAllow, Description: "读取远程服务器文件内容"}
	g.rules["ssh_download_file"] = ToolRule{ToolName: "ssh_download_file", Level: LevelAllow, Description: "下载远程服务器文件至本地工作目录"}
	g.rules["ssh_list_processes"] = ToolRule{ToolName: "ssh_list_processes", Level: LevelAllow, Description: "查看远程服务器运行进程"}
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
	g.rules["db_redis_list_connections"] = ToolRule{ToolName: "db_redis_list_connections", Level: LevelAllow, Description: "查看 Redis 实例"}
	g.rules["db_redis_keys"] = ToolRule{ToolName: "db_redis_keys", Level: LevelAllow, Description: "查询 Redis 键列表"}
	g.rules["db_redis_get"] = ToolRule{ToolName: "db_redis_get", Level: LevelAllow, Description: "读取 Redis 键值"}
	g.rules["db_redis_info"] = ToolRule{ToolName: "db_redis_info", Level: LevelAllow, Description: "查看 Redis 状态"}
	g.rules["db_redis_slowlog"] = ToolRule{ToolName: "db_redis_slowlog", Level: LevelAllow, Description: "查看 Redis 慢日志"}

	g.rules["db_mysql_list_connections"] = ToolRule{ToolName: "db_mysql_list_connections", Level: LevelAllow, Description: "查看 MySQL 实例"}
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

	g.rules["db_mongo_list_connections"] = ToolRule{ToolName: "db_mongo_list_connections", Level: LevelAllow, Description: "查看 MongoDB 实例"}
	g.rules["db_mongo_find"] = ToolRule{ToolName: "db_mongo_find", Level: LevelAllow, Description: "查询 MongoDB 集合文档"}
	g.rules["db_mongo_aggregate"] = ToolRule{ToolName: "db_mongo_aggregate", Level: LevelAllow, Description: "执行 MongoDB 聚合查询"}
	g.rules["db_mongo_health"] = ToolRule{ToolName: "db_mongo_health", Level: LevelAllow, Description: "查看 MongoDB 健康状态"}

	g.rules["db_sqlite_list_connections"] = ToolRule{ToolName: "db_sqlite_list_connections", Level: LevelAllow, Description: "查看 SQLite 列表"}
	g.rules["db_sqlite_list_tables"] = ToolRule{ToolName: "db_sqlite_list_tables", Level: LevelAllow, Description: "查看 SQLite 数据表"}
	g.rules["db_sqlite_schema"] = ToolRule{ToolName: "db_sqlite_schema", Level: LevelAllow, Description: "查看 SQLite 表结构"}
	g.rules["db_sqlite_query"] = ToolRule{
		ToolName:    "db_sqlite_query",
		Level:       LevelAllow,
		Description: "执行 SQLite 数据库 SQL 语句",
		AuditFunc:   g.auditSQLQuery,
	}

	// 5. Protocol & Orchestration tools
	g.rules["mqtt_publish"] = ToolRule{ToolName: "mqtt_publish", Level: LevelAllow, Description: "发布 MQTT 消息"}
	g.rules["mqtt_subscribe_once"] = ToolRule{ToolName: "mqtt_subscribe_once", Level: LevelAllow, Description: "单次订阅 MQTT 消息"}
	g.rules["http_request_readonly"] = ToolRule{ToolName: "http_request_readonly", Level: LevelAllow, Description: "发送 HTTP GET 请求"}

	g.rules["job_submit"] = ToolRule{ToolName: "job_submit", Level: LevelAllow, Description: "提交后台作业"}
	g.rules["job_status"] = ToolRule{ToolName: "job_status", Level: LevelAllow, Description: "查询后台作业状态"}
	g.rules["job_output"] = ToolRule{ToolName: "job_output", Level: LevelAllow, Description: "读取后台作业输出"}
	g.rules["job_kill"] = ToolRule{ToolName: "job_kill", Level: LevelAllow, Description: "终止后台作业"}

	g.rules["subagent_spawn"] = ToolRule{ToolName: "subagent_spawn", Level: LevelAllow, Description: "委派独立子代理"}
	g.rules["subagent_send"] = ToolRule{ToolName: "subagent_send", Level: LevelAllow, Description: "向子代理追加消息"}
	g.rules["subagent_interrupt"] = ToolRule{ToolName: "subagent_interrupt", Level: LevelAllow, Description: "中断子代理推导"}
	g.rules["subagent_list"] = ToolRule{ToolName: "subagent_list", Level: LevelAllow, Description: "查看子代理列表"}

	g.rules["workflow_run"] = ToolRule{ToolName: "workflow_run", Level: LevelAllow, Description: "执行工作流"}
	g.rules["workflow_create"] = ToolRule{ToolName: "workflow_create", Level: LevelAllow, Description: "创建工作流"}

	g.rules["skill_load"] = ToolRule{ToolName: "skill_load", Level: LevelAllow, Description: "加载技能包 SOP"}
	g.rules["skill_list"] = ToolRule{ToolName: "skill_list", Level: LevelAllow, Description: "列出可用技能包"}

	g.rules["memory_save"] = ToolRule{ToolName: "memory_save", Level: LevelAllow, Description: "保存长期语义记忆"}
	g.rules["memory_recall"] = ToolRule{ToolName: "memory_recall", Level: LevelAllow, Description: "检索召回事实记忆"}

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

func (g *PolicyGuard) RecordAuditLog(traceID, sessionID, tool, input, decision, outputHead string, durationMs int64) {
	if g.store == nil {
		return
	}
	if len(outputHead) > 200 {
		outputHead = outputHead[:200] + "..."
	}
	_ = g.store.AddAuditLog(store.AuditLogItem{
		TraceID:    traceID,
		SessionID:  sessionID,
		Tool:       tool,
		Input:      input,
		Decision:   decision,
		OutputHead: outputHead,
		DurationMs: durationMs,
		CreatedAt:  time.Now().UnixMilli(),
	})
}
