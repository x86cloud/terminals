package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
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
	if c.Store != nil {
		agent.DefaultRuntime.SetCoreStore(c.Store)
	}
	agent.DefaultManager.SetSSHManager(c.Sessions)
	agent.DefaultRuntime.SetManagers(c.Sessions, c.RedisMgr, c.MysqlMgr, c.PostgresMgr, c.MongoMgr, c.SqliteMgr, c.MqttMgr, c.DockerMgr, c.K8sMgr)
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

	// 异步自动起名逻辑：若为新会话且尚无自定义标题，自动由 Agent 提炼会话名称
	go s.tryAutoGenerateTitle(sessionID, messages, fullText)

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

func (s *AgentService) AgentResolveHitl(confirmID string, approved bool, reason string) bool {
	if agent.DefaultRuntime.HitlMgr == nil {
		return false
	}
	return agent.DefaultRuntime.HitlMgr.ResolveApproval(confirmID, approved, reason)
}

func (s *AgentService) AgentGetPendingHitls() []*guard.HitlRequest {
	if agent.DefaultRuntime.HitlMgr == nil {
		return nil
	}
	return agent.DefaultRuntime.HitlMgr.ListPending()
}

func (s *AgentService) AgentProposePlan(sessionID, objective string) (*planner.Plan, error) {
	if sessionID == "" {
		sessionID = "ai_agent_default"
	}

	c := GetContainer()
	cfg := c.Store.GetSettings()
	if c.Store != nil {
		agent.DefaultRuntime.SetCoreStore(c.Store)
	}
	agent.DefaultManager.SetSSHManager(c.Sessions)
	agent.DefaultRuntime.SetManagers(c.Sessions, c.RedisMgr, c.MysqlMgr, c.PostgresMgr, c.MongoMgr, c.SqliteMgr, c.MqttMgr, c.DockerMgr, c.K8sMgr)
	_ = agent.DefaultManager.InitOrUpdate(cfg)
	_ = agent.DefaultRuntime.InitOrUpdate(cfg)

	// Fetch message history from store
	var messages []agent.FrontendMessage
	if agent.DefaultRuntime.Store != nil {
		dbMsgs, err := agent.DefaultRuntime.Store.ListMessages(sessionID)
		if err == nil && len(dbMsgs) > 0 {
			for _, m := range dbMsgs {
				var tc []agent.ToolCallItem
				if m.ToolCalls != "" {
					_ = json.Unmarshal([]byte(m.ToolCalls), &tc)
				}
				var ps []agent.ProcessStep
				if m.ProcessSteps != "" {
					_ = json.Unmarshal([]byte(m.ProcessSteps), &ps)
				}
				messages = append(messages, agent.FrontendMessage{
					Role:             m.Role,
					Content:          m.Content,
					ReasoningContent: m.Reasoning,
					ToolCalls:        tc,
					ProcessSteps:     ps,
					Timestamp:        m.CreatedAt,
				})
			}
		}
	}

	// Ensure current user message with objective is present
	if len(messages) == 0 || messages[len(messages)-1].Role != "user" || messages[len(messages)-1].Content != objective {
		messages = append(messages, agent.FrontendMessage{
			Role:      "user",
			Content:   objective,
			Timestamp: time.Now().UnixMilli(),
		})
	}

	// Enable Planning Mode in Context
	planCtx := guard.WithPlanningMode(context.Background(), true)

	fullText, reasoningText, notice, err := agent.DefaultManager.StreamChat(
		planCtx,
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
			return nil, err
		}
		agent.DefaultRuntime.EventBus.Emit(events.Event{
			Type:      events.EventError,
			SessionID: sessionID,
			Payload:   err.Error(),
		})
		return nil, err
	}

	// Save Markdown plan to %APPDATA%/xClient/plans/<sessionId>/implementation_plan.md
	plan, saveErr := planner.SavePlanMarkdown(sessionID, objective, fullText)
	if saveErr != nil {
		return nil, saveErr
	}
	plan.ReasoningContent = reasoningText
	agent.DefaultRuntime.PlanGate.Submit(plan)

	agent.DefaultRuntime.EventBus.Emit(events.Event{
		Type:      events.EventPlanProposed,
		SessionID: sessionID,
		Payload:   plan,
	})

	go s.tryAutoGenerateTitle(sessionID, messages, fullText)

	agent.DefaultRuntime.EventBus.Emit(events.Event{
		Type:      events.EventDone,
		SessionID: sessionID,
		Payload: events.DonePayload{
			Content:          "",
			ReasoningContent: reasoningText,
		},
	})

	return plan, nil
}

