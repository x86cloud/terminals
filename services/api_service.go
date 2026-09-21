package services

import (
	"os"
	"path/filepath"
	"sync"
	"terminal/core"
	"terminal/logger"
	"terminal/proto"
)

type ApiService struct {
	mu sync.Mutex
}

func NewApiService() *ApiService {
	return &ApiService{}
}

func (s *ApiService) ApiRequest(req proto.ApiRequest) (proto.ApiResponse, error) {
	logger.Infof("执行 HTTP API 请求: Method=%s, URL=%s", req.Method, req.URL)
	resp, err := proto.HttpApiRequest(req)
	if err != nil {
		logger.Errorf("HTTP API 请求失败 [%s %s]: %v", req.Method, req.URL, err)
		return resp, err
	}
	logger.Infof("HTTP API 请求响应: %s %s -> 状态码=%d, 耗时=%dms", req.Method, req.URL, resp.StatusCode, resp.DurationMs)
	return resp, nil
}

func (s *ApiService) WsConnect(req proto.WsConnectRequest) (proto.WsConnectResult, error) {
	logger.Infof("发起 WebSocket 连接: URL=%s", req.URL)
	res, err := GetContainer().WsMgr.WsConnect(req)
	if err != nil {
		logger.Errorf("WebSocket 连接建立失败 [%s]: %v", req.URL, err)
		return res, err
	}
	logger.Infof("WebSocket 连接建立成功: ID=%s, URL=%s", res.ID, req.URL)
	return res, nil
}

func (s *ApiService) WsSend(id string, message string) error {
	logger.Infof("WebSocket 发送消息 [ID=%s, Bytes=%d]", id, len(message))
	if err := GetContainer().WsMgr.WsSend(id, message); err != nil {
		logger.Errorf("WebSocket 发送消息失败 [ID=%s]: %v", id, err)
		return err
	}
	return nil
}

func (s *ApiService) WsClose(id string) {
	logger.Infof("关闭 WebSocket 连接 [ID=%s]", id)
	GetContainer().WsMgr.WsClose(id)
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

func (s *ApiService) getApiPath() (string, error) {
	dir, err := core.AppConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "apis.json"), nil
}

// LoadApiTree 读取本地接口树文件内容。如果文件不存在则自动创建并写入默认接口树
func (s *ApiService) LoadApiTree() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	filePath, err := s.getApiPath()
	if err != nil {
		return defaultApiTreeJson, err
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			_ = os.WriteFile(filePath, []byte(defaultApiTreeJson), 0o644)
			return defaultApiTreeJson, nil
		}
		return "", err
	}
	if len(data) == 0 {
		_ = os.WriteFile(filePath, []byte(defaultApiTreeJson), 0o644)
		return defaultApiTreeJson, nil
	}
	return string(data), nil
}

// SaveApiTree 保存接口树数据到本地文件
func (s *ApiService) SaveApiTree(content string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	filePath, err := s.getApiPath()
	if err != nil {
		return err
	}
	return os.WriteFile(filePath, []byte(content), 0o644)
}

// ChooseImportApiFile 弹出文件选择对话框，读取用户选择的 JSON 文件内容
func (s *ApiService) ChooseImportApiFile() (string, error) {
	filePath, err := core.OpenFileDialog("选择要导入的 API 接口 JSON 文件")
	if err != nil {
		return "", err
	}
	if filePath == "" {
		return "", nil
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// ChooseExportApiFile 弹出文件保存对话框，将内容写入用户指定的路径
func (s *ApiService) ChooseExportApiFile(content string, defaultName string) (string, error) {
	if defaultName == "" {
		defaultName = "apis_backup.json"
	}
	filePath, err := core.SaveFileDialog("导出 API 接口数据", defaultName)
	if err != nil {
		return "", err
	}
	if filePath == "" {
		return "", nil
	}
	err = os.WriteFile(filePath, []byte(content), 0o644)
	if err != nil {
		return "", err
	}
	return filePath, nil
}
