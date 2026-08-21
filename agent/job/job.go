package job

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"terminal/agent/events"
	"terminal/agent/store"
)

type JobState string

const (
	StatePending         JobState = "pending"
	StateRunning         JobState = "running"
	StateWaitingApproval JobState = "waiting_approval"
	StateCompleted       JobState = "completed"
	StateFailed          JobState = "failed"
	StateKilled          JobState = "killed"
)

type Job struct {
	ID         string
	SessionID  string
	Kind       string // "chat" | "tool" | "subagent" | "workflow" | "goal_round"
	State      JobState
	Progress   float64
	Summary    string
	Error      string
	CreatedAt  time.Time
	StartedAt  time.Time
	FinishedAt time.Time

	cancelFunc context.CancelFunc
	mu         sync.RWMutex
	seq        int
}

type JobManager struct {
	mu        sync.RWMutex
	jobs      map[string]*Job
	executors map[string]JobExecutor
	store     *store.Store
	eventBus  *events.EventBus
}

func NewJobManager(st *store.Store, eb *events.EventBus) *JobManager {
	return &JobManager{
		jobs:      make(map[string]*Job),
		executors: make(map[string]JobExecutor),
		store:     st,
		eventBus:  eb,
	}
}

func (jm *JobManager) RegisterExecutor(target string, ex JobExecutor) {
	jm.mu.Lock()
	defer jm.mu.Unlock()
	if jm.executors == nil {
		jm.executors = make(map[string]JobExecutor)
	}
	jm.executors[strings.ToLower(strings.TrimSpace(target))] = ex
}

func (jm *JobManager) GetExecutor(target string) JobExecutor {
	jm.mu.RLock()
	defer jm.mu.RUnlock()
	t := strings.ToLower(strings.TrimSpace(target))
	if t == "" {
		t = "local"
	}
	return jm.executors[t]
}

func (jm *JobManager) SubmitExec(ctx context.Context, sessionID, kind string, spec ExecSpec, name, desc string) (string, error) {
	target := strings.ToLower(strings.TrimSpace(spec.Target))
	if target == "" {
		target = "local"
		spec.Target = "local"
	}

	ex := jm.GetExecutor(target)
	if ex == nil {
		return "", fmt.Errorf("未注册目标执行器: %s (可选: local, ssh)", target)
	}

	timeoutSec := spec.TimeoutSec
	if timeoutSec <= 0 {
		timeoutSec = 300
		spec.TimeoutSec = 300
	}

	jobID := jm.Submit(ctx, sessionID, kind, func(jobCtx context.Context, emitProgress ProgressFunc) (string, error) {
		timeoutCtx, cancel := context.WithTimeout(jobCtx, time.Duration(timeoutSec)*time.Second)
		defer cancel()

		emitProgress(0.1, fmt.Sprintf("开始执行 [%s] 指令: %s", target, name), fmt.Sprintf("▶ [%s] 任务启动: %s\n", target, name))

		var outBuf strings.Builder
		execErr := ex.Execute(timeoutCtx, spec, func(line string) {
			outBuf.WriteString(line + "\n")
			emitProgress(0.5, "执行中...", line+"\n")
		})

		if execErr != nil {
			emitProgress(0.0, "执行失败", fmt.Sprintf("❌ 执行失败: %v\n", execErr))
			return outBuf.String(), execErr
		}

		emitProgress(1.0, "执行完成", "✔ 命令执行成功。\n")
		return outBuf.String(), nil
	})

	return jobID, nil
}

type ProgressFunc func(progress float64, message string, newOutput string)

