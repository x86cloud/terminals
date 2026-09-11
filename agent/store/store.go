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
		created_at    INTEGER
	);
	CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

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

	return tx.Commit()
}

func (s *Store) ClearSessionMessages(sessionID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, err := s.db.Exec("DELETE FROM messages WHERE session_id = ?", sessionID)
	return err
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
