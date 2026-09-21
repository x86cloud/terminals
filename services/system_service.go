package services

import (
	"errors"
	"terminal/agent"
	"terminal/core"
	"terminal/logger"
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

