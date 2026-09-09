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
	"log"
	"terminal/agent/events"
	"terminal/agent/router"
	"terminal/agent/store"
	"terminal/core"
	"terminal/ssh"

	"github.com/cloudwego/eino-ext/components/model/openai"
	"github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
)

type ToolCallItem struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Args string `json:"args"`
}

type ProcessStep struct {
	ID         string `json:"id"`
	Type       string `json:"type"` // "think" | "tool"
	Title      string `json:"title"`
	Summary    string `json:"summary,omitempty"`
	Content    string `json:"content"`
	Timestamp  int64  `json:"timestamp"`
	DurationMs int64  `json:"duration_ms,omitempty"`
	Status     string `json:"status,omitempty"`
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
	mu           sync.RWMutex
	ctx          context.Context
	cfg          core.AppSettings
	cm           *openai.ChatModel
	storage      *Storage
	sshMgr       *ssh.SessionManager
	activeCancel context.CancelFunc
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

	_ = DefaultRuntime.GetOrCreateSession("ai_agent_default")

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
	sysPrompt = fmt.Sprintf("%s\n【人机交互规范】: 当面对用户需求模糊、缺少关键上下文参数（如目标数据库类型、具体主机会话、文件路径、镜像版本号、等）或需要二选一确认时，必须主动调用 `ask_user` 工具向用户发起提问获取澄清与确认，禁止盲目猜测假设。", sysPrompt)
	sysPrompt = fmt.Sprintf("%s\n【人机交互规范】: 合理规划工具使用，避免频繁向用户提问。", sysPrompt)
	sysPrompt = fmt.Sprintf("%s\n【排障与方案处理规范】: 当用户询问运维管理、数据库操作等问题怎么处理时，必须先进行分析，给出解决方案，主动调用`ask_user`询问是否需要帮用户处理问题。", sysPrompt)
	activeConn := DefaultRuntime.GetActiveConnection()
	if activeConn != nil && (activeConn.ID != "" || activeConn.Name != "" || activeConn.Protocol != "") {
		var activeDetail strings.Builder
		activeDetail.WriteString(fmt.Sprintf("【用户当前活动 Tab 聚焦连接】: 协议类型: %s", strings.ToUpper(activeConn.Protocol)))
		if activeConn.Name != "" {
			activeDetail.WriteString(fmt.Sprintf(", 会话名称: [%s]", activeConn.Name))
		}
		if activeConn.ID != "" {
			activeDetail.WriteString(fmt.Sprintf(", 连接ID/ServerID: `%s`", activeConn.ID))
		}
		if activeConn.Host != "" {
			if activeConn.Port > 0 {
				activeDetail.WriteString(fmt.Sprintf(", 目标主机: %s:%d", activeConn.Host, activeConn.Port))
			} else {
				activeDetail.WriteString(fmt.Sprintf(", 目标主机: %s", activeConn.Host))
			}
		}
		if activeConn.Database != "" {
			activeDetail.WriteString(fmt.Sprintf(", 选定库: [%s]", activeConn.Database))
		}
		if activeConn.Namespace != "" {
			activeDetail.WriteString(fmt.Sprintf(", 命名空间: [%s]", activeConn.Namespace))
		}
		if activeConn.Path != "" {
			activeDetail.WriteString(fmt.Sprintf(", 文件路径: [%s]", activeConn.Path))
		}
		sysPrompt = fmt.Sprintf("%s\n%s\n【上下文执行约定】: 用户在当前活动 Tab 提问且未明确指定目标连接/实例时，相关协议运维工具（如 SQL查询、Docker容器/Compose编排、Kubectl/K8s编排、SSH运维等）必须默认以此活动连接作为目标执行，无需额外询问！", sysPrompt, activeDetail.String())
	}

	if m.sshMgr != nil {
		sessions := m.sshMgr.List()
		var activeHosts []string
		for _, s := range sessions {
			if s.Connected {
				activeHosts = append(activeHosts, fmt.Sprintf("%s (ID: %s)", s.Title, s.ID))
			}
		}
		if len(activeHosts) > 0 {
			sysPrompt = fmt.Sprintf("%s\n客户端当前已建立连通的 SSH 服务器会话: [%s]。",
				sysPrompt, strings.Join(activeHosts, ", "))
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
	strategy := m.cfg.AiCompressionStrategy
	if strategy == "none" {
		return messages, ""
	}

	maxTokens := m.cfg.AiMaxContextTokens
	if maxTokens <= 0 {
		if m.cfg.AiModelContextTokens > 0 && m.cfg.AiContextCompressRatio > 0 {
			maxTokens = (m.cfg.AiModelContextTokens * m.cfg.AiContextCompressRatio) / 100
		}
		if maxTokens <= 0 {
			maxTokens = 52428
		}
	}

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
	m.mu.Lock()
	if m.activeCancel != nil {
		m.activeCancel()
		m.activeCancel = nil
	}
	m.mu.Unlock()

	sess := DefaultRuntime.GetSession()
	if sess != nil {
		sess.Stop()
	}
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
	sess := DefaultRuntime.GetSession()
	if sess == nil {
		sess = DefaultRuntime.GetOrCreateSession(sessionID)
	}

	m.mu.RLock()
	cfg := m.cfg
	m.mu.RUnlock()

	resolved, err := DefaultRuntime.Router.Resolve(ctx, router.RoleDefault)
	if err != nil || resolved == nil || resolved.Model == nil {
		return "", "", "", errors.New("AI Agent 未配置或 API Key 为空，请在设置中配置 API Key")
	}

	chatCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	sess.SetCancel(cancel)
	m.mu.Lock()
	m.activeCancel = cancel
	m.mu.Unlock()
	defer func() {
		m.mu.Lock()
		m.activeCancel = nil
		m.mu.Unlock()
	}()

	compressedMsgs, notice := m.applyContextCompression(chatCtx, messages)
	schemaMsgs := m.buildSchemaMessages(compressedMsgs, cfg.AiSystemPrompt)

	toolInfos := DefaultRuntime.ToolBus.ConvertToToolInfos(chatCtx)

	var fullResp strings.Builder
	var reasoningResp strings.Builder
	inThinkTag := false
	maxTurns := 50

	log.Printf("[Agent][StreamChat] Starting Native ReAct engine for session %s with %d messages, %d tools...", sessionID, len(schemaMsgs), len(toolInfos))

	for turn := 1; turn <= maxTurns; turn++ {
		if errors.Is(chatCtx.Err(), context.Canceled) {
			log.Printf("[Agent][StreamChat] Session %s context canceled by user on turn %d", sessionID, turn)
			return fullResp.String(), reasoningResp.String(), notice, errors.New("用户手动停止了推导")
		}

		log.Printf("[Agent][StreamChat] Turn %d: calling model.Stream (context: %d messages)...", turn, len(schemaMsgs))

		// Heartbeat ticker during waiting for LLM stream
		waitTicker := time.NewTicker(4 * time.Second)
		waitDone := make(chan struct{})
		go func(tNum int) {
			startWait := time.Now()
			for {
				select {
				case <-waitDone:
					return
				case <-waitTicker.C:
					elapsed := int(time.Since(startWait).Seconds())
					log.Printf("[Agent][StreamChat] Waiting for LLM generation on Turn %d (%ds elapsed)...", tNum, elapsed)
					DefaultRuntime.EventBus.Emit(events.Event{
						Type:      events.EventNotice,
						SessionID: sessionID,
						Payload:   fmt.Sprintf("正在结合最新执行结果深入推演中 (%ds)...", elapsed),
					})
				}
			}
		}(turn)

		streamReader, err := resolved.Model.Stream(chatCtx, schemaMsgs, model.WithTools(toolInfos))
		waitTicker.Stop()
		close(waitDone)

		if err != nil {
			if errors.Is(chatCtx.Err(), context.Canceled) {
				return fullResp.String(), reasoningResp.String(), notice, errors.New("用户手动停止了推导")
			}
			log.Printf("[Agent][StreamChat] Turn %d model.Stream error: %v", turn, err)
			return fullResp.String(), reasoningResp.String(), notice, fmt.Errorf("大模型请求异常: %w", err)
		}

		var turnContentAcc strings.Builder
		var turnReasoningAcc strings.Builder
		var streamReasoningAcc string
		var streamContentAcc string
		toolCallsMap := make(map[int]*schema.ToolCall)
		chunkCount := 0
		var streamRecvErr error

		func() {
			defer streamReader.Close()
			for {
				if errors.Is(chatCtx.Err(), context.Canceled) {
					return
				}
				chunk, err := streamReader.Recv()
				if errors.Is(err, io.EOF) {
					break
				}
				if err != nil {
					streamRecvErr = err
					log.Printf("[Agent][StreamChat] Turn %d stream Recv error: %v", turn, err)
					break
				}
				if chunk == nil {
					continue
				}
				chunkCount++

				// 1. Process reasoning content
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
						turnReasoningAcc.WriteString(delta)
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

				// 2. Process content & think tags
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
							turnContentAcc.WriteString(parts[0])
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
								turnReasoningAcc.WriteString(parts[0])
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
								turnContentAcc.WriteString(parts[1])
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
							turnReasoningAcc.WriteString(text)
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
						turnContentAcc.WriteString(text)
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

				// 3. Accumulate ToolCalls from chunk
				if len(chunk.ToolCalls) > 0 {
					for _, tc := range chunk.ToolCalls {
						idx := 0
						if tc.Index != nil {
							idx = *tc.Index
						}
						existing, exists := toolCallsMap[idx]
						if !exists {
							newTc := tc
							toolCallsMap[idx] = &newTc
						} else {
							if tc.ID != "" {
								existing.ID = tc.ID
							}
							if tc.Type != "" {
								existing.Type = tc.Type
							}
							if tc.Function.Name != "" {
								existing.Function.Name += tc.Function.Name
							}
							if tc.Function.Arguments != "" {
								existing.Function.Arguments += tc.Function.Arguments
							}
						}
					}
				}
			}
		}()

		if errors.Is(chatCtx.Err(), context.Canceled) {
			return fullResp.String(), reasoningResp.String(), notice, errors.New("用户手动停止了推导")
		}

		if streamRecvErr != nil {
			if fullResp.Len() == 0 && reasoningResp.Len() == 0 {
				return "", "", notice, fmt.Errorf("大模型流式响应异常: %w", streamRecvErr)
			}
			return fullResp.String(), reasoningResp.String(), notice, fmt.Errorf("大模型流式生成异常中断: %w", streamRecvErr)
		}

		// Collect tool calls
		var collectedToolCalls []schema.ToolCall
		for i := 0; i < len(toolCallsMap); i++ {
			if tc, ok := toolCallsMap[i]; ok && tc != nil && tc.Function.Name != "" {
				if tc.ID == "" {
					tc.ID = fmt.Sprintf("call_%d_%d", turn, i)
				}
				collectedToolCalls = append(collectedToolCalls, *tc)
			}
		}
		if len(collectedToolCalls) == 0 && len(toolCallsMap) > 0 {
			for _, tc := range toolCallsMap {
				if tc != nil && tc.Function.Name != "" {
					if tc.ID == "" {
						tc.ID = fmt.Sprintf("call_%d_%d", turn, len(collectedToolCalls))
					}
					collectedToolCalls = append(collectedToolCalls, *tc)
				}
			}
		}

		log.Printf("[Agent][StreamChat] Turn %d completed (received %d chunks, %d tool calls)", turn, chunkCount, len(collectedToolCalls))

		// If no tool calls, the model finished the conversation!
		if len(collectedToolCalls) == 0 {
			log.Printf("[Agent][StreamChat] Model finished final answer on Turn %d", turn)
			break
		}

		// Append Assistant message with tool calls to history
		assistantMsg := &schema.Message{
			Role:             schema.Assistant,
			Content:          turnContentAcc.String(),
			ReasoningContent: turnReasoningAcc.String(),
			ToolCalls:        collectedToolCalls,
		}
		schemaMsgs = append(schemaMsgs, assistantMsg)

		// Execute all tool calls
		for _, tc := range collectedToolCalls {
			if errors.Is(chatCtx.Err(), context.Canceled) {
				return fullResp.String(), reasoningResp.String(), notice, errors.New("用户手动停止了推导")
			}
			log.Printf("[Agent][StreamChat] Executing Tool: %s (id: %s) with args: %s", tc.Function.Name, tc.ID, tc.Function.Arguments)
			toolRes := DefaultRuntime.ToolBus.Invoke(chatCtx, "", sessionID, tc.Function.Name, tc.Function.Arguments)
			var outStr string
			if !toolRes.OK {
				if toolRes.Error != "" {
					outStr = fmt.Sprintf("Error: %s", toolRes.Error)
				} else {
					outStr = "Error: 工具执行失败"
				}
			} else {
				if s, ok := toolRes.Data.(string); ok {
					outStr = s
				} else if toolRes.Data != nil {
					b, err := json.Marshal(toolRes.Data)
					if err == nil {
						outStr = string(b)
					} else {
						outStr = fmt.Sprintf("%v", toolRes.Data)
					}
				} else {
					outStr = "{\"ok\": true}"
				}
			}
			if len(outStr) > 32768 {
				outStr = outStr[:32768] + "\n...(输出过长已截断)..."
			}
			schemaMsgs = append(schemaMsgs, schema.ToolMessage(outStr, tc.ID))
		}
	}

	finalContent := fullResp.String()
	if strings.TrimSpace(finalContent) == "" && reasoningResp.Len() > 0 {
		finalContent = "已完成任务推演与相关操作。"
	}

	return finalContent, reasoningResp.String(), notice, nil
}