func (jm *JobManager) Submit(
	ctx context.Context,
	sessionID, kind string,
	run func(jobCtx context.Context, emitProgress ProgressFunc) (summary string, err error),
) string {
	jobID := fmt.Sprintf("job_%d", time.Now().UnixNano())

	// Detach from parent tool call's ephemeral cancel/timeout while preserving session & trace context values
	detachedCtx := context.WithoutCancel(ctx)
	jobCtx, cancel := context.WithCancel(detachedCtx)
	now := time.Now()

	j := &Job{
		ID:         jobID,
		SessionID:  sessionID,
		Kind:       kind,
		State:      StatePending,
		Progress:   0,
		CreatedAt:  now,
		cancelFunc: cancel,
	}

	jm.mu.Lock()
	jm.jobs[jobID] = j
	jm.mu.Unlock()

	// Persist initial state
	if jm.store != nil {
		_ = jm.store.SaveJob(store.JobItem{
			ID:        jobID,
			SessionID: sessionID,
			Kind:      kind,
			State:     string(StatePending),
			Progress:  0,
			CreatedAt: now.UnixMilli(),
		})
	}

	// Emit creation event
	if jm.eventBus != nil {
		jm.eventBus.Emit(events.Event{
			Type:      events.EventJobCreated,
			SessionID: sessionID,
			Payload: events.JobProgressPayload{
				JobID:     jobID,
				SessionID: sessionID,
				Progress:  0,
				State:     string(StatePending),
			},
		})
	}

	// Run in background goroutine
	go func() {
		defer cancel()

		j.mu.Lock()
		j.State = StateRunning
		j.StartedAt = time.Now()
		j.mu.Unlock()

		if jm.store != nil {
			_ = jm.store.SaveJob(store.JobItem{
				ID:        jobID,
				SessionID: sessionID,
				Kind:      kind,
				State:     string(StateRunning),
				StartedAt: j.StartedAt.UnixMilli(),
			})
		}

		progressEmit := func(progress float64, message string, newOutput string) {
			j.mu.Lock()
			j.Progress = progress
			j.seq++
			curSeq := j.seq
			j.mu.Unlock()

			if newOutput != "" && jm.store != nil {
				_ = jm.store.AppendJobOutput(jobID, curSeq, newOutput)
			}

			if jm.eventBus != nil {
				jm.eventBus.Emit(events.Event{
					Type:      events.EventJobProgress,
					SessionID: sessionID,
					Payload: events.JobProgressPayload{
						JobID:       jobID,
						SessionID:   sessionID,
						Progress:    progress,
						Description: message,
						NewOutput:   newOutput,
						State:       string(StateRunning),
					},
				})
			}
		}

		summary, err := run(jobCtx, progressEmit)

		j.mu.Lock()
		j.FinishedAt = time.Now()
		duration := j.FinishedAt.Sub(j.StartedAt).Milliseconds()
		if jobCtx.Err() == context.Canceled {
			j.State = StateKilled
			j.Error = "作业已被强制终止"
		} else if err != nil {
			j.State = StateFailed
			j.Error = err.Error()
		} else {
			j.State = StateCompleted
			j.Progress = 1.0
			j.Summary = summary
		}
		finalState := j.State
		finalErr := j.Error
		finalSummary := j.Summary
		j.mu.Unlock()

		// Persist finish state
		if jm.store != nil {
			_ = jm.store.SaveJob(store.JobItem{
				ID:         jobID,
				SessionID:  sessionID,
				Kind:       kind,
				State:      string(finalState),
				Progress:   j.Progress,
				Error:      finalErr,
				Summary:    finalSummary,
				StartedAt:  j.StartedAt.UnixMilli(),
				CreatedAt:  j.CreatedAt.UnixMilli(),
				FinishedAt: j.FinishedAt.UnixMilli(),
			})
		}

		// Emit finish event
		if jm.eventBus != nil {
			jm.eventBus.Emit(events.Event{
				Type:      events.EventJobFinished,
				SessionID: sessionID,
				Payload: events.JobFinishedPayload{
					JobID:     jobID,
					SessionID: sessionID,
					State:     string(finalState),
					Error:     finalErr,
					Summary:   finalSummary,
					Duration:  duration,
				},
			})
		}
	}()

	return jobID
}

func (jm *JobManager) Kill(jobID string) bool {
	jm.mu.RLock()
	j, ok := jm.jobs[jobID]
	jm.mu.RUnlock()

	if !ok || j == nil {
		return false
	}

	j.mu.Lock()
	if j.cancelFunc != nil {
		j.cancelFunc()
	}
	j.State = StateKilled
	j.FinishedAt = time.Now()
	j.mu.Unlock()

	if jm.store != nil {
		_ = jm.store.SaveJob(store.JobItem{
			ID:         jobID,
			SessionID:  j.SessionID,
			Kind:       j.Kind,
			State:      string(StateKilled),
			Progress:   j.Progress,
			StartedAt:  j.StartedAt.UnixMilli(),
			CreatedAt:  j.CreatedAt.UnixMilli(),
			FinishedAt: j.FinishedAt.UnixMilli(),
		})
	}
	return true
}

func (jm *JobManager) KillBySession(sessionID string) {
	if sessionID == "" {
		return
	}
	jm.mu.RLock()
	var targets []*Job
	for _, j := range jm.jobs {
		if j.SessionID == sessionID {
			targets = append(targets, j)
		}
	}
	jm.mu.RUnlock()

	for _, j := range targets {
		j.mu.Lock()
		if j.State == StateRunning || j.State == StatePending || j.State == StateWaitingApproval {
			if j.cancelFunc != nil {
				j.cancelFunc()
			}
			j.State = StateKilled
			j.FinishedAt = time.Now()
			if jm.store != nil {
				_ = jm.store.SaveJob(store.JobItem{
					ID:         j.ID,
					SessionID:  j.SessionID,
					Kind:       j.Kind,
					State:      string(StateKilled),
					Progress:   j.Progress,
					StartedAt:  j.StartedAt.UnixMilli(),
					CreatedAt:  j.CreatedAt.UnixMilli(),
					FinishedAt: j.FinishedAt.UnixMilli(),
				})
			}
		}
		j.mu.Unlock()
	}
}

func (jm *JobManager) GetJob(jobID string) (*store.JobItem, error) {
	if jm.store == nil {
		return nil, fmt.Errorf("存储未就绪")
	}
	return jm.store.GetJob(jobID)
}

func (jm *JobManager) ListJobs(sessionID string) ([]store.JobItem, error) {
	if jm.store == nil {
		return nil, fmt.Errorf("存储未就绪")
	}
	return jm.store.ListJobs(sessionID)
}

func (jm *JobManager) Output(jobID string, fromSeq int) ([]store.JobOutputItem, error) {
	if jm.store == nil {
		return nil, fmt.Errorf("存储未就绪")
	}
	return jm.store.GetJobOutputs(jobID, fromSeq)
}

func (jm *JobManager) Wait(ctx context.Context, jobID string) (*store.JobItem, string, error) {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil, "", ctx.Err()
		case <-ticker.C:
			j, err := jm.GetJob(jobID)
			if err != nil {
				return nil, "", err
			}
			if j == nil {
				return nil, "", fmt.Errorf("job %s not found", jobID)
			}
			if j.State == string(StateCompleted) {
				return j, j.Summary, nil
			}
			if j.State == string(StateFailed) || j.State == string(StateKilled) {
				errMsg := j.Error
				if errMsg == "" {
					errMsg = "job ended with state " + j.State
				}
				return j, j.Summary, fmt.Errorf("%s", errMsg)
			}
		}
	}
}
