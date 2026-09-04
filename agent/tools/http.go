package tools

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"terminal/agent/guard"

	"github.com/cloudwego/eino/components/tool/utils"
)

// HttpRequestInput 全功能 HTTP 请求输入结构体
type HttpRequestInput struct {
	Method             string            `json:"method,omitempty" jsonschema:"description=HTTP 请求方法 (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)，大小写不敏感，默认为 GET"`
	URL                string            `json:"url" jsonschema:"description=目标 HTTP/HTTPS URL 地址 (若缺少协议头将自动补齐 http://)"`
	Params             map[string]any    `json:"params,omitempty" jsonschema:"description=可选的 URL Query 查询参数字典，会自动进行 URL 编码并拼接到 URL 尾部"`
	Headers            map[string]string `json:"headers,omitempty" jsonschema:"description=可选的自定义请求头键值对，如 Authorization, Content-Type, Accept 等"`
	Body               any               `json:"body,omitempty" jsonschema:"description=请求体内容，可为普通字符串、JSON 对象/数组或字典"`
	FormData           map[string]string `json:"form_data,omitempty" jsonschema:"description=表单数据 (x-www-form-urlencoded)，会自动编码为表单格式并设置对应 Content-Type"`
	ContentType        string            `json:"content_type,omitempty" jsonschema:"description=显式指定 Content-Type，若未指定但 body 为对象时自动设为 application/json"`
	TimeoutSeconds     int               `json:"timeout_seconds,omitempty" jsonschema:"description=请求超时时间（秒），默认 15 秒，最大支持 300 秒"`
	InsecureSkipVerify bool              `json:"insecure_skip_verify,omitempty" jsonschema:"description=是否跳过 SSL/TLS 证书有效性校验（在测试自签名证书或本地 HTTPS 服务时开启）"`
	FollowRedirects    *bool             `json:"follow_redirects,omitempty" jsonschema:"description=是否自动跟随 3xx 重定向，默认为 true"`
	ProxyURL           string            `json:"proxy_url,omitempty" jsonschema:"description=可选的 HTTP/SOCKS5 代理地址，如 http://127.0.0.1:7890"`
}

// HttpRequestOutput 全功能 HTTP 请求输出结构体
type HttpRequestOutput struct {
	StatusCode int               `json:"status_code" jsonschema:"description=HTTP 响应状态码"`
	StatusText string            `json:"status_text" jsonschema:"description=HTTP 响应状态描述文本"`
	Headers    map[string]string `json:"headers" jsonschema:"description=响应头集合"`
	Body       string            `json:"body" jsonschema:"description=完整响应体文本"`
	DurationMs int64             `json:"duration_ms" jsonschema:"description=请求执行总耗时 (毫秒)"`
	Size       int64             `json:"size" jsonschema:"description=响应体总字节数"`
}

// HttpReadonlyInput 兼容旧版的只读输入结构
type HttpReadonlyInput struct {
	URL            string            `json:"url" jsonschema:"description=要请求的 HTTP/HTTPS 完整 URL 地址 (仅允许 GET 请求)"`
	Headers        map[string]string `json:"headers,omitempty" jsonschema:"description=可选的自定义请求头键值对"`
	TimeoutSeconds int               `json:"timeout_seconds,omitempty" jsonschema:"description=请求超时秒数，默认 10 秒"`
}

