package executor

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"terminal/agent/ask"
	"terminal/agent/events"
	"terminal/agent/job"
	"terminal/agent/planner"
	"terminal/agent/subagent"
	"terminal/agent/tools"
	"terminal/agent/verifier"
	"terminal/agent/workflow"
)

type StepResult struct {
	StepID     string           `json:"step_id"`
	OK         bool             `json:"ok"`
	Output     any              `json:"output"`
	Error      string           `json:"error,omitempty"`
	DurationMs int64            `json:"duration_ms"`
	Verdict    verifier.Verdict `json:"verdict"`
	Fatal      bool             `json:"fatal,omitempty"`
}

type Executor struct {
	mu          sync.RWMutex
	toolBus     *tools.ToolBus
	verifier    *verifier.Verifier
	eventBus    *events.EventBus
	jobMgr      *job.JobManager
	subagentMgr *subagent.SubagentManager
	workflowEng *workflow.WorkflowEngine
	askMgr      *ask.AskManager
	maxParallel int
}

func NewExecutor(tb *tools.ToolBus, v *verifier.Verifier, eb *events.EventBus) *Executor {
	return &Executor{
		toolBus:     tb,
		verifier:    v,
		eventBus:    eb,
		maxParallel: 4,
	}
}

func (e *Executor) SetManagers(jm *job.JobManager, sm *subagent.SubagentManager, wf *workflow.WorkflowEngine, ask *ask.AskManager) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.jobMgr = jm
	e.subagentMgr = sm
	e.workflowEng = wf
	e.askMgr = ask
}

func (e *Executor) SetMaxParallel(max int) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if max <= 0 {
		max = 4
	}
	e.maxParallel = max
}

func (e *Executor) GetMaxParallel() int {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.maxParallel
}

var placeholderRegex = regexp.MustCompile(`\{\{([a-zA-Z0-9_\-\.]+)\}\}`)

// RenderStepArgs 动态变量模板渲染：支持 {{step_id.output}} 或 {{step_id.output.key}} 占位符替换
func RenderStepArgs(raw json.RawMessage, stepOutputs map[string]any) string {
	rawStr := string(raw)
	if strings.TrimSpace(rawStr) == "" {
		return "{}"
	}
	if len(stepOutputs) == 0 {
		return rawStr
	}

	rendered := placeholderRegex.ReplaceAllStringFunc(rawStr, func(match string) string {
		expr := strings.Trim(match, "{} \t\r\n")
		parts := strings.Split(expr, ".")
		if len(parts) == 0 {
			return match
		}
		stepID := parts[0]
		val, exists := stepOutputs[stepID]
		if !exists {
			return match
		}

		curr := val
		for i := 1; i < len(parts); i++ {
			p := parts[i]
			if p == "output" && i == 1 {
				if m, ok := curr.(map[string]any); ok {
					if outVal, ok2 := m["output"]; ok2 {
						curr = outVal
					}
				}
				continue
			}
			if m, ok := curr.(map[string]any); ok {
				if next, ok2 := m[p]; ok2 {
					curr = next
				} else {
					return match
				}
			} else {
				return match
			}
		}

		switch v := curr.(type) {
		case string:
			b, err := json.Marshal(v)
			if err == nil && len(b) >= 2 && b[0] == '"' && b[len(b)-1] == '"' {
				return string(b[1 : len(b)-1])
			}
			return v
		case int, int64, int32, float64, float32, bool:
			return fmt.Sprintf("%v", v)
		default:
			b, err := json.Marshal(v)
			if err == nil {
				return string(b)
			}
			return fmt.Sprintf("%v", v)
		}
	})

	return rendered
}

// ExecutePlan 兼容入口，内部自动调用 DAG 并发调度引擎
func (e *Executor) ExecutePlan(
	ctx context.Context,
	traceID string,
	plan *planner.Plan,
	onStepProgress func(step *planner.PlanStep, res *StepResult),
) ([]*StepResult, error) {
	return e.ExecuteDAG(ctx, traceID, plan, onStepProgress)
}

