package guard

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

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
	LevelEscalate  PermissionLevel = "escalate"
	LevelForbidden PermissionLevel = "forbidden"
)

type ApprovalRequest struct {
	ConfirmID   string                `json:"confirm_id"`
	SessionID   string                `json:"session_id"`
	TraceID     string                `json:"trace_id"`
	ToolName    string                `json:"tool_name"`
	Action      string                `json:"action"`
	Path        string                `json:"path"`
	Description string                `json:"description"`
	Arguments   string                `json:"arguments"`
	Level       PermissionLevel       `json:"level"`
	CreatedAt   int64                 `json:"created_at"`
	ResponseCh  chan ApprovalDecision `json:"-"`
}

type ApprovalDecision struct {
	Approved       bool   `json:"approved"`
	Remember       bool   `json:"remember"` // Remember decision for session (e.g. 30 mins)
	Reason         string `json:"reason,omitempty"`
	EscalateReason string `json:"escalate_reason,omitempty"`
}

type ToolRule struct {
	ToolName    string
	Level       PermissionLevel
	Description string
	AuditFunc   func(ctx context.Context, input string) (PermissionLevel, string)
}

type PolicyGuard struct {
	mu                    sync.RWMutex
	enableGuard           bool
	blockHighRiskCommands bool
	rules                 map[string]ToolRule
	store                 *store.Store

	// Session authorization memory: sessionID -> map[key]expireTimestamp
	authMemory sync.Map

	// Pending approval queue: confirmID -> *ApprovalRequest
	pendingQueue sync.Map

	// Callback when new confirm request arrives
	onConfirmRequest func(req *ApprovalRequest)
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

func (g *PolicyGuard) SetOnConfirmRequest(fn func(req *ApprovalRequest)) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.onConfirmRequest = fn
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
	g.rules["read_file"] = ToolRule{ToolName: "read_file", Level: LevelAllow, Description: "读取工作区文件内容（支持行号切片）"}
	g.rules["create_file"] = ToolRule{ToolName: "create_file", Level: LevelAllow, Description: "在工作区新建代码文件"}
	g.rules["apply_file_patch"] = ToolRule{ToolName: "apply_file_patch", Level: LevelAllow, Description: "在工作区应用局部精准代码 Patch 补丁"}
	g.rules["list_dir"] = ToolRule{ToolName: "list_dir", Level: LevelAllow, Description: "查看工作区文件目录"}
	g.rules["search_files"] = ToolRule{ToolName: "search_files", Level: LevelAllow, Description: "搜索工作区文件与关键字"}
	g.rules["move_file"] = ToolRule{ToolName: "move_file", Level: LevelConfirm, Description: "移动或重命名工作区文件"}
	g.rules["delete_file"] = ToolRule{ToolName: "delete_file", Level: LevelConfirm, Description: "删除工作区文件或目录"}
	g.rules["execute"] = ToolRule{
		ToolName:    "execute",
		Level:       LevelConfirm,
		Description: "在本地宿主机执行命令行/Shell指令",
		AuditFunc:   g.auditShellCommand,
	}

	// 2. Web search
	g.rules["web_search"] = ToolRule{ToolName: "web_search", Level: LevelAllow, Description: "互联网网页与新闻检索"}

	// 3. SSH Readonly
	g.rules["ssh_list_sessions"] = ToolRule{ToolName: "ssh_list_sessions", Level: LevelAllow, Description: "查看 SSH 会话列表"}
	g.rules["ssh_get_system_info"] = ToolRule{ToolName: "ssh_get_system_info", Level: LevelAllow, Description: "查看远程服务器 CPU/内存/磁盘与负载"}
	g.rules["ssh_list_dir"] = ToolRule{ToolName: "ssh_list_dir", Level: LevelAllow, Description: "查看远程服务器文件目录"}
	g.rules["ssh_read_file"] = ToolRule{ToolName: "ssh_read_file", Level: LevelAllow, Description: "读取远程服务器文件内容"}
	g.rules["ssh_download_file"] = ToolRule{ToolName: "ssh_download_file", Level: LevelAllow, Description: "下载远程服务器文件至本地工作目录"}
	g.rules["ssh_list_processes"] = ToolRule{ToolName: "ssh_list_processes", Level: LevelAllow, Description: "查看远程服务器运行进程"}
	g.rules["ssh_list_containers"] = ToolRule{ToolName: "ssh_list_containers", Level: LevelAllow, Description: "查看远程服务器 Docker 容器"}

	// 4. SSH Write / Exec
	g.rules["ssh_write_file"] = ToolRule{ToolName: "ssh_write_file", Level: LevelConfirm, Description: "在远程服务器写入或修改文件"}
	g.rules["ssh_delete_file"] = ToolRule{ToolName: "ssh_delete_file", Level: LevelConfirm, Description: "在远程服务器删除文件或目录"}
	g.rules["ssh_upload_file"] = ToolRule{ToolName: "ssh_upload_file", Level: LevelConfirm, Description: "上传本地文件至远程服务器"}
	g.rules["ssh_exec_command"] = ToolRule{
		ToolName:    "ssh_exec_command",
		Level:       LevelConfirm,
		Description: "在远程服务器执行 Shell 命令行",
		AuditFunc:   g.auditShellCommand,
	}

	// 5. Database readonly
	g.rules["db_redis_list_connections"] = ToolRule{ToolName: "db_redis_list_connections", Level: LevelAllow, Description: "查看已建立连接的 Redis 实例"}
	g.rules["db_redis_keys"] = ToolRule{ToolName: "db_redis_keys", Level: LevelAllow, Description: "查询 Redis 键列表"}
	g.rules["db_redis_get"] = ToolRule{ToolName: "db_redis_get", Level: LevelAllow, Description: "读取 Redis 键值与 TTL"}
	g.rules["db_redis_info"] = ToolRule{ToolName: "db_redis_info", Level: LevelAllow, Description: "查看 Redis 服务器状态与内存使用"}
	g.rules["db_redis_slowlog"] = ToolRule{ToolName: "db_redis_slowlog", Level: LevelAllow, Description: "查看 Redis 慢查询日志"}

	g.rules["db_mysql_list_connections"] = ToolRule{ToolName: "db_mysql_list_connections", Level: LevelAllow, Description: "查看已建立连接的 MySQL 实例"}
	g.rules["db_mysql_databases"] = ToolRule{ToolName: "db_mysql_databases", Level: LevelAllow, Description: "查看 MySQL 服务器所有数据库"}
	g.rules["db_mysql_tables"] = ToolRule{ToolName: "db_mysql_tables", Level: LevelAllow, Description: "查看 MySQL 数据库数据表"}
	g.rules["db_mysql_query_readonly"] = ToolRule{
		ToolName:    "db_mysql_query_readonly",
		Level:       LevelAllow,
		Description: "执行只读 MySQL SELECT/SHOW 查询 (受语法白名单与行数限制)",
		AuditFunc:   g.auditMysqlQuery,
	}
	g.rules["db_mysql_schema"] = ToolRule{ToolName: "db_mysql_schema", Level: LevelAllow, Description: "查看 MySQL 库表结构与索引"}
	g.rules["db_mysql_status"] = ToolRule{ToolName: "db_mysql_status", Level: LevelAllow, Description: "查看 MySQL 服务器指标看板"}
	g.rules["db_mysql_processlist"] = ToolRule{ToolName: "db_mysql_processlist", Level: LevelAllow, Description: "查看 MySQL 正在执行的线程进程"}

	g.rules["db_mongo_list_connections"] = ToolRule{ToolName: "db_mongo_list_connections", Level: LevelAllow, Description: "查看已建立连接的 MongoDB 实例"}
	g.rules["db_mongo_find"] = ToolRule{ToolName: "db_mongo_find", Level: LevelAllow, Description: "查询 MongoDB 集合文档"}
	g.rules["db_mongo_aggregate"] = ToolRule{ToolName: "db_mongo_aggregate", Level: LevelAllow, Description: "执行 MongoDB 聚合分析查询"}
	g.rules["db_mongo_health"] = ToolRule{ToolName: "db_mongo_health", Level: LevelAllow, Description: "查看 MongoDB 健康状态"}

	g.rules["db_sqlite_query_readonly"] = ToolRule{ToolName: "db_sqlite_query_readonly", Level: LevelAllow, Description: "执行只读 SQLite 查询"}
	g.rules["db_sqlite_list_tables"] = ToolRule{ToolName: "db_sqlite_list_tables", Level: LevelAllow, Description: "查看 SQLite 数据表列表"}

	// 6. Protocol tools
	g.rules["mqtt_publish"] = ToolRule{ToolName: "mqtt_publish", Level: LevelConfirm, Description: "向 MQTT Broker 发布指定 Topic 消息"}
	g.rules["mqtt_subscribe_once"] = ToolRule{ToolName: "mqtt_subscribe_once", Level: LevelAllow, Description: "单次订阅获取 MQTT 消息"}
	g.rules["http_request_readonly"] = ToolRule{ToolName: "http_request_readonly", Level: LevelAllow, Description: "发送只读 HTTP GET 请求"}

	// 7. Orchestration tools
	g.rules["job_submit"] = ToolRule{ToolName: "job_submit", Level: LevelConfirm, Description: "提交后台异步执行作业"}
	g.rules["job_status"] = ToolRule{ToolName: "job_status", Level: LevelAllow, Description: "查询后台作业状态"}
	g.rules["job_output"] = ToolRule{ToolName: "job_output", Level: LevelAllow, Description: "读取后台作业增量输出"}
	g.rules["job_kill"] = ToolRule{ToolName: "job_kill", Level: LevelConfirm, Description: "强制终止后台作业"}

	g.rules["subagent_spawn"] = ToolRule{ToolName: "subagent_spawn", Level: LevelConfirm, Description: "委派独立子代理并发执行任务"}
	g.rules["subagent_send"] = ToolRule{ToolName: "subagent_send", Level: LevelAllow, Description: "向已运行的子代理追加消息"}
	g.rules["subagent_interrupt"] = ToolRule{ToolName: "subagent_interrupt", Level: LevelConfirm, Description: "中断子代理当前推导"}
	g.rules["subagent_list"] = ToolRule{ToolName: "subagent_list", Level: LevelAllow, Description: "查看当前子代理列表与层级"}

	g.rules["workflow_run"] = ToolRule{ToolName: "workflow_run", Level: LevelConfirm, Description: "执行工作流"}
	g.rules["workflow_create"] = ToolRule{ToolName: "workflow_create", Level: LevelAllow, Description: "创建工作流定义"}

	g.rules["skill_load"] = ToolRule{ToolName: "skill_load", Level: LevelAllow, Description: "加载技能包 SOP 规则"}
	g.rules["skill_list"] = ToolRule{ToolName: "skill_list", Level: LevelAllow, Description: "列出可用技能包"}

	g.rules["memory_save"] = ToolRule{ToolName: "memory_save", Level: LevelAllow, Description: "保存关键事实至长期语义记忆库"}
	g.rules["memory_recall"] = ToolRule{ToolName: "memory_recall", Level: LevelAllow, Description: "从记忆库检索召回相关事实"}

	g.rules["ask_user"] = ToolRule{ToolName: "ask_user", Level: LevelAllow, Description: "向用户发起交互询问"}
}

