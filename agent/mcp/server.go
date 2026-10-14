package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"sync"
	"time"

	"terminal/logger"

	"github.com/google/uuid"
)

type SessionInfo struct {
	ID           string    `json:"id"`
	RemoteAddr   string    `json:"remoteAddr"`
	UserAgent    string    `json:"userAgent"`
	ConnectedAt  time.Time `json:"connectedAt"`
	LastActiveAt time.Time `json:"lastActiveAt"`
	ch           chan []byte
}

type ServerStatus struct {
	Running       bool   `json:"running"`
	Host          string `json:"host"`
	Port          int    `json:"port"`
	Endpoint      string `json:"endpoint"`
	ToolsCount    int    `json:"toolsCount"`
	SessionsCount int    `json:"sessionsCount"`
	UptimeSeconds int64  `json:"uptimeSeconds"`
}

type Server struct {
	mu        sync.RWMutex
	adapter   *ToolAdapter
	httpSrv   *http.Server
	listener  net.Listener
	host      string
	port      int
	startTime time.Time
	running   bool

	sessionsMu sync.RWMutex
	sessions   map[string]*SessionInfo
}

func NewServer(adapter *ToolAdapter) *Server {
	return &Server{
		adapter:  adapter,
		sessions: make(map[string]*SessionInfo),
	}
}

func (s *Server) SetAdapter(adapter *ToolAdapter) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.adapter = adapter
}

func (s *Server) Status() ServerStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	toolsCount := 0
	if s.adapter != nil {
		toolsCount = len(s.adapter.ListTools(context.Background()))
	}

	s.sessionsMu.RLock()
	sessCount := len(s.sessions)
	s.sessionsMu.RUnlock()

	var uptime int64
	if s.running && !s.startTime.IsZero() {
		uptime = int64(time.Since(s.startTime).Seconds())
	}

	endpoint := ""
	if s.running {
		endpoint = fmt.Sprintf("http://%s:%d/sse", s.host, s.port)
	}

	return ServerStatus{
		Running:       s.running,
		Host:          s.host,
		Port:          s.port,
		Endpoint:      endpoint,
		ToolsCount:    toolsCount,
		SessionsCount: sessCount,
		UptimeSeconds: uptime,
	}
}

func (s *Server) ListSessions() []SessionInfo {
	s.sessionsMu.RLock()
	defer s.sessionsMu.RUnlock()

	list := make([]SessionInfo, 0, len(s.sessions))
	for _, sess := range s.sessions {
		list = append(list, SessionInfo{
			ID:           sess.ID,
			RemoteAddr:   sess.RemoteAddr,
			UserAgent:    sess.UserAgent,
			ConnectedAt:  sess.ConnectedAt,
			LastActiveAt: sess.LastActiveAt,
		})
	}
	return list
}

func (s *Server) Start(host string, port int) error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return nil
	}

	if host == "" {
		host = "127.0.0.1"
	}
	if port <= 0 {
		port = 4096
	}

	addr := fmt.Sprintf("%s:%d", host, port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("启动 MCP 监听端口 %s 失败: %w", addr, err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/sse", s.handleSSE)
	mux.HandleFunc("/messages", s.handleMessages)
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/", s.handleRoot)

	srv := &http.Server{
		Handler:      s.corsMiddleware(mux),
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 60 * time.Second,
	}

	s.httpSrv = srv
	s.listener = ln
	s.host = host
	s.port = port
	s.startTime = time.Now()
	s.running = true
	s.mu.Unlock()

	logger.Infof("MCP Server 启动成功: http://%s/sse", addr)

	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Errorf("MCP Server 运行异常: %v", err)
			s.mu.Lock()
			s.running = false
			s.mu.Unlock()
		}
	}()

	return nil
}

func (s *Server) Stop() error {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	var err error
	if s.httpSrv != nil {
		err = s.httpSrv.Shutdown(ctx)
	}
	s.running = false
	s.startTime = time.Time{}
	s.mu.Unlock()

	s.sessionsMu.Lock()
	for id, sess := range s.sessions {
		close(sess.ch)
		delete(s.sessions, id)
	}
	s.sessionsMu.Unlock()

	logger.Infof("MCP Server 已停止")
	return err
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "*")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":  "ok",
		"service": "terminals-mcp-server",
		"version": "1.0.0",
		"running": s.running,
	})
}

func (s *Server) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	s.handleHealth(w, r)
}

