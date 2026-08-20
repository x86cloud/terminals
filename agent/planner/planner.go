package planner

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"terminal/agent/events"
	"terminal/agent/guard"
	"terminal/agent/router"

	"github.com/cloudwego/eino/schema"
)

type RiskLevel string

const (
	RiskLow    RiskLevel = "low"
	RiskMedium RiskLevel = "medium"
	RiskHigh   RiskLevel = "high"
)

type PlanStep struct {
	ID          string          `json:"id"`
	Action      string          `json:"action"` // tool_call | subagent | job | workflow | ask_user
	ToolName    string          `json:"tool_name,omitempty"`
	Args        json.RawMessage `json:"args"`
	Description string          `json:"description"`
	DependsOn   []string        `json:"depends_on,omitempty"`
	ExpectedOut string          `json:"expected_out,omitempty"`
	Exempted    bool            `json:"exempted,omitempty"`
	Status      string          `json:"status"` // pending | running | completed | failed | skipped
	DurationMs  int64           `json:"duration_ms,omitempty"`
	Error       string          `json:"error,omitempty"`
	Output      any             `json:"output,omitempty"`
	Verdict     string          `json:"verdict,omitempty"`
}

type Plan struct {
	ID               string     `json:"id"`
	SessionID        string     `json:"session_id"`
	Objective        string     `json:"objective"`
	Steps            []PlanStep `json:"steps"`
	RiskLevel        RiskLevel  `json:"risk_level"`
	NeedConfirm      bool       `json:"need_confirm"`
	ReasoningContent string     `json:"reasoning_content,omitempty"`
	CreatedAt        int64      `json:"created_at"`
}

type Planner struct {
	mu       sync.RWMutex
	router   *router.ModelRouter
	guard    *guard.PolicyGuard
	eventBus *events.EventBus
}

func NewPlanner(r *router.ModelRouter, g *guard.PolicyGuard, eb *events.EventBus) *Planner {
	return &Planner{
		router:   r,
		guard:    g,
		eventBus: eb,
	}
}

