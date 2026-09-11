package tools

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"terminal/agent/events"
	"terminal/agent/guard"
)

func TestHttp_Methods(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			name := r.URL.Query().Get("name")
			w.Header().Set("X-Custom-Echo", "pong")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"message":"hello ` + name + `"}`))
		case http.MethodPost:
			ct := r.Header.Get("Content-Type")
			body, _ := io.ReadAll(r.Body)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"received_ct":"` + ct + `","body":` + string(body) + `}`))
		case http.MethodPut:
			body, _ := io.ReadAll(r.Body)
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("updated: " + string(body)))
		case http.MethodDelete:
			id := r.URL.Query().Get("id")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("deleted: " + id))
		case http.MethodPatch:
			ct := r.Header.Get("Content-Type")
			body, _ := io.ReadAll(r.Body)
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("patched " + ct + ": " + string(body)))
		case http.MethodHead:
			w.Header().Set("X-Head-Check", "ok")
			w.WriteHeader(http.StatusOK)
		case http.MethodOptions:
			w.Header().Set("Allow", "GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS")
			w.WriteHeader(http.StatusNoContent)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	}))
	defer ts.Close()

	ctx := context.Background()

	// 1. 测试 GET 与 Query Params
	getRes, err := ExecuteHttpRequest(ctx, &HttpRequestInput{
		Method: "GET",
		URL:    ts.URL,
		Params: map[string]any{
			"name": "developer",
		},
	})
	if err != nil {
		t.Fatalf("GET 请求失败: %v", err)
	}
	if getRes.StatusCode != http.StatusOK {
		t.Errorf("期望 200, 实际 %d", getRes.StatusCode)
	}
	if getRes.Headers["X-Custom-Echo"] != "pong" {
		t.Errorf("期望 Header X-Custom-Echo 为 pong, 实际 %v", getRes.Headers["X-Custom-Echo"])
	}
	if getRes.Body != `{"message":"hello developer"}` {
		t.Errorf("GET 响应内容不符合预期: %s", getRes.Body)
	}

	// 2. 测试 POST 与 JSON Body
	postRes, err := ExecuteHttpRequest(ctx, &HttpRequestInput{
		Method: "POST",
		URL:    ts.URL,
		Body: map[string]any{
			"action": "create_item",
			"count":  42,
		},
	})
	if err != nil {
		t.Fatalf("POST 请求失败: %v", err)
	}
	if postRes.StatusCode != http.StatusCreated {
		t.Errorf("期望 201, 实际 %d", postRes.StatusCode)
	}
	var postData struct {
		ReceivedCT string         `json:"received_ct"`
		Body       map[string]any `json:"body"`
	}
	if err := json.Unmarshal([]byte(postRes.Body), &postData); err != nil {
		t.Fatalf("反序列化 POST 响应失败: %v", err)
	}
	if postData.Body["action"] != "create_item" {
		t.Errorf("POST Body 数据丢失或不匹配: %v", postData.Body)
	}

	// 3. 测试 PUT 与 Raw String Body
	putRes, err := ExecuteHttpRequest(ctx, &HttpRequestInput{
		Method: "PUT",
		URL:    ts.URL,
		Body:   "raw-put-content",
	})
	if err != nil {
		t.Fatalf("PUT 请求失败: %v", err)
	}
	if putRes.StatusCode != http.StatusOK || putRes.Body != "updated: raw-put-content" {
		t.Errorf("PUT 响应不匹配: %s", putRes.Body)
	}

	// 4. 测试 DELETE 与 Query
	delRes, err := ExecuteHttpRequest(ctx, &HttpRequestInput{
		Method: "DELETE",
		URL:    ts.URL,
		Params: map[string]any{"id": "item_999"},
	})
	if err != nil {
		t.Fatalf("DELETE 请求失败: %v", err)
	}
	if delRes.StatusCode != http.StatusOK || delRes.Body != "deleted: item_999" {
		t.Errorf("DELETE 响应不匹配: %s", delRes.Body)
	}

	// 5. 测试 PATCH 与 FormData (x-www-form-urlencoded)
	patchRes, err := ExecuteHttpRequest(ctx, &HttpRequestInput{
		Method: "PATCH",
		URL:    ts.URL,
		FormData: map[string]string{
			"status": "active",
			"tier":   "pro",
		},
	})
	if err != nil {
		t.Fatalf("PATCH 请求失败: %v", err)
	}
	if patchRes.StatusCode != http.StatusOK {
		t.Errorf("PATCH 状态码异常: %d", patchRes.StatusCode)
	}

	// 6. 测试 HEAD
	headRes, err := ExecuteHttpRequest(ctx, &HttpRequestInput{
		Method: "HEAD",
		URL:    ts.URL,
	})
	if err != nil {
		t.Fatalf("HEAD 请求失败: %v", err)
	}
	if headRes.StatusCode != http.StatusOK {
		t.Errorf("HEAD 状态码异常: %d", headRes.StatusCode)
	}
	if headRes.Headers["X-Head-Check"] != "ok" {
		t.Errorf("HEAD Headers 不符合预期: %v", headRes.Headers)
	}

	// 7. 测试 OPTIONS
	optRes, err := ExecuteHttpRequest(ctx, &HttpRequestInput{
		Method: "OPTIONS",
		URL:    ts.URL,
	})
	if err != nil {
		t.Fatalf("OPTIONS 请求失败: %v", err)
	}
	if optRes.StatusCode != http.StatusNoContent {
		t.Errorf("OPTIONS 状态码异常: %d", optRes.StatusCode)
	}
}

