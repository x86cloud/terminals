package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"terminal/agent/events"
	"terminal/agent/guard"

	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/schema"
)

type ToolResult struct {
	OK    bool   `json:"ok"`
	Data  any    `json:"data,omitempty"`
	Error string `json:"error,omitempty"`
}

func (tr *ToolResult) String() string {
	b, err := json.MarshalIndent(tr, "", "  ")
	if err != nil {
		if tr.Error != "" {
			return fmt.Sprintf("【错误】: %s", tr.Error)
		}
		return fmt.Sprintf("%v", tr.Data)
	}
	return string(b)
}

type ToolHandler func(ctx context.Context, input string) (any, error)

type RegisteredTool struct {
	Name        string
	Description string
	BaseTool    tool.BaseTool
	Handler     ToolHandler
	Level       guard.PermissionLevel
	Timeout     time.Duration
}

type ToolBus struct {
	mu       sync.RWMutex
	tools    map[string]*RegisteredTool
	guard    *guard.PolicyGuard
	eventBus *events.EventBus
}

func NewToolBus(g *guard.PolicyGuard, eb *events.EventBus) *ToolBus {
	return &ToolBus{
		tools:    make(map[string]*RegisteredTool),
		guard:    g,
		eventBus: eb,
	}
}

func (b *ToolBus) Register(t *RegisteredTool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.tools[t.Name] = t
}

func (b *ToolBus) Get(name string) (*RegisteredTool, bool) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	t, ok := b.tools[name]
	return t, ok
}

func (b *ToolBus) List() []*RegisteredTool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	var list []*RegisteredTool
	for _, t := range b.tools {
		list = append(list, t)
	}
	return list
}

type sessionCtxKey struct{}
type traceCtxKey struct{}

func WithSessionID(ctx context.Context, sessionID string) context.Context {
	return context.WithValue(ctx, sessionCtxKey{}, sessionID)
}

