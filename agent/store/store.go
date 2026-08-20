package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type SessionItem struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Workspace string `json:"workspace"`
	Settings  string `json:"settings"` // JSON snapshot
	CreatedAt int64  `json:"created_at"`
	UpdatedAt int64  `json:"updated_at"`
}

type MessageItem struct {
	ID           int64  `json:"id"`
	SessionID    string `json:"session_id"`
	Role         string `json:"role"`
	Content      string `json:"content"`
	Reasoning    string `json:"reasoning,omitempty"`
	ToolCalls    string `json:"tool_calls,omitempty"`    // JSON
	ProcessSteps string `json:"process_steps,omitempty"` // JSON
	CreatedAt    int64  `json:"created_at"`
}

type JobItem struct {
	ID         string  `json:"id"`
	SessionID  string  `json:"session_id"`
	Kind       string  `json:"kind"`
	State      string  `json:"state"` // pending | running | waiting_approval | completed | failed | killed
	Progress   float64 `json:"progress"`
	Error      string  `json:"error,omitempty"`
	Summary    string  `json:"summary,omitempty"`
	CreatedAt  int64   `json:"created_at"`
	StartedAt  int64   `json:"started_at"`
	FinishedAt int64   `json:"finished_at"`
}

type JobOutputItem struct {
	JobID string `json:"job_id"`
	Seq   int    `json:"seq"`
	Chunk string `json:"chunk"`
}

type SubagentItem struct {
	ID         string `json:"id"`
	ParentID   string `json:"parent_id,omitempty"`
	SessionID  string `json:"session_id"`
	Prompt     string `json:"prompt"`
	State      string `json:"state"`
	Result     string `json:"result,omitempty"` // JSON
	Depth      int    `json:"depth"`
	CreatedAt  int64  `json:"created_at"`
	FinishedAt int64  `json:"finished_at"`
}

type AuditLogItem struct {
	ID         int64  `json:"id"`
	TraceID    string `json:"trace_id"`
	SessionID  string `json:"session_id"`
	Tool       string `json:"tool"`
	Input      string `json:"input"`
	Decision   string `json:"decision"` // allow | confirm | escalate | forbidden
	OutputHead string `json:"output_head"`
	DurationMs int64  `json:"duration_ms"`
	CreatedAt  int64  `json:"created_at"`
}

type MemoryItem struct {
	ID        int64  `json:"id"`
	Kind      string `json:"kind"` // episodic | semantic
	Content   string `json:"content"`
	Tags      string `json:"tags"`
	Source    string `json:"source"`
	Meta      string `json:"meta,omitempty"`
	CreatedAt int64  `json:"created_at"`
}

type SkillItem struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	Instructions string `json:"instructions"`
	Tools        string `json:"tools"` // comma separated
}

type WorkflowItem struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Script      string `json:"script"`
	Version     int    `json:"version"`
}

type Store struct {
	mu sync.RWMutex
	db *sql.DB
}

var (
	defaultStore *Store
	storeOnce    sync.Once
)

func GetStore() (*Store, error) {
	var err error
	storeOnce.Do(func() {
		home, _ := os.UserConfigDir()
		dir := filepath.Join(home, "xClient")
		_ = os.MkdirAll(dir, 0o755)
		dbPath := filepath.Join(dir, "xagent.db")
		defaultStore, err = NewStore(dbPath)
	})
	return defaultStore, err
}

func NewStore(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("打开 xagent SQLite 数据库失败: %w", err)
	}

	db.SetMaxOpenConns(1) // Single writer mode for safe concurrent SQLite access

	s := &Store{db: db}
	if err := s.initSchema(); err != nil {
		return nil, fmt.Errorf("初始化 xagent 数据库结构失败: %w", err)
	}

	// 自动检查并迁移历史 JSON 数据
	s.autoMigrateJSONHistory()

	return s, nil
}

func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

