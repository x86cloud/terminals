package agent

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"
	"terminal/core"
	"terminal/ssh"
	"time"

	"github.com/cloudwego/eino-ext/components/model/openai"
	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/compose"
	"github.com/cloudwego/eino/flow/agent/react"
	"github.com/cloudwego/eino/schema"
)

type ToolCallItem struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Args string `json:"args"`
}

type ProcessStep struct {
	ID        string `json:"id"`
	Type      string `json:"type"` // "think" | "tool"
	Title     string `json:"title"`
	Summary   string `json:"summary,omitempty"`
	Content   string `json:"content"`
	Timestamp int64  `json:"timestamp"`
	Status    string `json:"status,omitempty"`
}

type FrontendMessage struct {
	Role             string         `json:"role"`
	Content          string         `json:"content"`
	ReasoningContent string         `json:"reasoning_content,omitempty"`
	ProcessSteps     []ProcessStep  `json:"process_steps,omitempty"`
	Images           []string       `json:"images,omitempty"`
	ToolCalls        []ToolCallItem `json:"tool_calls,omitempty"`
	ToolCallID       string         `json:"tool_call_id,omitempty"`
	Name             string         `json:"name,omitempty"`
	Timestamp        int64          `json:"timestamp,omitempty"`
}

type AgentManager struct {
	mu        sync.RWMutex
	ctx       context.Context
	cfg       core.AppSettings
	cm        *openai.ChatModel
	agent     *react.Agent
	storage   *Storage
	sshMgr    *ssh.SessionManager
	cancelMap sync.Map // sessionID -> context.CancelFunc
}

var DefaultManager = NewAgentManager()

func NewAgentManager() *AgentManager {
	return &AgentManager{
		storage: NewStorage(),
	}
}

func (m *AgentManager) SetContext(ctx context.Context) {
	m.ctx = ctx
}

func (m *AgentManager) SetSSHManager(sm *ssh.SessionManager) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sshMgr = sm
}

func (m *AgentManager) Storage() *Storage {
	return m.storage
}

func (m *AgentManager) InitOrUpdate(cfg core.AppSettings) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.cfg = cfg
	if strings.TrimSpace(cfg.AiAPIKey) == "" {
		m.cm = nil
		m.agent = nil
		return nil
	}

	temp := float32(cfg.AiTemperature)
	if temp <= 0 {
		temp = 0.7
	}

	baseURL := strings.TrimSpace(cfg.AiBaseURL)
	if baseURL == "" {
		baseURL = "https://api.deepseek.com"
	}

	modelConfig := &openai.ChatModelConfig{
		BaseURL:     baseURL,
		APIKey:      strings.TrimSpace(cfg.AiAPIKey),
		Model:       strings.TrimSpace(cfg.AiModel),
		Temperature: &temp,
	}

	if cfg.AiEnableThinking {
		modelConfig.ExtraFields = map[string]any{
			"thinking": map[string]any{
				"type": "enabled",
			},
		}
	}
	effort := strings.TrimSpace(cfg.AiReasoningEffort)
	if effort != "" && effort != "none" {
		modelConfig.ReasoningEffort = openai.ReasoningEffortLevel(effort)
	}

	ctx := m.ctx
	if ctx == nil {
		ctx = context.Background()
	}

	cm, err := openai.NewChatModel(ctx, modelConfig)
	if err != nil {
		return fmt.Errorf("创建 Eino OpenAI ChatModel 失败: %w", err)
	}

	if cfg.AiWorkspaceDir != "" && DefaultWorkspaceMgr.GetDir() == "" {
		DefaultWorkspaceMgr.SetDir(cfg.AiWorkspaceDir)
	}

	guard := NewPermissionGuard(cfg.AiEnablePermissionGuard, cfg.AiBlockHighRiskCommands, DefaultWorkspaceMgr)

	var rawTools []tool.BaseTool
	workspaceTools, _ := BuildWorkspaceTools(DefaultWorkspaceMgr)
	rawTools = append(rawTools, workspaceTools...)

	if cfg.AiEnableWebSearch {
		if webSearchTool, err := BuildWebSearchTool(DefaultWorkspaceMgr); err == nil {
			rawTools = append(rawTools, webSearchTool)
		}
	}

	if m.sshMgr != nil {
		if sshTools, err := BuildSSHTools(m.sshMgr, DefaultWorkspaceMgr); err == nil {
			rawTools = append(rawTools, sshTools...)
		}
	}

	var wrappedTools []tool.BaseTool
	for _, t := range rawTools {
		wrappedTools = append(wrappedTools, WrapToolWithPermissionGuard(t, guard))
	}

	ag, err := react.NewAgent(ctx, &react.AgentConfig{
		ToolCallingModel: cm,
		Model:            cm,
		MaxStep:          100,
		ToolsConfig: compose.ToolsNodeConfig{
			Tools: wrappedTools,
		},
		StreamToolCallChecker: func(ctx context.Context, sr *schema.StreamReader[*schema.Message]) (bool, error) {
			defer sr.Close()
			hasToolCall := false
			for {
				msg, err := sr.Recv()
				if errors.Is(err, io.EOF) {
					break
				}
				if err != nil {
					return false, err
				}
				if msg != nil && len(msg.ToolCalls) > 0 {
					hasToolCall = true
				}
			}
			return hasToolCall, nil
		},
	})
	if err != nil {
		return fmt.Errorf("创建 Eino ChatModelAgent 失败: %w", err)
	}

	m.cm = cm
	m.agent = ag
	return nil
}

