package services

import (
	"errors"
	"terminal/core"
)

type SystemService struct{}

func NewSystemService() *SystemService {
	return &SystemService{}
}

func (s *SystemService) ListServers() []core.ServerConfig {
	c := GetContainer()
	if c.Store == nil {
		return []core.ServerConfig{}
	}
	return c.Store.List()
}

func (s *SystemService) SaveServer(cfg core.ServerConfig) (core.ServerConfig, error) {
	c := GetContainer()
	if c.Store == nil {
		return core.ServerConfig{}, errors.New("配置存储不可用")
	}
	return c.Store.Save(cfg)
}

func (s *SystemService) DeleteServer(id string) error {
	c := GetContainer()
	if c.Store == nil {
		return errors.New("配置存储不可用")
	}
	return c.Store.Delete(id)
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
		return settings, errors.New("配置存储不可用")
	}
	return c.Store.SaveSettings(settings)
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
		return core.ServerGroup{}, errors.New("配置存储不可用")
	}
	return c.Store.SaveGroup(g)
}

func (s *SystemService) DeleteGroup(id string) error {
	c := GetContainer()
	if c.Store == nil {
		return errors.New("配置存储不可用")
	}
	return c.Store.DeleteGroup(id)
}

func (s *SystemService) MoveServerToGroup(serverID, groupID string) error {
	c := GetContainer()
	if c.Store == nil {
		return errors.New("配置存储不可用")
	}
	return c.Store.MoveServerToGroup(serverID, groupID)
}

func (s *SystemService) SelectPrivateKey() (string, error) {
	return core.OpenFileDialog("选择 SSH 私钥文件")
}

func (s *SystemService) SelectLocalSqliteFile() (string, error) {
	return core.OpenFileDialog("选择 SQLite 数据库文件")
}

func (s *SystemService) SelectCertFile() (string, error) {
	return core.OpenFileDialog("选择证书文件 (CA/Cert/Key)")
}
