package services

import (
	"terminal/core"
	"terminal/logger"
)

type SqliteService struct{}

func NewSqliteService() *SqliteService {
	return &SqliteService{}
}

func (s *SqliteService) SqliteOpenFile() (string, error) {
	path, err := core.OpenFileDialog("选择 SQLite 数据库文件")
	if err != nil {
		logger.Errorf("打开 SQLite 文件弹窗失败: %v", err)
	}
	return path, err
}

func (s *SqliteService) SqliteConnect(id string, filePath string) (bool, error) {
	logger.Infof("正在连接 SQLite 数据库 [ID=%s, Path=%s]", id, filePath)
	ok, err := GetContainer().SqliteMgr.SqliteConnect(id, filePath)
	if err != nil {
		logger.Errorf("SQLite 数据库连接失败 [ID=%s, Path=%s]: %v", id, filePath, err)
		return false, err
	}
	logger.Infof("SQLite 数据库连接成功 [ID=%s, Path=%s]", id, filePath)
	return ok, nil
}

func (s *SqliteService) SqliteClose(id string) error {
	logger.Infof("关闭 SQLite 数据库连接 [ID=%s]", id)
	GetContainer().SqliteMgr.SqliteClose(id)
	return nil
}

func (s *SqliteService) SqliteInfo(id string) (map[string]any, error) {
	return GetContainer().SqliteMgr.SqliteInfo(id)
}

func (s *SqliteService) SqliteTables(id string) ([]map[string]any, error) {
	tables, err := GetContainer().SqliteMgr.SqliteTables(id)
	if err != nil {
		logger.Errorf("获取 SQLite 表列表失败 [ID=%s]: %v", id, err)
		return nil, err
	}
	return tables, nil
}

func (s *SqliteService) SqliteDescribe(id string, table string) ([]map[string]any, error) {
	desc, err := GetContainer().SqliteMgr.SqliteDescribe(id, table)
	if err != nil {
		logger.Errorf("获取 SQLite 表结构失败 [ID=%s, Table=%s]: %v", id, table, err)
		return nil, err
	}
	return desc, nil
}

func (s *SqliteService) SqliteSelect(id string, table string, limit int, offset int) (map[string]any, error) {
	res, err := GetContainer().SqliteMgr.SqliteSelect(id, table, limit, offset)
	if err != nil {
		logger.Errorf("SQLite 查询数据失败 [ID=%s, Table=%s]: %v", id, table, err)
		return res, err
	}
	return res, nil
}

func (s *SqliteService) SqliteCount(id string, table string) (int64, error) {
	count, err := GetContainer().SqliteMgr.SqliteCount(id, table)
	if err != nil {
		logger.Errorf("SQLite 统计行数失败 [ID=%s, Table=%s]: %v", id, table, err)
		return 0, err
	}
	return count, nil
}

func (s *SqliteService) SqliteIndexes(id string, table string) ([]map[string]any, error) {
	return GetContainer().SqliteMgr.SqliteIndexes(id, table)
}

func (s *SqliteService) SqliteRun(id string, sqlText string) (map[string]any, error) {
	logger.Infof("SQLite 执行 SQL [ID=%s, SQL=%s]", id, sqlText)
	res, err := GetContainer().SqliteMgr.SqliteRun(id, sqlText)
	if err != nil {
		logger.Errorf("SQLite 执行 SQL 失败 [ID=%s]: %v", id, err)
		return res, err
	}
	return res, nil
}

func (s *SqliteService) SqliteSchema(id string) (map[string]any, error) {
	return GetContainer().SqliteMgr.SqliteSchema(id)
}
