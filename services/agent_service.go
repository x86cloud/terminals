package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"terminal/agent"
	"terminal/agent/ask"
	"terminal/agent/events"
	"terminal/agent/guard"
	"terminal/agent/planner"
	"terminal/agent/router"
	"terminal/agent/skills"
	"terminal/agent/store"
	"terminal/core"

	"github.com/cloudwego/eino/schema"
)

type AgentService struct {
	planCancelMap sync.Map
}

func NewAgentService() *AgentService {
	return &AgentService{}
}

func (s *AgentService) AgentSend(sessionID string, messages []agent.FrontendMessage) (string, error) {
	if sessionID == "" {
		sessionID = "ai_agent_default"
	}

	c := GetContainer()
	cfg := c.Store.GetSettings()
	agent.DefaultManager.SetSSHManager(c.Sessions)
	agent.DefaultRuntime.SetManagers(c.Sessions, c.RedisMgr, c.MysqlMgr, c.MongoMgr, c.SqliteMgr, c.MqttMgr)
	_ = agent.DefaultManager.InitOrUpdate(cfg)
	_ = agent.DefaultRuntime.InitOrUpdate(cfg)

	fullText, reasoningText, notice, err := agent.DefaultManager.StreamChat(
		context.Background(),
		sessionID,
		messages,
		func(chunk string) {},
		func(chunk string) {},
	)

	if notice != "" {
		agent.DefaultRuntime.EventBus.Emit(events.Event{
			Type:      events.EventNotice,
			SessionID: sessionID,
			Payload:   notice,
		})
	}

	if err != nil {
		if err.Error() == "用户手动停止了推导" {
			stoppedText := fullText
			if strings.TrimSpace(stoppedText) != "" {
				stoppedText += "\n\n⏹️ [用户手动停止了推导]"
			} else {
				stoppedText = "⏹️ [用户手动停止了推导]"
			}
			agent.DefaultRuntime.EventBus.Emit(events.Event{
				Type:      events.EventDone,
				SessionID: sessionID,
				Payload: events.DonePayload{
					Content:          stoppedText,
					ReasoningContent: reasoningText,
				},
			})
			return stoppedText, nil
		}
		agent.DefaultRuntime.EventBus.Emit(events.Event{
			Type:      events.EventError,
			SessionID: sessionID,
			Payload:   err.Error(),
		})
		return fullText, err
	}

	agent.DefaultRuntime.EventBus.Emit(events.Event{
		Type:      events.EventDone,
		SessionID: sessionID,
		Payload: events.DonePayload{
			Content:          fullText,
			ReasoningContent: reasoningText,
		},
	})

	// 异步尝试沉淀会话情节记忆与关键事实
	if agent.DefaultRuntime.Memory != nil && len(messages) >= 4 {
		schemaMsgs := make([]*schema.Message, 0, len(messages))
		for _, m := range messages {
			if m.Role == "user" {
				schemaMsgs = append(schemaMsgs, schema.UserMessage(m.Content))
			} else if m.Role == "assistant" {
				schemaMsgs = append(schemaMsgs, schema.AssistantMessage(m.Content, nil))
			}
		}
		go func(sid string, msgs []*schema.Message) {
			_ = agent.DefaultRuntime.Memory.SummarizeSession(context.Background(), sid, msgs, agent.DefaultRuntime.Router)
		}(sessionID, schemaMsgs)
	}

	return fullText, nil
}

func (s *AgentService) AgentStopSend(sessionID string) bool {
	if sessionID == "" {
		sessionID = "ai_agent_default"
	}
	agent.DefaultManager.StopChat(sessionID)
	return true
}

func (s *AgentService) AgentAnswerAsk(askID string, answer string) bool {
	if agent.DefaultRuntime.AskMgr == nil {
		return false
	}
	return agent.DefaultRuntime.AskMgr.Answer(askID, answer)
}

func (s *AgentService) AgentGetPendingAsks() []*ask.AskRequest {
	if agent.DefaultRuntime.AskMgr == nil {
		return nil
	}
	return agent.DefaultRuntime.AskMgr.ListPending()
}

