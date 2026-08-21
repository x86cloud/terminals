package agent

import (
	"context"

	"github.com/cloudwego/eino/adk/filesystem"
	"github.com/cloudwego/eino/schema"
)

type Local struct {
	filesystem.Backend
	filesystem.StreamingShell
}

func NewLocal(filesystem filesystem.Backend, shell filesystem.StreamingShell) *Local {
	return &Local{Backend: filesystem, StreamingShell: shell}
}

func (l *Local) ExecuteStreaming(ctx context.Context, input *filesystem.ExecuteRequest) (result *schema.StreamReader[*filesystem.ExecuteResponse], err error) {
	return l.StreamingShell.ExecuteStreaming(ctx, input)
}
