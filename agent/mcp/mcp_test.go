package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"

	"terminal/agent/tools"
)

func TestMCP_ProtocolSerialization(t *testing.T) {
	req := JSONRPCRequest{
		JSONRPC: JSONRPCVersion,
		ID:      1,
		Method:  "tools/list",
	}
	b, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("JSONRPCRequest marshal error: %v", err)
	}

	var parsed JSONRPCRequest
	if err := json.Unmarshal(b, &parsed); err != nil {
		t.Fatalf("JSONRPCRequest unmarshal error: %v", err)
	}
	if parsed.Method != "tools/list" || parsed.ID.(float64) != 1 {
		t.Fatalf("JSONRPCRequest 字段不匹配: %+v", parsed)
	}

	res := NewResponse(1, ToolsListResult{
		Tools: []ToolDefinition{
			{
				Name:        "test_tool",
				Description: "A test tool",
				InputSchema: map[string]any{"type": "object"},
			},
		},
	})
	b, err = json.Marshal(res)
	if err != nil {
		t.Fatalf("JSONRPCResponse marshal error: %v", err)
	}
	if !bytes.Contains(b, []byte("test_tool")) {
		t.Fatalf("响应中未包含工具名称: %s", string(b))
	}
}

func TestMCP_Server_Integration(t *testing.T) {
	// 1. 初始化测试用 ToolBus
	tb := tools.NewToolBus(nil, nil)
	tb.Register(&tools.RegisteredTool{
		Name:        "echo_tool",
		Description: "回显输入内容",
		Handler: func(ctx context.Context, input string) (any, error) {
			return fmt.Sprintf("echo: %s", input), nil
		},
	})

	adapter := NewToolAdapter(tb)
	srv := NewServer(adapter)

	// 2. 启动服务 (随机测试端口)
	port := 45678
	if err := srv.Start("127.0.0.1", port); err != nil {
		t.Fatalf("启动 MCP Server 失败: %v", err)
	}
	defer func() {
		_ = srv.Stop()
	}()

	status := srv.Status()
	if !status.Running || status.Port != port {
		t.Fatalf("Server status 状态异常: %+v", status)
	}

	// 3. 测试 /health 端点
	resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/health", port))
	if err != nil {
		t.Fatalf("GET /health 失败: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /health 状态码错误: %d", resp.StatusCode)
	}
	_ = resp.Body.Close()

	// 4. 测试 POST /messages -> initialize
	initPayload := map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "initialize",
		"params": map[string]any{
			"protocolVersion": "2024-11-05",
			"capabilities":    map[string]any{},
			"clientInfo":      map[string]any{"name": "test-client", "version": "1.0"},
		},
	}
	body, _ := json.Marshal(initPayload)
	resp, err = http.Post(fmt.Sprintf("http://127.0.0.1:%d/messages", port), "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST initialize 失败: %v", err)
	}
	defer resp.Body.Close()
	respBytes, _ := io.ReadAll(resp.Body)
	if !bytes.Contains(respBytes, []byte("terminals-mcp-server")) {
		t.Fatalf("initialize 响应未包含服务名: %s", string(respBytes))
	}

	// 5. 测试 POST /messages -> tools/list
	listPayload := map[string]any{
		"jsonrpc": "2.0",
		"id":      2,
		"method":  "tools/list",
	}
	body, _ = json.Marshal(listPayload)
	resp, err = http.Post(fmt.Sprintf("http://127.0.0.1:%d/messages", port), "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST tools/list 失败: %v", err)
	}
	defer resp.Body.Close()
	respBytes, _ = io.ReadAll(resp.Body)
	if !bytes.Contains(respBytes, []byte("echo_tool")) {
		t.Fatalf("tools/list 响应未包含 echo_tool: %s", string(respBytes))
	}

	// 6. 测试 POST /messages -> tools/call
	callPayload := map[string]any{
		"jsonrpc": "2.0",
		"id":      3,
		"method":  "tools/call",
		"params": map[string]any{
			"name": "echo_tool",
			"arguments": map[string]any{
				"msg": "hello-mcp",
			},
		},
	}
	body, _ = json.Marshal(callPayload)
	resp, err = http.Post(fmt.Sprintf("http://127.0.0.1:%d/messages", port), "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST tools/call 失败: %v", err)
	}
	defer resp.Body.Close()
	respBytes, _ = io.ReadAll(resp.Body)
	if !bytes.Contains(respBytes, []byte("hello-mcp")) {
		t.Fatalf("tools/call 结果不正确: %s", string(respBytes))
	}
}
