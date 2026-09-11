package tools

import (
	"context"
	"fmt"
	"time"

	"terminal/agent/ask"
	"terminal/agent/guard"
	"terminal/agent/skills"

	"github.com/cloudwego/eino/components/tool/utils"
)

type OrchestrationManagers struct {
	SkillsReg *skills.SkillsRegistry
	AskMgr    *ask.AskManager
}

// ---------- Ask User Tool ----------
type AskUserInput struct {
	SessionID string   `json:"session_id,omitempty" jsonschema:"description=当前所属会话 ID"`
	Question  string   `json:"question" jsonschema:"description=向用户提问的具体内容"`
	Options   []string `json:"options,omitempty" jsonschema:"description=可选的预设快捷选项列表"`
}

func RegisterOrchestrationTools(bus *ToolBus, mgrs OrchestrationManagers) error {
	// ---------- Ask User Tool ----------
	askTool, err := utils.InferTool("ask_user", "向用户发起交互询问以获取澄清或决策反馈",
		func(ctx context.Context, input *AskUserInput) (string, error) {
			sid := input.SessionID
			if sid == "" {
				sid = SessionIDFromContext(ctx)
			}
			if sid == "" {
				sid = "ai_agent_default"
			}
			if mgrs.AskMgr != nil {
				ans, err := mgrs.AskMgr.Ask(ctx, sid, input.Question, input.Options)
				if err != nil {
					return "", err
				}
				if ans == "" {
					return "【用户未回应】用户已忽略或超时未提供回答，请基于现有信息继续推演并进行合理说明。", nil
				}
				return fmt.Sprintf("【用户答复】: %s", ans), nil
			}
			return fmt.Sprintf("【已向用户发出询问】: %s (选项: %v)", input.Question, input.Options), nil
		})
	if err == nil {
		bus.Register(&RegisteredTool{
			Name:        "ask_user",
			Description: "向用户发起交互询问以获取澄清或决策反馈",
			BaseTool:    askTool,
			Level:       guard.LevelAllow,
			Timeout:     5 * time.Minute,
		})
	}

	return nil
}
