package services

import (
	"context"
	"strings"

	"terminal/agent"
	"terminal/agent/wiki"
	"terminal/logger"
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
	logger.Info("打开本地 Wiki 根目录所在文件夹")
	if err := wiki.OpenWikiDir(); err != nil {
		logger.Errorf("打开本地 Wiki 目录失败: %v", err)
		return err
	}
	return nil
}

// ListWikiTree 列出知识库文档树
func (s *WikiService) ListWikiTree() ([]wiki.WikiNode, error) {
	tree, err := wiki.ListTree()
	if err != nil {
		logger.Errorf("列出 Wiki 文档树失败: %v", err)
		return nil, err
	}
	return tree, nil
}

// GetWikiCatalog 获取知识库紧凑目录与摘要
func (s *WikiService) GetWikiCatalog() ([]wiki.WikiCatalogItem, error) {
	return wiki.GetCatalog()
}

// ReadWikiPage 读取指定相对路径的 Markdown 内容
func (s *WikiService) ReadWikiPage(relPath string) (string, error) {
	content, err := wiki.ReadPage(relPath)
	if err != nil {
		logger.Errorf("读取 Wiki 页面失败 [Path=%s]: %v", relPath, err)
		return "", err
	}
	return content, nil
}

// SaveWikiPage 保存 Markdown 页面
func (s *WikiService) SaveWikiPage(relPath string, content string) error {
	logger.Infof("保存 Wiki 页面 [Path=%s, Bytes=%d]", relPath, len(content))
	if err := wiki.SavePage(relPath, content); err != nil {
		logger.Errorf("保存 Wiki 页面失败 [Path=%s]: %v", relPath, err)
		return err
	}
	return nil
}

// CreateWikiNode 创建文档或分组
func (s *WikiService) CreateWikiNode(parentPath string, name string, isFolder bool) (string, error) {
	logger.Infof("创建 Wiki 节点 [Parent=%s, Name=%s, IsFolder=%v]", parentPath, name, isFolder)
	nodePath, err := wiki.CreateNode(parentPath, name, isFolder)
	if err != nil {
		logger.Errorf("创建 Wiki 节点失败 [Parent=%s, Name=%s]: %v", parentPath, name, err)
		return "", err
	}
	return nodePath, nil
}

// RenameWikiNode 重命名或移动文档/分组
func (s *WikiService) RenameWikiNode(oldRelPath string, newRelPath string) error {
	logger.Infof("重命名 Wiki 节点 [Old=%s, New=%s]", oldRelPath, newRelPath)
	if err := wiki.RenameNode(oldRelPath, newRelPath); err != nil {
		logger.Errorf("重命名 Wiki 节点失败 [Old=%s, New=%s]: %v", oldRelPath, newRelPath, err)
		return err
	}
	return nil
}

// DeleteWikiNode 删除文档或分组
func (s *WikiService) DeleteWikiNode(relPath string) error {
	logger.Infof("删除 Wiki 节点 [Path=%s]", relPath)
	if err := wiki.DeleteNode(relPath); err != nil {
		logger.Errorf("删除 Wiki 节点失败 [Path=%s]: %v", relPath, err)
		return err
	}
	return nil
}

// CompileSessionToWiki 调用大模型提炼会话中的关键资产，并自动合并更新到 Wiki
func (s *WikiService) CompileSessionToWiki(sessionID string, messages []agent.FrontendMessage) (string, error) {
	if len(messages) == 0 {
		return "会话无消息，无需提炼", nil
	}
	logger.Infof("提炼会话内容至 Wiki [SessionID=%s, MessageCount=%d]", sessionID, len(messages))
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
	res, err := wiki.CompileSession(context.Background(), agent.DefaultRuntime.Router, sessionID, sb.String())
	if err != nil {
		logger.Errorf("提炼会话至 Wiki 失败 [SessionID=%s]: %v", sessionID, err)
		return "", err
	}
	logger.Infof("会话提炼至 Wiki 成功 [SessionID=%s]", sessionID)
	return res, nil
}
