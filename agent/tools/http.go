package tools

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"terminal/agent/guard"

	"github.com/cloudwego/eino/components/tool/utils"
)

type HttpReadonlyInput struct {
	URL            string            `json:"url" jsonschema:"description=要请求的 HTTP/HTTPS 完整 URL 地址 (仅允许 GET 请求)"`
	Headers        map[string]string `json:"headers,omitempty" jsonschema:"description=可选的自定义请求头键值对"`
	TimeoutSeconds int               `json:"timeout_seconds,omitempty" jsonschema:"description=请求超时秒数，默认 10 秒"`
}

type HttpReadonlyOutput struct {
	StatusCode int               `json:"status_code"`
	StatusText string            `json:"status_text"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	DurationMs int64             `json:"duration_ms"`
}

func RegisterHttpTools(bus *ToolBus) error {
	httpTool, err := utils.InferTool("http_request_readonly", "发送只读 HTTP GET 请求以探测接口或获取服务状态 (禁止 POST/PUT/DELETE 等写方法)",
		func(ctx context.Context, input *HttpReadonlyInput) (*HttpReadonlyOutput, error) {
			rawURL := strings.TrimSpace(input.URL)
			if rawURL == "" {
				return nil, fmt.Errorf("URL 地址不能为空")
			}
			if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
				rawURL = "http://" + rawURL
			}

			timeout := 10 * time.Second
			if input.TimeoutSeconds > 0 && input.TimeoutSeconds <= 30 {
				timeout = time.Duration(input.TimeoutSeconds) * time.Second
			}

			client := &http.Client{Timeout: timeout}
			req, err := http.NewRequestWithContext(ctx, "GET", rawURL, nil)
			if err != nil {
				return nil, fmt.Errorf("创建 HTTP 请求失败: %w", err)
			}

			for k, v := range input.Headers {
				req.Header.Set(k, v)
			}
			if req.Header.Get("User-Agent") == "" {
				req.Header.Set("User-Agent", "xClient-Agent/2.0")
			}

			start := time.Now()
			resp, err := client.Do(req)
			if err != nil {
				return nil, fmt.Errorf("HTTP 请求执行失败: %w", err)
			}
			defer resp.Body.Close()

			bodyData, err := io.ReadAll(io.LimitReader(resp.Body, 1024*100)) // Max 100KB
			if err != nil {
				return nil, fmt.Errorf("读取响应失败: %w", err)
			}

			headersOut := make(map[string]string)
			for k, v := range resp.Header {
				if len(v) > 0 {
					headersOut[k] = v[0]
				}
			}

			return &HttpReadonlyOutput{
				StatusCode: resp.StatusCode,
				StatusText: resp.Status,
				Headers:    headersOut,
				Body:       string(bodyData),
				DurationMs: time.Since(start).Milliseconds(),
			}, nil
		})
	if err != nil {
		return err
	}

	bus.Register(&RegisteredTool{
		Name:        "http_request_readonly",
		Description: "发送只读 HTTP GET 请求以探测接口或获取服务状态 (禁止 POST/PUT/DELETE 等写方法)",
		BaseTool:    httpTool,
		Level:       guard.LevelAllow,
	})
	return nil
}
