package tools_test

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"terminal/agent/events"
	"terminal/agent/guard"
	"terminal/agent/tools"

	"github.com/cloudwego/eino/components/tool/utils"
)

type echoInput struct {
	Msg string `json:"msg"`
}

func TestToolBus_Invoke_AllowToolLifecycle(t *testing.T) {
	eb := events.NewEventBus()
	g := guard.NewPolicyGuard(true, false, nil)
	tb := tools.NewToolBus(g, eb)

	var mu sync.Mutex
	var receivedEvents []events.Event
	record := func(ev events.Event) {
		mu.Lock()
		defer mu.Unlock()
		receivedEvents = append(receivedEvents, ev)
	}

	eb.Subscribe(events.EventToolStart, record)
	eb.Subscribe(events.EventToolEvent, record)

	echoTool, err := utils.InferTool("echo_test", "echo test", func(ctx context.Context, input *echoInput) (string, error) {
		return "echo: " + input.Msg, nil
	})
	if err != nil {
		t.Fatalf("failed to infer tool: %v", err)
	}

	tb.Register(&tools.RegisteredTool{
		Name:     "echo_test",
		BaseTool: echoTool,
		Level:    guard.LevelAllow,
		Timeout:  10 * time.Second,
	})

	res := tb.Invoke(context.Background(), "trace_1", "single_session", "echo_test", `{"msg":"hello"}`)
	if !res.OK {
		t.Fatalf("expected tool invoke OK, got error: %s", res.Error)
	}

	time.Sleep(100 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()

	// Check event order: ToolStart -> ToolEvent
	if len(receivedEvents) < 2 {
		t.Fatalf("expected at least 2 events (ToolStart, ToolEvent), got %d", len(receivedEvents))
	}
	if receivedEvents[0].Type != events.EventToolStart {
		t.Fatalf("expected first event to be ToolStart, got %v", receivedEvents[0].Type)
	}
	if receivedEvents[1].Type != events.EventToolEvent {
		t.Fatalf("expected second event to be ToolEvent, got %v", receivedEvents[1].Type)
	}
}

func TestToolBus_Execute_LevelConfirm_Approved(t *testing.T) {
	eb := events.NewEventBus()
	g := guard.NewPolicyGuard(true, false, nil)
	hm := guard.NewHitlManager(eb)
	g.SetHitlManager(hm)
	tb := tools.NewToolBus(g, eb)

	tb.Register(&tools.RegisteredTool{
		Name:        "dangerous_op",
		Description: "高危写操作",
		Level:       guard.LevelConfirm,
		Handler: func(ctx context.Context, input string) (any, error) {
			return "op_success", nil
		},
	})

	done := make(chan *tools.ToolResult)
	go func() {
		res := tb.Invoke(context.Background(), "trace_hitl_1", "single_session", "dangerous_op", `{"action":"delete"}`)
		done <- res
	}()

	time.Sleep(30 * time.Millisecond)
	list := hm.ListPending()
	if len(list) != 1 {
		t.Fatalf("expected 1 pending HITL confirmation, got %d", len(list))
	}

	ok := hm.ResolveApproval(list[0].ConfirmID, true, "")
	if !ok {
		t.Fatalf("ResolveApproval failed")
	}

	select {
	case res := <-done:
		if !res.OK {
			t.Fatalf("expected tool to execute successfully after approval, got error: %s", res.Error)
		}
		if res.Data != "op_success" {
			t.Fatalf("expected 'op_success', got %v", res.Data)
		}
	case <-time.After(1 * time.Second):
		t.Fatalf("timeout waiting for tool execution after approval")
	}
}

func TestToolBus_Execute_LevelConfirm_RejectedWithReason(t *testing.T) {
	eb := events.NewEventBus()
	g := guard.NewPolicyGuard(true, false, nil)
	hm := guard.NewHitlManager(eb)
	g.SetHitlManager(hm)
	tb := tools.NewToolBus(g, eb)

	executed := false
	tb.Register(&tools.RegisteredTool{
		Name:        "dangerous_delete",
		Description: "高危删除操作",
		Level:       guard.LevelConfirm,
		Handler: func(ctx context.Context, input string) (any, error) {
			executed = true
			return "deleted", nil
		},
	})

	done := make(chan *tools.ToolResult)
	go func() {
		res := tb.Invoke(context.Background(), "trace_hitl_2", "single_session", "dangerous_delete", `{"path":"/important"}`)
		done <- res
	}()

	time.Sleep(30 * time.Millisecond)
	list := hm.ListPending()
	if len(list) != 1 {
		t.Fatalf("expected 1 pending HITL confirmation, got %d", len(list))
	}

	ok := hm.ResolveApproval(list[0].ConfirmID, false, "路径受保护，请更换目标")
	if !ok {
		t.Fatalf("ResolveApproval failed")
	}

	select {
	case res := <-done:
		if res.OK {
			t.Fatalf("expected tool to be rejected, but got OK")
		}
		if executed {
			t.Fatalf("handler should NOT have been executed when rejected")
		}
		if !strings.Contains(res.Error, "用户审批拒绝") || !strings.Contains(res.Error, "路径受保护，请更换目标") {
			t.Fatalf("error message does not contain user reason: %s", res.Error)
		}
	case <-time.After(1 * time.Second):
		t.Fatalf("timeout waiting for tool rejection response")
	}
}
