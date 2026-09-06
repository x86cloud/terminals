package agent

import (
	"context"
	"sync"
	"time"

	"terminal/agent/memory"
	"terminal/agent/router"
	"terminal/agent/tools"
	"terminal/core"
)

type SessionState string

const (
	SessionStateIdle            SessionState = "idle"
	SessionStatePlanning        SessionState = "planning"
	SessionStateWaitingApproval SessionState = "waiting_approval"
	SessionStateExecuting       SessionState = "executing"
	SessionStateVerifying       SessionState = "verifying"
	SessionStateDone            SessionState = "done"
	SessionStateFailed          SessionState = "failed"
	SessionStateStopped         SessionState = "stopped"
)

type Session struct {
	ID        string
	Title     string
	State     SessionState
	Workspace string
	Settings  core.AppSettings
	CreatedAt time.Time
	UpdatedAt time.Time

	workingMem *memory.WorkingMemory
	cancelFunc context.CancelFunc
	mu         sync.RWMutex
}

func NewSession(id, title, workspace string, settings core.AppSettings) *Session {
	now := time.Now()
	if id == "" {
		id = "ai_agent_default"
	}
	if title == "" {
		title = "新会话"
	}
	return &Session{
		ID:         id,
		Title:      title,
		State:      SessionStateIdle,
		Workspace:  workspace,
		Settings:   settings,
		CreatedAt:  now,
		UpdatedAt:  now,
		workingMem: memory.NewWorkingMemory(settings.AiMaxContextTokens),
	}
}

// BuildRunner is retained for backward compatibility as a clean no-op in standalone sync mode
func (s *Session) BuildRunner(ctx context.Context, routerInstance *router.ModelRouter, toolBus *tools.ToolBus) error {
	return nil
}

func (s *Session) SetCancel(cancel context.CancelFunc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cancelFunc = cancel
}

func (s *Session) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancelFunc != nil {
		s.cancelFunc()
	}
	s.State = SessionStateStopped
}

func (s *Session) WorkingMemory() *memory.WorkingMemory {
	return s.workingMem
}
