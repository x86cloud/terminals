package services

import (
	"context"
	"terminal/agent"
	"terminal/agent/mcp"
	"terminal/logger"
)

type McpService struct{}

func NewMcpService() *McpService {
	return &McpService{}
}

// GetMcpServerStatus 获取当前内置 MCP Server 的运行状态指标
func (s *McpService) GetMcpServerStatus() (mcp.ServerStatus, error) {
	c := GetContainer()
	if c.McpServer == nil {
		return mcp.ServerStatus{}, nil
	}
	return c.McpServer.Status(), nil
}

// RestartMcpServer 根据当前最新 AppSettings 重启或平滑启停 MCP Server
func (s *McpService) RestartMcpServer() (mcp.ServerStatus, error) {
	c := GetContainer()
	if c.McpServer == nil || c.Store == nil {
		return mcp.ServerStatus{}, nil
	}
	settings := c.Store.GetSettings()

	// 1. 确保适配器同步最新工具注册表
	c.McpServer.SetAdapter(mcp.NewToolAdapter(agent.DefaultRuntime.ToolBus))

	// 2. 停止现有服务监听
	_ = c.McpServer.Stop()

	// 3. 若配置开启，则启动新监听
	if settings.McpServerEnabled {
		host := settings.McpServerHost
		if host == "" {
			host = "127.0.0.1"
		}
		port := settings.McpServerPort
		if port <= 0 {
			port = 4096
		}
		logger.Infof("正在根据配置重启 MCP Server [Host=%s, Port=%d]...", host, port)
		if err := c.McpServer.Start(host, port); err != nil {
			logger.Errorf("重启 MCP Server 失败: %v", err)
			return c.McpServer.Status(), err
		}
	}

	return c.McpServer.Status(), nil
}

// GetMcpTools 获取已注册且对外暴露的标准 MCP 工具定义列表
func (s *McpService) GetMcpTools() ([]mcp.ToolDefinition, error) {
	c := GetContainer()
	if c.McpServer == nil {
		return nil, nil
	}
	adapter := mcp.NewToolAdapter(agent.DefaultRuntime.ToolBus)
	return adapter.ListTools(context.Background()), nil
}

// GetMcpSessions 获取当前已连接的外部 MCP 客户端会话列表
func (s *McpService) GetMcpSessions() ([]mcp.SessionInfo, error) {
	c := GetContainer()
	if c.McpServer == nil {
		return nil, nil
	}
	return c.McpServer.ListSessions(), nil
}
