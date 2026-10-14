package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"terminal/agent"
	"terminal/core"
	"terminal/logger"
	"terminal/storage"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type SystemService struct{}

func NewSystemService() *SystemService {
	return &SystemService{}
}

func (s *SystemService) ListServers() []core.ServerConfig {
	c := GetContainer()
	if c.Store == nil {
		logger.Warn("获取服务器列表失败: 配置存储未初始化")
		return []core.ServerConfig{}
	}
	return c.Store.List()
}

func (s *SystemService) SaveServer(cfg core.ServerConfig) (core.ServerConfig, error) {
	c := GetContainer()
	if c.Store == nil {
		err := errors.New("配置存储不可用")
		logger.Errorf("保存服务器配置失败: %v", err)
		return core.ServerConfig{}, err
	}
	saved, err := c.Store.Save(cfg)
	if err != nil {
		logger.Errorf("保存服务器配置失败 [ID=%s, Name=%s]: %v", cfg.ID, cfg.Name, err)
		return core.ServerConfig{}, err
	}
	logger.Infof("已保存服务器配置: ID=%s, 名称=%s, 类型=%s, 主机=%s:%d, 用户=%s", saved.ID, saved.Name, saved.Type, saved.Host, saved.Port, saved.Username)
	return saved, nil
}

func (s *SystemService) DeleteServer(id string) error {
	c := GetContainer()
	if c.Store == nil {
		err := errors.New("配置存储不可用")
		logger.Errorf("删除服务器配置失败 [ID=%s]: %v", id, err)
		return err
	}
	if err := c.Store.Delete(id); err != nil {
		logger.Errorf("删除服务器配置失败 [ID=%s]: %v", id, err)
		return err
	}
	logger.Infof("已成功删除服务器配置: ID=%s", id)
	return nil
}

func (s *SystemService) GetAppSettings() core.AppSettings {
	c := GetContainer()
	if c.Store == nil {
		return core.DefaultAppSettings()
	}
	return c.Store.GetSettings()
}

func (s *SystemService) SaveAppSettings(settings core.AppSettings) (core.AppSettings, error) {
	c := GetContainer()
	if c.Store == nil {
		err := errors.New("配置存储不可用")
		logger.Errorf("保存应用配置失败: %v", err)
		return settings, err
	}
	saved, err := c.Store.SaveSettings(settings)
	if err != nil {
		logger.Errorf("保存应用配置失败: %v", err)
		return settings, err
	}
	logger.Info("已成功更新应用全局配置")
	_ = agent.DefaultRuntime.InitOrUpdate(saved)
	_ = agent.DefaultManager.InitOrUpdate(saved)
	return saved, nil
}

func (s *SystemService) ListGroups() []core.ServerGroup {
	c := GetContainer()
	if c.Store == nil {
		return []core.ServerGroup{}
	}
	return c.Store.ListGroups()
}

func (s *SystemService) SaveGroup(g core.ServerGroup) (core.ServerGroup, error) {
	c := GetContainer()
	if c.Store == nil {
		err := errors.New("配置存储不可用")
		logger.Errorf("保存分组失败: %v", err)
		return core.ServerGroup{}, err
	}
	saved, err := c.Store.SaveGroup(g)
	if err != nil {
		logger.Errorf("保存分组失败 [ID=%s, Name=%s]: %v", g.ID, g.Name, err)
		return core.ServerGroup{}, err
	}
	logger.Infof("已成功保存分组: ID=%s, 名称=%s", saved.ID, saved.Name)
	return saved, nil
}

func (s *SystemService) DeleteGroup(id string) error {
	c := GetContainer()
	if c.Store == nil {
		err := errors.New("配置存储不可用")
		logger.Errorf("删除分组失败 [ID=%s]: %v", id, err)
		return err
	}
	if err := c.Store.DeleteGroup(id); err != nil {
		logger.Errorf("删除分组失败 [ID=%s]: %v", id, err)
		return err
	}
	logger.Infof("已成功删除分组: ID=%s", id)
	return nil
}

func (s *SystemService) MoveServerToGroup(serverID, groupID string) error {
	c := GetContainer()
	if c.Store == nil {
		err := errors.New("配置存储不可用")
		logger.Errorf("移动服务器分组失败: %v", err)
		return err
	}
	if err := c.Store.MoveServerToGroup(serverID, groupID); err != nil {
		logger.Errorf("移动服务器 ID=%s 至分组 ID=%s 失败: %v", serverID, groupID, err)
		return err
	}
	logger.Infof("移动服务器成功: ServerID=%s -> GroupID=%s", serverID, groupID)
	return nil
}

