package services

import (
	"errors"
	"terminal/core"
	"terminal/db"
)

type MysqlService struct{}

func NewMysqlService() *MysqlService {
	return &MysqlService{}
}

func (s *MysqlService) MysqlConnect(serverID string) (bool, error) {
	c := GetContainer()
	cfg, ok := c.Store.Get(serverID)
	if !ok {
		return false, errors.New("服务器配置不存在")
	}
	return c.MysqlMgr.MysqlConnectEx(cfg)
}

func (s *MysqlService) MysqlClose(serverID string) error {
	GetContainer().MysqlMgr.MysqlCloseEx(serverID)
	return nil
}

func (s *MysqlService) MysqlDatabases(serverID string) ([]string, error) {
	return GetContainer().MysqlMgr.MysqlDatabases(serverID)
}

func (s *MysqlService) MysqlTables(serverID, dbName string) ([]string, error) {
	return GetContainer().MysqlMgr.MysqlTables(serverID, dbName)
}

func (s *MysqlService) MysqlSelect(serverID, dbName, table string, limit, offset int) (db.MysqlQueryResult, error) {
	return GetContainer().MysqlMgr.MysqlSelect(serverID, dbName, table, limit, offset)
}

func (s *MysqlService) MysqlCount(serverID, dbName, table string) (int64, error) {
	return GetContainer().MysqlMgr.MysqlCount(serverID, dbName, table)
}

func (s *MysqlService) MysqlDescribe(serverID, dbName, table string) (db.MysqlQueryResult, error) {
	return GetContainer().MysqlMgr.MysqlDescribe(serverID, dbName, table)
}

func (s *MysqlService) MysqlRun(serverID, dbName, sqlText string) (db.MysqlQueryResult, error) {
	return GetContainer().MysqlMgr.MysqlRun(serverID, dbName, sqlText)
}

func (s *MysqlService) MysqlInsert(serverID, dbName, table string, columns []string, values []any) (int64, error) {
	return GetContainer().MysqlMgr.MysqlInsert(serverID, dbName, table, columns, values)
}

func (s *MysqlService) MysqlUpdate(serverID, dbName, table string, setCols []string, setVals []any, whereCols []string, whereVals []any) (int64, error) {
	return GetContainer().MysqlMgr.MysqlUpdate(serverID, dbName, table, setCols, setVals, whereCols, whereVals)
}

func (s *MysqlService) MysqlDelete(serverID, dbName, table string, whereCols []string, whereVals []any) (int64, error) {
	return GetContainer().MysqlMgr.MysqlDelete(serverID, dbName, table, whereCols, whereVals)
}

func (s *MysqlService) MysqlExport(serverID, dbName, mode, source, table, sqlText string, limit int) (string, error) {
	return GetContainer().MysqlMgr.MysqlExport(serverID, dbName, mode, source, table, sqlText, limit)
}

func (s *MysqlService) MysqlExportToFile(serverID, dbName, mode, source, table, sqlText string, limit int) (string, error) {
	return GetContainer().MysqlMgr.MysqlExportToFileEx(serverID, dbName, mode, source, table, sqlText, limit)
}

func (s *MysqlService) MysqlImport(serverID, dbName, mode, table, content string) (string, error) {
	return GetContainer().MysqlMgr.MysqlImport(serverID, dbName, mode, table, content)
}

func (s *MysqlService) MysqlImportFromFile(serverID, dbName, mode, table string) (string, error) {
	return GetContainer().MysqlMgr.MysqlImportFromFileEx(serverID, dbName, mode, table)
}

func (s *MysqlService) MysqlCreateDatabase(serverID, name, charset string) error {
	return GetContainer().MysqlMgr.MysqlCreateDatabase(serverID, name, charset)
}

func (s *MysqlService) MysqlDropDatabase(serverID, name string) error {
	return GetContainer().MysqlMgr.MysqlDropDatabase(serverID, name)
}

func (s *MysqlService) MysqlCreateTable(serverID, dbName, table, defs string) error {
	return GetContainer().MysqlMgr.MysqlCreateTable(serverID, dbName, table, defs)
}

func (s *MysqlService) MysqlDropTable(serverID, dbName, table string) error {
	return GetContainer().MysqlMgr.MysqlDropTable(serverID, dbName, table)
}

func (s *MysqlService) MysqlTruncateTable(serverID, dbName, table string) error {
	return GetContainer().MysqlMgr.MysqlTruncateTable(serverID, dbName, table)
}

func (s *MysqlService) MysqlTableStatus(serverID, dbName string) ([]map[string]any, error) {
	return GetContainer().MysqlMgr.MysqlTableStatus(serverID, dbName)
}

