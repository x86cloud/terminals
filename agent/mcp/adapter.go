package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"terminal/agent/tools"

	"github.com/cloudwego/eino/components/tool"
)

type ToolAdapter struct {
	bus *tools.ToolBus
}

func NewToolAdapter(bus *tools.ToolBus) *ToolAdapter {
	return &ToolAdapter{bus: bus}
}

// ListTools 将 ToolBus 中的所有工具转译为标准 MCP ToolDefinition 列表
func (a *ToolAdapter) ListTools(ctx context.Context) []ToolDefinition {
	if a.bus == nil {
		return nil
	}

	registered := a.bus.List()
	out := make([]ToolDefinition, 0, len(registered))

	for _, rt := range registered {
		def := ToolDefinition{
			Name:        rt.Name,
			Description: rt.Description,
			InputSchema: map[string]any{
				"type": "object",
			},
		}

		if rt.BaseTool != nil {
			info, err := rt.BaseTool.Info(ctx)
			if err == nil && info != nil && info.ParamsOneOf != nil {
				if js, err := info.ParamsOneOf.ToJSONSchema(); err == nil && js != nil {
					if b, err := json.Marshal(js); err == nil {
						var schemaMap map[string]any
						if err := json.Unmarshal(b, &schemaMap); err == nil && len(schemaMap) > 0 {
							def.InputSchema = schemaMap
						}
					}
				}
			}
		}

		out = append(out, def)
	}

	return out
}

// CallTool 直接执行 MCP 工具调用并返回标准 CallToolResult (完全开放模式)
func (a *ToolAdapter) CallTool(ctx context.Context, name string, arguments map[string]any) CallToolResult {
	if a.bus == nil {
		return CallToolResult{
			IsError: true,
			Content: []ToolContent{{Type: "text", Text: "ToolBus 未初始化"}},
		}
	}

	t, ok := a.bus.Get(name)
	if !ok {
		return CallToolResult{
			IsError: true,
			Content: []ToolContent{{Type: "text", Text: fmt.Sprintf("未知的工具: [%s]", name)}},
		}
	}

	var inputStr string
	if len(arguments) > 0 {
		b, err := json.Marshal(arguments)
		if err != nil {
			return CallToolResult{
				IsError: true,
				Content: []ToolContent{{Type: "text", Text: fmt.Sprintf("序列化工具参数失败: %v", err)}},
			}
		}
		inputStr = string(b)
	} else {
		inputStr = "{}"
	}

	timeout := t.Timeout
	if timeout <= 0 {
		timeout = 45 * time.Second
	}
	toolCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var resultObj any
	var runErr error

	if t.BaseTool != nil {
		if inv, ok := t.BaseTool.(tool.InvokableTool); ok {
			strRes, err := inv.InvokableRun(toolCtx, inputStr)
			if err != nil {
				runErr = err
			} else {
				var parsed any
				if err := json.Unmarshal([]byte(strRes), &parsed); err == nil {
					resultObj = parsed
				} else {
					resultObj = strRes
				}
			}
		}
	} else if t.Handler != nil {
		resultObj, runErr = t.Handler(toolCtx, inputStr)
	} else {
		runErr = fmt.Errorf("工具 [%s] 缺少可执行实现", name)
	}

	if runErr != nil {
		return CallToolResult{
			IsError: true,
			Content: []ToolContent{{Type: "text", Text: fmt.Sprintf("工具执行错误: %v", runErr)}},
		}
	}

	var textOutput string
	switch v := resultObj.(type) {
	case string:
		textOutput = v
	default:
		b, err := json.MarshalIndent(resultObj, "", "  ")
		if err == nil {
			textOutput = string(b)
		} else {
			textOutput = fmt.Sprintf("%v", resultObj)
		}
	}

	return CallToolResult{
		IsError: false,
		Content: []ToolContent{{Type: "text", Text: textOutput}},
	}
}
