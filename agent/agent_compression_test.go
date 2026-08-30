package agent

import (
	"context"
	"strings"
	"testing"

	"terminal/core"
)

func TestAgentManager_ApplyContextCompression_NoneStrategy(t *testing.T) {
	mgr := &AgentManager{
		cfg: core.AppSettings{
			AiModelContextTokens:   1000,
			AiContextCompressRatio: 80,
			AiMaxContextTokens:     10, // very small
			AiCompressionStrategy:  "none",
		},
	}

	msgs := []FrontendMessage{
		{Role: "user", Content: "Hello this is a long message that would exceed tokens"},
		{Role: "assistant", Content: "Hi there, response message"},
		{Role: "user", Content: "Another message"},
		{Role: "assistant", Content: "Another response"},
		{Role: "user", Content: "Fifth message"},
	}

	out, notice := mgr.applyContextCompression(context.Background(), msgs)
	if notice != "" {
		t.Fatalf("expected empty notice for 'none' strategy, got: %s", notice)
	}
	if len(out) != len(msgs) {
		t.Fatalf("expected len %d, got %d", len(msgs), len(out))
	}
}

func TestAgentManager_ApplyContextCompression_SlidingStrategy(t *testing.T) {
	mgr := &AgentManager{
		cfg: core.AppSettings{
			AiModelContextTokens:   100,
			AiContextCompressRatio: 80,
			AiMaxContextTokens:     10, // force trigger
			AiCompressionStrategy:  "sliding",
		},
	}

	msgs := []FrontendMessage{
		{Role: "user", Content: strings.Repeat("a", 50)},
		{Role: "assistant", Content: strings.Repeat("b", 50)},
		{Role: "user", Content: strings.Repeat("c", 50)},
		{Role: "assistant", Content: strings.Repeat("d", 50)},
		{Role: "user", Content: strings.Repeat("e", 50)},
		{Role: "assistant", Content: strings.Repeat("f", 50)},
	}

	out, notice := mgr.applyContextCompression(context.Background(), msgs)
	if !strings.Contains(notice, "滑动窗口") {
		t.Fatalf("expected sliding window notice, got: %s", notice)
	}
	if len(out) >= len(msgs) {
		t.Fatalf("expected messages to be truncated, before: %d, after: %d", len(msgs), len(out))
	}
}

func TestAgentManager_ApplyContextCompression_DynamicThreshold(t *testing.T) {
	mgr := &AgentManager{
		cfg: core.AppSettings{
			AiModelContextTokens:   1000,
			AiContextCompressRatio: 80, // 800 tokens threshold
			AiMaxContextTokens:     0,  // should be dynamically computed as 800
			AiCompressionStrategy:  "sliding",
		},
	}

	// 100 chars total ~ 33 tokens, well below 800 tokens
	msgs := []FrontendMessage{
		{Role: "user", Content: "short message 1"},
		{Role: "assistant", Content: "short reply 1"},
		{Role: "user", Content: "short message 2"},
		{Role: "assistant", Content: "short reply 2"},
		{Role: "user", Content: "short message 3"},
	}

	out, notice := mgr.applyContextCompression(context.Background(), msgs)
	if notice != "" {
		t.Fatalf("expected no compression for small token count, got notice: %s", notice)
	}
	if len(out) != len(msgs) {
		t.Fatalf("expected %d messages, got %d", len(msgs), len(out))
	}
}
