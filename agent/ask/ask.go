package ask

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"terminal/agent/events"
)

type AskRequest struct {
	AskID      string           `json:"ask_id"`
	SessionID  string           `json:"session_id"`
	TraceID    string           `json:"trace_id,omitempty"`
	Question   string           `json:"question"`
	Options    []string         `json:"options,omitempty"`
	CreatedAt  int64            `json:"created_at"`
	ResponseCh chan AskResponse `json:"-"`
}

type AskResponse struct {
	Answered bool   `json:"answered"`
	Answer   string `json:"answer,omitempty"`
}

type AskManager struct {
	mu       sync.RWMutex
	pending  sync.Map // askID -> *AskRequest
	eventBus *events.EventBus
}

func NewAskManager(eb *events.EventBus) *AskManager {
	return &AskManager{
		eventBus: eb,
	}
}

func (m *AskManager) Ask(ctx context.Context, sessionID, question string, options []string) (string, error) {
	askID := fmt.Sprintf("ask_%d", time.Now().UnixNano())
	req := &AskRequest{
		AskID:      askID,
		SessionID:  sessionID,
		Question:   question,
		Options:    options,
		CreatedAt:  time.Now().UnixMilli(),
		ResponseCh: make(chan AskResponse, 1),
	}

	m.pending.Store(askID, req)
	defer m.pending.Delete(askID)

	if m.eventBus != nil {
		m.eventBus.Emit(events.Event{
			Type:      events.EventAskUser,
			SessionID: sessionID,
			Payload: events.AskUserPayload{
				AskID:     askID,
				SessionID: sessionID,
				Question:  question,
				Options:   options,
			},
		})
	}

	// 5 分钟超时等待
	timeoutTimer := time.NewTimer(5 * time.Minute)
	defer timeoutTimer.Stop()

	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case <-timeoutTimer.C:
		return "", nil
	case resp := <-req.ResponseCh:
		if !resp.Answered {
			return "", nil
		}
		return resp.Answer, nil
	}
}

func (m *AskManager) Answer(askID string, answer string) bool {
	val, ok := m.pending.Load(askID)
	if !ok {
		return false
	}
	req, ok := val.(*AskRequest)
	if !ok {
		return false
	}

	trimmed := strings.TrimSpace(answer)
	select {
	case req.ResponseCh <- AskResponse{Answered: trimmed != "", Answer: trimmed}:
		return true
	default:
		return false
	}
}

func (m *AskManager) ListPending() []*AskRequest {
	var list []*AskRequest
	m.pending.Range(func(key, value any) bool {
		if req, ok := value.(*AskRequest); ok {
			list = append(list, req)
		}
		return true
	})
	return list
}
