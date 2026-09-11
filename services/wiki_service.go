package services

import (
	"context"
	"strings"

	"terminal/agent"
	"terminal/agent/wiki"
)

// WikiService 提供给前端 Wails 绑定的知识库管理服务
type WikiService struct{}

func NewWikiService() *WikiService {
	return &WikiService{}
}

// GetWikiDir 获取本地 Wiki 根目录
func (s *WikiService) GetWikiDir() (string, error) {
	return wiki.GetWikiDir()
}

// OpenWikiDir 打开本地系统文件浏览器
func (s *WikiService) OpenWikiDir() error {
	return wiki.OpenWikiDir()
}

// ListWikiTree 列出知识库文档树
func (s *WikiService) ListWikiTree() ([]wiki.WikiNode, error) {
	return wiki.ListTree()
}

// GetWikiCatalog 获取知识库紧凑目录与摘要
func (s *WikiService) GetWikiCatalog() ([]wiki.WikiCatalogItem, error) {
	return wiki.GetCatalog()
}

// ReadWikiPage 读取指定相对路径的 Markdown 内容
func (s *WikiService) ReadWikiPage(relPath string) (string, error) {
	return wiki.ReadPage(relPath)
}

// SaveWikiPage 保存 Markdown 页面
func (s *WikiService) SaveWikiPage(relPath string, content string) error {
	return wiki.SavePage(relPath, content)
}

// CreateWikiNode 创建文档或分组
func (s *WikiService) CreateWikiNode(parentPath string, name string, isFolder bool) (string, error) {
	return wiki.CreateNode(parentPath, name, isFolder)
}

// RenameWikiNode 重命名或移动文档/分组
func (s *WikiService) RenameWikiNode(oldRelPath string, newRelPath string) error {
	return wiki.RenameNode(oldRelPath, newRelPath)
}

// DeleteWikiNode 删除文档或分组
func (s *WikiService) DeleteWikiNode(relPath string) error {
	return wiki.DeleteNode(relPath)
}

// CompileSessionToWiki 调用大模型提炼会话中的关键资产，并自动合并更新到 Wiki
func (s *WikiService) CompileSessionToWiki(sessionID string, messages []agent.FrontendMessage) (string, error) {
	if len(messages) == 0 {
		return "会话无消息，无需提炼", nil
	}
	var sb strings.Builder
	for _, m := range messages {
		if strings.TrimSpace(m.Content) == "" {
			continue
		}
		roleName := "用户"
		if m.Role == "assistant" {
			roleName = "助手"
		}
		sb.WriteString(roleName + ": " + m.Content + "\n\n")
	}
	return wiki.CompileSession(context.Background(), agent.DefaultRuntime.Router, sessionID, sb.String())
}