func (m *AgentManager) buildSchemaMessages(messages []FrontendMessage, sysPrompt string) []*schema.Message {
	var out []*schema.Message
	// 加入当前系统时间
	currentTime := time.Now().Format("2006-01-02 15:04:05")
	sysPrompt = fmt.Sprintf("%s\n当前系统时间为: [%s]。", sysPrompt, currentTime)
	wsDir := DefaultWorkspaceMgr.GetDir()
	if wsDir != "" {
		sysPrompt = fmt.Sprintf("%s\n当前绑定的工作目录为: [%s]。", sysPrompt, wsDir)
	}

	if m.sshMgr != nil {
		sessions := m.sshMgr.List()
		var activeHosts []string
		for _, s := range sessions {
			if s.Connected {
				activeHosts = append(activeHosts, fmt.Sprintf("%s (%s:%d)", s.Title, s.Host, s.Port))
			}
		}
		if len(activeHosts) > 0 {
			sysPrompt = fmt.Sprintf("%s\n当前客户端共有 [%d] 个已连通激活的远程 SSH 服务器: [%s]。你可以使用 SSH 工具进行系统概况查询、文件与 Shell 命令行运维。",
				sysPrompt, len(activeHosts), strings.Join(activeHosts, ", "))
		}
	}

	if strings.TrimSpace(sysPrompt) != "" {
		out = append(out, schema.SystemMessage(sysPrompt))
	}

	for _, msg := range messages {
		role := strings.ToLower(msg.Role)
		content := msg.Content

		switch role {
		case "system":
			out = append(out, schema.SystemMessage(content))
		case "assistant":
			var toolCalls []schema.ToolCall
			for _, tc := range msg.ToolCalls {
				toolCalls = append(toolCalls, schema.ToolCall{
					ID: tc.ID,
					Function: schema.FunctionCall{
						Name:      tc.Name,
						Arguments: tc.Args,
					},
				})
			}
			out = append(out, schema.AssistantMessage(content, toolCalls))
		case "tool":
			out = append(out, schema.ToolMessage(content, msg.ToolCallID))
		case "user":
			if len(msg.Images) > 0 && m.cfg.AiEnableMultimodal {
				var parts []schema.MessageInputPart
				if strings.TrimSpace(content) != "" {
					parts = append(parts, schema.MessageInputPart{
						Type: schema.ChatMessagePartTypeText,
						Text: content,
					})
				}
				for _, imgUrl := range msg.Images {
					urlStr := imgUrl
					parts = append(parts, schema.MessageInputPart{
						Type: schema.ChatMessagePartTypeImageURL,
						Image: &schema.MessageInputImage{
							MessagePartCommon: schema.MessagePartCommon{
								URL: &urlStr,
							},
						},
					})
				}
				out = append(out, &schema.Message{
					Role:                  schema.User,
					UserInputMultiContent: parts,
				})
			} else {
				out = append(out, schema.UserMessage(content))
			}
		}
	}
	return out
}

func alignCutToUserMessage(messages []FrontendMessage, cutIdx int) int {
	for cutIdx > 0 && cutIdx < len(messages) && strings.ToLower(messages[cutIdx].Role) != "user" {
		cutIdx--
	}
	if cutIdx < 0 {
		return 0
	}
	return cutIdx
}

