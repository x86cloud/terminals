package agent

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"
	"terminal/core"
	"time"

	"github.com/cloudwego/eino-ext/components/model/openai"
	"github.com/cloudwego/eino/compose"
	"github.com/cloudwego/eino/flow/agent/react"
	"github.com/cloudwego/eino/schema"
)

type FrontendMessage struct {
	Role      string   `json:"role"`
	Content   string   `json:"content"`
	Images    []string `json:"images,omitempty"`
	Timestamp int64    `json:"timestamp,omitempty"`
}

type AgentManager struct {
	mu      sync.RWMutex
	ctx     context.Context
	cfg     core.AppSettings
	cm      *openai.ChatModel
	agent   *react.Agent
	storage *Storage
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

	tools, _ := BuildWorkspaceTools(DefaultWorkspaceMgr)
	if cfg.AiEnableWebSearch {
		if webSearchTool, err := BuildWebSearchTool(DefaultWorkspaceMgr); err == nil {
			tools = append(tools, webSearchTool)
		}
	}
	ag, err := react.NewAgent(ctx, &react.AgentConfig{
		ToolCallingModel: cm,
		Model:            cm,
		ToolsConfig: compose.ToolsNodeConfig{
			Tools: tools,
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
	sysPrompt = fmt.Sprintf("%s\n当前系统时间为: [%s]", sysPrompt, currentTime)
	wsDir := DefaultWorkspaceMgr.GetDir()
	if wsDir != "" {
		sysPrompt = fmt.Sprintf("%s\n当前绑定的工作目录为: [%s]。你可以使用挂载的工具在该目录下查看文件列表、读取文件、写入/修改文件、删除文件或搜索内容。", sysPrompt, wsDir)
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
			out = append(out, schema.AssistantMessage(content, nil))
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
		cutIdx := len(messages) - 4
		if cutIdx < 0 {
			cutIdx = 0
		}
		return messages[cutIdx:], "已触发滑动窗口截断，保留最新对话"
	}

	// Strategy == "summary"
	cutIdx := len(messages) - 3
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

func (m *AgentManager) StreamChat(
	ctx context.Context,
	messages []FrontendMessage,
	onChunk func(chunk string),
) (string, string, error) {
	m.mu.RLock()
	ag := m.agent
	cfg := m.cfg
	m.mu.RUnlock()

	if ag == nil {
		return "", "", errors.New("AI Agent 未配置或 API Key 为空，请在设置中配置 API Key")
	}

	compressedMsgs, notice := m.applyContextCompression(ctx, messages)
	schemaMsgs := m.buildSchemaMessages(compressedMsgs, cfg.AiSystemPrompt)

	sr, err := ag.Stream(ctx, schemaMsgs)
	if err != nil {
		return "", "", fmt.Errorf("AI Agent 推导请求失败: %w", err)
	}
	defer sr.Close()

	var fullResp strings.Builder
	for {
		chunk, err := sr.Recv()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return fullResp.String(), notice, fmt.Errorf("接收 AI 响应流中断: %w", err)
		}
		if chunk != nil {
			text := chunk.Content
			if text != "" {
				fullResp.WriteString(text)
				onChunk(text)
			}
		}
	}

	return fullResp.String(), notice, nil
}