func (s *AgentService) AgentProposePlan(sessionID, objective string) (*planner.Plan, error) {
	if sessionID == "" {
		sessionID = "ai_agent_default"
	}
	c := GetContainer()
	agent.DefaultRuntime.SetManagers(c.Sessions, c.RedisMgr, c.MysqlMgr, c.MongoMgr, c.SqliteMgr, c.MqttMgr)
	toolsList := agent.DefaultRuntime.ToolBus.List()
	var descBuilder strings.Builder
	for _, t := range toolsList {
		descBuilder.WriteString(fmt.Sprintf("- %s: %s\n", t.Name, t.Description))
	}
	plan, err := agent.DefaultRuntime.Planner.GeneratePlan(context.Background(), sessionID, objective, descBuilder.String())
	if err != nil {
		return nil, err
	}
	agent.DefaultRuntime.PlanGate.Submit(plan)

	agent.DefaultRuntime.EventBus.Emit(events.Event{
		Type:      events.EventPlanProposed,
		SessionID: sessionID,
		Payload:   plan,
	})
	return plan, nil
}

func (s *AgentService) AgentApprovePlan(planID string) (bool, error) {
	plan, ok := agent.DefaultRuntime.PlanGate.Approve(planID)
	if !ok || plan == nil {
		return false, errors.New("规划不存在或已批准")
	}

	traceID := fmt.Sprintf("trace_%d", time.Now().UnixNano())
	c := GetContainer()
	agent.DefaultRuntime.SetManagers(c.Sessions, c.RedisMgr, c.MysqlMgr, c.MongoMgr, c.SqliteMgr, c.MqttMgr)

	planCtx, planCancel := context.WithCancel(context.Background())
	s.planCancelMap.Store(planID, planCancel)

	// Execute Plan in background
	go func() {
		defer func() {
			s.planCancelMap.Delete(planID)
			planCancel()
		}()

		_, err := agent.DefaultRuntime.Executor.ExecutePlan(planCtx, traceID, plan, nil)

		var report strings.Builder
		report.WriteString(fmt.Sprintf("### 🎯 规划执行完成: %s\n\n", plan.Objective))
		if err != nil {
			if planCtx.Err() == context.Canceled {
				report.WriteString("> ⏹️ **规划已被用户手动停止**\n\n")
			} else {
				report.WriteString(fmt.Sprintf("> ⚠️ **执行过程中断**: %s\n\n", err.Error()))
			}
		} else {
			report.WriteString("> ✅ **全部规划步骤执行完成**\n\n")
		}
		report.WriteString("| 步骤 | 动作 | 工具 | 状态 |\n| :--- | :--- | :--- | :--- |\n")
		for _, step := range plan.Steps {
			report.WriteString(fmt.Sprintf("| `%s` | %s | `%s` | %s |\n", step.ID, step.Description, step.ToolName, step.Status))
		}

		// Build detailed steps summary with actual output data
		var stepsSummary strings.Builder
		for i, st := range plan.Steps {
			stepsSummary.WriteString(fmt.Sprintf("\n【步骤 %d】: %s\n- 动作/工具: %s (`%s`)\n- 状态: %s (耗时: %dms)\n", i+1, st.Description, st.Action, st.ToolName, st.Status, st.DurationMs))
			if st.Output != nil && fmt.Sprintf("%v", st.Output) != "" {
				outStr := fmt.Sprintf("%v", st.Output)
				if len(outStr) > 3000 {
					outStr = outStr[:3000] + "...(省略长数据)"
				}
				stepsSummary.WriteString(fmt.Sprintf("- 采集数据与产出:\n%s\n", outStr))
			}
			if st.Error != "" {
				stepsSummary.WriteString(fmt.Sprintf("- 错误/异常: %s\n", st.Error))
			}
		}

		conclusionPrompt := fmt.Sprintf(`你是一个专业的智能运维专家与系统架构师。请针对刚刚执行完毕的规划任务，结合各步骤采集到的真实数据与输出，撰写一份结构清晰、见解深刻、直接面向用户的【任务执行总结与诊断结论报告】。

【用户目标】: %s
【规划执行状态】: %s

【各步骤详细执行产出与数据】:
%s

【输出规范与要求】:
1. **核心结论与目标达成情况**：简明扼要说明目标是否已达成，整体系统或服务健康度如何。
2. **核心数据与指标分析**：深度提炼步骤中采集的关键数据（例如：CPU/内存使用率、负载、关键进程、数据库指标等），切忌只机械罗列步骤，要给出专业分析。
3. **异常发现与风险提示**：指出执行过程中发现的任何异常、资源瓶颈或安全风险（若一切正常，请明确说明系统处于健康状态）。
4. **后续运维建议与优化措施**：给出 1~3 条具备可操作性的具体处置建议（如需进一步排查可提示用户输入何种指令）。
请使用清晰优美的 Markdown 格式输出，使用表格、加粗、列表增强可读性。`, plan.Objective, func() string {
			if err != nil {
				return fmt.Sprintf("执行异常 (%v)", err)
			}
			return "全部步骤执行成功"
		}(), stepsSummary.String())

		// Generate LLM conclusion
		resolved, rErr := agent.DefaultRuntime.Router.Resolve(context.Background(), router.RoleDefault)
		if rErr == nil && resolved != nil && resolved.Model != nil {
			msgs := []*schema.Message{
				schema.SystemMessage("你是一个具备资深运维与研发诊断能力的 AI 专家助理，请根据规划任务的实际执行数据提供精准、专业的总结与诊断结论。"),
				schema.UserMessage(conclusionPrompt),
			}
			out, gErr := resolved.Model.Generate(context.Background(), msgs)
			if gErr == nil && out != nil && strings.TrimSpace(out.Content) != "" {
				report.WriteString("\n\n---\n\n### 📝 智能分析与诊断结论\n\n")
				report.WriteString(out.Content)
			}
		}

		summaryContent := report.String()

		if agent.DefaultRuntime.Store != nil {
			_ = agent.DefaultRuntime.Store.AddMessage(store.MessageItem{
				SessionID: plan.SessionID,
				Role:      "assistant",
				Content:   summaryContent,
			})
		}

		agent.DefaultRuntime.EventBus.Emit(events.Event{
			Type:      events.EventDone,
			SessionID: plan.SessionID,
			TraceID:   traceID,
			Payload: events.DonePayload{
				Content: summaryContent,
			},
		})
	}()

	return true, nil
}

