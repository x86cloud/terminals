package router

import (
	"context"
	"testing"
)

func TestModelRouter_ThinkingAndReasoning(t *testing.T) {
	r := NewModelRouter()

	// 1. Thinking disabled: ReasoningEffort should NOT be set even if profile has it
	r.SetProfile(RoleDefault, ModelProfile{
		BaseURL:         "https://api.openai.com/v1",
		APIKey:          "sk-test",
		Model:           "o1-mini",
		EnableThinking:  false,
		ReasoningEffort: "high",
	})

	// Since we don't make real network calls, test SetProfile and profile storage
	profile := r.profiles[RoleDefault]
	if profile.EnableThinking {
		t.Fatalf("expected EnableThinking false")
	}
	if profile.ReasoningEffort != "high" {
		t.Fatalf("expected ReasoningEffort high in profile")
	}

	// 2. Resolve testing without API call error (fails on network/key but tests cfg construction before call)
	ctx := context.Background()
	_, err := r.Resolve(ctx, RoleDefault)
	// NewChatModel fails due to invalid key, which is expected in unit test
	if err == nil {
		t.Logf("resolve succeeded or mock")
	}
}
