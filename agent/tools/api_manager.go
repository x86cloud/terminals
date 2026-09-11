package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"terminal/agent/guard"

	"github.com/cloudwego/eino/components/tool/utils"
)

// ApiManagerInput 接口管理工具输入结构体
type ApiManagerInput struct {
	Action          string            `json:"action" jsonschema:"description=操作类型: list (列出/搜索接口与分组摘要), get (获取单个接口或分组详情), create (新建接口或分组), update (更新接口或分组), delete (删除接口或分组),required"`
	Keyword         string            `json:"keyword,omitempty" jsonschema:"description=搜索关键词 (用于 action=list 时按名称/URL/方法过滤)"`
	ID              string            `json:"id,omitempty" jsonschema:"description=目标接口或分组 ID (用于 get / update / delete)"`
	Name            string            `json:"name,omitempty" jsonschema:"description=接口或分组名称 (用于 create / update，或在 get/delete 时按名称查找)"`
	IsFolder        bool              `json:"is_folder,omitempty" jsonschema:"description=是否为分组节点 (用于 create，true 表示新建分组，false 表示新建接口)"`
	TargetFolderID  string            `json:"target_folder_id,omitempty" jsonschema:"description=目标父分组 ID (用于 create 时指定放入哪个分组，默认为根目录)"`
	Method          string            `json:"method,omitempty" jsonschema:"description=HTTP 请求方法 (GET, POST, PUT, DELETE, PATCH 等，用于接口)"`
	URL             string            `json:"url,omitempty" jsonschema:"description=接口请求 URL 地址 (用于接口)"`
	Params          map[string]any    `json:"params,omitempty" jsonschema:"description=可选 Query 查询参数字典 (键值对)"`
	Headers         map[string]string `json:"headers,omitempty" jsonschema:"description=可选自定义请求头字典 (键值对)"`
	BodyType        string            `json:"body_type,omitempty" jsonschema:"description=请求体类型: none, json, text, xml"`
	Body            any               `json:"body,omitempty" jsonschema:"description=请求体内容，可为普通字符串或 JSON 对象/字典"`
	AuthType        string            `json:"auth_type,omitempty" jsonschema:"description=鉴权类型: none, basic, bearer"`
	AuthToken       string            `json:"auth_token,omitempty" jsonschema:"description=Bearer Token 鉴权值"`
	AuthUsername    string            `json:"auth_username,omitempty" jsonschema:"description=Basic Auth 用户名"`
	AuthPassword    string            `json:"auth_password,omitempty" jsonschema:"description=Basic Auth 密码"`
	TimeoutMs       int               `json:"timeout_ms,omitempty" jsonschema:"description=请求超时时间 (毫秒)，默认 30000"`
	InsecureTLS     bool              `json:"insecure_tls,omitempty" jsonschema:"description=是否跳过 SSL 证书校验"`
	FollowRedirects *bool             `json:"follow_redirects,omitempty" jsonschema:"description=是否自动跟随 3xx 重定向，默认 true"`
}

// ApiManagerOutput 接口管理工具输出结构体
type ApiManagerOutput struct {
	Action  string       `json:"action"`
	Success bool         `json:"success"`
	Message string       `json:"message,omitempty"`
	List    []ApiSummary `json:"list,omitempty"`
	Item    *ApiTreeItem `json:"item,omitempty"`
	Total   int          `json:"total,omitempty"`
}