func (g *PolicyGuard) auditShellCommand(ctx context.Context, input string) (PermissionLevel, string) {
	g.mu.RLock()
	blockHighRisk := g.blockHighRiskCommands
	g.mu.RUnlock()

	if !blockHighRisk {
		return LevelConfirm, ""
	}

	clean := strings.ToLower(strings.TrimSpace(input))

	// If JSON format like {"command": "...", "cmd": "..."}, unpack and append for strict check
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

	for _, pattern := range HighRiskCommandPatterns {
		if strings.Contains(clean, pattern) {
			return LevelForbidden, fmt.Sprintf("命令中包含高危危险指令关键字: %s", pattern)
		}
	}
	return LevelConfirm, ""
}

func (g *PolicyGuard) auditMysqlQuery(ctx context.Context, input string) (PermissionLevel, string) {
	clean := strings.TrimSpace(input)
	if clean == "" {
		return LevelAllow, ""
	}

	// Try parse json {sql: "..."}
	var obj struct {
		SQL string `json:"sql"`
	}
	sqlText := clean
	if err := json.Unmarshal([]byte(clean), &obj); err == nil && obj.SQL != "" {
		sqlText = obj.SQL
	}

	cleanSQL := strings.TrimSpace(sqlText)
	upperSQL := strings.ToUpper(cleanSQL)

	allowedPrefixes := []string{"SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"}
	isValid := false
	for _, p := range allowedPrefixes {
		if strings.HasPrefix(upperSQL, p) {
			isValid = true
			break
		}
	}

	if !isValid {
		return LevelForbidden, "MySQL 只读执行器仅允许 SELECT / SHOW / DESCRIBE / EXPLAIN 等查询语句，禁止执行写库与变更操作"
	}

	if strings.Contains(cleanSQL, ";") && !strings.HasSuffix(cleanSQL, ";") {
		return LevelForbidden, "MySQL 只读执行器禁止执行多语句批量复合 SQL"
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

	targetLevel := defaultLevel
	if targetLevel == "" {
		targetLevel = LevelAllow
	}

	rule, ok := g.rules[toolName]
	if ok {
		if rule.Level != "" {
			targetLevel = rule.Level
		}
		if rule.AuditFunc != nil {
			lvl, reason := rule.AuditFunc(ctx, input)
			if lvl == LevelForbidden || lvl == LevelEscalate {
				return lvl, reason
			}
			if lvl != "" {
				targetLevel = lvl
			}
		}
	}

	// Check session authorization memory (e.g. user chose "Remember for this session")
	if targetLevel == LevelConfirm && sessionID != "" {
		if g.isAuthorizedInMemory(sessionID, toolName) {
			return LevelAllow, "已通过会话内授权记忆自动放行"
		}
	}

	return targetLevel, ""
}

func (g *PolicyGuard) isAuthorizedInMemory(sessionID, toolName string) bool {
	memVal, ok := g.authMemory.Load(sessionID)
	if !ok {
		return false
	}
	memMap, ok := memVal.(*sync.Map)
	if !ok {
		return false
	}
	expVal, ok := memMap.Load(toolName)
	if !ok {
		return false
	}
	exp, ok := expVal.(int64)
	if !ok || time.Now().Unix() > exp {
		memMap.Delete(toolName)
		return false
	}
	return true
}

func (g *PolicyGuard) RememberAuthorization(sessionID, toolName string, duration time.Duration) {
	if sessionID == "" || toolName == "" {
		return
	}
	if duration <= 0 {
		duration = 30 * time.Minute
	}
	val, _ := g.authMemory.LoadOrStore(sessionID, &sync.Map{})
	memMap := val.(*sync.Map)
	memMap.Store(toolName, time.Now().Add(duration).Unix())
}

func (g *PolicyGuard) RevokeAuthorization(sessionID, toolName string) {
	if val, ok := g.authMemory.Load(sessionID); ok {
		memMap := val.(*sync.Map)
		if toolName == "" {
			g.authMemory.Delete(sessionID)
		} else {
			memMap.Delete(toolName)
		}
	}
}

func (g *PolicyGuard) RequestApproval(ctx context.Context, req *ApprovalRequest) ApprovalDecision {
	req.CreatedAt = time.Now().UnixMilli()
	req.ResponseCh = make(chan ApprovalDecision, 1)

	g.pendingQueue.Store(req.ConfirmID, req)
	defer g.pendingQueue.Delete(req.ConfirmID)

	g.mu.RLock()
	cb := g.onConfirmRequest
	g.mu.RUnlock()

	if cb != nil {
		cb(req)
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	select {
	case dec := <-req.ResponseCh:
		if dec.Approved && dec.Remember {
			g.RememberAuthorization(req.SessionID, req.ToolName, 30*time.Minute)
		}
		return dec
	case <-timeoutCtx.Done():
		return ApprovalDecision{
			Approved: false,
			Reason:   "审批等待超时（5分钟）已自动取消",
		}
	}
}

func (g *PolicyGuard) DecideApproval(confirmID string, dec ApprovalDecision) bool {
	if val, ok := g.pendingQueue.Load(confirmID); ok {
		req := val.(*ApprovalRequest)
		select {
		case req.ResponseCh <- dec:
			return true
		default:
			return false
		}
	}
	return false
}

func (g *PolicyGuard) ListPendingApprovals() []*ApprovalRequest {
	var list []*ApprovalRequest
	g.pendingQueue.Range(func(key, value any) bool {
		if req, ok := value.(*ApprovalRequest); ok {
			list = append(list, req)
		}
		return true
	})
	return list
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
