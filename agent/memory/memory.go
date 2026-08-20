package memory

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"terminal/agent/router"
	"terminal/agent/store"

	"github.com/cloudwego/eino/schema"
)

type WorkingMemory struct {
	mu           sync.RWMutex
	messages     []*schema.Message
	maxTokens    int
	lastRecallAt int64
}

func NewWorkingMemory(maxTokens int) *WorkingMemory {
	if maxTokens <= 0 {
		maxTokens = 4096
	}
	return &WorkingMemory{
		maxTokens: maxTokens,
	}
}

func (w *WorkingMemory) SetMessages(msgs []*schema.Message) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.messages = msgs
}

func (w *WorkingMemory) GetMessages() []*schema.Message {
	w.mu.RLock()
	defer w.mu.RUnlock()
	out := make([]*schema.Message, len(w.messages))
	copy(out, w.messages)
	return out
}

func (w *WorkingMemory) Append(msg *schema.Message) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.messages = append(w.messages, msg)
}

func (w *WorkingMemory) CompressSlidingWindow() {
	w.mu.Lock()
	defer w.mu.Unlock()

	totalChars := 0
	for _, m := range w.messages {
		totalChars += len(m.Content)
	}

	estTokens := totalChars / 3
	if estTokens <= w.maxTokens || len(w.messages) <= 4 {
		return
	}

	// Keep system message if first, then keep last 4
	var sysMsg *schema.Message
	if len(w.messages) > 0 && w.messages[0].Role == schema.System {
		sysMsg = w.messages[0]
	}

	recent := w.messages[len(w.messages)-4:]
	if sysMsg != nil && recent[0] != sysMsg {
		w.messages = append([]*schema.Message{sysMsg}, recent...)
	} else {
		w.messages = recent
	}
}

type MemorySystem struct {
	mu    sync.RWMutex
	store *store.Store
}

func NewMemorySystem(st *store.Store) *MemorySystem {
	return &MemorySystem{store: st}
}

func (m *MemorySystem) Recall(ctx context.Context, query string, limit int) []string {
	return m.RecallWithSource(ctx, query, "", limit)
}

func (m *MemorySystem) RecallWithSource(ctx context.Context, query, sourceFilter string, limit int) []string {
	if m.store == nil || strings.TrimSpace(query) == "" {
		return nil
	}

	items, err := m.store.QueryMemories(query, sourceFilter, limit)
	if err != nil || len(items) == 0 {
		return nil
	}

	var results []string
	for _, it := range items {
		results = append(results, fmt.Sprintf("[%s记忆]: %s", it.Kind, it.Content))
	}
	return results
}

func (m *MemorySystem) SaveFact(kind, content, tags, source string) error {
	if m.store == nil || strings.TrimSpace(content) == "" {
		return nil
	}
	if kind == "" {
		kind = "semantic"
	}
	return m.store.SaveMemory(store.MemoryItem{
		Kind:      kind,
		Content:   content,
		Tags:      tags,
		Source:    source,
		CreatedAt: time.Now().UnixMilli(),
	})
}

func (m *MemorySystem) SaveEpisodic(sessionID, summary string, tags string) error {
	return m.SaveFact("episodic", summary, tags, sessionID)
}

type SessionSummaryResult struct {
	Topic     string   `json:"topic"`
	Summary   string   `json:"summary"`
	KeyFacts  []string `json:"key_facts"`
	Decisions []string `json:"decisions"`
	Tags      []string `json:"tags"`
}

func (m *MemorySystem) SummarizeSession(ctx context.Context, sessionID string, messages []*schema.Message, r *router.ModelRouter) error {
	if m.store == nil || len(messages) < 4 || r == nil {
		return nil
	}

	// 1. 检查最近一次摘要时间，去重防刷屏（30分钟）
	recentEpisodic, err := m.store.QueryMemories(sessionID, sessionID, 1)
	if err == nil && len(recentEpisodic) > 0 {
		if time.Since(time.UnixMilli(recentEpisodic[0].CreatedAt)) < 30*time.Minute {
			return nil
		}
	}

	// 2. 提取有效对话内容 (过滤空消息)
	var convText strings.Builder
	for _, msg := range messages {
		if msg == nil || strings.TrimSpace(msg.Content) == "" {
			continue
		}
		roleName := "用户"
		if msg.Role == schema.Assistant {
			roleName = "助手"
		} else if msg.Role == schema.System {
			continue
		}
		convText.WriteString(fmt.Sprintf("%s: %s\n", roleName, msg.Content))
	}

	if convText.Len() < 50 {
		return nil
	}

	// 3. 调用模型生成结构化情节摘要
	modelRes, err := r.Resolve(ctx, router.RoleDefault)
	if err != nil || modelRes == nil || modelRes.Model == nil {
		return nil
	}

	prompt := fmt.Sprintf(`请对以下运维会话对话内容进行要点总结与关键事实沉淀：
【对话内容】:
%s

请输出纯 JSON 格式：
{
  "topic": "会话主题(10字内)",
  "summary": "3-5句话结论与操作摘要",
  "key_facts": ["关键配置、IP、文件名或事实1", "事实2"],
  "decisions": ["做出的决策或排查结论"],
  "tags": ["标签1", "标签2"]
}`, convText.String())

	resp, err := modelRes.Model.Generate(ctx, []*schema.Message{
		schema.SystemMessage("你是一个专业的智能运维知识与会话总结助手。只输出纯 JSON，不要包含任何 markdown 代码块以外的说明。"),
		schema.UserMessage(prompt),
	})
	if err != nil || resp == nil || resp.Content == "" {
		return nil
	}

	clean := strings.TrimSpace(resp.Content)
	clean = strings.TrimPrefix(clean, "```json")
	clean = strings.TrimPrefix(clean, "```")
	clean = strings.TrimSuffix(clean, "```")
	clean = strings.TrimSpace(clean)

	var res SessionSummaryResult
	if err := json.Unmarshal([]byte(clean), &res); err != nil {
		return nil
	}

	now := time.Now().UnixMilli()
	tagsStr := strings.Join(res.Tags, ",")
	if res.Topic != "" {
		tagsStr = res.Topic + "," + tagsStr
	}

	// 4. 保存情节记忆 (episodic)
	if res.Summary != "" {
		_ = m.store.SaveMemory(store.MemoryItem{
			Kind:      "episodic",
			Content:   res.Summary,
			Tags:      tagsStr,
			Source:    sessionID,
			Meta:      fmt.Sprintf(`{"topic":%q}`, res.Topic),
			CreatedAt: now,
		})
	}

	// 5. 保存事实知识 (semantic)
	for _, fact := range res.KeyFacts {
		if strings.TrimSpace(fact) != "" {
			_ = m.store.SaveMemory(store.MemoryItem{
				Kind:      "semantic",
				Content:   fact,
				Tags:      tagsStr,
				Source:    sessionID,
				CreatedAt: now,
			})
		}
	}

	return nil
}