// ExecuteApiManager 执行接口与分组管理操作
func ExecuteApiManager(ctx context.Context, input *ApiManagerInput) (*ApiManagerOutput, error) {
	if input == nil {
		return nil, fmt.Errorf("请求参数不能为空")
	}

	action := strings.ToLower(strings.TrimSpace(input.Action))
	if action == "" {
		action = "list"
	}

	nodes, err := LoadApiTreeNodes()
	if err != nil {
		return nil, fmt.Errorf("读取接口树失败: %w", err)
	}

	switch action {
	case "list":
		summaries := FlattenApiList(nodes, "", input.Keyword)
		return &ApiManagerOutput{
			Action:  "list",
			Success: true,
			List:    summaries,
			Total:   len(summaries),
			Message: fmt.Sprintf("成功获取接口列表，共 %d 项", len(summaries)),
		}, nil

	case "get":
		query := strings.TrimSpace(input.ID)
		if query == "" {
			query = strings.TrimSpace(input.Name)
		}
		if query == "" {
			return nil, fmt.Errorf("查询接口必须提供 id 或 name")
		}

		found := FindNodeByIDOrName(nodes, query)
		if found == nil {
			return &ApiManagerOutput{
				Action:  "get",
				Success: false,
				Message: fmt.Sprintf("未找到 ID 或名称为「%s」的接口或分组", query),
			}, nil
		}

		return &ApiManagerOutput{
			Action:  "get",
			Success: true,
			Item:    found,
			Message: fmt.Sprintf("成功获取「%s」(ID: %s)", found.Name, found.ID),
		}, nil

	case "create":
		name := strings.TrimSpace(input.Name)
		if name == "" {
			return nil, fmt.Errorf("创建接口或分组时名称 (name) 不能为空")
		}

		if input.IsFolder {
			// 创建分组
			newFolder := ApiTreeItem{
				Name:     name,
				IsFolder: true,
				Children: []ApiTreeItem{},
			}
			newNodes, insertedFolder := InsertApiNode(nodes, input.TargetFolderID, newFolder)
			if err := SaveApiTreeNodes(newNodes); err != nil {
				return nil, fmt.Errorf("保存新分组失败: %w", err)
			}
			return &ApiManagerOutput{
				Action:  "create",
				Success: true,
				Item:    &insertedFolder,
				Message: fmt.Sprintf("成功创建分组「%s」", name),
			}, nil
		}

		// 创建接口
		method := strings.ToUpper(strings.TrimSpace(input.Method))
		if method == "" {
			method = "GET"
		}
		rawURL := strings.TrimSpace(input.URL)
		if rawURL == "" {
			return nil, fmt.Errorf("创建接口时 URL 不能为空")
		}

		var params []ApiHeaderItem
		for k, v := range input.Params {
			params = append(params, ApiHeaderItem{
				Name:    k,
				Value:   fmt.Sprintf("%v", v),
				Enabled: true,
			})
		}

		var headers []ApiHeaderItem
		for k, v := range input.Headers {
			headers = append(headers, ApiHeaderItem{
				Name:    k,
				Value:   v,
				Enabled: true,
			})
		}

		bodyStr := formatBodyString(input.Body)
		bodyType := strings.ToLower(strings.TrimSpace(input.BodyType))
		if bodyType == "" {
			if bodyStr != "" {
				bodyType = "json"
			} else {
				bodyType = "none"
			}
		}

		timeout := input.TimeoutMs
		if timeout <= 0 {
			timeout = 30000
		}

		followRedir := true
		if input.FollowRedirects != nil {
			followRedir = *input.FollowRedirects
		}

		var auth *ApiAuthItem
		if input.AuthType != "" && input.AuthType != "none" {
			auth = &ApiAuthItem{
				Type:     input.AuthType,
				Token:    input.AuthToken,
				Username: input.AuthUsername,
				Password: input.AuthPassword,
			}
		}

		newItem := ApiTreeItem{
			Name:            name,
			IsFolder:        false,
			Mode:            "http",
			Method:          method,
			URL:             rawURL,
			Params:          params,
			Headers:         headers,
			BodyType:        bodyType,
			Body:            bodyStr,
			Auth:            auth,
			TimeoutMs:       timeout,
			InsecureTLS:     input.InsecureTLS,
			FollowRedirects: followRedir,
		}

		newNodes, insertedItem := InsertApiNode(nodes, input.TargetFolderID, newItem)
		if err := SaveApiTreeNodes(newNodes); err != nil {
			return nil, fmt.Errorf("保存新接口失败: %w", err)
		}

		return &ApiManagerOutput{
			Action:  "create",
			Success: true,
			Item:    &insertedItem,
			Message: fmt.Sprintf("成功创建接口「%s」[%s %s]", name, method, rawURL),
		}, nil

	case "update":
		targetID := strings.TrimSpace(input.ID)
		if targetID == "" {
			if found := FindNodeByIDOrName(nodes, input.Name); found != nil {
				targetID = found.ID
			}
		}
		if targetID == "" {
			return nil, fmt.Errorf("更新接口必须提供有效 ID 或现有接口名称")
		}

		var patch ApiTreeItem
		patch.Name = strings.TrimSpace(input.Name)
		if input.Method != "" {
			patch.Method = strings.ToUpper(strings.TrimSpace(input.Method))
		}
		patch.URL = strings.TrimSpace(input.URL)

		if input.Params != nil {
			for k, v := range input.Params {
				patch.Params = append(patch.Params, ApiHeaderItem{
					Name:    k,
					Value:   fmt.Sprintf("%v", v),
					Enabled: true,
				})
			}
		}

		if input.Headers != nil {
			for k, v := range input.Headers {
				patch.Headers = append(patch.Headers, ApiHeaderItem{
					Name:    k,
					Value:   v,
					Enabled: true,
				})
			}
		}

		if input.Body != nil {
			patch.Body = formatBodyString(input.Body)
			patch.BodyType = input.BodyType
			if patch.BodyType == "" {
				patch.BodyType = "json"
			}
		}

		if input.AuthType != "" {
			patch.Auth = &ApiAuthItem{
				Type:     input.AuthType,
				Token:    input.AuthToken,
				Username: input.AuthUsername,
				Password: input.AuthPassword,
			}
		}

		if input.TimeoutMs > 0 {
			patch.TimeoutMs = input.TimeoutMs
		}
		patch.InsecureTLS = input.InsecureTLS
		if input.FollowRedirects != nil {
			patch.FollowRedirects = *input.FollowRedirects
		}

		newNodes, ok := UpdateApiNode(nodes, targetID, patch)
		if !ok {
			return &ApiManagerOutput{
				Action:  "update",
				Success: false,
				Message: fmt.Sprintf("未找到 ID 为「%s」的接口或分组进行更新", targetID),
			}, nil
		}

		if err := SaveApiTreeNodes(newNodes); err != nil {
			return nil, fmt.Errorf("保存更新接口失败: %w", err)
		}

		updatedItem := FindNodeByIDOrName(newNodes, targetID)
		return &ApiManagerOutput{
			Action:  "update",
			Success: true,
			Item:    updatedItem,
			Message: fmt.Sprintf("成功更新「%s」(ID: %s)", targetID, targetID),
		}, nil

	case "delete":
		targetID := strings.TrimSpace(input.ID)
		if targetID == "" {
			if found := FindNodeByIDOrName(nodes, input.Name); found != nil {
				targetID = found.ID
			}
		}
		if targetID == "" {
			return nil, fmt.Errorf("删除接口必须提供有效 ID 或接口名称")
		}

		newNodes, ok := DeleteApiNode(nodes, targetID)
		if !ok {
			return &ApiManagerOutput{
				Action:  "delete",
				Success: false,
				Message: fmt.Sprintf("未找到 ID 为「%s」的接口或分组", targetID),
			}, nil
		}

		if err := SaveApiTreeNodes(newNodes); err != nil {
			return nil, fmt.Errorf("保存删除后的接口树失败: %w", err)
		}

		return &ApiManagerOutput{
			Action:  "delete",
			Success: true,
			Message: fmt.Sprintf("已成功删除接口或分组 (ID: %s)", targetID),
		}, nil

	default:
		return nil, fmt.Errorf("不支持的操作 action: %s (支持: list, get, create, update, delete)", action)
	}
}

func formatBodyString(body any) string {
	if body == nil {
		return ""
	}
	switch b := body.(type) {
	case string:
		return b
	default:
		bs, err := json.MarshalIndent(b, "", "  ")
		if err == nil {
			return string(bs)
		}
		return fmt.Sprintf("%v", b)
	}
}

// RegisterApiManagerTool 注册 api_manager 工具到 ToolBus
func RegisterApiManagerTool(bus *ToolBus) error {
	toolInstance, err := utils.InferTool(
		"api_manager",
		"管理 API 调试工具中的接口树与分组 (支持 list 列出/搜索接口与分组摘要、get 获取接口完整配置、create 创建新接口或新分组、update 更新接口/分组、delete 删除接口或分组)",
		func(ctx context.Context, input *ApiManagerInput) (*ApiManagerOutput, error) {
			return ExecuteApiManager(ctx, input)
		},
	)
	if err != nil {
		return fmt.Errorf("初始化 api_manager 工具失败: %w", err)
	}

	bus.Register(&RegisteredTool{
		Name:        "api_manager",
		Description: "管理 API 调试工具中的接口树与分组 (支持 list/get/create/update/delete)",
		BaseTool:    toolInstance,
		Level:       guard.LevelAllow,
	})

	return nil
}
