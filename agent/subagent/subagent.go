package subagent

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"terminal/agent/events"
	"terminal/agent/store"
)

type SubagentState string

const (
	StateRunning     SubagentState = "running"
	StateCompleted   SubagentState = "completed"
	StateFailed      SubagentState = "failed"
	StateInterrupted SubagentState = "interrupted"
)

type Subagent struct {
	ID        string
	ParentID  string
	SessionID string
	Prompt    string
	State     SubagentState
	Result    string
	Depth     int
	Workspace string

	cancelFunc context.CancelFunc
	mu         sync.RWMutex
}

type SubagentRunnerFunc func(ctx context.Context, subID, prompt string) (result string, err error)

type SubagentManager struct {
	mu          sync.RWMutex
	subagents   map[string]*Subagent
	store       *store.Store
	eventBus    *events.EventBus
	runner      SubagentRunnerFunc
	maxDepth    int
	maxParallel int
	activeCount int
}

func NewSubagentManager(st *store.Store, eb *events.EventBus, runner SubagentRunnerFunc) *SubagentManager {
	return &SubagentManager{
		subagents:   make(map[string]*Subagent),
		store:       st,
		eventBus:    eb,
		runner:      runner,
		maxDepth:    3,
		maxParallel: 8,
	}
}

func (sm *SubagentManager) SetRunner(runner SubagentRunnerFunc) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.runner = runner
}

func (sm *SubagentManager) Spawn(
	ctx context.Context,
	parentID, sessionID, prompt, expectedSchema string,
	depth int,
) (string, error) {
	sm.mu.Lock()
	if depth > sm.maxDepth {
		sm.mu.Unlock()
		return "", fmt.Errorf("子代理委派已超过最大递归深度上限 (%d)", sm.maxDepth)
	}
	if sm.activeCount >= sm.maxParallel {
		sm.mu.Unlock()
		return "", fmt.Errorf("当前并发子代理数量已达系统上限 (%d)", sm.maxParallel)
	}
	sm.activeCount++
	sm.mu.Unlock()

	subID := fmt.Sprintf("sub_%d", time.Now().UnixNano())
	// Detach from parent tool call's ephemeral cancel/timeout while preserving session & trace context values
	detachedCtx := context.WithoutCancel(ctx)
	subCtx, cancel := context.WithCancel(detachedCtx)
	now := time.Now().UnixMilli()

	sub := &Subagent{
		ID:         subID,
		ParentID:   parentID,
		SessionID:  sessionID,
		Prompt:     prompt,
		State:      StateRunning,
		Depth:      depth,
		cancelFunc: cancel,
	}

	sm.mu.Lock()
	sm.subagents[subID] = sub
	sm.mu.Unlock()

	if sm.store != nil {
		_ = sm.store.SaveSubagent(store.SubagentItem{
			ID:        subID,
			ParentID:  parentID,
			SessionID: sessionID,
			Prompt:    prompt,
			State:     string(StateRunning),
			Depth:     depth,
			CreatedAt: now,
		})
	}

	if sm.eventBus != nil {
		sm.eventBus.Emit(events.Event{
			Type:      events.EventSubagentCreated,
			SessionID: sessionID,
			Payload: events.SubagentEventPayload{
				SubagentID: subID,
				ParentID:   parentID,
				SessionID:  sessionID,
				Prompt:     prompt,
				State:      string(StateRunning),
			},
		})
	}

	// Run in background goroutine
	go func() {
		defer func() {
			cancel()
			sm.mu.Lock()
			sm.activeCount--
			sm.mu.Unlock()
		}()

		var res string
		var err error

		if sm.runner != nil {
			res, err = sm.runner(subCtx, subID, prompt)
		} else {
			res = fmt.Sprintf("【子代理执行完成】: %s", prompt)
		}

		sub.mu.Lock()
		if subCtx.Err() == context.Canceled {
			sub.State = StateInterrupted
		} else if err != nil {
			sub.State = StateFailed
			sub.Result = fmt.Sprintf("执行错误: %v", err)
		} else {
			sub.State = StateCompleted
			// Validate structured schema if requested
			if expectedSchema != "" {
				var dummy any
				if err := json.Unmarshal([]byte(res), &dummy); err != nil {
					sub.Result = fmt.Sprintf(`{"raw_output": %q}`, res)
				} else {
					sub.Result = res
				}
			} else {
				sub.Result = res
			}
		}
		finalState := sub.State
		finalRes := sub.Result
		sub.mu.Unlock()

		finishedAt := time.Now().UnixMilli()
		if sm.store != nil {
			_ = sm.store.SaveSubagent(store.SubagentItem{
				ID:         subID,
				State:      string(finalState),
				Result:     finalRes,
				FinishedAt: finishedAt,
			})
		}

		if sm.eventBus != nil {
			sm.eventBus.Emit(events.Event{
				Type:      events.EventSubagentFinished,
				SessionID: sessionID,
				Payload: events.SubagentEventPayload{
					SubagentID: subID,
					ParentID:   parentID,
					SessionID:  sessionID,
					Prompt:     prompt,
					State:      string(finalState),
					Result:     finalRes,
				},
			})
		}
	}()

	return subID, nil
}