func (m *AgentManager) applyContextCompression(ctx context.Context, messages []FrontendMessage) ([]FrontendMessage, string) {
	maxTokens := m.cfg.AiMaxContextTokens
	if maxTokens <= 0 {
		maxTokens = 4096
	}
	strategy := m.cfg.AiCompressionStrategy

	totalChars := 0
	for _, msg := range messages {
		totalChars += len(msg.Content)
	}

	estTokens := totalChars / 3
	if estTokens <= maxTokens || len(messages) <= 4 {
		return messages, ""
	}

	if strategy == "sliding" {
		cutIdx := alignCutToUserMessage(messages, len(messages)-4)
		return messages[cutIdx:], "已触发滑动窗口截断，保留最新对话"
	}

	// Strategy == "summary"
	cutIdx := alignCutToUserMessage(messages, len(messages)-3)
	if cutIdx <= 0 {
		return messages, ""
	}

	oldMsgs := messages[:cutIdx]
	recentMsgs := messages[cutIdx:]

	if m.cm != nil {
		var summaryContent strings.Builder
		summaryContent.WriteString("请将以下历史对话提炼总结为一段简明扼要的上下文摘要，保留关键讨论要点：\n\n")
		for _, msg := range oldMsgs {
			summaryContent.WriteString(fmt.Sprintf("%s: %s\n", msg.Role, msg.Content))
		}

		sumReq := []*schema.Message{
			schema.UserMessage(summaryContent.String()),
		}

		res, err := m.cm.Generate(ctx, sumReq)
		if err == nil && res != nil && strings.TrimSpace(res.Content) != "" {
			summaryText := "[历史对话摘要]: " + strings.TrimSpace(res.Content)
			compressed := append([]FrontendMessage{
				{Role: "system", Content: summaryText},
			}, recentMsgs...)
			return compressed, "已自动调用 AI 智能摘要压缩历史上下文"
		}
	}

	return messages[cutIdx:], "已触发滑动窗口截断，保留最新对话"
}

func (m *AgentManager) StopChat(sessionID string) {
	if cancelVal, ok := m.cancelMap.LoadAndDelete(sessionID); ok {
		if cancel, ok := cancelVal.(context.CancelFunc); ok {
			cancel()
		}
	}
}

func (m *AgentManager) StreamChat(
	ctx context.Context,
	sessionID string,
	messages []FrontendMessage,
	onChunk func(chunk string),
	onReasoningChunk func(chunk string),
) (string, string, string, error) {
	m.mu.RLock()
	ag := m.agent
	cfg := m.cfg
	m.mu.RUnlock()

	if ag == nil {
		return "", "", "", errors.New("AI Agent 未配置或 API Key 为空，请在设置中配置 API Key")
	}

	chatCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	if sessionID != "" {
		m.cancelMap.Store(sessionID, cancel)
		defer m.cancelMap.Delete(sessionID)
	}

	compressedMsgs, notice := m.applyContextCompression(chatCtx, messages)
	schemaMsgs := m.buildSchemaMessages(compressedMsgs, cfg.AiSystemPrompt)

	sr, err := ag.Stream(chatCtx, schemaMsgs)
	if err != nil {
		if errors.Is(chatCtx.Err(), context.Canceled) {
			return "", "", notice, errors.New("用户手动停止了推导")
		}
		return "", "", "", fmt.Errorf("AI Agent 推导请求失败: %w", err)
	}
	defer sr.Close()

	var fullResp strings.Builder
	var reasoningResp strings.Builder
	inThinkTag := false

	for {
		if errors.Is(chatCtx.Err(), context.Canceled) {
			return fullResp.String(), reasoningResp.String(), notice, errors.New("用户手动停止了推导")
		}

		chunk, err := sr.Recv()
		if errors.Is(err, io.EOF) {
			break
		}
		if errors.Is(chatCtx.Err(), context.Canceled) {
			return fullResp.String(), reasoningResp.String(), notice, errors.New("用户手动停止了推导")
		}
		if err != nil {
			return fullResp.String(), reasoningResp.String(), notice, fmt.Errorf("接收 AI 响应流中断: %w", err)
		}
		if chunk != nil {
			reasoningText := chunk.ReasoningContent
			if reasoningText == "" && chunk.Extra != nil {
				if r, ok := chunk.Extra["reasoning-content"].(string); ok && r != "" {
					reasoningText = r
				} else if r, ok := chunk.Extra["reasoning_content"].(string); ok && r != "" {
					reasoningText = r
				} else if r, ok := chunk.Extra["thinking"].(string); ok && r != "" {
					reasoningText = r
				}
			}
			if reasoningText != "" {
				reasoningResp.WriteString(reasoningText)
				if onReasoningChunk != nil {
					onReasoningChunk(reasoningText)
				}
			}

			text := chunk.Content
			if text != "" {
				if strings.Contains(text, "<think>") {
					parts := strings.SplitN(text, "<think>", 2)
					if parts[0] != "" {
						fullResp.WriteString(parts[0])
						onChunk(parts[0])
					}
					inThinkTag = true
					text = parts[1]
				}

				if inThinkTag {
					if strings.Contains(text, "</think>") {
						parts := strings.SplitN(text, "</think>", 2)
						if parts[0] != "" {
							reasoningResp.WriteString(parts[0])
							if onReasoningChunk != nil {
								onReasoningChunk(parts[0])
							}
						}
						inThinkTag = false
						if parts[1] != "" {
							fullResp.WriteString(parts[1])
							onChunk(parts[1])
						}
					} else {
						reasoningResp.WriteString(text)
						if onReasoningChunk != nil {
							onReasoningChunk(text)
						}
					}
				} else {
					fullResp.WriteString(text)
					onChunk(text)
				}
			}
		}
	}

	return fullResp.String(), reasoningResp.String(), notice, nil
}
