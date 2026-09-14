package planner

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
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
	Action      string          `json:"action"` // tool_call | subagent | job | ask_user
	ToolName    string          `json:"tool_name,omitempty"`
	Args        json.RawMessage `json:"args,omitempty"`
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

// Plan 规划方案实体 (对齐 Antigravity IDE 规范，以 Markdown 为核心资产)
type Plan struct {
	ID               string     `json:"id"`
	SessionID        string     `json:"session_id"`
	Objective        string     `json:"objective"`
	Content          string     `json:"content"`              // Markdown 格式完整实施方案
	FilePath         string     `json:"file_path"`            // 本地落盘路径 (%APPDATA%/xClient/plans/<sessionId>/implementation_plan.md)
	Status           string     `json:"status"`               // proposed | approved | rejected
	IsUpdate         bool       `json:"is_update,omitempty"`  // 是否是对已有方案的更新版本
	Steps            []PlanStep `json:"steps,omitempty"`      // 兼容字段
	RiskLevel        RiskLevel  `json:"risk_level,omitempty"` // 兼容字段
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

// GetPlansDir 获取会话专用的 plans 应用目录
func GetPlansDir(sessionID string) (string, error) {
	home, err := os.UserConfigDir()
	if err != nil {
		home = os.TempDir()
	}
	if sessionID == "" {
		sessionID = "default"
	}
	dir := filepath.Join(home, "xClient", "plans", sessionID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

// GetExistingPlan 获取会话已有方案内容（若无则返回空字符串）
func GetExistingPlan(sessionID string) string {
	plansDir, err := GetPlansDir(sessionID)
	if err != nil {
		return ""
	}
	planFilePath := filepath.Join(plansDir, "implementation_plan.md")
	data, err := os.ReadFile(planFilePath)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// DeletePlan 删除会话对应的实施方案目录
func DeletePlan(sessionID string) error {
	home, err := os.UserConfigDir()
	if err != nil {
		return err
	}
	if sessionID == "" {
		sessionID = "default"
	}
	dir := filepath.Join(home, "xClient", "plans", sessionID)
	return os.RemoveAll(dir)
}

// SavePlanMarkdown 保存 Markdown 方案到会话应用目录，并返回包装好的 Plan 对象
func SavePlanMarkdown(sessionID, objective, content string) (*Plan, error) {
	plansDir, err := GetPlansDir(sessionID)
	if err != nil {
		return nil, err
	}
	planFilePath := filepath.Join(plansDir, "implementation_plan.md")

	var isUpdate bool
	if oldData, err := os.ReadFile(planFilePath); err == nil && len(strings.TrimSpace(string(oldData))) > 0 {
		isUpdate = true
	}

	finalContent := strings.TrimSpace(content)
	if finalContent == "" {
		finalContent = fmt.Sprintf("# %s\n\n## 目标与背景\n执行目标: %s\n", objective, objective)
	}

	_ = os.WriteFile(planFilePath, []byte(finalContent), 0o644)

	planID := fmt.Sprintf("plan_%d", time.Now().UnixNano())
	plan := &Plan{
		ID:          planID,
		SessionID:   sessionID,
		Objective:   objective,
		Content:     finalContent,
		FilePath:    planFilePath,
		Status:      "proposed",
		IsUpdate:    isUpdate,
		NeedConfirm: true,
		CreatedAt:   time.Now().UnixMilli(),
	}
	return plan, nil
}

func (p *Planner) GeneratePlan(ctx context.Context, sessionID, objective string, toolDescriptions string) (*Plan, error) {
	planID := fmt.Sprintf("plan_%d", time.Now().UnixNano())
	plansDir, _ := GetPlansDir(sessionID)
	planFilePath := filepath.Join(plansDir, "implementation_plan.md")

	var resolved *router.ResolvedModel
	if p.router != nil {
		resolved, _ = p.router.Resolve(ctx, router.RolePlanner)
	}
	if resolved == nil || resolved.Model == nil {
		fallbackContent := fmt.Sprintf("# %s\n\n## 目标与背景\n用户请求制定技术实施方案。\n\n## 拟变更清单\n- 根据用户目标开展变更。\n\n## 验证计划\n- 实施完成后进行功能和连通性验证。\n", objective)
		_ = os.WriteFile(planFilePath, []byte(fallbackContent), 0o644)
		return &Plan{
			ID:          planID,
			SessionID:   sessionID,
			Objective:   objective,
			Content:     fallbackContent,
			FilePath:    planFilePath,
			Status:      "proposed",
			RiskLevel:   RiskLow,
			NeedConfirm: true,
			CreatedAt:   time.Now().UnixMilli(),
		}, nil
	}

	systemPrompt := `你是一个顶尖的技术架构与任务规划专家（遵循 Google DeepMind Antigravity 规划模式规范）。
请针对用户的任务目标和可用环境工具，制定专业、详尽、清晰且可落地的技术实施方案 (Implementation Plan)。

【输出格式要求】
请直接输出纯 Markdown 格式内容，严禁在外部包裹闲聊或客套话。格式必须严格包含以下章节：

# [目标简述]

## 目标与背景
简要说明任务背景、要解决的核心问题与期望达成的最终状态。

## 用户确认与关键决策 (User Review Required)
列出需要用户重点注意的风险项、重要技术选型或不可逆变更。建议使用 GitHub Alerts 语法（如 > [!IMPORTANT] 或 > [!WARNING]）高亮。

## 拟变更清单 (Proposed Changes)
按模块或组件清晰列出拟变更的文件、服务、数据库对象或命令。

## 验证计划 (Verification Plan)
详细列出方案执行完毕后的测试与验收步骤（包括自动化命令或人工检查路径）。
`

	userPrompt := fmt.Sprintf("【用户目标】: %s\n\n【可用工具环境】:\n%s", objective, toolDescriptions)

	var reasoningAcc strings.Builder
	var contentAcc strings.Builder

	stream, err := resolved.Model.Stream(ctx, []*schema.Message{
		schema.SystemMessage(systemPrompt),
		schema.UserMessage(userPrompt),
	})
	if err != nil || stream == nil {
		res, genErr := resolved.Model.Generate(ctx, []*schema.Message{
			schema.SystemMessage(systemPrompt),
			schema.UserMessage(userPrompt),
		})
		if genErr != nil || res == nil || strings.TrimSpace(res.Content) == "" {
			fallbackContent := fmt.Sprintf("# %s\n\n## 目标与背景\n执行目标: %s\n\n## 拟变更清单\n- 开展任务实施。\n\n## 验证计划\n- 检查执行结果。\n", objective, objective)
			_ = os.WriteFile(planFilePath, []byte(fallbackContent), 0o644)
			return &Plan{
				ID:          planID,
				SessionID:   sessionID,
				Objective:   objective,
				Content:     fallbackContent,
				FilePath:    planFilePath,
				Status:      "proposed",
				RiskLevel:   RiskLow,
				NeedConfirm: true,
				CreatedAt:   time.Now().UnixMilli(),
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

	finalContent := strings.TrimSpace(contentAcc.String())
	if finalContent == "" {
		finalContent = fmt.Sprintf("# %s\n\n## 目标与背景\n执行目标: %s\n", objective, objective)
	}

	// 写入本地应用目录
	_ = os.WriteFile(planFilePath, []byte(finalContent), 0o644)

	plan := &Plan{
		ID:               planID,
		SessionID:        sessionID,
		Objective:        objective,
		Content:          finalContent,
		FilePath:         planFilePath,
		Status:           "proposed",
		NeedConfirm:      true,
		ReasoningContent: reasoningAcc.String(),
		CreatedAt:        time.Now().UnixMilli(),
	}

	return plan, nil
}

func (p *Planner) EvaluateNeedConfirm(plan *Plan) bool {
	return true
}