func (s *Store) initSchema() error {
	schemaSQL := `
	CREATE TABLE IF NOT EXISTS sessions (
		id          TEXT PRIMARY KEY,
		title       TEXT,
		workspace   TEXT,
		settings    TEXT,
		created_at  INTEGER,
		updated_at  INTEGER
	);

	CREATE TABLE IF NOT EXISTS messages (
		id            INTEGER PRIMARY KEY AUTOINCREMENT,
		session_id    TEXT NOT NULL,
		role          TEXT NOT NULL,
		content       TEXT,
		reasoning     TEXT,
		tool_calls    TEXT,
		process_steps TEXT,
		created_at    INTEGER
	);
	CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

	CREATE TABLE IF NOT EXISTS jobs (
		id          TEXT PRIMARY KEY,
		session_id  TEXT,
		kind        TEXT,
		state       TEXT,
		progress    REAL,
		error       TEXT,
		summary     TEXT,
		created_at  INTEGER,
		started_at  INTEGER,
		finished_at INTEGER
	);

	CREATE TABLE IF NOT EXISTS job_output (
		job_id  TEXT NOT NULL,
		seq     INTEGER NOT NULL,
		chunk   TEXT,
		PRIMARY KEY (job_id, seq)
	);

	CREATE TABLE IF NOT EXISTS subagents (
		id          TEXT PRIMARY KEY,
		parent_id   TEXT,
		session_id  TEXT,
		prompt      TEXT,
		state       TEXT,
		result      TEXT,
		depth       INTEGER DEFAULT 0,
		created_at  INTEGER,
		finished_at INTEGER
	);

	CREATE TABLE IF NOT EXISTS audit_logs (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		trace_id    TEXT,
		session_id  TEXT,
		tool        TEXT,
		input       TEXT,
		decision    TEXT,
		output_head TEXT,
		duration_ms INTEGER,
		created_at  INTEGER
	);
	CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON audit_logs(session_id);
	CREATE INDEX IF NOT EXISTS idx_audit_logs_trace ON audit_logs(trace_id);

	CREATE TABLE IF NOT EXISTS memories (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		kind        TEXT,
		content     TEXT,
		tags        TEXT,
		source      TEXT,
		meta        TEXT,
		created_at  INTEGER
	);

	CREATE TABLE IF NOT EXISTS skills (
		name         TEXT PRIMARY KEY,
		description  TEXT,
		instructions TEXT,
		tools        TEXT
	);

	CREATE TABLE IF NOT EXISTS workflows (
		name        TEXT PRIMARY KEY,
		description TEXT,
		script      TEXT,
		version     INTEGER
	);
	`
	_, err := s.db.Exec(schemaSQL)
	if err != nil {
		return err
	}
	_, _ = s.db.Exec("ALTER TABLE memories ADD COLUMN meta TEXT;")
	return nil
}

func (s *Store) autoMigrateJSONHistory() {
	home, _ := os.UserConfigDir()
	jsonPath := filepath.Join(home, "xClient", "ai_agent_history.json")
	if _, err := os.Stat(jsonPath); err != nil {
		return // File does not exist
	}

	// Check if default session exists
	var count int
	_ = s.db.QueryRow("SELECT COUNT(*) FROM messages WHERE session_id = 'ai_agent_default'").Scan(&count)
	if count > 0 {
		return // Already migrated
	}

	data, err := os.ReadFile(jsonPath)
	if err != nil || len(data) == 0 {
		return
	}

	type OldMessage struct {
		Role             string          `json:"role"`
		Content          string          `json:"content"`
		ReasoningContent string          `json:"reasoning_content,omitempty"`
		ProcessSteps     json.RawMessage `json:"process_steps,omitempty"`
		ToolCalls        json.RawMessage `json:"tool_calls,omitempty"`
		Timestamp        int64           `json:"timestamp,omitempty"`
	}

	var oldMsgs []OldMessage
	if err := json.Unmarshal(data, &oldMsgs); err != nil || len(oldMsgs) == 0 {
		return
	}

	now := time.Now().UnixMilli()
	_ = s.SaveSession(SessionItem{
		ID:        "ai_agent_default",
		Title:     "默认会话",
		CreatedAt: now,
		UpdatedAt: now,
	})

	for _, msg := range oldMsgs {
		t := msg.Timestamp
		if t == 0 {
			t = now
		}
		psStr := ""
		if len(msg.ProcessSteps) > 0 {
			psStr = string(msg.ProcessSteps)
		}
		tcStr := ""
		if len(msg.ToolCalls) > 0 {
			tcStr = string(msg.ToolCalls)
		}
		_ = s.AddMessage(MessageItem{
			SessionID:    "ai_agent_default",
			Role:         msg.Role,
			Content:      msg.Content,
			Reasoning:    msg.ReasoningContent,
			ToolCalls:    tcStr,
			ProcessSteps: psStr,
			CreatedAt:    t,
		})
	}
}