func (s *MysqlService) MysqlIndexes(serverID, dbName, table string) ([]map[string]any, error) {
	return GetContainer().MysqlMgr.MysqlIndexes(serverID, dbName, table)
}

func (s *MysqlService) MysqlCreateIndex(serverID, dbName, table, name, colsCSV string, unique bool) error {
	return GetContainer().MysqlMgr.MysqlCreateIndex(serverID, dbName, table, name, colsCSV, unique)
}

func (s *MysqlService) MysqlDropIndex(serverID, dbName, table, name string) error {
	return GetContainer().MysqlMgr.MysqlDropIndex(serverID, dbName, table, name)
}

func (s *MysqlService) MysqlUsers(serverID string) ([]map[string]any, error) {
	return GetContainer().MysqlMgr.MysqlUsers(serverID)
}

func (s *MysqlService) MysqlGrants(serverID, user, host string) (string, error) {
	return GetContainer().MysqlMgr.MysqlGrants(serverID, user, host)
}

func (s *MysqlService) MysqlCreateUser(serverID, user, host, password, authPlugin string, lock bool) error {
	return GetContainer().MysqlMgr.MysqlCreateUser(serverID, user, host, password, authPlugin, lock)
}

func (s *MysqlService) MysqlDropUser(serverID, user, host string) error {
	return GetContainer().MysqlMgr.MysqlDropUser(serverID, user, host)
}

func (s *MysqlService) MysqlChangeUserPassword(serverID, user, host, newPassword string) error {
	return GetContainer().MysqlMgr.MysqlChangeUserPassword(serverID, user, host, newPassword)
}

func (s *MysqlService) MysqlToggleUserLock(serverID, user, host string, lock bool) error {
	return GetContainer().MysqlMgr.MysqlToggleUserLock(serverID, user, host, lock)
}

func (s *MysqlService) MysqlGrantPrivileges(serverID, user, host, dbName, table string, privs []string, withGrantOption bool) error {
	return GetContainer().MysqlMgr.MysqlGrantPrivileges(serverID, user, host, dbName, table, privs, withGrantOption)
}

func (s *MysqlService) MysqlRevokePrivileges(serverID, user, host, dbName, table string, privs []string) error {
	return GetContainer().MysqlMgr.MysqlRevokePrivileges(serverID, user, host, dbName, table, privs)
}

func (s *MysqlService) MysqlRevokeAllPrivileges(serverID, user, host string) error {
	return GetContainer().MysqlMgr.MysqlRevokeAllPrivileges(serverID, user, host)
}

func (s *MysqlService) MysqlStatus(serverID string) (map[string]any, error) {
	return GetContainer().MysqlMgr.MysqlStatus(serverID)
}

func (s *MysqlService) MysqlVariables(serverID string) (map[string]any, error) {
	return GetContainer().MysqlMgr.MysqlVariables(serverID)
}

func (s *MysqlService) MysqlProcessList(serverID string) ([]map[string]any, error) {
	return GetContainer().MysqlMgr.MysqlProcessList(serverID)
}

func (s *MysqlService) MysqlSlowLog(serverID string, limit int) ([]map[string]any, error) {
	return GetContainer().MysqlMgr.MysqlSlowLog(serverID, limit)
}

func (s *MysqlService) MysqlSchema(serverID, dbName string) (map[string]any, error) {
	return GetContainer().MysqlMgr.MysqlSchema(serverID, dbName)
}

func (s *MysqlService) MysqlExportJSON(serverID, dbName, source, table, sqlText string, limit int) (string, error) {
	return GetContainer().MysqlMgr.MysqlExportJSON(serverID, dbName, source, table, sqlText, limit)
}

func (s *MysqlService) MysqlImportJSON(serverID, dbName, table, content string) (string, error) {
	return GetContainer().MysqlMgr.MysqlImportJSON(serverID, dbName, table, content)
}

func (s *MysqlService) MysqlQueryCSV(serverID, dbName, sqlText string, limit int) (string, error) {
	return GetContainer().MysqlMgr.MysqlQueryCSV(serverID, dbName, sqlText, limit)
}

func (s *MysqlService) MysqlBackup(serverID, dbName string) (string, error) {
	return GetContainer().MysqlMgr.MysqlBackup(serverID, dbName)
}

func (s *MysqlService) MysqlBackupToFile(serverID, dbName string) (string, error) {
	return GetContainer().MysqlMgr.MysqlBackupToFile(serverID, dbName)
}

func (s *MysqlService) MysqlTestConnection(cfg core.ServerConfig) (map[string]any, error) {
	return GetContainer().MysqlMgr.TestConnection(cfg)
}
