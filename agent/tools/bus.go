package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
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

func (b *ToolBus) Unregister(name string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.tools, name)
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
type callIDCtxKey struct{}

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

func WithCallID(ctx context.Context, callID string) context.Context {
	return context.WithValue(ctx, callIDCtxKey{}, callID)
}

func CallIDFromContext(ctx context.Context) string {
	if v := ctx.Value(callIDCtxKey{}); v != nil {
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
	ctx = WithCallID(ctx, callID)

	// 1. Check Tool existence
	t, ok := b.Get(toolName)
	if !ok {
		res := &ToolResult{OK: false, Error: fmt.Sprintf("未知的工具 [%s]", toolName)}
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
	if b.guard != nil {
		lvl, reason := b.guard.Audit(ctx, sessionID, toolName, input, t.Level)
		if lvl == guard.LevelForbidden {
			res := &ToolResult{
				OK:    false,
				Error: fmt.Sprintf("【权限审查模块硬拦截】操作拒绝: %s", reason),
			}
			b.emitToolEvent(sessionID, callID, toolName, input, res.String(), time.Since(start).Milliseconds())
			return res
		} else if lvl == guard.LevelConfirm {
			hitlMgr := b.guard.HitlManager()
			if hitlMgr != nil {
				toolDesc := t.Description
				if toolDesc == "" {
					toolDesc = toolName
				}
				approved, rejectReason, err := hitlMgr.RequestApproval(ctx, sessionID, traceID, toolName, toolDesc, input, reason)
				if err != nil {
					res := &ToolResult{
						OK:    false,
						Error: fmt.Sprintf("【人工审批中断】%s", err.Error()),
					}
					b.emitToolEvent(sessionID, callID, toolName, input, res.String(), time.Since(start).Milliseconds())
					return res
				}
				if !approved {
					errMsg := "【用户审批拒绝】用户拒绝执行此操作。"
					if strings.TrimSpace(rejectReason) != "" {
						errMsg += fmt.Sprintf(" 用户反馈/理由: %s", strings.TrimSpace(rejectReason))
					}
					res := &ToolResult{
						OK:    false,
						Error: errMsg,
					}
					b.emitToolEvent(sessionID, callID, toolName, input, res.String(), time.Since(start).Milliseconds())
					return res
				}
			}
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

	// 5. Emit Event
	b.emitToolEvent(sessionID, callID, toolName, input, finalRes.String(), duration)

	return finalRes
}

func (b *ToolBus) emitToolEvent(sessionID, callID, toolName, input, output string, durationMs int64) {
	if b.eventBus != nil {
		b.eventBus.Emit(events.Event{
			Type:      events.EventToolEvent,
			SessionID: sessionID,
			Payload: events.ToolEventPayload{
				CallID:     callID,
				ToolName:   toolName,
				Input:      input,
				Output:     output,
				DurationMs: durationMs,
			},
		})
	}
}

// ConvertToToolInfos converts all registered tools into schema.ToolInfo for ChatModel
func (b *ToolBus) ConvertToToolInfos(ctx context.Context) []*schema.ToolInfo {
	b.mu.RLock()
	defer b.mu.RUnlock()

	var out []*schema.ToolInfo
	for _, rt := range b.tools {
		if rt.BaseTool != nil {
			info, err := rt.BaseTool.Info(ctx)
			if err == nil && info != nil {
				out = append(out, info)
				continue
			}
		}
		out = append(out, &schema.ToolInfo{
			Name: rt.Name,
			Desc: rt.Description,
			ParamsOneOf: schema.NewParamsOneOfByParams(map[string]*schema.ParameterInfo{
				"input": {
					Type: schema.String,
					Desc: "JSON string arguments for tool",
				},
			}),
		})
	}
	return out
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
	var outStr string
	if !res.OK {
		if res.Error != "" {
			outStr = fmt.Sprintf("Error: %s", res.Error)
		} else {
			outStr = "Error: 工具执行失败"
		}
	} else {
		if s, ok := res.Data.(string); ok {
			outStr = s
		} else if res.Data != nil {
			b, err := json.Marshal(res.Data)
			if err == nil {
				outStr = string(b)
			} else {
				outStr = fmt.Sprintf("%v", res.Data)
			}
		} else {
			outStr = "{\"ok\": true}"
		}
	}

	// Safe 32KB truncation protection for LLM context window
	if len(outStr) > 32768 {
		outStr = outStr[:32768] + "\n...(输出过长已安全截断)..."
	}
	return outStr, nil
}