// ExecuteDAG 基于拓扑分层的 DAG 并行调度与失败重试
func (e *Executor) ExecuteDAG(
	ctx context.Context,
	traceID string,
	plan *planner.Plan,
	onStepProgress func(step *planner.PlanStep, res *StepResult),
) ([]*StepResult, error) {
	if plan == nil || len(plan.Steps) == 0 {
		return nil, nil
	}

	layers, err := BuildDAG(plan.Steps)
	if err != nil {
		return nil, fmt.Errorf("构建执行 DAG 失败: %w", err)
	}

	maxParallel := e.GetMaxParallel()
	var allResults []*StepResult
	var resultsMu sync.Mutex

	stepOutputs := make(map[string]any)
	var outputsMu sync.RWMutex

	for _, layer := range layers {
		if ctx.Err() != nil {
			break
		}

		sem := make(chan struct{}, maxParallel)
		var wg sync.WaitGroup
		layerResults := make([]*StepResult, len(layer))

		for i := range layer {
			stepCopy := layer[i]
			wg.Add(1)

			go func(idx int, st planner.PlanStep) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()

				outputsMu.RLock()
				outputsSnapshot := make(map[string]any, len(stepOutputs))
				for k, v := range stepOutputs {
					outputsSnapshot[k] = v
				}
				outputsMu.RUnlock()

				res := e.executeStepWithRetry(ctx, traceID, plan, &st, outputsSnapshot)
				layerResults[idx] = res

				if res != nil {
					if res.OK {
						outputsMu.Lock()
						stepOutputs[st.ID] = res.Output
						outputsMu.Unlock()
					}

					// Update original plan.Steps
					resultsMu.Lock()
					for j := range plan.Steps {
						if plan.Steps[j].ID == st.ID {
							plan.Steps[j].Status = st.Status
							plan.Steps[j].Output = res.Output
							plan.Steps[j].Error = res.Error
							plan.Steps[j].DurationMs = res.DurationMs
							plan.Steps[j].Verdict = string(res.Verdict.Status)
							break
						}
					}
					resultsMu.Unlock()
				}

				if onStepProgress != nil {
					onStepProgress(&st, res)
				}
			}(i, stepCopy)
		}

		wg.Wait()

		// 收集本层结果并检查是否发生严重失败
		var fatalErr error
		for _, r := range layerResults {
			if r != nil {
				resultsMu.Lock()
				allResults = append(allResults, r)
				resultsMu.Unlock()

				if !r.OK {
					if fatalErr == nil {
						fatalErr = fmt.Errorf("步骤 [%s] 执行失败: %s", r.StepID, r.Error)
					}
				}
			}
		}

		if fatalErr != nil {
			return allResults, fatalErr
		}
	}

	return allResults, nil
}

// ExecuteSingleStepDirect 单步直接执行（用于单步重试）
func (e *Executor) ExecuteSingleStepDirect(
	ctx context.Context,
	traceID string,
	plan *planner.Plan,
	step *planner.PlanStep,
	stepOutputs map[string]any,
) *StepResult {
	return e.executeStepWithRetry(ctx, traceID, plan, step, stepOutputs)
}