func (sm *SubagentManager) Interrupt(subID string) bool {
	sm.mu.RLock()
	sub, ok := sm.subagents[subID]
	sm.mu.RUnlock()

	if !ok || sub == nil {
		return false
	}

	sub.mu.Lock()
	if sub.cancelFunc != nil {
		sub.cancelFunc()
	}
	sub.State = StateInterrupted
	sub.mu.Unlock()

	if sm.store != nil {
		_ = sm.store.SaveSubagent(store.SubagentItem{
			ID:         subID,
			State:      string(StateInterrupted),
			FinishedAt: time.Now().UnixMilli(),
		})
	}
	return true
}

func (sm *SubagentManager) InterruptBySession(sessionID string) {
	if sessionID == "" {
		return
	}
	sm.mu.RLock()
	var targets []*Subagent
	for _, sub := range sm.subagents {
		if sub.SessionID == sessionID {
			targets = append(targets, sub)
		}
	}
	sm.mu.RUnlock()

	for _, sub := range targets {
		sub.mu.Lock()
		if sub.State == StateRunning {
			if sub.cancelFunc != nil {
				sub.cancelFunc()
			}
			sub.State = StateInterrupted
			if sm.store != nil {
				_ = sm.store.SaveSubagent(store.SubagentItem{
					ID:         sub.ID,
					State:      string(StateInterrupted),
					FinishedAt: time.Now().UnixMilli(),
				})
			}
		}
		sub.mu.Unlock()
	}
}

func (sm *SubagentManager) Send(ctx context.Context, subID string, message string) (string, error) {
	sm.mu.RLock()
	sub, ok := sm.subagents[subID]
	runner := sm.runner
	sm.mu.RUnlock()

	if !ok || sub == nil {
		return "", fmt.Errorf("子代理 [%s] 不存在", subID)
	}

	if runner == nil {
		return "", fmt.Errorf("子代理执行器未就绪")
	}

	combinedPrompt := fmt.Sprintf("上下文历史: %s\n\n用户追加问题: %s", sub.Prompt, message)
	res, err := runner(ctx, subID, combinedPrompt)
	if err != nil {
		return "", err
	}

	sub.mu.Lock()
	sub.Result = res
	sub.Prompt = combinedPrompt
	sub.mu.Unlock()

	if sm.store != nil {
		_ = sm.store.SaveSubagent(store.SubagentItem{
			ID:         subID,
			State:      string(StateCompleted),
			Result:     res,
			Prompt:     combinedPrompt,
			FinishedAt: time.Now().UnixMilli(),
		})
	}

	if sm.eventBus != nil {
		sm.eventBus.Emit(events.Event{
			Type:      events.EventSubagentFinished,
			SessionID: sub.SessionID,
			Payload: events.SubagentEventPayload{
				SubagentID: subID,
				ParentID:   sub.ParentID,
				SessionID:  sub.SessionID,
				Prompt:     combinedPrompt,
				State:      string(StateCompleted),
				Result:     res,
			},
		})
	}

	return res, nil
}

func (sm *SubagentManager) List(sessionID string) ([]store.SubagentItem, error) {
	if sm.store == nil {
		return nil, fmt.Errorf("存储未就绪")
	}
	return sm.store.ListSubagents(sessionID)
}

func (sm *SubagentManager) Get(subID string) (*store.SubagentItem, error) {
	if sm.store == nil {
		return nil, fmt.Errorf("存储未就绪")
	}
	return sm.store.GetSubagent(subID)
}

func (sm *SubagentManager) Wait(ctx context.Context, subID string) (*store.SubagentItem, string, error) {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil, "", ctx.Err()
		case <-ticker.C:
			sm.mu.RLock()
			memSub, inMem := sm.subagents[subID]
			sm.mu.RUnlock()

			if inMem && memSub != nil {
				memSub.mu.RLock()
				state := memSub.State
				res := memSub.Result
				memSub.mu.RUnlock()

				if state == StateCompleted {
					return &store.SubagentItem{
						ID:        subID,
						ParentID:  memSub.ParentID,
						SessionID: memSub.SessionID,
						Prompt:    memSub.Prompt,
						State:     string(state),
						Result:    res,
						Depth:     memSub.Depth,
					}, res, nil
				}
				if state == StateFailed || state == StateInterrupted {
					errMsg := res
					if errMsg == "" {
						errMsg = "subagent ended with state " + string(state)
					}
					return &store.SubagentItem{
						ID:        subID,
						ParentID:  memSub.ParentID,
						SessionID: memSub.SessionID,
						Prompt:    memSub.Prompt,
						State:     string(state),
						Result:    res,
						Depth:     memSub.Depth,
					}, res, fmt.Errorf("%s", errMsg)
				}
			}

			sub, err := sm.Get(subID)
			if err == nil && sub != nil {
				if sub.State == string(StateCompleted) {
					return sub, sub.Result, nil
				}
				if sub.State == string(StateFailed) || sub.State == string(StateInterrupted) {
					errMsg := sub.Result
					if errMsg == "" {
						errMsg = "subagent ended with state " + sub.State
					}
					return sub, sub.Result, fmt.Errorf("%s", errMsg)
				}
			}
		}
	}
}