func (s *AgentService) AgentApprovePlan(planID string) (bool, error) {
	plan, ok := agent.DefaultRuntime.PlanGate.Approve(planID)
	if !ok || plan == nil {
		return false, errors.New("规划不存在或已批准")
	}
	plan.Status = "approved"

	if len(plan.Steps) == 0 {
		return true, nil
	}

	traceID := fmt.Sprintf("trace_%d", time.Now().UnixNano())
	c := GetContainer()
	if c.Store != nil {
		agent.DefaultRuntime.SetCoreStore(c.Store)
	}
	agent.DefaultRuntime.SetManagers(c.Sessions, c.RedisMgr, c.MysqlMgr, c.PostgresMgr, c.MongoMgr, c.SqliteMgr, c.MqttMgr, c.DockerMgr, c.K8sMgr)

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
	if c.Store != nil {
		agent.DefaultRuntime.SetCoreStore(c.Store)
	}
	agent.DefaultRuntime.SetManagers(c.Sessions, c.RedisMgr, c.MysqlMgr, c.PostgresMgr, c.MongoMgr, c.SqliteMgr, c.MqttMgr, c.DockerMgr, c.K8sMgr)
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

func (s *AgentService) AgentSetActiveConnection(info agent.ActiveConnectionInfo) {
	if info.Protocol == "" && info.ID == "" {
		agent.DefaultRuntime.SetActiveConnection(nil)
		return
	}
	agent.DefaultRuntime.SetActiveConnection(&info)
}

func (s *AgentService) AgentGetActiveConnection() *agent.ActiveConnectionInfo {
	return agent.DefaultRuntime.GetActiveConnection()
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
	hasPlan := false
	for _, m := range dbMsgs {
		var tc []agent.ToolCallItem
		if m.ToolCalls != "" {
			_ = json.Unmarshal([]byte(m.ToolCalls), &tc)
		}
		var ps []agent.ProcessStep
		if m.ProcessSteps != "" {
			_ = json.Unmarshal([]byte(m.ProcessSteps), &ps)
		}
		var pl *planner.Plan
		if m.Plan != "" {
			_ = json.Unmarshal([]byte(m.Plan), &pl)
			if pl != nil {
				hasPlan = true
			}
		}
		out = append(out, agent.FrontendMessage{
			Role:             m.Role,
			Content:          m.Content,
			ReasoningContent: m.Reasoning,
			ToolCalls:        tc,
			ProcessSteps:     ps,
			Plan:             pl,
			Timestamp:        m.CreatedAt,
		})
	}

	// 智能兜底恢复：如果历史消息中未保存 Plan 实体，但本地 implementation_plan.md 真实存在，
	// 自动将其挂载到最后一条 assistant 消息上，确保重启应用后绝不丢失 Implementation Plan 显示！
	if !hasPlan && len(out) > 0 {
		if existingPlanContent := planner.GetExistingPlan(sessionID); existingPlanContent != "" {
			plansDir, _ := planner.GetPlansDir(sessionID)
			filePath := filepath.Join(plansDir, "implementation_plan.md")
			for i := len(out) - 1; i >= 0; i-- {
				if out[i].Role == "assistant" {
					out[i].Plan = &planner.Plan{
						ID:          fmt.Sprintf("plan_%s", sessionID),
						SessionID:   sessionID,
						Objective:   "技术实施方案",
						Content:     existingPlanContent,
						FilePath:    filePath,
						Status:      "proposed",
						NeedConfirm: true,
					}
					break
				}
			}
		}
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
		var plBytes []byte
		if m.Plan != nil {
			plBytes, _ = json.Marshal(m.Plan)
		}
		dbMsgs = append(dbMsgs, store.MessageItem{
			SessionID:    sessionID,
			Role:         m.Role,
			Content:      m.Content,
			Reasoning:    m.ReasoningContent,
			ToolCalls:    string(tcBytes),
			ProcessSteps: string(psBytes),
			Plan:         string(plBytes),
			CreatedAt:    m.Timestamp,
		})
	}
	err := agent.DefaultRuntime.Store.ReplaceMessages(sessionID, dbMsgs)
	if err == nil {
		if sess, _ := agent.DefaultRuntime.Store.GetSession(sessionID); sess == nil {
			title := "新会话"
			if sessionID == "ai_agent_default" {
				title = "默认会话"
			}
			_, _ = agent.DefaultRuntime.Store.CreateSession(sessionID, title)
		} else {
			_ = agent.DefaultRuntime.Store.TouchSession(sessionID)
		}
	}
	return err
}

func (s *AgentService) AgentConfirmTool(confirmID string, approved bool) bool {
	if agent.DefaultRuntime.HitlMgr == nil {
		return false
	}
	return agent.DefaultRuntime.HitlMgr.ResolveApproval(confirmID, approved, "")
}

func (s *AgentService) AgentDecideApproval(confirmID string, approved, remember bool, reason string) bool {
	if agent.DefaultRuntime.HitlMgr == nil {
		return false
	}
	return agent.DefaultRuntime.HitlMgr.ResolveApproval(confirmID, approved, reason)
}

func (s *AgentService) AgentGetPendingApprovals() []any {
	if agent.DefaultRuntime.HitlMgr == nil {
		return nil
	}
	list := agent.DefaultRuntime.HitlMgr.ListPending()
	res := make([]any, 0, len(list))
	for _, item := range list {
		res = append(res, item)
	}
	return res
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

// ---------- Agent 多会话管理 ----------

func (s *AgentService) AgentListSessions() ([]store.SessionItem, error) {
	if agent.DefaultRuntime.Store == nil {
		return []store.SessionItem{}, nil
	}
	return agent.DefaultRuntime.Store.ListSessions()
}

func (s *AgentService) AgentCreateSession(title string) (store.SessionItem, error) {
	if agent.DefaultRuntime.Store == nil {
		return store.SessionItem{}, errors.New("存储层未就绪")
	}
	id := fmt.Sprintf("sess_%d", time.Now().UnixMilli())
	if strings.TrimSpace(title) == "" {
		title = "新会话"
	}
	return agent.DefaultRuntime.Store.CreateSession(id, title)
}

func (s *AgentService) AgentUpdateSessionTitle(sessionID, title string) error {
	if agent.DefaultRuntime.Store == nil {
		return errors.New("存储层未就绪")
	}
	err := agent.DefaultRuntime.Store.UpdateSessionTitle(sessionID, title)
	if err == nil {
		core.EmitEvent("agent:session_updated", map[string]string{
			"id":    sessionID,
			"title": strings.TrimSpace(title),
		})
	}
	return err
}

func (s *AgentService) AgentDeleteSession(sessionID string) error {
	if agent.DefaultRuntime.Store == nil {
		return errors.New("存储层未就绪")
	}
	// 联动清理方案目录
	_ = planner.DeletePlan(sessionID)
	err := agent.DefaultRuntime.Store.DeleteSession(sessionID)
	if err == nil {
		core.EmitEvent("agent:session_deleted", sessionID)
	}
	return err
}

func (s *AgentService) AgentGenerateSessionTitle(sessionID string) (string, error) {
	if agent.DefaultRuntime.Store == nil {
		return "", errors.New("存储层未就绪")
	}
	msgs, err := s.AgentGetSessionMessages(sessionID)
	if err != nil || len(msgs) == 0 {
		return "新会话", nil
	}
	var firstUserQ, firstAssistantA string
	for _, m := range msgs {
		if m.Role == "user" && firstUserQ == "" {
			firstUserQ = m.Content
		} else if m.Role == "assistant" && firstAssistantA == "" {
			firstAssistantA = m.Content
		}
		if firstUserQ != "" && firstAssistantA != "" {
			break
		}
	}
	title, err := agent.DefaultManager.GenerateSessionTitle(context.Background(), firstUserQ, firstAssistantA)
	if err != nil {
		return "", err
	}
	_ = agent.DefaultRuntime.Store.UpdateSessionTitle(sessionID, title)
	core.EmitEvent("agent:session_updated", map[string]string{
		"id":    sessionID,
		"title": title,
	})
	return title, nil
}

func (s *AgentService) tryAutoGenerateTitle(sessionID string, messages []agent.FrontendMessage, assistantReply string) {
	if agent.DefaultRuntime.Store == nil {
		return
	}
	sess, err := agent.DefaultRuntime.Store.GetSession(sessionID)
	if err != nil || sess == nil {
		// 如果会话不存在则自动创建
		newSess, createErr := agent.DefaultRuntime.Store.CreateSession(sessionID, "新会话")
		if createErr == nil {
			sess = &newSess
		} else {
			return
		}
	}
	// 仅当会话标题为默认通用名称（新会话、默认会话或空）时，才在首轮问答后自动起名
	t := strings.TrimSpace(sess.Title)
	if t != "新会话" && t != "默认会话" && t != "" {
		return
	}

	// 提取首条用户问题
	var firstUserQ string
	for _, m := range messages {
		if m.Role == "user" && strings.TrimSpace(m.Content) != "" {
			firstUserQ = m.Content
			break
		}
	}
	if firstUserQ == "" {
		return
	}

	title, genErr := agent.DefaultManager.GenerateSessionTitle(context.Background(), firstUserQ, assistantReply)
	if genErr == nil && title != "" && title != "新会话" {
		_ = agent.DefaultRuntime.Store.UpdateSessionTitle(sessionID, title)
		core.EmitEvent("agent:session_updated", map[string]string{
			"id":    sessionID,
			"title": title,
		})
	}
}