func (p *Planner) GeneratePlan(ctx context.Context, sessionID, objective string, toolDescriptions string) (*Plan, error) {
	planID := fmt.Sprintf("plan_%d", time.Now().UnixNano())

	// If no planner model configured, generate simple single-step plan
	resolved, err := p.router.Resolve(ctx, router.RolePlanner)
	if err != nil || resolved == nil || resolved.Model == nil {
		return &Plan{
			ID:          planID,
			SessionID:   sessionID,
			Objective:   objective,
			RiskLevel:   RiskLow,
			NeedConfirm: false,
			CreatedAt:   time.Now().UnixMilli(),
			Steps: []PlanStep{
				{
					ID:          "step_1",
					Action:      "tool_call",
					Description: "执行用户指令",
					Status:      "pending",
				},
			},
		}, nil
	}

	prompt := fmt.Sprintf(`你是一个专业的运维与任务规划专家。请针对以下用户目标制定清晰、安全的步骤规划 (JSON 格式输出)。

【用户目标】: %s

【可用工具列表】:
%s

【输出规范】:
请仅返回如下合法的 JSON 对象，不要附加任何 Markdown 代码块外的闲聊：
{
  "objective": "用户目标精炼",
  "risk_level": "low" | "medium" | "high",
  "need_confirm": true | false,
  "steps": [
    {
      "id": "step_1",
      "action": "tool_call",
      "tool_name": "具体工具名",
      "args": {},
      "description": "步骤简述",
      "depends_on": [],
      "expected_out": "期望产出"
    }
  ]
}
`, objective, toolDescriptions)

	var reasoningAcc strings.Builder
	var contentAcc strings.Builder

	stream, err := resolved.Model.Stream(ctx, []*schema.Message{
		schema.SystemMessage("你只输出合法的 JSON 规划对象。"),
		schema.UserMessage(prompt),
	})
	if err != nil || stream == nil {
		// Fallback to Generate if Stream not available
		res, genErr := resolved.Model.Generate(ctx, []*schema.Message{
			schema.SystemMessage("你只输出合法的 JSON 规划对象。"),
			schema.UserMessage(prompt),
		})
		if genErr != nil || res == nil || strings.TrimSpace(res.Content) == "" {
			return &Plan{
				ID:          planID,
				SessionID:   sessionID,
				Objective:   objective,
				RiskLevel:   RiskLow,
				NeedConfirm: false,
				CreatedAt:   time.Now().UnixMilli(),
				Steps: []PlanStep{
					{
						ID:          "step_1",
						Action:      "tool_call",
						Description: "执行用户目标",
						Status:      "pending",
					},
				},
			}, nil
		}
		contentAcc.WriteString(res.Content)
		if res.Extra != nil {
			if r, ok := res.Extra["reasoning_content"].(string); ok && r != "" {
				reasoningAcc.WriteString(r)
				if p.eventBus != nil {
					p.eventBus.Emit(events.Event{
						Type:      events.EventReasoningChunk,
						SessionID: sessionID,
						Payload:   events.ReasoningChunkPayload{Chunk: r},
					})
				}
			}
		}
	} else {
		defer stream.Close()
		for {
			chunk, err := stream.Recv()
			if err != nil {
				break
			}
			if chunk == nil {
				continue
			}

			// Check reasoning_content
			if chunk.Extra != nil {
				if r, ok := chunk.Extra["reasoning_content"].(string); ok && r != "" {
					reasoningAcc.WriteString(r)
					if p.eventBus != nil {
						p.eventBus.Emit(events.Event{
							Type:      events.EventReasoningChunk,
							SessionID: sessionID,
							Payload:   events.ReasoningChunkPayload{Chunk: r},
						})
					}
				}
			}
			if chunk.Content != "" {
				contentAcc.WriteString(chunk.Content)
			}
		}
	}

	content := strings.TrimSpace(contentAcc.String())
	if strings.HasPrefix(content, "```") {
		lines := strings.Split(content, "\n")
		if len(lines) > 2 {
			content = strings.Join(lines[1:len(lines)-1], "\n")
		}
	}

	var plan Plan
	if err := json.Unmarshal([]byte(content), &plan); err != nil {
		// Fallback
		return &Plan{
			ID:               planID,
			SessionID:        sessionID,
			Objective:        objective,
			RiskLevel:        RiskLow,
			NeedConfirm:      false,
			ReasoningContent: reasoningAcc.String(),
			CreatedAt:        time.Now().UnixMilli(),
			Steps: []PlanStep{
				{
					ID:          "step_1",
					Action:      "tool_call",
					Description: objective,
					Status:      "pending",
				},
			},
		}, nil
	}

	plan.ID = planID
	plan.SessionID = sessionID
	plan.ReasoningContent = reasoningAcc.String()
	plan.CreatedAt = time.Now().UnixMilli()

	for i := range plan.Steps {
		if strings.TrimSpace(plan.Steps[i].ID) == "" {
			plan.Steps[i].ID = fmt.Sprintf("step_%d", i+1)
		}
		if plan.Steps[i].Status == "" {
			plan.Steps[i].Status = "pending"
		}
	}

	// Evaluate Risk & PlanGate confirmation requirement
	plan.NeedConfirm = p.EvaluateNeedConfirm(&plan)

	return &plan, nil
}

func (p *Planner) EvaluateNeedConfirm(plan *Plan) bool {
	if plan.RiskLevel == RiskHigh {
		return true
	}
	for _, st := range plan.Steps {
		if strings.Contains(st.ToolName, "write") ||
			strings.Contains(st.ToolName, "delete") ||
			strings.Contains(st.ToolName, "exec") ||
			strings.Contains(st.ToolName, "publish") {
			return true
		}
	}
	return false
}
