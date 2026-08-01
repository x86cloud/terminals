package main

import (
	"context"
	"crypto/tls"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ApiHeader 是请求头的一行，支持启用/禁用。
type ApiHeader struct {
	Name    string `json:"name"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

// ApiAuth 描述鉴权信息。
type ApiAuth struct {
	Type     string `json:"type"` // none | basic | bearer
	Username string `json:"username"`
	Password string `json:"password"`
	Token    string `json:"token"`
}

// ApiRequest 描述一次 HTTP 调试请求。
type ApiRequest struct {
	Method         string      `json:"method"`
	URL            string      `json:"url"`
	Headers        []ApiHeader `json:"headers"`
	Body           string      `json:"body"`
	TimeoutMs      int         `json:"timeoutMs"`
	InsecureTLS    bool        `json:"insecureTLS"`
	FollowRedirects bool       `json:"followRedirects"`
	Auth           *ApiAuth    `json:"auth,omitempty"`
}

// ApiResponse 描述一次 HTTP 调试的响应结果。
type ApiResponse struct {
	Status      string            `json:"status"`
	StatusCode  int               `json:"statusCode"`
	Proto       string            `json:"proto"`
	Headers     map[string]string `json:"headers"`
	Body        string            `json:"body"`
	DurationMs  int64             `json:"durationMs"`
	Size        int64             `json:"size"`
	Error       string            `json:"error"`
}

// 不需要发送请求体的方法。
var noBodyMethods = map[string]bool{
	"GET":  true,
	"HEAD": true,
}

// ApiRequest 在后端执行一次 HTTP 请求，返回结构化结果。
// 网络错误、超时、非 2xx 状态都会返回（写入 Error / StatusCode），不会让调用失败。
func (a *App) ApiRequest(req ApiRequest) (ApiResponse, error) {
	resp := ApiResponse{Headers: map[string]string{}}
	if strings.TrimSpace(req.URL) == "" {
		resp.Error = "请求地址不能为空"
		return resp, nil
	}
	u, err := url.Parse(strings.TrimSpace(req.URL))
	if err != nil {
		resp.Error = "无效的请求地址: " + err.Error()
		return resp, nil
	}
	if u.Scheme == "" || u.Host == "" {
		resp.Error = "请求地址需要包含协议和主机，如 https://example.com/api"
		return resp, nil
	}

	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if method == "" {
		method = "GET"
	}

	var bodyReader io.Reader
	if !noBodyMethods[method] && req.Body != "" {
		bodyReader = strings.NewReader(req.Body)
	}

	httpReq, err := http.NewRequest(method, u.String(), bodyReader)
	if err != nil {
		resp.Error = "构造请求失败: " + err.Error()
		return resp, nil
	}

	// 应用请求头（跳过禁用项与 Host）。
	for _, h := range req.Headers {
		if !h.Enabled || strings.TrimSpace(h.Name) == "" {
			continue
		}
		if strings.EqualFold(h.Name, "Host") {
			continue
		}
		httpReq.Header.Set(h.Name, h.Value)
	}

	// 鉴权。
	if req.Auth != nil {
		switch req.Auth.Type {
		case "basic":
			httpReq.SetBasicAuth(req.Auth.Username, req.Auth.Password)
		case "bearer":
			token := strings.TrimSpace(req.Auth.Token)
			if token != "" {
				httpReq.Header.Set("Authorization", "Bearer "+token)
			}
		}
	}

	// 客户端配置。
	timeout := time.Duration(req.TimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: req.InsecureTLS}, //nolint:gosec
	}
	client := &http.Client{
		Transport: transport,
		Timeout:   timeout,
	}
	if !req.FollowRedirects {
		client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	httpReq = httpReq.WithContext(ctx)

	start := time.Now()
	httpResp, err := client.Do(httpReq)
	resp.DurationMs = time.Since(start).Milliseconds()
	if err != nil {
		resp.Error = "请求失败: " + err.Error()
		return resp, nil
	}
	defer httpResp.Body.Close()

	resp.Status = httpResp.Status
	resp.StatusCode = httpResp.StatusCode
	resp.Proto = httpResp.Proto
	for k, vals := range httpResp.Header {
		if len(vals) > 0 {
			resp.Headers[k] = vals[0]
		}
	}

	// 读取响应体，限制最大 16MB 避免内存暴涨。
	const maxBody = 16 << 20
	raw, err := io.ReadAll(io.LimitReader(httpResp.Body, maxBody+1))
	if err != nil {
		resp.Error = "读取响应失败: " + err.Error()
		return resp, nil
	}
	resp.Size = int64(len(raw))
	if len(raw) > maxBody {
		resp.Body = string(raw[:maxBody]) +
			"\n\n[响应体过大，已截断至 16MB]"
	} else {
		resp.Body = string(raw)
	}

	return resp, nil
}
