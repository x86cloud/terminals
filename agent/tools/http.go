package tools

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
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
	ApiID              string            `json:"api_id,omitempty" jsonschema:"description=可选已保存接口的 ID (若提供将自动从接口列表中加载该接口的 URL/Method/Headers/Params/Body/Auth 等基础配置)"`
	ApiName            string            `json:"api_name,omitempty" jsonschema:"description=可选已保存接口的名称 (用于通过名称查找已存接口配置)"`
	Method             string            `json:"method,omitempty" jsonschema:"description=HTTP 请求方法 (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)，大小写不敏感，默认为 GET 或从已保存接口继承"`
	URL                string            `json:"url,omitempty" jsonschema:"description=目标 HTTP/HTTPS URL 地址 (若缺少协议头将自动补齐 http://；若提供了 api_id/api_name 可省略)"`
	Params             map[string]any    `json:"params,omitempty" jsonschema:"description=可选的 URL Query 查询参数字典，会自动进行 URL 编码并拼接到 URL 尾部 (会与已保存接口的参数合并)"`
	Headers            map[string]string `json:"headers,omitempty" jsonschema:"description=可选的自定义请求头键值对，如 Authorization, Content-Type, Accept 等 (会与已保存接口的请求头合并)"`
	Body               any               `json:"body,omitempty" jsonschema:"description=请求体内容，可为普通字符串、JSON 对象/数组或字典"`
	FormData           map[string]string `json:"form_data,omitempty" jsonschema:"description=表单数据 (x-www-form-urlencoded)，会自动编码为表单格式并设置对应 Content-Type"`
	ContentType        string            `json:"content_type,omitempty" jsonschema:"description=显式指定 Content-Type，若未指定但 body 为对象时自动设为 application/json"`
	TimeoutSeconds     int               `json:"timeout_seconds,omitempty" jsonschema:"description=请求超时时间（秒），默认 15 秒，最大支持 300 秒"`
	InsecureSkipVerify bool              `json:"insecure_skip_verify,omitempty" jsonschema:"description=是否跳过 SSL/TLS 证书有效性校验（在测试自签名证书或本地 HTTPS 服务时开启）"`
	FollowRedirects    *bool             `json:"follow_redirects,omitempty" jsonschema:"description=是否自动跟随 3xx 重定向，默认为 true"`
	ProxyURL           string            `json:"proxy_url,omitempty" jsonschema:"description=可选的 HTTP/SOCKS5 代理地址，如 http://127.0.0.1:7890"`
	SaveToList         bool              `json:"save_to_list,omitempty" jsonschema:"description=是否在执行后将本次请求保存/更新到接口列表中，默认 false"`
	SaveName           string            `json:"save_name,omitempty" jsonschema:"description=保存到接口列表时的接口名称 (若未提供且指定了 api_id 则更新原接口，否则使用 URL 或请求方法作为名称)"`
	TargetFolderID     string            `json:"target_folder_id,omitempty" jsonschema:"description=保存到接口列表时的目标分组 ID (默认为默认分组或根目录)"`
}

// HttpRequestOutput 全功能 HTTP 请求输出结构体
type HttpRequestOutput struct {
	StatusCode int               `json:"status_code" jsonschema:"description=HTTP 响应状态码"`
	StatusText string            `json:"status_text" jsonschema:"description=HTTP 响应状态描述文本"`
	Headers    map[string]string `json:"headers" jsonschema:"description=响应头集合"`
	Body       string            `json:"body" jsonschema:"description=完整响应体文本"`
	DurationMs int64             `json:"duration_ms" jsonschema:"description=请求执行总耗时 (毫秒)"`
	Size       int64             `json:"size" jsonschema:"description=响应体总字节数"`
	SavedApiID string            `json:"saved_api_id,omitempty" jsonschema:"description=若保存到接口列表，返回保存/更新后的接口 ID"`
}