func SessionIDFromContext(ctx context.Context) string {
	if v := ctx.Value(sessionCtxKey{}); v != nil {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func WithTraceID(ctx context.Context, traceID string) context.Context {
	return context.WithValue(ctx, traceCtxKey{}, traceID)
}

func TraceIDFromContext(ctx context.Context) string {
	if v := ctx.Value(traceCtxKey{}); v != nil {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func (b *ToolBus) Invoke(ctx context.Context, traceID, sessionID, toolName, input string) *ToolResult {
	start := time.Now()
	callID := fmt.Sprintf("call_%d", start.UnixNano())

	if sessionID != "" {
		ctx = WithSessionID(ctx, sessionID)
	}
	if traceID != "" {
		ctx = WithTraceID(ctx, traceID)
	}

	// 1. Check Tool existence
	t, ok := b.Get(toolName)
	if !ok {
		res := &ToolResult{OK: false, Error: fmt.Sprintf("未知的工具 [%s]", toolName)}
		if b.guard != nil {
			b.guard.RecordAuditLog(traceID, sessionID, toolName, input, "forbidden", res.String(), time.Since(start).Milliseconds())
		}
		return res
	}

	// 2. Emit ToolStart
	if b.eventBus != nil {
		b.eventBus.Emit(events.Event{
			Type:      events.EventToolStart,
			SessionID: sessionID,
			TraceID:   traceID,
			Payload: events.ToolStartPayload{
				CallID:   callID,
				ToolName: toolName,
				Detail:   fmt.Sprintf("正在调用工具 [%s]...", toolName),
			},
		})
	}

	// 3. Permission Guard Audit
	decision := "allow"
	if b.guard != nil {
		lvl, reason := b.guard.Audit(ctx, sessionID, toolName, input, t.Level)
		switch lvl {
		case guard.LevelForbidden:
			res := &ToolResult{
				OK:    false,
				Error: fmt.Sprintf("【权限审查模块硬拦截】操作拒绝: %s", reason),
			}
			b.guard.RecordAuditLog(traceID, sessionID, toolName, input, "forbidden", res.String(), time.Since(start).Milliseconds())
			b.emitToolEvent(sessionID, callID, toolName, input, res.String())
			return res

		case guard.LevelConfirm:
			confirmID := fmt.Sprintf("guard_%d", time.Now().UnixNano())
			req := &guard.ApprovalRequest{
				ConfirmID:   confirmID,
				SessionID:   sessionID,
				TraceID:     traceID,
				ToolName:    toolName,
				Action:      t.Description,
				Description: fmt.Sprintf("工具 [%s]: %s", toolName, t.Description),
				Arguments:   input,
				Level:       lvl,
			}

			// Emit confirm request event
			if b.eventBus != nil {
				b.eventBus.Emit(events.Event{
					Type:      events.EventConfirmRequest,
					SessionID: sessionID,
					TraceID:   traceID,
					Payload: events.ConfirmRequestPayload{
						ConfirmID:   confirmID,
						Action:      t.Description,
						Description: req.Description,
						ToolName:    toolName,
						Arguments:   input,
						RiskLevel:   string(lvl),
					},
				})
			}

			appDec := b.guard.RequestApproval(ctx, req)
			if !appDec.Approved {
				reasonText := appDec.Reason
				if reasonText == "" {
					reasonText = "用户取消了该工具执行操作"
				}
				res := &ToolResult{
					OK:    false,
					Error: fmt.Sprintf("【用户拒绝审批】: %s", reasonText),
				}
				b.guard.RecordAuditLog(traceID, sessionID, toolName, input, "rejected", res.String(), time.Since(start).Milliseconds())
				b.emitToolEvent(sessionID, callID, toolName, input, res.String())
				return res
			}
			decision = "approved"
		}
	}

	// 4. Execute Tool
	timeout := t.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	toolCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var resultObj any
	var runErr error

	if t.BaseTool != nil {
		if inv, ok := t.BaseTool.(tool.InvokableTool); ok {
			strRes, err := inv.InvokableRun(toolCtx, input)
			if err != nil {
				runErr = err
			} else {
				// Try decode json or wrap string
				var parsed any
				if err := json.Unmarshal([]byte(strRes), &parsed); err == nil {
					resultObj = parsed
				} else {
					resultObj = strRes
				}
			}
		}
	} else if t.Handler != nil {
		resultObj, runErr = t.Handler(toolCtx, input)
	}

	duration := time.Since(start).Milliseconds()
	var finalRes *ToolResult

	if runErr != nil {
		finalRes = &ToolResult{OK: false, Error: runErr.Error()}
	} else {
		finalRes = &ToolResult{OK: true, Data: resultObj}
	}

	// 5. Record Audit Log & Emit Event
	if b.guard != nil {
		b.guard.RecordAuditLog(traceID, sessionID, toolName, input, decision, finalRes.String(), duration)
	}
	b.emitToolEvent(sessionID, callID, toolName, input, finalRes.String())

	return finalRes
}

func (b *ToolBus) emitToolEvent(sessionID, callID, toolName, input, output string) {
	if b.eventBus != nil {
		b.eventBus.Emit(events.Event{
			Type:      events.EventToolEvent,
			SessionID: sessionID,
			Payload: events.ToolEventPayload{
				CallID:   callID,
				ToolName: toolName,
				Input:    input,
				Output:   output,
			},
		})
	}
}

// ConvertToEinoTools converts all registered tools into Eino BaseTool wrappers
func (b *ToolBus) ConvertToEinoTools(sessionID string) []tool.BaseTool {
	b.mu.RLock()
	defer b.mu.RUnlock()

	var out []tool.BaseTool
	for _, rt := range b.tools {
		out = append(out, &guardWrappedEinoTool{
			bus:       b,
			tool:      rt,
			sessionID: sessionID,
		})
	}
	return out
}

type guardWrappedEinoTool struct {
	bus       *ToolBus
	tool      *RegisteredTool
	sessionID string
}

func (w *guardWrappedEinoTool) Info(ctx context.Context) (*schema.ToolInfo, error) {
	if w.tool.BaseTool != nil {
		info, err := w.tool.BaseTool.Info(ctx)
		if err == nil && info != nil {
			return info, nil
		}
	}
	return &schema.ToolInfo{
		Name: w.tool.Name,
		Desc: w.tool.Description,
		ParamsOneOf: schema.NewParamsOneOfByParams(map[string]*schema.ParameterInfo{
			"input": {
				Type: schema.String,
				Desc: "JSON string arguments for tool",
			},
		}),
	}, nil
}

func (w *guardWrappedEinoTool) InvokableRun(ctx context.Context, input string, opts ...tool.Option) (string, error) {
	res := w.bus.Invoke(ctx, "", w.sessionID, w.tool.Name, input)
	if !res.OK {
		if res.Error != "" {
			return fmt.Sprintf(`{"ok":false,"error":%q}`, res.Error), nil
		}
		return `{"ok":false,"error":"工具执行失败"}`, nil
	}
	return res.String(), nil
}