// ---------- Session Operations ----------

func (s *Store) ListSessions() ([]SessionItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query("SELECT id, title, workspace, settings, created_at, updated_at FROM sessions ORDER BY updated_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []SessionItem
	for rows.Next() {
		var it SessionItem
		var ws, st sql.NullString
		if err := rows.Scan(&it.ID, &it.Title, &ws, &st, &it.CreatedAt, &it.UpdatedAt); err != nil {
			continue
		}
		it.Workspace = ws.String
		it.Settings = st.String
		list = append(list, it)
	}
	return list, nil
}

func (s *Store) GetSession(id string) (*SessionItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var it SessionItem
	var ws, st sql.NullString
	err := s.db.QueryRow("SELECT id, title, workspace, settings, created_at, updated_at FROM sessions WHERE id = ?", id).
		Scan(&it.ID, &it.Title, &ws, &st, &it.CreatedAt, &it.UpdatedAt)
	if err != nil {
		return nil, err
	}
	it.Workspace = ws.String
	it.Settings = st.String
	return &it, nil
}

func (s *Store) SaveSession(it SessionItem) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UnixMilli()
	if it.CreatedAt == 0 {
		it.CreatedAt = now
	}
	it.UpdatedAt = now

	_, err := s.db.Exec(`
		INSERT INTO sessions (id, title, workspace, settings, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			workspace = excluded.workspace,
			settings = excluded.settings,
			updated_at = excluded.updated_at
	`, it.ID, it.Title, it.Workspace, it.Settings, it.CreatedAt, it.UpdatedAt)
	return err
}

func (s *Store) DeleteSession(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, _ = s.db.Exec("DELETE FROM messages WHERE session_id = ?", id)
	_, _ = s.db.Exec("DELETE FROM audit_logs WHERE session_id = ?", id)
	_, err := s.db.Exec("DELETE FROM sessions WHERE id = ?", id)
	return err
}

// ---------- Message Operations ----------