// ExecuteHttpRequest 执行全功能 HTTP 请求核心逻辑
func ExecuteHttpRequest(ctx context.Context, input *HttpRequestInput) (*HttpRequestOutput, error) {
	if input == nil {
		return nil, fmt.Errorf("请求参数不能为空")
	}

	// 若提供了 api_id 或 api_name，优先从接口列表中加载已保存的接口配置
	var loadedSavedItem *ApiTreeItem
	if strings.TrimSpace(input.ApiID) != "" || strings.TrimSpace(input.ApiName) != "" {
		targetQuery := strings.TrimSpace(input.ApiID)
		if targetQuery == "" {
			targetQuery = strings.TrimSpace(input.ApiName)
		}
		nodes, err := LoadApiTreeNodes()
		if err != nil {
			return nil, fmt.Errorf("加载接口树列表失败: %w", err)
		}
		item := FindNodeByIDOrName(nodes, targetQuery)
		if item == nil {
			return nil, fmt.Errorf("在已保存接口列表中未找到 ID 或名称为「%s」的接口", targetQuery)
		}
		if item.IsFolder {
			return nil, fmt.Errorf("指定的 ID/名称「%s」是一个分组而非接口", targetQuery)
		}
		loadedSavedItem = item

		// 继承配置
		if strings.TrimSpace(input.Method) == "" && item.Method != "" {
			input.Method = item.Method
		}
		if strings.TrimSpace(input.URL) == "" && item.URL != "" {
			input.URL = item.URL
		}
		// Params 基础填充与合并
		if len(item.Params) > 0 {
			mergedParams := make(map[string]any)
			for _, p := range item.Params {
				if p.Enabled && strings.TrimSpace(p.Name) != "" {
					mergedParams[p.Name] = p.Value
				}
			}
			for k, v := range input.Params {
				mergedParams[k] = v
			}
			input.Params = mergedParams
		}
		// Headers 基础填充与合并
		if len(item.Headers) > 0 || item.Auth != nil {
			mergedHeaders := make(map[string]string)
			for _, h := range item.Headers {
				if h.Enabled && strings.TrimSpace(h.Name) != "" {
					mergedHeaders[h.Name] = h.Value
				}
			}
			if item.Auth != nil {
				switch strings.ToLower(item.Auth.Type) {
				case "bearer":
					if item.Auth.Token != "" {
						mergedHeaders["Authorization"] = "Bearer " + item.Auth.Token
					}
				case "basic":
					if item.Auth.Username != "" || item.Auth.Password != "" {
						cred := base64.StdEncoding.EncodeToString([]byte(item.Auth.Username + ":" + item.Auth.Password))
						mergedHeaders["Authorization"] = "Basic " + cred
					}
				}
			}
			for k, v := range input.Headers {
				mergedHeaders[k] = v
			}
			input.Headers = mergedHeaders
		}
		if input.Body == nil && item.Body != "" {
			input.Body = item.Body
		}
		if input.ContentType == "" && item.BodyType == "json" {
			input.ContentType = "application/json"
		}
		if input.TimeoutSeconds <= 0 && item.TimeoutMs > 0 {
			input.TimeoutSeconds = (item.TimeoutMs + 999) / 1000
		}
		if !input.InsecureSkipVerify && item.InsecureTLS {
			input.InsecureSkipVerify = true
		}
		if input.FollowRedirects == nil {
			val := item.FollowRedirects
			input.FollowRedirects = &val
		}
	}

	rawURL := strings.TrimSpace(input.URL)
	if rawURL == "" {
		return nil, fmt.Errorf("URL 地址不能为空 (请提供 url 或通过 api_id/api_name 指定已保存接口)")
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
	defer transport.CloseIdleConnections()

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

	var savedApiID string
	if input.SaveToList {
		nodes, err := LoadApiTreeNodes()
		if err == nil {
			var saveParams []ApiHeaderItem
			for k, v := range input.Params {
				saveParams = append(saveParams, ApiHeaderItem{
					Name:    k,
					Value:   fmt.Sprintf("%v", v),
					Enabled: true,
				})
			}
			var saveHeaders []ApiHeaderItem
			for k, v := range input.Headers {
				saveHeaders = append(saveHeaders, ApiHeaderItem{
					Name:    k,
					Value:   v,
					Enabled: true,
				})
			}
			bodyStr := formatBodyString(input.Body)
			bodyType := "none"
			if bodyStr != "" {
				bodyType = "json"
			}
			if loadedSavedItem != nil && input.ApiID != "" {
				// 更新已存接口
				patch := ApiTreeItem{
					Method:   method,
					URL:      rawURL,
					Params:   saveParams,
					Headers:  saveHeaders,
					Body:     bodyStr,
					BodyType: bodyType,
				}
				if input.SaveName != "" {
					patch.Name = input.SaveName
				}
				newNodes, ok := UpdateApiNode(nodes, loadedSavedItem.ID, patch)
				if ok {
					_ = SaveApiTreeNodes(newNodes)
					savedApiID = loadedSavedItem.ID
				}
			} else {
				// 新增接口
				name := strings.TrimSpace(input.SaveName)
				if name == "" {
					name = fmt.Sprintf("[%s] %s", method, rawURL)
				}
				newItem := ApiTreeItem{
					Name:            name,
					IsFolder:        false,
					Mode:            "http",
					Method:          method,
					URL:             rawURL,
					Params:          saveParams,
					Headers:         saveHeaders,
					BodyType:        bodyType,
					Body:            bodyStr,
					TimeoutMs:       int(timeout.Milliseconds()),
					InsecureTLS:     input.InsecureSkipVerify,
					FollowRedirects: input.FollowRedirects == nil || *input.FollowRedirects,
				}
				targetFolder := strings.TrimSpace(input.TargetFolderID)
				if targetFolder == "" {
					targetFolder = "folder_default"
				}
				newNodes, insertedItem := InsertApiNode(nodes, targetFolder, newItem)
				_ = SaveApiTreeNodes(newNodes)
				savedApiID = insertedItem.ID
			}
		}
	}

	return &HttpRequestOutput{
		StatusCode: resp.StatusCode,
		StatusText: resp.Status,
		Headers:    headersOut,
		Body:       string(bodyBytes),
		DurationMs: time.Since(start).Milliseconds(),
		Size:       int64(len(bodyBytes)),
		SavedApiID: savedApiID,
	}, nil
}

// RegisterHttpTools 注册全功能 http_request 工具
func RegisterHttpTools(bus *ToolBus) error {
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

	return nil
}

