package executor

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"terminal/agent/planner"
)

type FailureClass int

const (
	FailureTransient FailureClass = iota // 网络抖动、连接超时、资源暂不可用 → 重试
	FailurePermanent                     // 参数错误、路径不存在、权限拒绝 → 换招
	FailureFatal                         // 高危、上下文取消、致命崩溃 → 终止
)

func classifyFailure(step *planner.PlanStep, res *StepResult) FailureClass {
	if res == nil {
		return FailureFatal
	}

	if res.Verdict.Class == "fatal" {
		return FailureFatal
	}
	if res.Verdict.Class == "transient" {
		return FailureTransient
	}
	if res.Verdict.Class == "permanent" {
		return FailurePermanent
	}

	errStr := strings.ToLower(res.Error)
	if strings.Contains(errStr, "timeout") || strings.Contains(errStr, "connection refused") || strings.Contains(errStr, "reset by peer") || strings.Contains(errStr, "temporary") {
		return FailureTransient
	}
	if strings.Contains(errStr, "context canceled") || strings.Contains(errStr, "killed") || strings.Contains(errStr, "forbidden") {
		return FailureFatal
	}

	return FailurePermanent
}

// executeStepWithRetry 执行单步：支持指数退避重试与换招机制
func (e *Executor) executeStepWithRetry(
	ctx context.Context,
	traceID string,
	plan *planner.Plan,
	step *planner.PlanStep,
	stepOutputs map[string]any,
) *StepResult {
	const maxStepRetries = 2
	const maxFixAttempts = 2

	var finalRes *StepResult
	currentStep := *step
	fixAttempts := 0

	for attempt := 0; attempt <= maxStepRetries; attempt++ {
		if ctx.Err() != nil {
			return &StepResult{
				StepID:     step.ID,
				OK:         false,
				Error:      ctx.Err().Error(),
				Fatal:      true,
				DurationMs: 0,
			}
		}

		finalRes = e.executeSingleStep(ctx, traceID, plan, &currentStep, stepOutputs)
		step.Status = currentStep.Status
		if finalRes != nil {
			step.Output = finalRes.Output
			step.Error = finalRes.Error
			step.DurationMs = finalRes.DurationMs
			step.Verdict = string(finalRes.Verdict.Status)
		}
		if finalRes.OK {
			return finalRes
		}

		class := classifyFailure(&currentStep, finalRes)
		if class == FailureFatal {
			finalRes.Fatal = true
			return finalRes
		}

		if class == FailureTransient && attempt < maxStepRetries {
			// 指数退避: 300ms, 600ms
			backoff := time.Duration((attempt+1)*300) * time.Millisecond
			select {
			case <-ctx.Done():
				finalRes.Fatal = true
				return finalRes
			case <-time.After(backoff):
			}
			continue
		}

		// Permanent 错误且有修复建议时尝试换招
		if class == FailurePermanent && fixAttempts < maxFixAttempts && finalRes.Verdict.FixSuggestion != "" {
			fixAttempts++
			var argsMap map[string]any
			if len(currentStep.Args) > 0 {
				_ = json.Unmarshal(currentStep.Args, &argsMap)
			}
			if argsMap == nil {
				argsMap = make(map[string]any)
			}
			argsMap["_fix_suggestion"] = finalRes.Verdict.FixSuggestion
			argsMap["_previous_error"] = finalRes.Error
			newArgs, _ := json.Marshal(argsMap)
			currentStep.Args = newArgs
			continue
		}

		break
	}

	return finalRes
}
