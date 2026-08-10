package proto

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// WsConnectRequest 是建立 WebSocket 连接所需的参数
type WsConnectRequest struct {
	URL         string      `json:"url"`
	Headers     []ApiHeader `json:"headers"`
	InsecureTLS bool        `json:"insecureTLS"`
	Auth        *ApiAuth    `json:"auth,omitempty"`
	Protocols   []string    `json:"protocols"`
}

// WsConnectResult 是连接结果
type WsConnectResult struct {
	ID     string `json:"id"`
	URL    string `json:"url"`
	Status string `json:"status"`
	Error  string `json:"error"`
}

// WsStatusEvent 描述连接状态变化
type WsStatusEvent struct {
	Status string `json:"status"`
	Error  string `json:"error"`
}

// WsMessageEvent 描述一条收发消息
type WsMessageEvent struct {
	Dir     string `json:"dir"` // in | out
	Payload string `json:"payload"`
	Type    string `json:"type"` // text | binary
	Ts      int64  `json:"ts"`
	Error   string `json:"error"`
}

type wsConn struct {
	id        string
	conn      *websocket.Conn
	done      chan struct{}
	closeOnce sync.Once
}

type WsManager struct {
	mu    sync.Mutex
	ctx   context.Context
	conns map[string]*wsConn
}

func NewWsManager() *WsManager {
	return &WsManager{conns: map[string]*wsConn{}}
}

func (m *WsManager) SetContext(ctx context.Context) {
	m.ctx = ctx
}

func (m *WsManager) get(id string) (*wsConn, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.conns[id]
	return c, ok
}

func (m *WsManager) put(c *wsConn) {
	m.mu.Lock()
	m.conns[c.id] = c
	m.mu.Unlock()
}

func (m *WsManager) close(id string) {
	m.mu.Lock()
	c, ok := m.conns[id]
	if ok {
		delete(m.conns, id)
	}
	m.mu.Unlock()
	if !ok {
		return
	}
	c.closeOnce.Do(func() {
		close(c.done)
		_ = c.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
		_ = c.conn.Close()
	})
}

func (m *WsManager) CloseAll() {
	m.mu.Lock()
	conns := make([]*wsConn, 0, len(m.conns))
	for _, c := range m.conns {
		conns = append(conns, c)
	}
	m.conns = make(map[string]*wsConn)
	m.mu.Unlock()

	for _, c := range conns {
		c.closeOnce.Do(func() {
			close(c.done)
			_ = c.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			_ = c.conn.Close()
		})
	}
}

// WsConnect 建立一个新的 WebSocket 连接，连接成功后持续推送消息事件
func (m *WsManager) WsConnect(req WsConnectRequest) (WsConnectResult, error) {
	url := strings.TrimSpace(req.URL)
	if url == "" {
		return WsConnectResult{}, errors.New("WebSocket 地址不能为空")
	}
	if !strings.HasPrefix(url, "ws://") && !strings.HasPrefix(url, "wss://") {
		return WsConnectResult{}, errors.New("WebSocket 地址需以 ws:// 或 wss:// 开头")
	}

	id := uuid.NewString()
	header := make(http.Header)
	for _, h := range req.Headers {
		if !h.Enabled || strings.TrimSpace(h.Name) == "" {
			continue
		}
		header.Set(h.Name, h.Value)
	}
	if req.Auth != nil && req.Auth.Type != "none" {
		switch req.Auth.Type {
		case "basic":
			raw := req.Auth.Username + ":" + req.Auth.Password
			header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(raw)))
		case "bearer":
			if t := strings.TrimSpace(req.Auth.Token); t != "" {
				header.Set("Authorization", "Bearer "+t)
			}
		}
	}

	d := &websocket.Dialer{
		HandshakeTimeout: 15 * time.Second,
	}
	if req.InsecureTLS {
		d.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}
	if len(req.Protocols) > 0 {
		d.Subprotocols = req.Protocols
	}

	c, resp, err := d.Dial(url, header)
	if err != nil {
		errMsg := err.Error()
		if resp != nil {
			errMsg = fmt.Sprintf("握手失败 [%d]: %s", resp.StatusCode, err.Error())
		}
		return WsConnectResult{Error: errMsg}, err
	}

	conn := &wsConn{id: id, conn: c, done: make(chan struct{})}
	m.put(conn)

	if m.ctx != nil {
		wruntime.EventsEmit(m.ctx, "ws:status:"+id, WsStatusEvent{Status: "open"})
		wruntime.EventsEmit(m.ctx, "ws:message:"+id, WsMessageEvent{
			Dir: "sys", Payload: "已连接到 " + url, Type: "system", Ts: time.Now().UnixMilli(),
		})
	}

	go m.wsReadLoop(conn)
	return WsConnectResult{ID: id, URL: url, Status: "open"}, nil
}

func (m *WsManager) wsReadLoop(conn *wsConn) {
	for {
		select {
		case <-conn.done:
			return
		default:
		}
		mt, data, err := conn.conn.ReadMessage()
		if err != nil {
			if m.ctx != nil {
				wruntime.EventsEmit(m.ctx, "ws:status:"+conn.id, WsStatusEvent{Status: "closed", Error: err.Error()})
				wruntime.EventsEmit(m.ctx, "ws:message:"+conn.id, WsMessageEvent{
					Dir: "sys", Payload: "连接已关闭: " + err.Error(), Type: "system", Ts: time.Now().UnixMilli(),
				})
			}
			m.close(conn.id)
			return
		}
		payload := string(data)
		typ := "text"
		if mt == websocket.BinaryMessage {
			payload = base64.StdEncoding.EncodeToString(data)
			typ = "binary"
		}
		if m.ctx != nil {
			wruntime.EventsEmit(m.ctx, "ws:message:"+conn.id, WsMessageEvent{
				Dir: "in", Payload: payload, Type: typ, Ts: time.Now().UnixMilli(),
			})
		}
	}
}

// WsSend 通过指定连接发送一条文本消息
func (m *WsManager) WsSend(id string, message string) error {
	c, ok := m.get(id)
	if !ok {
		return errors.New("WebSocket 连接不存在或已断开")
	}
	if err := c.conn.WriteMessage(websocket.TextMessage, []byte(message)); err != nil {
		return err
	}
	if m.ctx != nil {
		wruntime.EventsEmit(m.ctx, "ws:message:"+id, WsMessageEvent{
			Dir: "out", Payload: message, Type: "text", Ts: time.Now().UnixMilli(),
		})
	}
	return nil
}

// WsClose 关闭指定连接
func (m *WsManager) WsClose(id string) {
	m.close(id)
	if m.ctx != nil {
		wruntime.EventsEmit(m.ctx, "ws:message:"+id, WsMessageEvent{
			Dir: "sys", Payload: "已主动断开连接", Type: "system", Ts: time.Now().UnixMilli(),
		})
		wruntime.EventsEmit(m.ctx, "ws:status:"+id, WsStatusEvent{Status: "closed"})
	}
}