func (s *Server) handleSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	sessionID := uuid.NewString()
	sess := &SessionInfo{
		ID:           sessionID,
		RemoteAddr:   r.RemoteAddr,
		UserAgent:    r.UserAgent(),
		ConnectedAt:  time.Now(),
		LastActiveAt: time.Now(),
		ch:           make(chan []byte, 100),
	}

	s.sessionsMu.Lock()
	s.sessions[sessionID] = sess
	s.sessionsMu.Unlock()

	defer func() {
		s.sessionsMu.Lock()
		delete(s.sessions, sessionID)
		s.sessionsMu.Unlock()
	}()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	// 1. 发送标准 endpoint 事件 (告知客户端向何处 POST 请求)
	endpointURL := fmt.Sprintf("/messages?sessionId=%s", sessionID)
	fmt.Fprintf(w, "event: endpoint\ndata: %s\n\n", endpointURL)
	flusher.Flush()

	logger.Infof("MCP 客户端已连接 [SessionID=%s, IP=%s]", sessionID, r.RemoteAddr)

	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			logger.Infof("MCP 客户端连接已关闭 [SessionID=%s]", sessionID)
			return
		case msg, ok := <-sess.ch:
			if !ok {
				return
			}
			fmt.Fprintf(w, "event: message\ndata: %s\n\n", string(msg))
			flusher.Flush()
		case <-ticker.C:
			// 发送心跳保持长连接
			fmt.Fprintf(w, ": keepalive\n\n")
			flusher.Flush()
		}
	}
}

func (s *Server) handleMessages(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionID := r.URL.Query().Get("sessionId")
	if sessionID != "" {
		s.sessionsMu.Lock()
		if sess, ok := s.sessions[sessionID]; ok {
			sess.LastActiveAt = time.Now()
		}
		s.sessionsMu.Unlock()
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(NewErrorResponse(nil, CodeParseError, "读取请求体失败", err.Error()))
		return
	}
	defer r.Body.Close()

	var req JSONRPCRequest
	if err := json.Unmarshal(body, &req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(NewErrorResponse(nil, CodeParseError, "解析 JSON-RPC 请求失败", err.Error()))
		return
	}

	resp := s.dispatchRPC(r.Context(), req)

	// 如果没有 ID（通知类型请求），直接返回 202 Accepted
	if req.ID == nil {
		w.WriteHeader(http.StatusAccepted)
		return
	}

	respBytes, _ := json.Marshal(resp)

	// 双轨回传：如果有活动的 SSE channel，向其推送 message 事件；同时作为 HTTP 响应返回
	if sessionID != "" {
		s.sessionsMu.RLock()
		if sess, ok := s.sessions[sessionID]; ok {
			select {
			case sess.ch <- respBytes:
			default:
			}
		}
		s.sessionsMu.RUnlock()
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(respBytes)
}

func (s *Server) dispatchRPC(ctx context.Context, req JSONRPCRequest) JSONRPCResponse {
	switch req.Method {
	case "initialize":
		var params InitializeParams
		if len(req.Params) > 0 {
			_ = json.Unmarshal(req.Params, &params)
		}
		result := InitializeResult{
			ProtocolVersion: MCPProtocolVersion,
			Capabilities: ServerCapabilities{
				Tools: &ToolsCapability{ListChanged: false},
			},
			ServerInfo: ImplementationInfo{
				Name:    "terminals-mcp-server",
				Version: "1.0.0",
			},
		}
		return NewResponse(req.ID, result)

	case "notifications/initialized":
		return NewResponse(req.ID, map[string]any{})

	case "ping":
		return NewResponse(req.ID, map[string]any{})

	case "tools/list":
		s.mu.RLock()
		adapter := s.adapter
		s.mu.RUnlock()

		var toolsList []ToolDefinition
		if adapter != nil {
			toolsList = adapter.ListTools(ctx)
		}
		return NewResponse(req.ID, ToolsListResult{
			Tools: toolsList,
		})

	case "tools/call":
		s.mu.RLock()
		adapter := s.adapter
		s.mu.RUnlock()

		if adapter == nil {
			return NewErrorResponse(req.ID, CodeInternalError, "ToolAdapter 未初始化", nil)
		}

		var params CallToolParams
		if err := json.Unmarshal(req.Params, &params); err != nil {
			return NewErrorResponse(req.ID, CodeInvalidParams, "解析 tools/call 参数失败", err.Error())
		}

		callRes := adapter.CallTool(ctx, params.Name, params.Arguments)
		return NewResponse(req.ID, callRes)

	default:
		return NewErrorResponse(req.ID, CodeMethodNotFound, fmt.Sprintf("不支持的方法: %s", req.Method), nil)
	}
}
