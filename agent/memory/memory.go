package memory

import (
	"sync"

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