// ServersExportData 定义全量配置导出的 JSON 结构
type ServersExportData struct {
	Version    string              `json:"version"`
	ExportedAt string              `json:"exportedAt"`
	Servers    []core.ServerConfig `json:"servers"`
	Groups     []core.ServerGroup  `json:"groups"`
}

// ConfigIOResult 描述配置导入/导出操作的结果
type ConfigIOResult struct {
	Success      bool   `json:"success"`
	Cancelled    bool   `json:"cancelled"`
	FilePath     string `json:"filePath"`
	ServersCount int    `json:"serversCount"`
	GroupsCount  int    `json:"groupsCount"`
	Message      string `json:"message"`
}

// ExportServersConfig 弹出原生保存对话框并导出所有服务器连接与分组配置
func (s *SystemService) ExportServersConfig() (*ConfigIOResult, error) {
	c := GetContainer()
	if c.Store == nil {
		return nil, errors.New("配置存储不可用")
	}

	servers := c.Store.List()
	groups := c.Store.ListGroups()

	defaultFilename := fmt.Sprintf("terminals_backup_%s.json", time.Now().Format("20060102_150405"))
	filePath, err := core.SaveFileDialog("导出连接与分组配置", defaultFilename)
	if err != nil {
		logger.Errorf("导出配置对话框错误: %v", err)
		return nil, err
	}
	if filePath == "" {
		// 用户取消
		return &ConfigIOResult{
			Cancelled: true,
		}, nil
	}

	data := ServersExportData{
		Version:    "1.0",
		ExportedAt: time.Now().Format(time.RFC3339),
		Servers:    servers,
		Groups:     groups,
	}

	jsonBytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		logger.Errorf("序列化配置失败: %v", err)
		return nil, err
	}

	if err := storage.WriteFileAtomic(filePath, jsonBytes, 0o644); err != nil {
		logger.Errorf("写入配置文件失败 [%s]: %v", filePath, err)
		return nil, err
	}

	logger.Infof("已成功导出配置到文件 [%s]: %d 个连接, %d 个分组", filePath, len(servers), len(groups))
	return &ConfigIOResult{
		Success:      true,
		FilePath:     filePath,
		ServersCount: len(servers),
		GroupsCount:  len(groups),
		Message:      fmt.Sprintf("已成功导出 %d 个连接与 %d 个分组", len(servers), len(groups)),
	}, nil
}

