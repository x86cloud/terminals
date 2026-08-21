package workflow

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"terminal/agent/events"
	"terminal/agent/store"
)

type StageFunc func(ctx context.Context, input any) (output any, err error)

type Stage struct {
	Name string
	Run  StageFunc
}

type WorkflowEngine struct {
	mu       sync.RWMutex
	eventBus *events.EventBus
	store    *store.Store
}

func NewWorkflowEngine(eb *events.EventBus) *WorkflowEngine {
	st, _ := store.GetStore()
	return &WorkflowEngine{
		eventBus: eb,
		store:    st,
	}
}

func (w *WorkflowEngine) SetStore(st *store.Store) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.store = st
}

// Pipeline runs items sequentially through a series of stages without barrier
func (w *WorkflowEngine) Pipeline(
	ctx context.Context,
	sessionID string,
	items []any,
	stages []Stage,
	onProgress func(itemIdx, stageIdx int, msg string),
) []any {
	var results []any

	for i, item := range items {
		cur := item
		var stageErr error

		for j, stage := range stages {
			if ctx.Err() != nil {
				break
			}
			if onProgress != nil {
				onProgress(i, j, fmt.Sprintf("条目 [%d/%d] 正在执行阶段: %s", i+1, len(items), stage.Name))
			}

			out, err := stage.Run(ctx, cur)
			if err != nil {
				stageErr = err
				break // Item eliminated on stage error, others continue
			}
			cur = out
		}

		if stageErr == nil {
			results = append(results, cur)
		}
	}

	return results
}

// Parallel runs multiple tasks concurrently and waits for all of them
func (w *WorkflowEngine) Parallel(
	ctx context.Context,
	tasks []func(ctx context.Context) (any, error),
) []any {
	var wg sync.WaitGroup
	results := make([]any, len(tasks))

	for i, t := range tasks {
		wg.Add(1)
		go func(idx int, task func(ctx context.Context) (any, error)) {
			defer wg.Done()
			res, err := task(ctx)
			if err == nil {
				results[idx] = res
			}
		}(i, t)
	}

	wg.Wait()
	return results
}

type WorkflowStepSpec struct {
	Name     string         `json:"name"`
	ToolName string         `json:"tool_name"`
	Args     map[string]any `json:"args"`
}

type WorkflowSpec struct {
	Name        string             `json:"name"`
	Description string             `json:"description"`
	Steps       []WorkflowStepSpec `json:"steps"`
}

type ToolInvokerFunc func(ctx context.Context, sessionID, toolName, input string) (any, error)

func (w *WorkflowEngine) RunWorkflow(
	ctx context.Context,
	sessionID string,
	workflowName string,
	invoker ToolInvokerFunc,
) (map[string]any, error) {
	w.mu.RLock()
	st := w.store
	w.mu.RUnlock()

	if st == nil {
		return nil, fmt.Errorf("工作流存储未就绪")
	}

	wf, err := st.GetWorkflow(workflowName)
	if err != nil || wf == nil {
		return nil, fmt.Errorf("未找到工作流 [%s]", workflowName)
	}

	var spec WorkflowSpec
	if err := json.Unmarshal([]byte(wf.Script), &spec); err != nil {
		return nil, fmt.Errorf("解析工作流脚本定义失败: %w", err)
	}

	results := make(map[string]any)

	for i, step := range spec.Steps {
		if ctx.Err() != nil {
			return results, ctx.Err()
		}

		stepArgs, _ := json.Marshal(step.Args)
		var stepRes any
		var stepErr error
		if invoker != nil {
			stepRes, stepErr = invoker(ctx, sessionID, step.ToolName, string(stepArgs))
		}
		if stepErr != nil {
			return results, fmt.Errorf("工作流步骤 [%d: %s] 执行失败: %s", i+1, step.Name, stepErr.Error())
		}
		results[step.Name] = stepRes
	}

	return results, nil
}
