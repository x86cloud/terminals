package tools

import (
	"context"
	"fmt"
	"time"

	"terminal/agent/ask"
	"terminal/agent/guard"
	"terminal/agent/job"
	"terminal/agent/memory"
	"terminal/agent/skills"
	"terminal/agent/store"
	"terminal/agent/subagent"
	"terminal/agent/workflow"

	"github.com/cloudwego/eino/components/tool/utils"
)

type OrchestrationManagers struct {
	JobMgr      *job.JobManager
	SubagentM   *subagent.SubagentManager
	SkillsReg   *skills.SkillsRegistry
	MemorySys   *memory.MemorySystem
	WorkflowEng *workflow.WorkflowEngine
	AskMgr      *ask.AskManager
}

// ---------- Job Inputs ----------
type JobSubmitInput struct {
	SessionID   string            `json:"session_id,omitempty" jsonschema:"description=所属会话 ID，留空使用当前会话"`
	Name        string            `json:"name" jsonschema:"description=作业名称"`
	Description string            `json:"description" jsonschema:"description=异步长任务描述与指令"`
	Target      string            `json:"target,omitempty" jsonschema:"description=执行目标: local(默认,本地Shell) | ssh(远程SSH)"`
	Session     string            `json:"session,omitempty" jsonschema:"description=Target=ssh 时的 SSH 会话 ID 或名称"`
	Command     string            `json:"command" jsonschema:"description=要执行的命令或脚本指令"`
	Cwd         string            `json:"cwd,omitempty" jsonschema:"description=本地执行时的工作目录，默认使用当前绑定的工作区"`
	Shell       string            `json:"shell,omitempty" jsonschema:"description=本地 Shell: 留空自动选择 (Windows: powershell, 其他: bash)"`
	TimeoutSec  int               `json:"timeout_sec,omitempty" jsonschema:"description=超时时间 (秒)，默认 300"`
	Env         map[string]string `json:"env,omitempty" jsonschema:"description=可选环境变量"`
}

type JobStatusInput struct {
	JobID string `json:"job_id" jsonschema:"description=目标作业 ID"`
}

type JobOutputInput struct {
	JobID   string `json:"job_id" jsonschema:"description=目标作业 ID"`
	FromSeq int    `json:"from_seq,omitempty" jsonschema:"description=增量读取的起始序列号，默认 0"`
}

// ---------- Subagent Inputs ----------
type SubagentSpawnInput struct {
	SessionID      string `json:"session_id" jsonschema:"description=所属会话 ID"`
	Prompt         string `json:"prompt" jsonschema:"description=委派给子代理的独立任务 Prompt"`
	ExpectedSchema string `json:"expected_schema,omitempty" jsonschema:"description=可选的期望返回 JSON Schema"`
}

type SubagentSendInput struct {
	SubagentID string `json:"subagent_id" jsonschema:"description=目标子代理 ID"`
	Message    string `json:"message" jsonschema:"description=追加给子代理的补充说明或追问"`
}

type SubagentInterruptInput struct {
	SubagentID string `json:"subagent_id" jsonschema:"description=目标子代理 ID"`
}