func (e *Executor) executeSingleStep(
	ctx context.Context,
	traceID string,
	plan *planner.Plan,
	step *planner.PlanStep,
	stepOutputs map[string]any,
) *StepResult {
	start := time.Now()

	step.Status = "running"
	if e.eventBus != nil {
		e.eventBus.Emit(events.Event{
			Type:      events.EventStepStarted,
			SessionID: plan.SessionID,
			TraceID:   traceID,
			Payload: events.StepEventPayload{
				PlanID:   plan.ID,
				StepID:   step.ID,
				Action:   step.Action,
				ToolName: step.ToolName,
				Status:   "running",
			},
		})
	}

	renderedArgs := RenderStepArgs(step.Args, stepOutputs)
	var stepRes *StepResult

	switch strings.ToLower(strings.TrimSpace(step.Action)) {
	case "tool_call":
		if step.ToolName == "" {
			stepRes = &StepResult{
				StepID:     step.ID,
				OK:         false,
				Error:      "未指定需要调用的工具名称",
				DurationMs: time.Since(start).Milliseconds(),
			}
			break
		}
		toolRes := e.toolBus.Invoke(ctx, traceID, plan.SessionID, step.ToolName, renderedArgs)
		stepRes = &StepResult{
			StepID:     step.ID,
			OK:         toolRes.OK,
			Output:     toolRes.Data,
			Error:      toolRes.Error,
			DurationMs: time.Since(start).Milliseconds(),
		}

	case "job":
		if e.jobMgr != nil {
			var jobSpec struct {
				Command    string `json:"command"`
				Target     string `json:"target"`
				Cwd        string `json:"cwd"`
				TimeoutSec int    `json:"timeout_sec"`
			}
			_ = json.Unmarshal([]byte(renderedArgs), &jobSpec)
			cmd := jobSpec.Command
			if cmd == "" {
				cmd = step.Description
			}
			spec := job.ExecSpec{
				Target:     jobSpec.Target,
				Command:    cmd,
				Cwd:        jobSpec.Cwd,
				TimeoutSec: jobSpec.TimeoutSec,
			}
			jobID, err := e.jobMgr.SubmitExec(ctx, plan.SessionID, "plan_step", spec, step.ID, step.Description)
			if err != nil {
				stepRes = &StepResult{
					StepID:     step.ID,
					OK:         false,
					Error:      fmt.Sprintf("提交后台作业失败: %v", err),
					DurationMs: time.Since(start).Milliseconds(),
				}
			} else {
				_, summary, waitErr := e.jobMgr.Wait(ctx, jobID)
				stepRes = &StepResult{
					StepID:     step.ID,
					OK:         waitErr == nil,
					Output:     summary,
					Error:      func() string { if waitErr != nil { return waitErr.Error() }; return "" }(),
					DurationMs: time.Since(start).Milliseconds(),
				}
			}
		} else {
			// Fallback to toolBus
			toolRes := e.toolBus.Invoke(ctx, traceID, plan.SessionID, "exec_command", renderedArgs)
			stepRes = &StepResult{
				StepID:     step.ID,
				OK:         toolRes.OK,
				Output:     toolRes.Data,
				Error:      toolRes.Error,
				DurationMs: time.Since(start).Milliseconds(),
			}
		}

	case "subagent":
		if e.subagentMgr != nil {
			var subSpec struct {
				Prompt         string `json:"prompt"`
				ExpectedSchema string `json:"expected_schema"`
			}
			_ = json.Unmarshal([]byte(renderedArgs), &subSpec)
			prompt := subSpec.Prompt
			if prompt == "" {
				prompt = step.Description
			}
			subID, err := e.subagentMgr.Spawn(ctx, plan.ID, plan.SessionID, prompt, subSpec.ExpectedSchema, 1)
			if err != nil {
				stepRes = &StepResult{
					StepID:     step.ID,
					OK:         false,
					Error:      fmt.Sprintf("委派子代理失败: %v", err),
					DurationMs: time.Since(start).Milliseconds(),
				}
			} else {
				_, res, waitErr := e.subagentMgr.Wait(ctx, subID)
				stepRes = &StepResult{
					StepID:     step.ID,
					OK:         waitErr == nil,
					Output:     res,
					Error:      func() string { if waitErr != nil { return waitErr.Error() }; return "" }(),
					DurationMs: time.Since(start).Milliseconds(),
				}
			}
		} else {
			stepRes = &StepResult{
				StepID:     step.ID,
				OK:         true,
				Output:     fmt.Sprintf("【子代理推导完成】: %s", step.Description),
				DurationMs: time.Since(start).Milliseconds(),
			}
		}

	case "workflow":
		if e.workflowEng != nil {
			var wfSpec struct {
				WorkflowName string `json:"workflow_name"`
				Items        []any  `json:"items"`
			}
			_ = json.Unmarshal([]byte(renderedArgs), &wfSpec)
			res := e.workflowEng.Pipeline(ctx, plan.SessionID, wfSpec.Items, nil, nil)
			stepRes = &StepResult{
				StepID:     step.ID,
				OK:         true,
				Output:     res,
				DurationMs: time.Since(start).Milliseconds(),
			}
		} else {
			stepRes = &StepResult{
				StepID:     step.ID,
				OK:         true,
				Output:     step.Description,
				DurationMs: time.Since(start).Milliseconds(),
			}
		}

	case "ask_user":
		if e.askMgr != nil {
			var askSpec struct {
				Question string   `json:"question"`
				Options  []string `json:"options"`
			}
			_ = json.Unmarshal([]byte(renderedArgs), &askSpec)
			question := askSpec.Question
			if question == "" {
				question = step.Description
			}
			ans, err := e.askMgr.Ask(ctx, plan.SessionID, question, askSpec.Options)
			stepRes = &StepResult{
				StepID:     step.ID,
				OK:         err == nil,
				Output:     ans,
				Error:      func() string { if err != nil { return err.Error() }; return "" }(),
				DurationMs: time.Since(start).Milliseconds(),
			}
		} else {
			stepRes = &StepResult{
				StepID:     step.ID,
				OK:         true,
				Output:     "已跳过确认",
				DurationMs: time.Since(start).Milliseconds(),
			}
		}

	default:
		if step.ToolName != "" {
			toolRes := e.toolBus.Invoke(ctx, traceID, plan.SessionID, step.ToolName, renderedArgs)
			stepRes = &StepResult{
				StepID:     step.ID,
				OK:         toolRes.OK,
				Output:     toolRes.Data,
				Error:      toolRes.Error,
				DurationMs: time.Since(start).Milliseconds(),
			}
		} else {
			stepRes = &StepResult{
				StepID:     step.ID,
				OK:         true,
				Output:     step.Description,
				DurationMs: time.Since(start).Milliseconds(),
			}
		}
	}

	// 执行结果验证
	if e.verifier != nil {
		verdict := e.verifier.Verify(ctx, step.ExpectedOut, stepRes.Output, stepRes.Error)
		stepRes.Verdict = verdict
		if verdict.Status == verifier.VerdictFail && stepRes.OK {
			stepRes.OK = false
			stepRes.Error = verdict.Reason
		}
	}

	if stepRes.OK {
		step.Status = "completed"
	} else {
		step.Status = "failed"
	}

	if e.eventBus != nil {
		e.eventBus.Emit(events.Event{
			Type:      events.EventStepFinished,
			SessionID: plan.SessionID,
			TraceID:   traceID,
			Payload: events.StepEventPayload{
				PlanID:     plan.ID,
				StepID:     step.ID,
				Action:     step.Action,
				ToolName:   step.ToolName,
				Status:     step.Status,
				Output:     stepRes.Output,
				Error:      stepRes.Error,
				DurationMs: stepRes.DurationMs,
				Verdict:    string(stepRes.Verdict.Status),
			},
		})
	}

	return stepRes
}
