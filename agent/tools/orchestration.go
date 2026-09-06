package tools

import (
	"context"
	"fmt"
	"time"

	"terminal/agent/ask"
	"terminal/agent/guard"
	"terminal/agent/memory"
	"terminal/agent/skills"
	"terminal/agent/store"
	"terminal/agent/workflow"

	"github.com/cloudwego/eino/components/tool/utils"
)

type OrchestrationManagers struct {
	SkillsReg   *skills.SkillsRegistry
	MemorySys   *memory.MemorySystem
	WorkflowEng *workflow.WorkflowEngine
	AskMgr      *ask.AskManager
}



// ---------- Workflow Inputs ----------
type WorkflowRunInput struct {
	Name      string `json:"name" jsonschema:"description=工作流名称"`
	SessionID string `json:"session_id,omitempty" jsonschema:"description=会话 ID"`
}

type WorkflowCreateInput struct {
	Name        string `json:"name" jsonschema:"description=工作流名称"`
	Description string `json:"description" jsonschema:"description=工作流描述"`
	Script      string `json:"script" jsonschema:"description=工作流定义 JSON 字符串"`
}

// ---------- Skill & Memory & Ask Inputs ----------
type SkillLoadInput struct {
	Name string `json:"name" jsonschema:"description=要加载的技能包名称"`
}

type MemorySaveInput struct {
	Content string `json:"content" jsonschema:"description=要固化记录的关键事实或总结"`
	Tags    string `json:"tags,omitempty" jsonschema:"description=标签分类"`
}

type MemoryRecallInput struct {
	Query string `json:"query" jsonschema:"description=检索查询关键词"`
}

type AskUserInput struct {
	SessionID string   `json:"session_id,omitempty" jsonschema:"description=当前所属会话 ID"`
	Question  string   `json:"question" jsonschema:"description=向用户提问的具体内容"`
	Options   []string `json:"options,omitempty" jsonschema:"description=可选的预设快捷选项列表"`
}

func RegisterOrchestrationTools(bus *ToolBus, mgrs OrchestrationManagers) error {


	// ---------- Workflow Tools ----------
	if mgrs.WorkflowEng != nil {
		wfRunTool, err := utils.InferTool("workflow_run", "执行已保存的标准运维排障工作流",
			func(ctx context.Context, input *WorkflowRunInput) (any, error) {
				return mgrs.WorkflowEng.RunWorkflow(ctx, input.SessionID, input.Name, func(c context.Context, sID, toolName, in string) (any, error) {
					res := bus.Invoke(c, "", sID, toolName, in)
					if !res.OK {
						return nil, fmt.Errorf("%s", res.Error)
					}
					return res.Data, nil
				})
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "workflow_run",
				Description: "执行已保存的标准运维排障工作流",
				BaseTool:    wfRunTool,
				Level:       guard.LevelAllow,
			})
		}

		wfCreateTool, err := utils.InferTool("workflow_create", "创建并持久化保存新的标准化工作流定义",
			func(ctx context.Context, input *WorkflowCreateInput) (string, error) {
				st, _ := store.GetStore()
				if st == nil {
					return "", fmt.Errorf("存储未就绪")
				}
				err := st.SaveWorkflow(store.WorkflowItem{
					Name:        input.Name,
					Description: input.Description,
					Script:      input.Script,
					Version:     1,
				})
				if err != nil {
					return "", err
				}
				return fmt.Sprintf("已成功创建工作流 [%s]", input.Name), nil
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "workflow_create",
				Description: "创建并持久化保存新的标准化工作流定义",
				BaseTool:    wfCreateTool,
				Level:       guard.LevelAllow,
			})
		}
	}


	// ---------- Memory Tools ----------
	if mgrs.MemorySys != nil {
		memSaveTool, err := utils.InferTool("memory_save", "将重要事实、配置或总结固化保存至长期语义记忆库",
			func(ctx context.Context, input *MemorySaveInput) (string, error) {
				if err := mgrs.MemorySys.SaveFact("semantic", input.Content, input.Tags, "agent_tool"); err != nil {
					return "", err
				}
				return "已成功固化保存至长期语义记忆库", nil
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "memory_save",
				Description: "将重要事实、配置或总结固化保存至长期语义记忆库",
				BaseTool:    memSaveTool,
				Level:       guard.LevelAllow,
			})
		}

		memRecallTool, err := utils.InferTool("memory_recall", "根据关键词从长期记忆库中检索召回相关事实",
			func(ctx context.Context, input *MemoryRecallInput) (any, error) {
				return mgrs.MemorySys.Recall(ctx, input.Query, 5), nil
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "memory_recall",
				Description: "根据关键词从长期记忆库中检索召回相关事实",
				BaseTool:    memRecallTool,
				Level:       guard.LevelAllow,
			})
		}
	}

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