type SubagentListInput struct {
	SessionID string `json:"session_id" jsonschema:"description=会话 ID"`
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
	// ---------- Job Tools ----------
	if mgrs.JobMgr != nil {
		submitTool, err := utils.InferTool("job_submit", "提交并启动一个新的后台异步执行作业 (支持本地与远程命令长任务)",
			func(ctx context.Context, input *JobSubmitInput) (any, error) {
				spec := job.ExecSpec{
					Target:     input.Target,
					Session:    input.Session,
					Command:    input.Command,
					Cwd:        input.Cwd,
					Shell:      input.Shell,
					TimeoutSec: input.TimeoutSec,
					Env:        input.Env,
				}
				jobID, err := mgrs.JobMgr.SubmitExec(ctx, input.SessionID, "tool", spec, input.Name, input.Description)
				if err != nil {
					return nil, err
				}
				return map[string]any{
					"job_id":      jobID,
					"name":        input.Name,
					"state":       "running",
					"target":      input.Target,
					"description": input.Description,
				}, nil
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "job_submit",
				Description: "提交并启动一个新的后台异步执行作业 (支持本地与远程命令长任务)",
				BaseTool:    submitTool,
				Level:       guard.LevelConfirm,
			})
		}

		statusTool, err := utils.InferTool("job_status", "查询后台作业的运行状态与进度",
			func(ctx context.Context, input *JobStatusInput) (any, error) {
				return mgrs.JobMgr.GetJob(input.JobID)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "job_status",
				Description: "查询后台作业的运行状态与进度",
				BaseTool:    statusTool,
				Level:       guard.LevelAllow,
			})
		}

		outputTool, err := utils.InferTool("job_output", "增量读取后台作业的终端输出流",
			func(ctx context.Context, input *JobOutputInput) (any, error) {
				return mgrs.JobMgr.Output(input.JobID, input.FromSeq)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "job_output",
				Description: "增量读取后台作业的终端输出流",
				BaseTool:    outputTool,
				Level:       guard.LevelAllow,
			})
		}

		killTool, err := utils.InferTool("job_kill", "强制终止正在后台运行的作业",
			func(ctx context.Context, input *JobStatusInput) (string, error) {
				ok := mgrs.JobMgr.Kill(input.JobID)
				if !ok {
					return "", fmt.Errorf("未找到作业 [%s] 或作业已结束", input.JobID)
				}
				return fmt.Sprintf("已成功向作业 [%s] 发送终止信号", input.JobID), nil
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "job_kill",
				Description: "强制终止正在后台运行的作业",
				BaseTool:    killTool,
				Level:       guard.LevelConfirm,
			})
		}
	}

	// ---------- Subagent Tools ----------
	if mgrs.SubagentM != nil {
		spawnTool, err := utils.InferTool("subagent_spawn", "委派独立子代理并发执行子任务 (隔离上下文与后台运行)",
			func(ctx context.Context, input *SubagentSpawnInput) (string, error) {
				subID, err := mgrs.SubagentM.Spawn(ctx, "", input.SessionID, input.Prompt, input.ExpectedSchema, 1)
				if err != nil {
					return "", err
				}
				return fmt.Sprintf("已成功创建并启动后台子代理 [%s]，子代理将在完成后自动回传结构化结果", subID), nil
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "subagent_spawn",
				Description: "委派独立子代理并发执行子任务 (隔离上下文与后台运行)",
				BaseTool:    spawnTool,
				Level:       guard.LevelConfirm,
			})
		}

		sendSubTool, err := utils.InferTool("subagent_send", "向指定子代理发送追问或追加指令以进行多轮排障交互",
			func(ctx context.Context, input *SubagentSendInput) (string, error) {
				return mgrs.SubagentM.Send(ctx, input.SubagentID, input.Message)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "subagent_send",
				Description: "向指定子代理发送追问或追加指令以进行多轮排障交互",
				BaseTool:    sendSubTool,
				Level:       guard.LevelConfirm,
			})
		}

		interruptTool, err := utils.InferTool("subagent_interrupt", "中断正在运行的子代理推导",
			func(ctx context.Context, input *SubagentInterruptInput) (string, error) {
				ok := mgrs.SubagentM.Interrupt(input.SubagentID)
				if !ok {
					return "", fmt.Errorf("子代理不存在或已终止")
				}
				return fmt.Sprintf("已成功中断子代理 [%s]", input.SubagentID), nil
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "subagent_interrupt",
				Description: "中断正在运行的子代理推导",
				BaseTool:    interruptTool,
				Level:       guard.LevelConfirm,
			})
		}

		listTool, err := utils.InferTool("subagent_list", "列出当前会话下的子代理树与执行结果",
			func(ctx context.Context, input *SubagentListInput) (any, error) {
				return mgrs.SubagentM.List(input.SessionID)
			})
		if err == nil {
			bus.Register(&RegisteredTool{
				Name:        "subagent_list",
				Description: "列出当前会话下的子代理树与执行结果",
				BaseTool:    listTool,
				Level:       guard.LevelAllow,
			})
		}
	}

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
				Level:       guard.LevelConfirm,
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
				Level:       guard.LevelConfirm,
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