// ImportServersConfig 弹出原生选择对话框并增量智能合并导入服务器连接与分组配置
func (s *SystemService) ImportServersConfig() (*ConfigIOResult, error) {
	c := GetContainer()
	if c.Store == nil {
		return nil, errors.New("配置存储不可用")
	}

	filePath, err := core.OpenFileDialog("选择要导入的配置文件 (.json)")
	if err != nil {
		logger.Errorf("选择导入文件错误: %v", err)
		return nil, err
	}
	if filePath == "" {
		// 用户取消
		return &ConfigIOResult{
			Cancelled: true,
		}, nil
	}

	rawBytes, err := os.ReadFile(filePath)
	if err != nil {
		logger.Errorf("读取配置文件失败 [%s]: %v", filePath, err)
		return nil, err
	}

	var exportData ServersExportData
	if err := json.Unmarshal(rawBytes, &exportData); err != nil || (len(exportData.Servers) == 0 && len(exportData.Groups) == 0) {
		// 尝试直接作为 []core.ServerConfig 解析（兼容第三方或旧版裸列表）
		var legacyServers []core.ServerConfig
		if errLegacy := json.Unmarshal(rawBytes, &legacyServers); errLegacy == nil && len(legacyServers) > 0 {
			exportData.Servers = legacyServers
		} else {
			return nil, fmt.Errorf("配置文件格式错误，无法识别有效的连接或分组数据")
		}
	}

	// 当前本地已有配置
	existingServers := c.Store.List()
	existingGroups := c.Store.ListGroups()

	existingServerIDs := make(map[string]bool)
	for _, srv := range existingServers {
		existingServerIDs[srv.ID] = true
	}

	existingGroupIDs := make(map[string]bool)
	existingGroupNames := make(map[string]string) // name -> ID
	for _, grp := range existingGroups {
		existingGroupIDs[grp.ID] = true
		existingGroupNames[grp.Name] = grp.ID
	}

	// 分组映射字典：旧 ID -> 新 ID
	groupIDMap := make(map[string]string)
	importedGroupsCount := 0

	for _, grp := range exportData.Groups {
		oldID := grp.ID
		trimmedName := strings.TrimSpace(grp.Name)
		if trimmedName == "" {
			continue
		}

		// 若本地已存在同名分组，直接复用该同名分组的 ID
		if targetID, exists := existingGroupNames[trimmedName]; exists {
			groupIDMap[oldID] = targetID
			continue
		}

		// 若 ID 冲突，分配新 UUID
		if existingGroupIDs[grp.ID] || grp.ID == "" {
			grp.ID = uuid.NewString()
		}

		savedGroup, err := c.Store.SaveGroup(grp)
		if err != nil {
			logger.Warnf("导入分组 [%s] 失败: %v", grp.Name, err)
			continue
		}
		existingGroupIDs[savedGroup.ID] = true
		existingGroupNames[savedGroup.Name] = savedGroup.ID
		groupIDMap[oldID] = savedGroup.ID
		importedGroupsCount++
	}

	importedServersCount := 0
	for _, srv := range exportData.Servers {
		// 若 ID 冲突或为空，分配新 UUID
		if existingServerIDs[srv.ID] || srv.ID == "" {
			srv.ID = uuid.NewString()
		}

		// 检查分组映射
		if srv.GroupID != "" {
			if newGroupID, ok := groupIDMap[srv.GroupID]; ok {
				srv.GroupID = newGroupID
			} else if !existingGroupIDs[srv.GroupID] {
				// 所属分组既不在映射中，也不在本地分组中，置为空（移至未分组）
				srv.GroupID = ""
			}
		}

		// 保证名称非空
		if srv.Name == "" {
			srv.Name = srv.Host
		}

		savedSrv, err := c.Store.Save(srv)
		if err != nil {
			logger.Warnf("导入连接 [%s] 失败: %v", srv.Name, err)
			continue
		}
		existingServerIDs[savedSrv.ID] = true
		importedServersCount++
	}

	logger.Infof("已成功从 [%s] 导入配置: %d 个连接, %d 个分组", filePath, importedServersCount, importedGroupsCount)
	return &ConfigIOResult{
		Success:      true,
		FilePath:     filePath,
		ServersCount: importedServersCount,
		GroupsCount:  importedGroupsCount,
		Message:      fmt.Sprintf("成功导入 %d 个连接配置与 %d 个分组", importedServersCount, importedGroupsCount),
	}, nil
}

func (s *SystemService) SelectPrivateKey() (string, error) {
	path, err := core.OpenFileDialog("选择 SSH 私钥文件")
	if err != nil {
		logger.Errorf("选择私钥文件失败: %v", err)
	}
	return path, err
}

func (s *SystemService) SelectLocalSqliteFile() (string, error) {
	path, err := core.OpenFileDialog("选择 SQLite 数据库文件")
	if err != nil {
		logger.Errorf("选择 SQLite 文件失败: %v", err)
	}
	return path, err
}

func (s *SystemService) SelectCertFile() (string, error) {
	path, err := core.OpenFileDialog("选择证书文件 (CA/Cert/Key)")
	if err != nil {
		logger.Errorf("选择证书文件失败: %v", err)
	}
	return path, err
}

func (s *SystemService) GetAppVersion() core.AppVersionInfo {
	return core.GetAppVersionInfo()
}

func (s *SystemService) CheckForUpdates() core.UpdateCheckResult {
	res := core.CheckForUpdates()
	if res.HasUpdate {
		logger.Infof("检测到新版本发布: %s (当前版本: %s)", res.LatestVersion, res.CurrentVersion)
	}
	return res
}

func (s *SystemService) OpenBrowser(targetURL string) error {
	logger.Infof("调用系统浏览器打开 URL: %s", targetURL)
	if err := core.OpenBrowser(targetURL); err != nil {
		logger.Errorf("打开浏览器失败 [%s]: %v", targetURL, err)
		return err
	}
	return nil
}

func (s *SystemService) HideWindow() {
	if app := application.Get(); app != nil {
		if w, ok := app.Window.GetByName("main"); ok && w != nil {
			w.Hide()
		}
	}
}

func (s *SystemService) QuitApp() {
	core.SetAppQuitting(true)
	if app := application.Get(); app != nil {
		app.Quit()
	}
}


