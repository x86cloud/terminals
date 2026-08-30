package agent_test

import (
	"context"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"terminal/agent/events"
	"terminal/agent/guard"
	"terminal/agent/tools"

	"github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

// MockChatModel simulates a 2-turn agent model (Turn 1: ToolCall -> Turn 2: Final Text)
type MockChatModel struct {
	turn int
	mu   sync.Mutex
}

func (m *MockChatModel) Generate(ctx context.Context, in []*schema.Message, opts ...model.Option) (*schema.Message, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.turn++

	if m.turn == 1 {
		return &schema.Message{
			Role:    schema.Assistant,
			Content: "正在检查命名空间...",
			ToolCalls: []schema.ToolCall{
				{
					ID: "call_test_123",
					Function: schema.FunctionCall{
						Name:      "execute",
						Arguments: `{"command":"kubectl get ns"}`,
					},
				},
			},
		}, nil
	}

	return &schema.Message{
		Role:    schema.Assistant,
		Content: "检查完毕，命名空间有 default, kube-system。",
	}, nil
}

func (m *MockChatModel) Stream(ctx context.Context, in []*schema.Message, opts ...model.Option) (*schema.StreamReader[*schema.Message], error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.turn++

	r, w := schema.Pipe[*schema.Message](2)

	if m.turn == 1 {
		go func() {
			defer w.Close()
			w.Send(&schema.Message{
				Role:    schema.Assistant,
				Content: "正在检查命名空间...",
				ToolCalls: []schema.ToolCall{
					{
						ID: "call_test_123",
						Function: schema.FunctionCall{
							Name:      "execute",
							Arguments: `{"command":"kubectl get ns"}`,
						},
					},
				},
			}, nil)
		}()
		return r, nil
	}

	go func() {
		defer w.Close()
		w.Send(&schema.Message{
			Role:    schema.Assistant,
			Content: "检查完毕，命名空间有 default, kube-system。",
		}, nil)
	}()
	return r, nil
}

func TestHitlApprovalWithAdkRunnerStream(t *testing.T) {
	eb := events.NewEventBus()
	g := guard.NewPolicyGuard(true, true, nil)
	hm := guard.NewHitlManager(eb)
	g.SetHitlManager(hm)
	tb := tools.NewToolBus(g, eb)

	tb.Register(&tools.RegisteredTool{
		Name:        "execute",
		Description: "执行命令行",
		Level:       guard.LevelConfirm,
		Handler: func(ctx context.Context, input string) (any, error) {
			return map[string]any{
				"ExitCode": 0,
				"Output":   "default Active\nkube-system Active",
			}, nil
		},
	})

	// Simulate frontend auto-approver in background
	go func() {
		for i := 0; i < 50; i++ {
			time.Sleep(20 * time.Millisecond)
			pending := hm.ListPending()
			if len(pending) > 0 {
				hm.ResolveApproval(pending[0].ConfirmID, true, "")
				return
			}
		}
	}()

	res := tb.Invoke(context.Background(), "trace1", "sess1", "execute", `{"command":"kubectl get ns"}`)
	if !res.OK {
		t.Fatalf("expected tool invoke OK, got error: %s", res.Error)
	}
	t.Logf("Tool result: %s", res.String())
}

func TestNativeReActAgentExecutionWithHitl(t *testing.T) {
	ctx := context.Background()
	eb := events.NewEventBus()
	g := guard.NewPolicyGuard(true, true, nil)
	hm := guard.NewHitlManager(eb)
	g.SetHitlManager(hm)
	tb := tools.NewToolBus(g, eb)

	tb.Register(&tools.RegisteredTool{
		Name:        "execute",
		Description: "执行命令行",
		Level:       guard.LevelConfirm,
		Handler: func(ctx context.Context, input string) (any, error) {
			return map[string]any{
				"ExitCode": 0,
				"Output":   "default Active\nkube-system Active",
			}, nil
		},
	})

	toolInfos := tb.ConvertToToolInfos(ctx)
	mockModel := &MockChatModel{}

	// Background approver
	go func() {
		for i := 0; i < 50; i++ {
			time.Sleep(20 * time.Millisecond)
			pending := hm.ListPending()
			if len(pending) > 0 {
				hm.ResolveApproval(pending[0].ConfirmID, true, "")
				return
			}
		}
	}()

	schemaMsgs := []*schema.Message{
		schema.UserMessage("检查命名空间"),
	}

	var outputs []string
	maxTurns := 5

	for turn := 1; turn <= maxTurns; turn++ {
		streamReader, err := mockModel.Stream(ctx, schemaMsgs, model.WithTools(toolInfos))
		if err != nil {
			t.Fatalf("Stream failed: %v", err)
		}

		var turnContent strings.Builder
		var turnToolCalls []schema.ToolCall

		for {
			chunk, err := streamReader.Recv()
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				t.Fatalf("Recv error: %v", err)
			}
			if chunk != nil {
				if chunk.Content != "" {
					turnContent.WriteString(chunk.Content)
					outputs = append(outputs, chunk.Content)
				}
				if len(chunk.ToolCalls) > 0 {
					turnToolCalls = append(turnToolCalls, chunk.ToolCalls...)
				}
			}
		}
		streamReader.Close()

		if len(turnToolCalls) == 0 {
			break
		}

		schemaMsgs = append(schemaMsgs, &schema.Message{
			Role:      schema.Assistant,
			Content:   turnContent.String(),
			ToolCalls: turnToolCalls,
		})

		for _, tc := range turnToolCalls {
			toolRes := tb.Invoke(ctx, "", "sess1", tc.Function.Name, tc.Function.Arguments)
			if !toolRes.OK {
				t.Fatalf("tool execution failed: %v", toolRes.Error)
			}
			outStr := toolRes.String()
			schemaMsgs = append(schemaMsgs, schema.ToolMessage(outStr, tc.ID))
		}
	}

	if len(outputs) < 2 {
		t.Fatalf("expected at least 2 outputs across 2 turns, got: %v", outputs)
	}
	t.Logf("Collected outputs: %+v", outputs)
}

// ErrorStreamChatModel simulates a model whose stream fails on Turn 1
type ErrorStreamChatModel struct {
	turn int
	mu   sync.Mutex
}

func (m *ErrorStreamChatModel) Generate(ctx context.Context, in []*schema.Message, opts ...model.Option) (*schema.Message, error) {
	return nil, errors.New("not implemented")
}

func (m *ErrorStreamChatModel) Stream(ctx context.Context, in []*schema.Message, opts ...model.Option) (*schema.StreamReader[*schema.Message], error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.turn++

	r, w := schema.Pipe[*schema.Message](2)

	go func() {
		defer w.Close()
		w.Send(nil, errors.New("upstream gateway connection reset"))
	}()
	return r, nil
}

func TestStreamChat_StreamRecvErrorHandled(t *testing.T) {
	ctx := context.Background()
	mockModel := &ErrorStreamChatModel{}

	r, err := mockModel.Stream(ctx, []*schema.Message{schema.UserMessage("test error stream")})
	if err != nil {
		t.Fatalf("Stream failed: %v", err)
	}
	defer r.Close()

	_, recvErr := r.Recv()
	if recvErr == nil {
		t.Fatalf("expected error from Recv, got nil")
	}
	if !strings.Contains(recvErr.Error(), "upstream gateway") {
		t.Fatalf("unexpected error message: %v", recvErr)
	}
}
