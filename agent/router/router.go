package router

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/cloudwego/eino-ext/components/model/openai"
)

type ModelRole string

const (
	RoleDefault  ModelRole = "default"
	RolePlanner  ModelRole = "planner"
	RoleVerifier ModelRole = "verifier"
)

type ModelProfile struct {
	BaseURL         string  `json:"base_url"`
	APIKey          string  `json:"api_key"`
	Model           string  `json:"model"`
	Temperature     float32 `json:"temperature"`
	EnableThinking  bool    `json:"enable_thinking"`
	ReasoningEffort string  `json:"reasoning_effort"`
}

type ResolvedModel struct {
	Role    ModelRole
	Model   *openai.ChatModel
	Profile ModelProfile
}

type ModelRouter struct {
	mu       sync.RWMutex
	profiles map[ModelRole]ModelProfile
	models   map[ModelRole]*openai.ChatModel
}

func NewModelRouter() *ModelRouter {
	return &ModelRouter{
		profiles: make(map[ModelRole]ModelProfile),
		models:   make(map[ModelRole]*openai.ChatModel),
	}
}

func (r *ModelRouter) SetProfile(role ModelRole, profile ModelProfile) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.profiles[role] = profile
	delete(r.models, role) // Invalidate cached model
}

func (r *ModelRouter) Resolve(ctx context.Context, role ModelRole) (*ResolvedModel, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Check if configured for this specific role
	profile, ok := r.profiles[role]
	if !ok || strings.TrimSpace(profile.APIKey) == "" {
		// Fallback to default
		profile, ok = r.profiles[RoleDefault]
		if !ok || strings.TrimSpace(profile.APIKey) == "" {
			return nil, fmt.Errorf("模型路由未配置有效 API Key")
		}
		role = RoleDefault
	}

	if cm, cached := r.models[role]; cached && cm != nil {
		return &ResolvedModel{Role: role, Model: cm, Profile: profile}, nil
	}

	temp := profile.Temperature
	if temp <= 0 {
		temp = 0.7
	}
	baseURL := strings.TrimSpace(profile.BaseURL)
	if baseURL == "" {
		baseURL = "https://api.deepseek.com"
	}

	cfg := &openai.ChatModelConfig{
		BaseURL:     baseURL,
		APIKey:      strings.TrimSpace(profile.APIKey),
		Model:       strings.TrimSpace(profile.Model),
		Temperature: &temp,
	}

	if profile.EnableThinking {
		cfg.ExtraFields = map[string]any{
			"thinking": map[string]any{
				"type": "enabled",
			},
		}
	}
	if profile.ReasoningEffort != "" && profile.ReasoningEffort != "none" {
		cfg.ReasoningEffort = openai.ReasoningEffortLevel(profile.ReasoningEffort)
	}

	cm, err := openai.NewChatModel(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("创建模型 [%s] 失败: %w", role, err)
	}

	r.models[role] = cm
	return &ResolvedModel{Role: role, Model: cm, Profile: profile}, nil
}