func (s *AgentService) AgentCancelPlan(planID string) bool {
	if cancelVal, ok := s.planCancelMap.LoadAndDelete(planID); ok {
		if cancel, ok := cancelVal.(context.CancelFunc); ok {
			cancel()
			return true
		}
	}
	return false
}

func (s *AgentService) AgentRetryPlanStep(planID, stepID string) (*planner.PlanStep, error) {
	plan := agent.DefaultRuntime.PlanGate.Get(planID)
	if plan == nil {
		return nil, errors.New("规划不存在")
	}

	var targetStep *planner.PlanStep
	for i := range plan.Steps {
		if plan.Steps[i].ID == stepID {
			targetStep = &plan.Steps[i]
			break
		}
	}
	if targetStep == nil {
		return nil, fmt.Errorf("步骤 [%s] 未找到", stepID)
	}

	c := GetContainer()
	agent.DefaultRuntime.SetManagers(c.Sessions, c.RedisMgr, c.MysqlMgr, c.MongoMgr, c.SqliteMgr, c.MqttMgr)
	traceID := fmt.Sprintf("retry_%d", time.Now().UnixNano())

	stepOutputs := make(map[string]any)
	res := agent.DefaultRuntime.Executor.ExecuteSingleStepDirect(context.Background(), traceID, plan, targetStep, stepOutputs)
	if res != nil && res.OK {
		targetStep.Status = "completed"
	} else {
		targetStep.Status = "failed"
	}

	return targetStep, nil
}

func (s *AgentService) AgentSelectWorkspaceDir() (string, error) {
	dir, err := core.OpenDirectoryDialog("选择工作目录")
	if err != nil {
		return "", err
	}
	if dir != "" {
		agent.DefaultRuntime.WorkspaceMgr.SetDir(dir)
		c := GetContainer()
		cfg := c.Store.GetSettings()
		cfg.AiWorkspaceDir = dir
		_, _ = c.Store.SaveSettings(cfg)
		_ = agent.DefaultRuntime.InitOrUpdate(cfg)
	}
	return dir, nil
}

