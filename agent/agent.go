package agent

import (
	"context"
	"errors"
	"fmt"
	"io"
	"runtime"
	"strings"
	"sync"
	"time"

	"encoding/json"
	"terminal/agent/events"
	"terminal/agent/router"
	"terminal/agent/store"
	"terminal/core"
	"terminal/ssh"

	"github.com/cloudwego/eino-ext/components/model/openai"
	"github.com/cloudwego/eino/adk"
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

type Storage struct{}

func NewStorage() *Storage {
	return &Storage{}
}

func (s *Storage) LoadHistory() ([]FrontendMessage, error) {
	if DefaultRuntime.Store == nil {
		return []FrontendMessage{}, nil
	}
	dbMsgs, err := DefaultRuntime.Store.ListMessages("ai_agent_default")
	if err != nil {
		return []FrontendMessage{}, nil
	}
	var out []FrontendMessage
	for _, m := range dbMsgs {
		var tc []ToolCallItem
		if m.ToolCalls != "" {
			_ = json.Unmarshal([]byte(m.ToolCalls), &tc)
		}
		var ps []ProcessStep
		if m.ProcessSteps != "" {
			_ = json.Unmarshal([]byte(m.ProcessSteps), &ps)
		}
		out = append(out, FrontendMessage{
			Role:             m.Role,
			Content:          m.Content,
			ReasoningContent: m.Reasoning,
			ToolCalls:        tc,
			ProcessSteps:     ps,
			Timestamp:        m.CreatedAt,
		})
	}
	return out, nil
}

func (s *Storage) SaveHistory(messages []FrontendMessage) error {
	if DefaultRuntime.Store == nil {
		return nil
	}
	var dbMsgs []store.MessageItem
	for _, m := range messages {
		tcBytes, _ := json.Marshal(m.ToolCalls)
		psBytes, _ := json.Marshal(m.ProcessSteps)
		dbMsgs = append(dbMsgs, store.MessageItem{
			SessionID:    "ai_agent_default",
			Role:         m.Role,
			Content:      m.Content,
			Reasoning:    m.ReasoningContent,
			ToolCalls:    string(tcBytes),
			ProcessSteps: string(psBytes),
			CreatedAt:    m.Timestamp,
		})
	}
	return DefaultRuntime.Store.ReplaceMessages("ai_agent_default", dbMsgs)
}

func (s *Storage) ClearHistory() error {
	if DefaultRuntime.Store != nil {
		return DefaultRuntime.Store.ClearSessionMessages("ai_agent_default")
	}
	return nil
}

type AgentManager struct {
	mu        sync.RWMutex
	ctx       context.Context
	cfg       core.AppSettings
	cm        *openai.ChatModel
	runner    *adk.Runner
	storage   *Storage
	sshMgr    *ssh.SessionManager
	cancelMap sync.Map // sessionID -> context.CancelFunc
}

var DefaultManager = NewAgentManager()
var DefaultWorkspaceMgr = DefaultRuntime.WorkspaceMgr

func NewAgentManager() *AgentManager {
	return &AgentManager{
		storage: NewStorage(),
	}
}

func (m *AgentManager) SetContext(ctx context.Context) {
	m.ctx = ctx
	DefaultRuntime.SetContext(ctx)
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
	_ = DefaultRuntime.InitOrUpdate(cfg)

	if strings.TrimSpace(cfg.AiAPIKey) == "" {
		m.runner = nil
		m.cm = nil
		return nil
	}

	ctx := m.ctx
	if ctx == nil {
		ctx = context.Background()
	}

	resolved, err := DefaultRuntime.Router.Resolve(ctx, router.RoleDefault)
	if err != nil {
		return fmt.Errorf("创建模型失败: %w", err)
	}
	m.cm = resolved.Model

	// Build default session runner
	sess := DefaultRuntime.GetOrCreateSession("ai_agent_default")
	if err := sess.BuildRunner(ctx, DefaultRuntime.Router, DefaultRuntime.ToolBus); err != nil {
		return fmt.Errorf("创建 ADK Runner 失败: %w", err)
	}
	m.runner = sess.GetRunner()

	return nil
}

func (m *AgentManager) buildSchemaMessages(messages []FrontendMessage, sysPrompt string) []*schema.Message {
	var out []*schema.Message
	currentTime := time.Now().Format("2006-01-02 15:04:05")
	sysPrompt = fmt.Sprintf("%s\n系统: %s, 当前时间为: [%s]。", runtime.GOOS, sysPrompt, currentTime)
	wsDir := DefaultRuntime.WorkspaceMgr.GetDir()
	if wsDir != "" {
		sysPrompt = fmt.Sprintf("%s\n当前绑定的工作目录为: [%s]。", sysPrompt, wsDir)
	}
	sysPrompt = fmt.Sprintf("%s\n【人机交互规范】: 当面对用户需求模糊、缺少关键上下文参数（如目标数据库类型、具体主机会话、文件路径等）或需要二选一确认时，必须主动调用 `ask_user` 工具向用户发起提问获取澄清与确认，禁止盲目猜测假设。", sysPrompt)
	sysPrompt = fmt.Sprintf("%s\n【人机交互规范】: 合理规划工具使用，避免频繁向用户提问。", sysPrompt)

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
	sess := DefaultRuntime.GetOrCreateSession(sessionID)
	sess.Stop()
}

func normalizeChunkDelta(accumulated, chunk string) string {
	if len(accumulated) > 0 && len(chunk) > len(accumulated) && strings.HasPrefix(chunk, accumulated) {
		return chunk[len(accumulated):]
	}
	return chunk
}

func (m *AgentManager) StreamChat(
	ctx context.Context,
	sessionID string,
	messages []FrontendMessage,
	onChunk func(chunk string),
	onReasoningChunk func(chunk string),
) (string, string, string, error) {
	if sessionID == "" {
		sessionID = "ai_agent_default"
	}

	sess := DefaultRuntime.GetOrCreateSession(sessionID)
	if err := sess.BuildRunner(ctx, DefaultRuntime.Router, DefaultRuntime.ToolBus); err != nil {
		return "", "", "", fmt.Errorf("构建会话 Runner 失败: %w", err)
	}
	runner := sess.GetRunner()

	m.mu.RLock()
	cfg := m.cfg
	m.mu.RUnlock()

	if runner == nil {
		return "", "", "", errors.New("AI Agent 未配置或 API Key 为空，请在设置中配置 API Key")
	}

	chatCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	sess.SetCancel(cancel)
	m.cancelMap.Store(sessionID, cancel)
	defer m.cancelMap.Delete(sessionID)

	compressedMsgs, notice := m.applyContextCompression(chatCtx, messages)
	schemaMsgs := m.buildSchemaMessages(compressedMsgs, cfg.AiSystemPrompt)

	iter := runner.Run(chatCtx, schemaMsgs)

	var fullResp strings.Builder
	var reasoningResp strings.Builder
	inThinkTag := false

	for {
		if errors.Is(chatCtx.Err(), context.Canceled) {
			return fullResp.String(), reasoningResp.String(), notice, errors.New("用户手动停止了推导")
		}

		event, ok := iter.Next()
		if !ok || event == nil {
			break
		}
		if errors.Is(chatCtx.Err(), context.Canceled) {
			return fullResp.String(), reasoningResp.String(), notice, errors.New("用户手动停止了推导")
		}
		if event.Err != nil {
			return fullResp.String(), reasoningResp.String(), notice, fmt.Errorf("Agent 事件错误: %w", event.Err)
		}

		if event.Output != nil && event.Output.MessageOutput != nil {
			mv := event.Output.MessageOutput
			if mv.Role == schema.Tool || (mv.Role != schema.Assistant && mv.ToolName != "") {
				continue
			}

			if mv.IsStreaming && mv.MessageStream != nil {
				func() {
					defer mv.MessageStream.Close()
					streamReasoningAcc := ""
					streamContentAcc := ""
					for {
						if errors.Is(chatCtx.Err(), context.Canceled) {
							return
						}
						chunk, err := mv.MessageStream.Recv()
						if errors.Is(err, io.EOF) || err != nil {
							break
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
								delta := normalizeChunkDelta(streamReasoningAcc, reasoningText)
								streamReasoningAcc += delta
								if delta != "" {
									reasoningResp.WriteString(delta)
									if onReasoningChunk != nil {
										onReasoningChunk(delta)
									}
									DefaultRuntime.EventBus.Emit(events.Event{
										Type:      events.EventReasoningChunk,
										SessionID: sessionID,
										Payload:   events.ReasoningChunkPayload{Chunk: delta},
									})
								}
							}

							text := chunk.Content
							if text != "" {
								text = normalizeChunkDelta(streamContentAcc, text)
								streamContentAcc += text
							}
							if text != "" {
								if strings.Contains(text, "<think>") {
									parts := strings.SplitN(text, "<think>", 2)
									if parts[0] != "" {
										fullResp.WriteString(parts[0])
										if onChunk != nil {
											onChunk(parts[0])
										}
										DefaultRuntime.EventBus.Emit(events.Event{
											Type:      events.EventChatChunk,
											SessionID: sessionID,
											Payload:   events.ChatChunkPayload{Chunk: parts[0]},
										})
									}
									inThinkTag = true
									text = parts[1]
								}

								if inThinkTag {
									if strings.Contains(text, "</think>") {
										parts := strings.SplitN(text, "</think>", 2)
										if parts[0] != "" {
											reasoningResp.WriteString(parts[0])
											streamReasoningAcc += parts[0]
											if onReasoningChunk != nil {
												onReasoningChunk(parts[0])
											}
											DefaultRuntime.EventBus.Emit(events.Event{
												Type:      events.EventReasoningChunk,
												SessionID: sessionID,
												Payload:   events.ReasoningChunkPayload{Chunk: parts[0]},
											})
										}
										inThinkTag = false
										if parts[1] != "" {
											fullResp.WriteString(parts[1])
											if onChunk != nil {
												onChunk(parts[1])
											}
											DefaultRuntime.EventBus.Emit(events.Event{
												Type:      events.EventChatChunk,
												SessionID: sessionID,
												Payload:   events.ChatChunkPayload{Chunk: parts[1]},
											})
										}
									} else {
										reasoningResp.WriteString(text)
										streamReasoningAcc += text
										if onReasoningChunk != nil {
											onReasoningChunk(text)
										}
										DefaultRuntime.EventBus.Emit(events.Event{
											Type:      events.EventReasoningChunk,
											SessionID: sessionID,
											Payload:   events.ReasoningChunkPayload{Chunk: text},
										})
									}
								} else {
									fullResp.WriteString(text)
									if onChunk != nil {
										onChunk(text)
									}
									DefaultRuntime.EventBus.Emit(events.Event{
										Type:      events.EventChatChunk,
										SessionID: sessionID,
										Payload:   events.ChatChunkPayload{Chunk: text},
									})
								}
							}
						}
					}
				}()
			} else if mv.Message != nil {
				if mv.Role == schema.Assistant || mv.Role == "" {
					if mv.Message.ReasoningContent != "" {
						reasoningResp.WriteString(mv.Message.ReasoningContent)
						if onReasoningChunk != nil {
							onReasoningChunk(mv.Message.ReasoningContent)
						}
						DefaultRuntime.EventBus.Emit(events.Event{
							Type:      events.EventReasoningChunk,
							SessionID: sessionID,
							Payload:   events.ReasoningChunkPayload{Chunk: mv.Message.ReasoningContent},
						})
					}
					if mv.Message.Content != "" {
						fullResp.WriteString(mv.Message.Content)
						if onChunk != nil {
							onChunk(mv.Message.Content)
						}
						DefaultRuntime.EventBus.Emit(events.Event{
							Type:      events.EventChatChunk,
							SessionID: sessionID,
							Payload:   events.ChatChunkPayload{Chunk: mv.Message.Content},
						})
					}
				}
			}
		}
	}

	finalContent := fullResp.String()
	if strings.TrimSpace(finalContent) == "" && reasoningResp.Len() > 0 {
		finalContent = "已完成任务推演与相关操作。"
	}

	return finalContent, reasoningResp.String(), notice, nil
}