// HttpReadonlyOutput 兼容旧版的只读输出结构
type HttpReadonlyOutput struct {
	StatusCode int               `json:"status_code"`
	StatusText string            `json:"status_text"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	DurationMs int64             `json:"duration_ms"`
}

// ExecuteHttpRequest 执行全功能 HTTP 请求核心逻辑
func ExecuteHttpRequest(ctx context.Context, input *HttpRequestInput) (*HttpRequestOutput, error) {
	if input == nil {
		return nil, fmt.Errorf("请求参数不能为空")
	}

	rawURL := strings.TrimSpace(input.URL)
	if rawURL == "" {
		return nil, fmt.Errorf("URL 地址不能为空")
	}
	if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
		rawURL = "http://" + rawURL
	}

	// 1. 处理 URL Query 参数拼接
	if len(input.Params) > 0 {
		parsedURL, err := url.Parse(rawURL)
		if err != nil {
			return nil, fmt.Errorf("解析 URL 失败: %w", err)
		}
		query := parsedURL.Query()
		for k, v := range input.Params {
			var valStr string
			switch val := v.(type) {
			case string:
				valStr = val
			case fmt.Stringer:
				valStr = val.String()
			default:
				valStr = fmt.Sprintf("%v", val)
			}
			query.Set(k, valStr)
		}
		parsedURL.RawQuery = query.Encode()
		rawURL = parsedURL.String()
	}

	// 2. HTTP 方法确定
	method := strings.ToUpper(strings.TrimSpace(input.Method))
	if method == "" {
		method = http.MethodGet
	}
	validMethods := map[string]bool{
		http.MethodGet:     true,
		http.MethodPost:    true,
		http.MethodPut:     true,
		http.MethodDelete:  true,
		http.MethodPatch:   true,
		http.MethodHead:    true,
		http.MethodOptions: true,
	}
	if !validMethods[method] {
		return nil, fmt.Errorf("不支持的 HTTP 请求方法: %s (仅支持 GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)", method)
	}

	// 3. 构建请求体与 Content-Type
	var bodyReader io.Reader
	detectedContentType := ""

	if len(input.FormData) > 0 {
		formVals := url.Values{}
		for k, v := range input.FormData {
			formVals.Set(k, v)
		}
		bodyReader = strings.NewReader(formVals.Encode())
		detectedContentType = "application/x-www-form-urlencoded"
	} else if input.Body != nil {
		switch b := input.Body.(type) {
		case string:
			bodyReader = strings.NewReader(b)
			trimmed := strings.TrimSpace(b)
			if (strings.HasPrefix(trimmed, "{") && strings.HasSuffix(trimmed, "}")) ||
				(strings.HasPrefix(trimmed, "[") && strings.HasSuffix(trimmed, "]")) {
				detectedContentType = "application/json; charset=utf-8"
			}
		case []byte:
			bodyReader = bytes.NewReader(b)
		default:
			// 结构体、Map、Slice 等自动进行 JSON 序列化
			jsonBytes, err := json.Marshal(b)
			if err != nil {
				return nil, fmt.Errorf("请求体 JSON 序列化失败: %w", err)
			}
			bodyReader = bytes.NewReader(jsonBytes)
			detectedContentType = "application/json; charset=utf-8"
		}
	}

	req, err := http.NewRequestWithContext(ctx, method, rawURL, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("创建 HTTP 请求对象失败: %w", err)
	}

	// 4. 设置请求头
	for k, v := range input.Headers {
		req.Header.Set(k, v)
	}
	if input.ContentType != "" {
		req.Header.Set("Content-Type", input.ContentType)
	} else if detectedContentType != "" && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", detectedContentType)
	}
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", "xClient-Agent/2.0")
	}

	// 5. 设置超时与 Transport (SSL 跳过、代理、重定向)
	timeout := 15 * time.Second
	if input.TimeoutSeconds > 0 {
		if input.TimeoutSeconds > 300 {
			timeout = 300 * time.Second
		} else {
			timeout = time.Duration(input.TimeoutSeconds) * time.Second
		}
	}

	transport := http.DefaultTransport.(*http.Transport).Clone()

	if input.InsecureSkipVerify {
		if transport.TLSClientConfig == nil {
			transport.TLSClientConfig = &tls.Config{}
		}
		transport.TLSClientConfig.InsecureSkipVerify = true
	}

	if strings.TrimSpace(input.ProxyURL) != "" {
		pURL, err := url.Parse(strings.TrimSpace(input.ProxyURL))
		if err != nil {
			return nil, fmt.Errorf("解析代理地址失败: %w", err)
		}
		transport.Proxy = http.ProxyURL(pURL)
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   timeout,
	}

	if input.FollowRedirects != nil && !*input.FollowRedirects {
		client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		}
	}

	// 6. 执行请求并读取响应
	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP 请求执行失败: %w", err)
	}
	defer resp.Body.Close()

	// 限制单个响应体最大 100MB 防止极端 OOM，正常 API 响应均不截断
	const maxSafetyLimit = 100 * 1024 * 1024
	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, maxSafetyLimit))
	if err != nil {
		return nil, fmt.Errorf("读取 HTTP 响应体失败: %w", err)
	}

	headersOut := make(map[string]string)
	for k, v := range resp.Header {
		if len(v) > 0 {
			headersOut[k] = strings.Join(v, ", ")
		}
	}

	return &HttpRequestOutput{
		StatusCode: resp.StatusCode,
		StatusText: resp.Status,
		Headers:    headersOut,
		Body:       string(bodyBytes),
		DurationMs: time.Since(start).Milliseconds(),
		Size:       int64(len(bodyBytes)),
	}, nil
}

// RegisterHttpTools 注册全功能 http_request 工具以及向后兼容的 http_request_readonly 工具
func RegisterHttpTools(bus *ToolBus) error {
	// 1. 全功能 HTTP 请求工具
	fullHttpTool, err := utils.InferTool(
		"http_request",
		"发送全功能 HTTP/HTTPS 网络请求 (支持 GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS 全方法、Query 参数自动编码、JSON 与表单请求体、自定义 Header、SSL 证书跳过与代理设置)",
		func(ctx context.Context, input *HttpRequestInput) (*HttpRequestOutput, error) {
			return ExecuteHttpRequest(ctx, input)
		},
	)
	if err != nil {
		return fmt.Errorf("初始化 http_request 工具失败: %w", err)
	}

	bus.Register(&RegisteredTool{
		Name:        "http_request",
		Description: "发送全功能 HTTP/HTTPS 网络请求 (支持 GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS 全方法、Query 参数、请求体与 Header)",
		BaseTool:    fullHttpTool,
		Level:       guard.LevelAllow,
	})

	// 2. 向后兼容原有的只读工具 http_request_readonly
	readonlyTool, err := utils.InferTool(
		"http_request_readonly",
		"发送只读 HTTP GET 请求以探测接口或获取服务状态 (向后兼容别名，底层转发至 http_request)",
		func(ctx context.Context, input *HttpReadonlyInput) (*HttpReadonlyOutput, error) {
			res, err := ExecuteHttpRequest(ctx, &HttpRequestInput{
				Method:         http.MethodGet,
				URL:            input.URL,
				Headers:        input.Headers,
				TimeoutSeconds: input.TimeoutSeconds,
			})
			if err != nil {
				return nil, err
			}
			return &HttpReadonlyOutput{
				StatusCode: res.StatusCode,
				StatusText: res.StatusText,
				Headers:    res.Headers,
				Body:       res.Body,
				DurationMs: res.DurationMs,
			}, nil
		},
	)
	if err != nil {
		return fmt.Errorf("初始化 http_request_readonly 兼容工具失败: %w", err)
	}

	bus.Register(&RegisteredTool{
		Name:        "http_request_readonly",
		Description: "发送只读 HTTP GET 请求以探测接口或获取服务状态 (向后兼容别名)",
		BaseTool:    readonlyTool,
		Level:       guard.LevelAllow,
	})

	return nil
}