func (s *AgentService) AgentSetWorkspaceDir(dir string) string {
	agent.DefaultRuntime.WorkspaceMgr.SetDir(dir)
	c := GetContainer()
	cfg := c.Store.GetSettings()
	cfg.AiWorkspaceDir = dir
	_, _ = c.Store.SaveSettings(cfg)
	_ = agent.DefaultRuntime.InitOrUpdate(cfg)
	return dir
}

func (s *AgentService) AgentGetWorkspaceDir() string {
	dir := agent.DefaultRuntime.WorkspaceMgr.GetDir()
	if dir == "" {
		c := GetContainer()
		cfg := c.Store.GetSettings()
		if cfg.AiWorkspaceDir != "" {
			agent.DefaultRuntime.WorkspaceMgr.SetDir(cfg.AiWorkspaceDir)
			dir = cfg.AiWorkspaceDir
		}
	}
	return dir
}

func (s *AgentService) AgentListSessions() ([]store.SessionItem, error) {
	if agent.DefaultRuntime.Store == nil {
		return []store.SessionItem{}, nil
	}
	return agent.DefaultRuntime.Store.ListSessions()
}

func (s *AgentService) AgentCreateSession(title string) (*store.SessionItem, error) {
	if agent.DefaultRuntime.Store == nil {
		return nil, errors.New("存储未就绪")
	}
	id := fmt.Sprintf("session_%d", time.Now().UnixNano())
	now := time.Now().UnixMilli()
	item := store.SessionItem{
		ID:        id,
		Title:     title,
		Workspace: agent.DefaultRuntime.WorkspaceMgr.GetDir(),
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := agent.DefaultRuntime.Store.SaveSession(item); err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *AgentService) AgentDeleteSession(sessionID string) bool {
	if agent.DefaultRuntime.Store != nil {
		_ = agent.DefaultRuntime.Store.DeleteSession(sessionID)
	}
	return true
}

func (s *AgentService) AgentGetSessionMessages(sessionID string) ([]agent.FrontendMessage, error) {
	if sessionID == "" {
		sessionID = "ai_agent_default"
	}
	if agent.DefaultRuntime.Store == nil {
		return []agent.FrontendMessage{}, nil
	}
	dbMsgs, err := agent.DefaultRuntime.Store.ListMessages(sessionID)
	if err != nil {
		return []agent.FrontendMessage{}, nil
	}
	var out []agent.FrontendMessage
	for _, m := range dbMsgs {
		var tc []agent.ToolCallItem
		if m.ToolCalls != "" {
			_ = json.Unmarshal([]byte(m.ToolCalls), &tc)
		}
		var ps []agent.ProcessStep
		if m.ProcessSteps != "" {
			_ = json.Unmarshal([]byte(m.ProcessSteps), &ps)
		}
		out = append(out, agent.FrontendMessage{
			Role:             m.Role,
			Content:          m.Content,
			ReasoningContent: m.Reasoning,
			ToolCalls:        tc,
			ProcessSteps:     ps,
			Timestamp:        m.CreatedAt,
		})
	}
	return out, nil
}

func (s *AgentService) AgentSaveSessionMessages(sessionID string, messages []agent.FrontendMessage) error {
	if sessionID == "" {
		sessionID = "ai_agent_default"
	}
	if agent.DefaultRuntime.Store == nil {
		return nil
	}
	var dbMsgs []store.MessageItem
	for _, m := range messages {
		tcBytes, _ := json.Marshal(m.ToolCalls)
		psBytes, _ := json.Marshal(m.ProcessSteps)
		dbMsgs = append(dbMsgs, store.MessageItem{
			SessionID:    sessionID,
			Role:         m.Role,
			Content:      m.Content,
			Reasoning:    m.ReasoningContent,
			ToolCalls:    string(tcBytes),
			ProcessSteps: string(psBytes),
			CreatedAt:    m.Timestamp,
		})
	}
	return agent.DefaultRuntime.Store.ReplaceMessages(sessionID, dbMsgs)
}

func (s *AgentService) AgentConfirmTool(confirmID string, approved bool) bool {
	return s.AgentDecideApproval(confirmID, approved, false, "")
}

func (s *AgentService) AgentDecideApproval(confirmID string, approved, remember bool, reason string) bool {
	return agent.DefaultRuntime.Guard.DecideApproval(confirmID, guard.ApprovalDecision{
		Approved: approved,
		Remember: remember,
		Reason:   reason,
	})
}

func (s *AgentService) AgentGetPendingApprovals() []*guard.ApprovalRequest {
	return agent.DefaultRuntime.Guard.ListPendingApprovals()
}

func (s *AgentService) AgentListJobs(sessionID string) ([]store.JobItem, error) {
	return agent.DefaultRuntime.JobMgr.ListJobs(sessionID)
}

func (s *AgentService) AgentGetJob(jobID string) (*store.JobItem, error) {
	return agent.DefaultRuntime.JobMgr.GetJob(jobID)
}

func (s *AgentService) AgentGetJobOutput(jobID string, fromSeq int) ([]store.JobOutputItem, error) {
	return agent.DefaultRuntime.JobMgr.Output(jobID, fromSeq)
}

func (s *AgentService) AgentKillJob(jobID string) bool {
	return agent.DefaultRuntime.JobMgr.Kill(jobID)
}

func (s *AgentService) AgentListSubagents(sessionID string) ([]store.SubagentItem, error) {
	return agent.DefaultRuntime.SubagentM.List(sessionID)
}

func (s *AgentService) AgentSendSubagent(subID, message string) (string, error) {
	c := GetContainer()
	agent.DefaultRuntime.SetManagers(c.Sessions, c.RedisMgr, c.MysqlMgr, c.MongoMgr, c.SqliteMgr, c.MqttMgr)
	return agent.DefaultRuntime.SubagentM.Send(context.Background(), subID, message)
}

func (s *AgentService) AgentInterruptSubagent(subID string) bool {
	return agent.DefaultRuntime.SubagentM.Interrupt(subID)
}

func (s *AgentService) AgentGetAuditLogs(sessionID string, limit int) ([]store.AuditLogItem, error) {
	if agent.DefaultRuntime.Store == nil {
		return []store.AuditLogItem{}, nil
	}
	return agent.DefaultRuntime.Store.ListAuditLogs(sessionID, limit)
}

func (s *AgentService) AgentListSkills() []skills.Skill {
	if agent.DefaultRuntime.SkillsReg == nil {
		return []skills.Skill{}
	}
	return agent.DefaultRuntime.SkillsReg.List()
}

func (s *AgentService) AgentGetSkillsDir() string {
	if agent.DefaultRuntime.SkillsReg == nil {
		return ""
	}
	return agent.DefaultRuntime.SkillsReg.GetSkillsDir()
}

func (s *AgentService) AgentOpenSkillsDir() (string, error) {
	dir := s.AgentGetSkillsDir()
	if dir == "" {
		return "", fmt.Errorf("未找到本地技能目录")
	}
	_ = os.MkdirAll(dir, 0o755)

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", dir)
	case "darwin":
		cmd = exec.Command("open", dir)
	default:
		cmd = exec.Command("xdg-open", dir)
	}

	if err := cmd.Start(); err != nil {
		return dir, fmt.Errorf("打开本地技能目录失败: %w", err)
	}
	return dir, nil
}

func (s *AgentService) AgentRecallMemories(query string, limit int) []string {
	return agent.DefaultRuntime.Memory.Recall(context.Background(), query, limit)
}

func (s *AgentService) AgentSaveMemory(kind, content, tags, source string) error {
	return agent.DefaultRuntime.Memory.SaveFact(kind, content, tags, source)
}

func (s *AgentService) AgentGetHistory() ([]agent.FrontendMessage, error) {
	return s.AgentGetSessionMessages("ai_agent_default")
}

func (s *AgentService) AgentSaveHistory(messages []agent.FrontendMessage) error {
	return s.AgentSaveSessionMessages("ai_agent_default", messages)
}

func (s *AgentService) AgentClearHistory() error {
	if agent.DefaultRuntime.Store != nil {
		_ = agent.DefaultRuntime.Store.ClearSessionMessages("ai_agent_default")
	}
	return agent.DefaultManager.Storage().ClearHistory()
}
