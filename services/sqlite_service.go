package services

import (
	"terminal/core"
)

type SqliteService struct{}

func NewSqliteService() *SqliteService {
	return &SqliteService{}
}

func (s *SqliteService) SqliteOpenFile() (string, error) {
	return core.OpenFileDialog("选择 SQLite 数据库文件")
}

func (s *SqliteService) SqliteConnect(id string, filePath string) (bool, error) {
	return GetContainer().SqliteMgr.SqliteConnect(id, filePath)
}

func (s *SqliteService) SqliteClose(id string) error {
	GetContainer().SqliteMgr.SqliteClose(id)
	return nil
}

func (s *SqliteService) SqliteInfo(id string) (map[string]any, error) {
	return GetContainer().SqliteMgr.SqliteInfo(id)
}

func (s *SqliteService) SqliteTables(id string) ([]map[string]any, error) {
	return GetContainer().SqliteMgr.SqliteTables(id)
}

func (s *SqliteService) SqliteDescribe(id string, table string) ([]map[string]any, error) {
	return GetContainer().SqliteMgr.SqliteDescribe(id, table)
}

func (s *SqliteService) SqliteSelect(id string, table string, limit int, offset int) (map[string]any, error) {
	return GetContainer().SqliteMgr.SqliteSelect(id, table, limit, offset)
}

func (s *SqliteService) SqliteCount(id string, table string) (int64, error) {
	return GetContainer().SqliteMgr.SqliteCount(id, table)
}

func (s *SqliteService) SqliteIndexes(id string, table string) ([]map[string]any, error) {
	return GetContainer().SqliteMgr.SqliteIndexes(id, table)
}

func (s *SqliteService) SqliteRun(id string, sqlText string) (map[string]any, error) {
	return GetContainer().SqliteMgr.SqliteRun(id, sqlText)
}

func (s *SqliteService) SqliteSchema(id string) (map[string]any, error) {
	return GetContainer().SqliteMgr.SqliteSchema(id)
}
