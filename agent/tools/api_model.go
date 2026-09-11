package tools

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"terminal/core"

	"github.com/google/uuid"
)

var apiFileMu sync.Mutex

// ApiHeaderItem 接口的请求头或 Query 参数项
type ApiHeaderItem struct {
	Name    string `json:"name"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

// ApiAuthItem 接口鉴权配置
type ApiAuthItem struct {
	Type     string `json:"type"` // none | basic | bearer
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
	Token    string `json:"token,omitempty"`
}

// ApiTreeItem 接口树节点（支持分组与接口项）
type ApiTreeItem struct {
	ID              string          `json:"id"`
	Name            string          `json:"name"`
	IsFolder        bool            `json:"isFolder"`
	Mode            string          `json:"mode,omitempty"` // "http" | "ws"
	Method          string          `json:"method,omitempty"`
	URL             string          `json:"url,omitempty"`
	Params          []ApiHeaderItem `json:"params,omitempty"`
	Headers         []ApiHeaderItem `json:"headers,omitempty"`
	BodyType        string          `json:"bodyType,omitempty"`
	Body            string          `json:"body,omitempty"`
	Auth            *ApiAuthItem    `json:"auth,omitempty"`
	TimeoutMs       int             `json:"timeoutMs,omitempty"`
	InsecureTLS     bool            `json:"insecureTLS,omitempty"`
	FollowRedirects bool            `json:"followRedirects,omitempty"`
	WsProtocols     string          `json:"wsProtocols,omitempty"`
	Children        []ApiTreeItem   `json:"children,omitempty"`
	CreatedAt       int64           `json:"createdAt,omitempty"`
	UpdatedAt       int64           `json:"updatedAt,omitempty"`
}

// ApiSummary 接口或分组的精简摘要结构（便于 LLM 快速通览）
type ApiSummary struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	IsFolder   bool   `json:"is_folder"`
	FolderPath string `json:"folder_path,omitempty"`
	Method     string `json:"method,omitempty"`
	URL        string `json:"url,omitempty"`
	ChildCount int    `json:"child_count,omitempty"`
}

const defaultApiTreeJson = `[
  {
    "id": "folder_default",
    "name": "默认分组",
    "isFolder": true,
    "createdAt": 1700000000000,
    "updatedAt": 1700000000000,
    "children": [
      {
        "id": "api_example_get",
        "name": "示例: GET 请求",
        "isFolder": false,
        "mode": "http",
        "method": "GET",
        "url": "https://httpbin.org/get",
        "params": [
          {
            "name": "test",
            "value": "123",
            "enabled": true
          }
        ],
        "headers": [],
        "bodyType": "none",
        "body": "",
        "auth": {
          "type": "none"
        },
        "timeoutMs": 30000,
        "insecureTLS": false,
        "followRedirects": true,
        "createdAt": 1700000000000,
        "updatedAt": 1700000000000
      }
    ]
  }
]`

// GetApiPath 获取接口配置文件的存储绝对路径
func GetApiPath() (string, error) {
	dir, err := core.AppConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "apis.json"), nil
}

// LoadApiTreeNodes 从本地 apis.json 文件中读取解析接口树
func LoadApiTreeNodes() ([]ApiTreeItem, error) {
	apiFileMu.Lock()
	defer apiFileMu.Unlock()

	filePath, err := GetApiPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			_ = os.WriteFile(filePath, []byte(defaultApiTreeJson), 0o644)
			var defaultNodes []ApiTreeItem
			_ = json.Unmarshal([]byte(defaultApiTreeJson), &defaultNodes)
			return defaultNodes, nil
		}
		return nil, err
	}

	if len(strings.TrimSpace(string(data))) == 0 {
		_ = os.WriteFile(filePath, []byte(defaultApiTreeJson), 0o644)
		var defaultNodes []ApiTreeItem
		_ = json.Unmarshal([]byte(defaultApiTreeJson), &defaultNodes)
		return defaultNodes, nil
	}

	var nodes []ApiTreeItem
	if err := json.Unmarshal(data, &nodes); err != nil {
		return nil, fmt.Errorf("解析 apis.json 失败: %w", err)
	}

	return nodes, nil
}

// SaveApiTreeNodes 将接口树持久化到本地 apis.json 文件，并广播全局事件
func SaveApiTreeNodes(nodes []ApiTreeItem) error {
	apiFileMu.Lock()
	defer apiFileMu.Unlock()

	filePath, err := GetApiPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(nodes, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化接口树失败: %w", err)
	}

	if err := os.WriteFile(filePath, data, 0o644); err != nil {
		return fmt.Errorf("写入 apis.json 失败: %w", err)
	}

	// 触发全局前端事件通知，刷新 UI 树
	core.EmitEvent("api:tree-updated", nil)
	return nil
}

// FindNodeByIDOrName 深度遍历查找指定 ID 或名称的节点（若传入 name 则大小写不敏感匹配）
func FindNodeByIDOrName(nodes []ApiTreeItem, query string) *ApiTreeItem {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil
	}

	// 优先精确匹配 ID
	if item := findNodeByID(nodes, query); item != nil {
		return item
	}

	// 其次匹配名称 (忽略大小写)
	return findNodeByName(nodes, strings.ToLower(query))
}

func findNodeByID(nodes []ApiTreeItem, id string) *ApiTreeItem {
	for i := range nodes {
		if nodes[i].ID == id {
			return &nodes[i]
		}
		if nodes[i].IsFolder && len(nodes[i].Children) > 0 {
			if found := findNodeByID(nodes[i].Children, id); found != nil {
				return found
			}
		}
	}
	return nil
}

func findNodeByName(nodes []ApiTreeItem, lowerName string) *ApiTreeItem {
	for i := range nodes {
		if strings.ToLower(strings.TrimSpace(nodes[i].Name)) == lowerName {
			return &nodes[i]
		}
		if nodes[i].IsFolder && len(nodes[i].Children) > 0 {
			if found := findNodeByName(nodes[i].Children, lowerName); found != nil {
				return found
			}
		}
	}
	return nil
}

// FlattenApiList 将树状结构扁平化为便于 LLM 理解的列表摘要
func FlattenApiList(nodes []ApiTreeItem, currentPath string, keyword string) []ApiSummary {
	var list []ApiSummary
	kw := strings.ToLower(strings.TrimSpace(keyword))

	for _, n := range nodes {
		nodePath := currentPath
		if nodePath == "" {
			nodePath = n.Name
		} else {
			nodePath = nodePath + " / " + n.Name
		}

		matched := true
		if kw != "" {
			matched = strings.Contains(strings.ToLower(n.Name), kw) ||
				strings.Contains(strings.ToLower(n.URL), kw) ||
				strings.Contains(strings.ToLower(n.Method), kw)
		}

		if matched {
			summary := ApiSummary{
				ID:         n.ID,
				Name:       n.Name,
				IsFolder:   n.IsFolder,
				FolderPath: currentPath,
				Method:     n.Method,
				URL:        n.URL,
			}
			if n.IsFolder {
				summary.ChildCount = len(n.Children)
			}
			list = append(list, summary)
		}

		if n.IsFolder && len(n.Children) > 0 {
			subList := FlattenApiList(n.Children, nodePath, keyword)
			list = append(list, subList...)
		}
	}
	return list
}

// InsertApiNode 将新节点插入至指定父分组中，若 parentID 为空则放入根目录，并返回插入成功后的完整节点
func InsertApiNode(nodes []ApiTreeItem, parentID string, newItem ApiTreeItem) ([]ApiTreeItem, ApiTreeItem) {
	if newItem.ID == "" {
		prefix := "api_"
		if newItem.IsFolder {
			prefix = "folder_"
		}
		newItem.ID = prefix + strings.ReplaceAll(uuid.New().String(), "-", "")[:12]
	}
	now := time.Now().UnixMilli()
	if newItem.CreatedAt == 0 {
		newItem.CreatedAt = now
	}
	newItem.UpdatedAt = now

	// 插入到根目录
	if parentID == "" || parentID == "__root__" {
		return append(nodes, newItem), newItem
	}

	var inserted bool
	var traverse func(list []ApiTreeItem) []ApiTreeItem
	traverse = func(list []ApiTreeItem) []ApiTreeItem {
		res := make([]ApiTreeItem, len(list))
		for i, item := range list {
			if item.ID == parentID && item.IsFolder {
				item.Children = append(item.Children, newItem)
				item.UpdatedAt = now
				inserted = true
				res[i] = item
			} else if item.IsFolder && len(item.Children) > 0 {
				item.Children = traverse(item.Children)
				res[i] = item
			} else {
				res[i] = item
			}
		}
		return res
	}

	newNodes := traverse(nodes)
	if !inserted {
		// 未找到目标分组，降级追加到根目录
		return append(nodes, newItem), newItem
	}
	return newNodes, newItem
}

// UpdateApiNode 递归更新指定 ID 的节点字段
func UpdateApiNode(nodes []ApiTreeItem, id string, patch ApiTreeItem) ([]ApiTreeItem, bool) {
	var updated bool
	now := time.Now().UnixMilli()

	var traverse func(list []ApiTreeItem) []ApiTreeItem
	traverse = func(list []ApiTreeItem) []ApiTreeItem {
		res := make([]ApiTreeItem, len(list))
		for i, item := range list {
			if item.ID == id {
				// 更新字段
				if patch.Name != "" {
					item.Name = patch.Name
				}
				if !item.IsFolder {
					if patch.Method != "" {
						item.Method = strings.ToUpper(patch.Method)
					}
					if patch.URL != "" {
						item.URL = patch.URL
					}
					if patch.Params != nil {
						item.Params = patch.Params
					}
					if patch.Headers != nil {
						item.Headers = patch.Headers
					}
					if patch.BodyType != "" {
						item.BodyType = patch.BodyType
					}
					if patch.Body != "" {
						item.Body = patch.Body
					}
					if patch.Auth != nil {
						item.Auth = patch.Auth
					}
					if patch.TimeoutMs > 0 {
						item.TimeoutMs = patch.TimeoutMs
					}
					item.InsecureTLS = patch.InsecureTLS
					item.FollowRedirects = patch.FollowRedirects
				}
				item.UpdatedAt = now
				updated = true
				res[i] = item
			} else if item.IsFolder && len(item.Children) > 0 {
				item.Children = traverse(item.Children)
				res[i] = item
			} else {
				res[i] = item
			}
		}
		return res
	}

	newNodes := traverse(nodes)
	return newNodes, updated
}

// DeleteApiNode 递归删除指定 ID 的节点
func DeleteApiNode(nodes []ApiTreeItem, id string) ([]ApiTreeItem, bool) {
	var deleted bool

	var traverse func(list []ApiTreeItem) []ApiTreeItem
	traverse = func(list []ApiTreeItem) []ApiTreeItem {
		var res []ApiTreeItem
		for _, item := range list {
			if item.ID == id {
				deleted = true
				continue
			}
			if item.IsFolder && len(item.Children) > 0 {
				item.Children = traverse(item.Children)
			}
			res = append(res, item)
		}
		return res
	}

	newNodes := traverse(nodes)
	return newNodes, deleted
}
