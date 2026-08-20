package events

import (
	"context"
	"fmt"
	"sync"
	"time"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type EventType string

const (
	EventChatChunk        EventType = "ChatChunk"
	EventReasoningChunk   EventType = "ReasoningChunk"
	EventToolStart        EventType = "ToolStart"
	EventToolEvent        EventType = "ToolEvent"
	EventConfirmRequest   EventType = "ConfirmRequest"
	EventJobCreated       EventType = "JobCreated"
	EventJobProgress      EventType = "JobProgress"
	EventJobFinished      EventType = "JobFinished"
	EventSubagentCreated  EventType = "SubagentCreated"
	EventSubagentFinished EventType = "SubagentFinished"
	EventPlanProposed     EventType = "PlanProposed"
	EventPlanApproved     EventType = "PlanApproved"
	EventStepStarted      EventType = "StepStarted"
	EventStepFinished     EventType = "StepFinished"
	EventGoalUpdated      EventType = "GoalUpdated"
	EventAskUser          EventType = "ask_user"
	EventNotice           EventType = "Notice"
	EventError            EventType = "Error"
	EventDone             EventType = "Done"
)

type Event struct {
	Type      EventType `json:"type"`
	SessionID string    `json:"session_id"`
	TraceID   string    `json:"trace_id,omitempty"`
	Timestamp int64     `json:"timestamp"`
	Payload   any       `json:"payload"`
}

// Specific Payloads

type ChatChunkPayload struct {
	Chunk string `json:"chunk"`
}

type ReasoningChunkPayload struct {
	Chunk string `json:"chunk"`
}

type ToolStartPayload struct {
	CallID   string `json:"call_id"`
	ToolName string `json:"tool_name"`
	Detail   string `json:"detail"`
}

type ToolEventPayload struct {
	CallID   string `json:"call_id"`
	ToolName string `json:"tool_name"`
	Input    string `json:"input"`
	Output   string `json:"output"`
}

type ConfirmRequestPayload struct {
	ConfirmID   string `json:"confirm_id"`
	Action      string `json:"action"`
	Path        string `json:"path"`
	Description string `json:"description"`
	ToolName    string `json:"tool_name"`
	Arguments   string `json:"arguments"`
	RiskLevel   string `json:"risk_level"`
}

type JobProgressPayload struct {
	JobID       string  `json:"job_id"`
	SessionID   string  `json:"session_id"`
	Progress    float64 `json:"progress"`
	Description string  `json:"description,omitempty"`
	NewOutput   string  `json:"new_output,omitempty"`
	State       string  `json:"state"`
}

type JobFinishedPayload struct {
	JobID     string  `json:"job_id"`
	SessionID string  `json:"session_id"`
	State     string  `json:"state"` // completed | failed | killed
	Error     string  `json:"error,omitempty"`
	Summary   string  `json:"summary,omitempty"`
	Duration  int64   `json:"duration_ms"`
}

type SubagentEventPayload struct {
	SubagentID string `json:"subagent_id"`
	ParentID   string `json:"parent_id,omitempty"`
	SessionID  string `json:"session_id"`
	Prompt     string `json:"prompt"`
	State      string `json:"state"`
	Result     string `json:"result,omitempty"`
	Error      string `json:"error,omitempty"`
}

type StepEventPayload struct {
	PlanID     string `json:"plan_id"`
	StepID     string `json:"step_id"`
	Action     string `json:"action"`
	ToolName   string `json:"tool_name,omitempty"`
	Status     string `json:"status"` // running | completed | failed | skipped
	Output     any    `json:"output,omitempty"`
	Error      string `json:"error,omitempty"`
	DurationMs int64  `json:"duration_ms,omitempty"`
	Verdict    string `json:"verdict,omitempty"` // pass | fail | partial
}

type GoalUpdatedPayload struct {
	GoalID    string `json:"goal_id"`
	Objective string `json:"objective"`
	Phase     string `json:"phase"`
	Rounds    int    `json:"rounds"`
	MaxRounds int    `json:"max_rounds"`
	Blocker   string `json:"blocker,omitempty"`
}

type AskUserPayload struct {
	AskID     string   `json:"ask_id"`
	SessionID string   `json:"session_id"`
	Question  string   `json:"question"`
	Options   []string `json:"options,omitempty"`
}

type DonePayload struct {
	Content          string `json:"content"`
	ReasoningContent string `json:"reasoning_content,omitempty"`
}

// EventBus provides thread-safe event pub/sub and bridges to Wails
type EventBus struct {
	mu        sync.RWMutex
	ctx       context.Context
	handlers  map[EventType][]func(e Event)
	rawEvents chan Event
}

var DefaultEventBus = NewEventBus()

func NewEventBus() *EventBus {
	return &EventBus{
		handlers:  make(map[EventType][]func(e Event)),
		rawEvents: make(chan Event, 256),
	}
}

func (b *EventBus) SetContext(ctx context.Context) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.ctx = ctx
}

