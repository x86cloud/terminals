package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

type Storage struct {
	mu   sync.Mutex
	path string
}

func NewStorage() *Storage {
	home, _ := os.UserConfigDir()
	dir := filepath.Join(home, "xClient")
	_ = os.MkdirAll(dir, 0o755)
	return &Storage{
		path: filepath.Join(dir, "ai_agent_history.json"),
	}
}

func (s *Storage) LoadHistory() ([]FrontendMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.path)
	if err != nil {
		return []FrontendMessage{}, nil
	}
	var msgs []FrontendMessage
	if err := json.Unmarshal(data, &msgs); err != nil {
		return []FrontendMessage{}, nil
	}
	return msgs, nil
}

func (s *Storage) SaveHistory(msgs []FrontendMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := json.MarshalIndent(msgs, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0o644)
}

func (s *Storage) ClearHistory() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	_ = os.Remove(s.path)
	return nil
}
