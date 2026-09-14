package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

type MessageItem struct {
	ID           int64  `json:"id"`
	SessionID    string `json:"session_id"`
	Role         string `json:"role"`
	Content      string `json:"content"`
	Reasoning    string `json:"reasoning,omitempty"`
	ToolCalls    string `json:"tool_calls,omitempty"`    // JSON
	ProcessSteps string `json:"process_steps,omitempty"` // JSON
	Plan         string `json:"plan,omitempty"`          // JSON
	CreatedAt    int64  `json:"created_at"`
}

type SessionItem struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	CreatedAt int64  `json:"created_at"`
	UpdatedAt int64  `json:"updated_at"`
}

type SkillItem struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	Instructions string `json:"instructions"`
	Tools        string `json:"tools"` // comma separated
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
	// 自动检查并初始化/迁移多会话表
	s.autoMigrateSessions()

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
	CREATE TABLE IF NOT EXISTS messages (
		id            INTEGER PRIMARY KEY AUTOINCREMENT,
		session_id    TEXT NOT NULL,
		role          TEXT NOT NULL,
		content       TEXT,
		reasoning     TEXT,
		tool_calls    TEXT,
		process_steps TEXT,
		plan          TEXT,
		created_at    INTEGER
	);
	CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

	CREATE TABLE IF NOT EXISTS agent_sessions (
		id         TEXT PRIMARY KEY,
		title      TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_agent_sessions_updated ON agent_sessions(updated_at DESC);

	CREATE TABLE IF NOT EXISTS skills (
		name         TEXT PRIMARY KEY,
		description  TEXT,
		instructions TEXT,
		tools        TEXT
	);
	`
	_, err := s.db.Exec(schemaSQL)
	if err != nil {
		return err
	}

	// 自动兼容旧表结构增加 plan 列
	_, _ = s.db.Exec("ALTER TABLE messages ADD COLUMN plan TEXT;")

	return nil
}

func (s *Store) autoMigrateSessions() {
	var count int
	_ = s.db.QueryRow("SELECT COUNT(*) FROM agent_sessions").Scan(&count)
	if count > 0 {
		return
	}

	type sessEntry struct {
		id    string
		title string
		minT  int64
		maxT  int64
	}
	var entries []sessEntry

	// 先完整读出现有 messages 表中出现过的所有 session_id，确保 rows 释放连接
	rows, err := s.db.Query("SELECT DISTINCT session_id, MIN(created_at), MAX(created_at) FROM messages GROUP BY session_id")
	if err == nil {
		for rows.Next() {
			var sessID string
			var minT, maxT int64
			if err := rows.Scan(&sessID, &minT, &maxT); err == nil && sessID != "" {
				title := "默认会话"
				if sessID != "ai_agent_default" {
					title = "历史会话"
				}
				if minT == 0 {
					minT = time.Now().UnixMilli()
				}
				if maxT == 0 {
					maxT = minT
				}
				entries = append(entries, sessEntry{id: sessID, title: title, minT: minT, maxT: maxT})
			}
		}
		rows.Close()
	}

	for _, e := range entries {
		_, _ = s.db.Exec("INSERT OR IGNORE INTO agent_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)", e.id, e.title, e.minT, e.maxT)
		count++
	}

	if count == 0 {
		now := time.Now().UnixMilli()
		_, _ = s.db.Exec("INSERT OR IGNORE INTO agent_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)", "ai_agent_default", "默认会话", now, now)
	}
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

// ---------- Message Operations ----------

func (s *Store) ListMessages(sessionID string) ([]MessageItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(`
		SELECT id, session_id, role, content, reasoning, tool_calls, process_steps, plan, created_at
		FROM messages WHERE session_id = ? ORDER BY id ASC
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []MessageItem
	for rows.Next() {
		var it MessageItem
		var rs, tc, ps, pl sql.NullString
		if err := rows.Scan(&it.ID, &it.SessionID, &it.Role, &it.Content, &rs, &tc, &ps, &pl, &it.CreatedAt); err != nil {
			continue
		}
		it.Reasoning = rs.String
		it.ToolCalls = tc.String
		it.ProcessSteps = ps.String
		it.Plan = pl.String
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
		INSERT INTO messages (session_id, role, content, reasoning, tool_calls, process_steps, plan, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, it.SessionID, it.Role, it.Content, it.Reasoning, it.ToolCalls, it.ProcessSteps, it.Plan, it.CreatedAt)
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
		INSERT INTO messages (session_id, role, content, reasoning, tool_calls, process_steps, plan, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
		if _, err := stmt.Exec(sessionID, m.Role, m.Content, m.Reasoning, m.ToolCalls, m.ProcessSteps, m.Plan, t); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *Store) ClearSessionMessages(sessionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec("DELETE FROM messages WHERE session_id = ?", sessionID)
	return err
}

// ---------- Agent Sessions ----------

func (s *Store) ListSessions() ([]SessionItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query("SELECT id, title, created_at, updated_at FROM agent_sessions ORDER BY updated_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []SessionItem
	for rows.Next() {
		var it SessionItem
		if err := rows.Scan(&it.ID, &it.Title, &it.CreatedAt, &it.UpdatedAt); err == nil {
			list = append(list, it)
		}
	}
	return list, nil
}

func (s *Store) GetSession(id string) (*SessionItem, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var it SessionItem
	err := s.db.QueryRow("SELECT id, title, created_at, updated_at FROM agent_sessions WHERE id = ?", id).
		Scan(&it.ID, &it.Title, &it.CreatedAt, &it.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &it, nil
}

func (s *Store) CreateSession(id, title string) (SessionItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if id == "" {
		id = fmt.Sprintf("sess_%d", time.Now().UnixMilli())
	}
	if strings.TrimSpace(title) == "" {
		title = "新会话"
	}
	now := time.Now().UnixMilli()
	it := SessionItem{
		ID:        id,
		Title:     title,
		CreatedAt: now,
		UpdatedAt: now,
	}
	_, err := s.db.Exec(`
		INSERT INTO agent_sessions (id, title, created_at, updated_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at
	`, it.ID, it.Title, it.CreatedAt, it.UpdatedAt)
	return it, err
}

func (s *Store) UpdateSessionTitle(id, title string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UnixMilli()
	_, err := s.db.Exec("UPDATE agent_sessions SET title = ?, updated_at = ? WHERE id = ?", strings.TrimSpace(title), now, id)
	return err
}

func (s *Store) TouchSession(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UnixMilli()
	_, err := s.db.Exec("UPDATE agent_sessions SET updated_at = ? WHERE id = ?", now, id)
	return err
}

func (s *Store) DeleteSession(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("DELETE FROM messages WHERE session_id = ?", id); err != nil {
		return err
	}
	if _, err := tx.Exec("DELETE FROM agent_sessions WHERE id = ?", id); err != nil {
		return err
	}
	return tx.Commit()
}

// ---------- Skills ----------

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