func (s *Store) ListMessages(sessionID string) ([]MessageItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(`
		SELECT id, session_id, role, content, reasoning, tool_calls, process_steps, created_at
		FROM messages WHERE session_id = ? ORDER BY id ASC
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []MessageItem
	for rows.Next() {
		var it MessageItem
		var rs, tc, ps sql.NullString
		if err := rows.Scan(&it.ID, &it.SessionID, &it.Role, &it.Content, &rs, &tc, &ps, &it.CreatedAt); err != nil {
			continue
		}
		it.Reasoning = rs.String
		it.ToolCalls = tc.String
		it.ProcessSteps = ps.String
		list = append(list, it)
	}
	return list, nil
}

func (s *Store) AddMessage(it MessageItem) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if it.CreatedAt == 0 {
		it.CreatedAt = time.Now().UnixMilli()
	}

	_, err := s.db.Exec(`
		INSERT INTO messages (session_id, role, content, reasoning, tool_calls, process_steps, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, it.SessionID, it.Role, it.Content, it.Reasoning, it.ToolCalls, it.ProcessSteps, it.CreatedAt)

	// Update session updated_at
	_, _ = s.db.Exec("UPDATE sessions SET updated_at = ? WHERE id = ?", it.CreatedAt, it.SessionID)
	return err
}

func (s *Store) ReplaceMessages(sessionID string, msgs []MessageItem) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM messages WHERE session_id = ?", sessionID); err != nil {
		return err
	}

	stmt, err := tx.Prepare(`
		INSERT INTO messages (session_id, role, content, reasoning, tool_calls, process_steps, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	now := time.Now().UnixMilli()
	for _, m := range msgs {
		t := m.CreatedAt
		if t == 0 {
			t = now
		}
		if _, err := stmt.Exec(sessionID, m.Role, m.Content, m.Reasoning, m.ToolCalls, m.ProcessSteps, t); err != nil {
			return err
		}
	}

	_, _ = tx.Exec("UPDATE sessions SET updated_at = ? WHERE id = ?", now, sessionID)
	return tx.Commit()
}

func (s *Store) ClearSessionMessages(sessionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec("DELETE FROM messages WHERE session_id = ?", sessionID)
	return err
}

// ---------- Job Operations ----------

func (s *Store) SaveJob(it JobItem) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`
		INSERT INTO jobs (id, session_id, kind, state, progress, error, summary, created_at, started_at, finished_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			state = excluded.state,
			progress = CASE WHEN excluded.progress > 0 THEN excluded.progress ELSE jobs.progress END,
			error = CASE WHEN excluded.error != '' THEN excluded.error ELSE jobs.error END,
			summary = CASE WHEN excluded.summary != '' THEN excluded.summary ELSE jobs.summary END,
			started_at = CASE WHEN excluded.started_at > 0 THEN excluded.started_at ELSE jobs.started_at END,
			finished_at = CASE WHEN excluded.finished_at > 0 THEN excluded.finished_at ELSE jobs.finished_at END
	`, it.ID, it.SessionID, it.Kind, it.State, it.Progress, it.Error, it.Summary, it.CreatedAt, it.StartedAt, it.FinishedAt)
	return err
}

func (s *Store) GetJob(id string) (*JobItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var it JobItem
	var er, sm sql.NullString
	err := s.db.QueryRow(`
		SELECT id, session_id, kind, state, progress, error, summary, created_at, started_at, finished_at
		FROM jobs WHERE id = ?
	`, id).Scan(&it.ID, &it.SessionID, &it.Kind, &it.State, &it.Progress, &er, &sm, &it.CreatedAt, &it.StartedAt, &it.FinishedAt)
	if err != nil {
		return nil, err
	}
	it.Error = er.String
	it.Summary = sm.String
	return &it, nil
}

func (s *Store) ListJobs(sessionID string) ([]JobItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := "SELECT id, session_id, kind, state, progress, error, summary, created_at, started_at, finished_at FROM jobs"
	var rows *sql.Rows
	var err error
	if sessionID != "" {
		rows, err = s.db.Query(query+" WHERE session_id = ? ORDER BY created_at DESC", sessionID)
	} else {
		rows, err = s.db.Query(query + " ORDER BY created_at DESC LIMIT 100")
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []JobItem
	for rows.Next() {
		var it JobItem
		var er, sm sql.NullString
		if err := rows.Scan(&it.ID, &it.SessionID, &it.Kind, &it.State, &it.Progress, &er, &sm, &it.CreatedAt, &it.StartedAt, &it.FinishedAt); err != nil {
			continue
		}
		it.Error = er.String
		it.Summary = sm.String
		list = append(list, it)
	}
	return list, nil
}

func (s *Store) AppendJobOutput(jobID string, seq int, chunk string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec("INSERT INTO job_output (job_id, seq, chunk) VALUES (?, ?, ?)", jobID, seq, chunk)
	return err
}

func (s *Store) GetJobOutputs(jobID string, fromSeq int) ([]JobOutputItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query("SELECT job_id, seq, chunk FROM job_output WHERE job_id = ? AND seq >= ? ORDER BY seq ASC", jobID, fromSeq)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []JobOutputItem
	for rows.Next() {
		var it JobOutputItem
		if err := rows.Scan(&it.JobID, &it.Seq, &it.Chunk); err != nil {
			continue
		}
		list = append(list, it)
	}
	return list, nil
}

// ---------- Subagent Operations ----------

func (s *Store) SaveSubagent(it SubagentItem) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if it.CreatedAt == 0 {
		it.CreatedAt = time.Now().UnixMilli()
	}

	_, err := s.db.Exec(`
		INSERT INTO subagents (id, parent_id, session_id, prompt, state, result, depth, created_at, finished_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			state = excluded.state,
			result = excluded.result,
			finished_at = excluded.finished_at
	`, it.ID, it.ParentID, it.SessionID, it.Prompt, it.State, it.Result, it.Depth, it.CreatedAt, it.FinishedAt)
	return err
}

func (s *Store) ListSubagents(sessionID string) ([]SubagentItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := "SELECT id, parent_id, session_id, prompt, state, result, depth, created_at, finished_at FROM subagents"
	var rows *sql.Rows
	var err error
	if sessionID != "" {
		rows, err = s.db.Query(query+" WHERE session_id = ? ORDER BY created_at ASC", sessionID)
	} else {
		rows, err = s.db.Query(query + " ORDER BY created_at DESC LIMIT 100")
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []SubagentItem
	for rows.Next() {
		var it SubagentItem
		var pid, res sql.NullString
		if err := rows.Scan(&it.ID, &pid, &it.SessionID, &it.Prompt, &it.State, &res, &it.Depth, &it.CreatedAt, &it.FinishedAt); err != nil {
			continue
		}
		it.ParentID = pid.String
		it.Result = res.String
		list = append(list, it)
	}
	return list, nil
}

func (s *Store) GetSubagent(id string) (*SubagentItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var it SubagentItem
	var pid, res sql.NullString
	err := s.db.QueryRow("SELECT id, parent_id, session_id, prompt, state, result, depth, created_at, finished_at FROM subagents WHERE id = ?", id).
		Scan(&it.ID, &pid, &it.SessionID, &it.Prompt, &it.State, &res, &it.Depth, &it.CreatedAt, &it.FinishedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	it.ParentID = pid.String
	it.Result = res.String
	return &it, nil
}

// ---------- Audit Log Operations ----------

func (s *Store) AddAuditLog(it AuditLogItem) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if it.CreatedAt == 0 {
		it.CreatedAt = time.Now().UnixMilli()
	}

	_, err := s.db.Exec(`
		INSERT INTO audit_logs (trace_id, session_id, tool, input, decision, output_head, duration_ms, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, it.TraceID, it.SessionID, it.Tool, it.Input, it.Decision, it.OutputHead, it.DurationMs, it.CreatedAt)
	return err
}

func (s *Store) ListAuditLogs(sessionID string, limit int) ([]AuditLogItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 {
		limit = 100
	}

	var rows *sql.Rows
	var err error
	if sessionID != "" {
		rows, err = s.db.Query(`
			SELECT id, trace_id, session_id, tool, input, decision, output_head, duration_ms, created_at
			FROM audit_logs WHERE session_id = ? ORDER BY id DESC LIMIT ?
		`, sessionID, limit)
	} else {
		rows, err = s.db.Query(`
			SELECT id, trace_id, session_id, tool, input, decision, output_head, duration_ms, created_at
			FROM audit_logs ORDER BY id DESC LIMIT ?
		`, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []AuditLogItem
	for rows.Next() {
		var it AuditLogItem
		var tr, sid, out sql.NullString
		if err := rows.Scan(&it.ID, &tr, &sid, &it.Tool, &it.Input, &it.Decision, &out, &it.DurationMs, &it.CreatedAt); err != nil {
			continue
		}
		it.TraceID = tr.String
		it.SessionID = sid.String
		it.OutputHead = out.String
		list = append(list, it)
	}
	return list, nil
}

// ---------- Memory Operations ----------

func (s *Store) SaveMemory(it MemoryItem) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if it.CreatedAt == 0 {
		it.CreatedAt = time.Now().UnixMilli()
	}

	_, err := s.db.Exec(`
		INSERT INTO memories (kind, content, tags, source, meta, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, it.Kind, it.Content, it.Tags, it.Source, it.Meta, it.CreatedAt)
	return err
}

func (s *Store) QueryMemories(query string, sourceFilter string, limit int) ([]MemoryItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 {
		limit = 10
	}

	var rows *sql.Rows
	var err error
	if sourceFilter != "" {
		rows, err = s.db.Query(`
			SELECT id, kind, content, tags, source, COALESCE(meta, ''), created_at
			FROM memories
			WHERE (content LIKE ? OR tags LIKE ?) AND source = ?
			ORDER BY id DESC LIMIT ?
		`, "%"+query+"%", "%"+query+"%", sourceFilter, limit)
	} else {
		rows, err = s.db.Query(`
			SELECT id, kind, content, tags, source, COALESCE(meta, ''), created_at
			FROM memories
			WHERE content LIKE ? OR tags LIKE ?
			ORDER BY id DESC LIMIT ?
		`, "%"+query+"%", "%"+query+"%", limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []MemoryItem
	for rows.Next() {
		var it MemoryItem
		var tg, src, mt sql.NullString
		if err := rows.Scan(&it.ID, &it.Kind, &it.Content, &tg, &src, &mt, &it.CreatedAt); err != nil {
			continue
		}
		it.Tags = tg.String
		it.Source = src.String
		it.Meta = mt.String
		list = append(list, it)
	}
	return list, nil
}

// ---------- Skills & Workflows ----------

func (s *Store) ListSkills() ([]SkillItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query("SELECT name, description, instructions, tools FROM skills")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []SkillItem
	for rows.Next() {
		var it SkillItem
		var tl sql.NullString
		if err := rows.Scan(&it.Name, &it.Description, &it.Instructions, &tl); err != nil {
			continue
		}
		it.Tools = tl.String
		list = append(list, it)
	}
	return list, nil
}

func (s *Store) SaveSkill(it SkillItem) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec(`
		INSERT INTO skills (name, description, instructions, tools)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(name) DO UPDATE SET
			description = excluded.description,
			instructions = excluded.instructions,
			tools = excluded.tools
	`, it.Name, it.Description, it.Instructions, it.Tools)
	return err
}

// ---------- Workflow Operations ----------

func (s *Store) SaveWorkflow(it WorkflowItem) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if it.Version <= 0 {
		it.Version = 1
	}

	_, err := s.db.Exec(`
		INSERT INTO workflows (name, description, script, version)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(name) DO UPDATE SET
			description = excluded.description,
			script = excluded.script,
			version = excluded.version
	`, it.Name, it.Description, it.Script, it.Version)
	return err
}

func (s *Store) GetWorkflow(name string) (*WorkflowItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var it WorkflowItem
	var desc, script sql.NullString
	err := s.db.QueryRow("SELECT name, description, script, version FROM workflows WHERE name = ?", name).
		Scan(&it.Name, &desc, &script, &it.Version)
	if err != nil {
		return nil, err
	}
	it.Description = desc.String
	it.Script = script.String
	return &it, nil
}

func (s *Store) ListWorkflows() ([]WorkflowItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query("SELECT name, description, script, version FROM workflows")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []WorkflowItem
	for rows.Next() {
		var it WorkflowItem
		var desc, script sql.NullString
		if err := rows.Scan(&it.Name, &desc, &script, &it.Version); err != nil {
			continue
		}
		it.Description = desc.String
		it.Script = script.String
		list = append(list, it)
	}
	return list, nil
}

func (s *Store) DeleteWorkflow(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec("DELETE FROM workflows WHERE name = ?", name)
	return err
}