func (b *EventBus) Subscribe(t EventType, handler func(e Event)) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers[t] = append(b.handlers[t], handler)
}

func (b *EventBus) Emit(e Event) {
	if e.Timestamp == 0 {
		e.Timestamp = time.Now().UnixMilli()
	}

	// 1. In-process handlers
	b.mu.RLock()
	handlers := b.handlers[e.Type]
	ctx := b.ctx
	b.mu.RUnlock()

	for _, h := range handlers {
		go h(e)
	}

	// 2. Emit to Wails runtime for frontend
	if ctx != nil {
		// Generic unified event stream
		wruntime.EventsEmit(ctx, "agent:event", e)
		if e.SessionID != "" {
			wruntime.EventsEmit(ctx, fmt.Sprintf("agent:event:%s", e.SessionID), e)
		}

		// Backward-compatible individual event channels
		switch e.Type {
		case EventChatChunk:
			if p, ok := e.Payload.(ChatChunkPayload); ok {
				wruntime.EventsEmit(ctx, fmt.Sprintf("agent:chunk:%s", e.SessionID), p.Chunk)
			} else if s, ok := e.Payload.(string); ok {
				wruntime.EventsEmit(ctx, fmt.Sprintf("agent:chunk:%s", e.SessionID), s)
			}
		case EventReasoningChunk:
			if p, ok := e.Payload.(ReasoningChunkPayload); ok {
				wruntime.EventsEmit(ctx, fmt.Sprintf("agent:reasoning_chunk:%s", e.SessionID), p.Chunk)
			} else if s, ok := e.Payload.(string); ok {
				wruntime.EventsEmit(ctx, fmt.Sprintf("agent:reasoning_chunk:%s", e.SessionID), s)
			}
		case EventConfirmRequest:
			if p, ok := e.Payload.(ConfirmRequestPayload); ok {
				wruntime.EventsEmit(ctx, fmt.Sprintf("agent:confirm_request:%s", e.SessionID), p)
			}
		case EventAskUser:
			if p, ok := e.Payload.(AskUserPayload); ok {
				wruntime.EventsEmit(ctx, fmt.Sprintf("agent:ask_user:%s", e.SessionID), p)
				wruntime.EventsEmit(ctx, "agent:ask_user", p)
			}
		case EventToolStart:
			if p, ok := e.Payload.(ToolStartPayload); ok {
				wruntime.EventsEmit(ctx, fmt.Sprintf("agent:tool_start:%s", e.SessionID), map[string]string{
					"call_id":   p.CallID,
					"tool_name": p.ToolName,
					"toolName":  p.ToolName,
					"detail":    p.Detail,
				})
			}
		case EventToolEvent:
			if p, ok := e.Payload.(ToolEventPayload); ok {
				wruntime.EventsEmit(ctx, fmt.Sprintf("agent:tool_event:%s", e.SessionID), map[string]string{
					"call_id":   p.CallID,
					"id":        p.CallID,
					"tool_name": p.ToolName,
					"name":      p.ToolName,
					"input":     p.Input,
					"args":      p.Input,
					"output":    p.Output,
					"result":    p.Output,
				})
			}
		case EventNotice:
			if s, ok := e.Payload.(string); ok {
				wruntime.EventsEmit(ctx, fmt.Sprintf("agent:notice:%s", e.SessionID), s)
			}
		case EventError:
			if s, ok := e.Payload.(string); ok {
				wruntime.EventsEmit(ctx, fmt.Sprintf("agent:error:%s", e.SessionID), s)
			}
		case EventDone:
			if p, ok := e.Payload.(DonePayload); ok {
				wruntime.EventsEmit(ctx, fmt.Sprintf("agent:done:%s", e.SessionID), map[string]string{
					"content":           p.Content,
					"reasoning_content": p.ReasoningContent,
				})
			}
		}
	}
}