func TestHttp_Redirect(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/redirect" {
			http.Redirect(w, r, "/target", http.StatusFound)
			return
		}
		if r.URL.Path == "/target" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("landed"))
			return
		}
	}))
	defer ts.Close()

	ctx := context.Background()

	// 默认自动跟随重定向
	resFollow, err := ExecuteHttpRequest(ctx, &HttpRequestInput{
		URL: ts.URL + "/redirect",
	})
	if err != nil {
		t.Fatalf("重定向请求失败: %v", err)
	}
	if resFollow.StatusCode != http.StatusOK || resFollow.Body != "landed" {
		t.Errorf("未能跟随重定向至最终页面: status=%d, body=%s", resFollow.StatusCode, resFollow.Body)
	}

	// 关闭跟随重定向
	followFalse := false
	resNoFollow, err := ExecuteHttpRequest(ctx, &HttpRequestInput{
		URL:             ts.URL + "/redirect",
		FollowRedirects: &followFalse,
	})
	if err != nil {
		t.Fatalf("不重定向请求失败: %v", err)
	}
	if resNoFollow.StatusCode != http.StatusFound {
		t.Errorf("期望 302 Found, 实际 %d", resNoFollow.StatusCode)
	}
}

func TestHttp_InsecureSkipVerify(t *testing.T) {
	tlsServer := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("secure-content"))
	}))
	defer tlsServer.Close()

	ctx := context.Background()

	// 1. 跳过证书校验应能正常访问自签 HTTPS
	res, err := ExecuteHttpRequest(ctx, &HttpRequestInput{
		URL:                tlsServer.URL,
		InsecureSkipVerify: true,
	})
	if err != nil {
		t.Fatalf("跳过证书校验应请求成功: %v", err)
	}
	if res.StatusCode != http.StatusOK || res.Body != "secure-content" {
		t.Errorf("HTTPS 响应异常: %s", res.Body)
	}

	// 2. 开启证书校验时针对测试自签证书应报错
	_, errCert := ExecuteHttpRequest(ctx, &HttpRequestInput{
		URL:                tlsServer.URL,
		InsecureSkipVerify: false,
	})
	if errCert == nil {
		t.Error("未开启 InsecureSkipVerify 时自签名证书应报错，但未报错")
	}
}

func TestHttp_ToolBusRegistration(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer ts.Close()

	g := guard.NewPolicyGuard(true, false, nil)
	eb := events.NewEventBus()
	bus := NewToolBus(g, eb)

	if err := RegisterHttpTools(bus); err != nil {
		t.Fatalf("注册 HTTP 工具失败: %v", err)
	}

	// 验证 http_request 工具已注册
	fullTool, ok := bus.Get("http_request")
	if !ok {
		t.Fatal("未找到 http_request 工具")
	}
	if fullTool.Level != guard.LevelAllow {
		t.Errorf("http_request 权限等级应为 LevelAllow, 实际 %s", fullTool.Level)
	}

	// 通过 ToolBus.Invoke 测试全功能 http_request
	inputJSON, _ := json.Marshal(HttpRequestInput{
		Method: "GET",
		URL:    ts.URL,
	})
	res := bus.Invoke(context.Background(), "trace_1", "session_1", "http_request", string(inputJSON))
	if !res.OK {
		t.Fatalf("ToolBus 调用 http_request 失败: %s", res.Error)
	}
}
