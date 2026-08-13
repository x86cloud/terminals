package main

import (
	"errors"
	"terminal/db"
)

// ---------- MySQL 核心 API ----------

func (a *App) MysqlConnect(serverID string) (bool, error) {
	cfg, ok := a.store.Get(serverID)
	if !ok {
		return false, errors.New("服务器配置不存在")
	}
	return a.mysqlMgr.MysqlConnectEx(cfg)
}

func (a *App) MysqlClose(serverID string) error {
	a.mysqlMgr.MysqlCloseEx(serverID)
	return nil
}

func (a *App) MysqlDatabases(serverID string) ([]string, error) {
	return a.mysqlMgr.MysqlDatabases(serverID)
}

func (a *App) MysqlTables(serverID, dbName string) ([]string, error) {
	return a.mysqlMgr.MysqlTables(serverID, dbName)
}

func (a *App) MysqlSelect(serverID, dbName, table string, limit, offset int) (db.MysqlQueryResult, error) {
	return a.mysqlMgr.MysqlSelect(serverID, dbName, table, limit, offset)
}

func (a *App) MysqlCount(serverID, dbName, table string) (int64, error) {
	return a.mysqlMgr.MysqlCount(serverID, dbName, table)
}

func (a *App) MysqlDescribe(serverID, dbName, table string) (db.MysqlQueryResult, error) {
	return a.mysqlMgr.MysqlDescribe(serverID, dbName, table)
}

func (a *App) MysqlRun(serverID, dbName, sqlText string) (db.MysqlQueryResult, error) {
	return a.mysqlMgr.MysqlRun(serverID, dbName, sqlText)
}

func (a *App) MysqlInsert(serverID, dbName, table string, columns []string, values []any) (int64, error) {
	return a.mysqlMgr.MysqlInsert(serverID, dbName, table, columns, values)
}

func (a *App) MysqlUpdate(serverID, dbName, table string, setCols []string, setVals []any, whereCols []string, whereVals []any) (int64, error) {
	return a.mysqlMgr.MysqlUpdate(serverID, dbName, table, setCols, setVals, whereCols, whereVals)
}

func (a *App) MysqlDelete(serverID, dbName, table string, whereCols []string, whereVals []any) (int64, error) {
	return a.mysqlMgr.MysqlDelete(serverID, dbName, table, whereCols, whereVals)
}

func (a *App) MysqlExport(serverID, dbName, mode, source, table, sqlText string, limit int) (string, error) {
	return a.mysqlMgr.MysqlExport(serverID, dbName, mode, source, table, sqlText, limit)
}

func (a *App) MysqlExportToFile(serverID, dbName, mode, source, table, sqlText string, limit int) (string, error) {
	return a.mysqlMgr.MysqlExportToFileEx(serverID, dbName, mode, source, table, sqlText, limit)
}

func (a *App) MysqlImport(serverID, dbName, mode, table, content string) (string, error) {
	return a.mysqlMgr.MysqlImport(serverID, dbName, mode, table, content)
}

func (a *App) MysqlImportFromFile(serverID, dbName, mode, table string) (string, error) {
	return a.mysqlMgr.MysqlImportFromFileEx(serverID, dbName, mode, table)
}

// ---------- MySQL 扩展 API (MysqlExMgr) ----------

func (a *App) MysqlConnectEx(serverID string) (bool, error) {
	cfg, ok := a.store.Get(serverID)
	if !ok {
		return false, errors.New("服务器配置不存在")
	}
	return a.mysqlMgr.MysqlConnectEx(cfg)
}

func (a *App) MysqlCloseEx(serverID string) {
	a.mysqlMgr.MysqlCloseEx(serverID)
}

func (a *App) MysqlCreateDatabase(serverID, name, charset string) error {
	return a.mysqlMgr.MysqlCreateDatabase(serverID, name, charset)
}

func (a *App) MysqlDropDatabase(serverID, name string) error {
	return a.mysqlMgr.MysqlDropDatabase(serverID, name)
}

func (a *App) MysqlCreateTable(serverID, dbName, table, defs string) error {
	return a.mysqlMgr.MysqlCreateTable(serverID, dbName, table, defs)
}

func (a *App) MysqlDropTable(serverID, dbName, table string) error {
	return a.mysqlMgr.MysqlDropTable(serverID, dbName, table)
}

func (a *App) MysqlTruncateTable(serverID, dbName, table string) error {
	return a.mysqlMgr.MysqlTruncateTable(serverID, dbName, table)
}

func (a *App) MysqlTableStatus(serverID, dbName string) ([]map[string]any, error) {
	return a.mysqlMgr.MysqlTableStatus(serverID, dbName)
}

func (a *App) MysqlIndexes(serverID, dbName, table string) ([]map[string]any, error) {
	return a.mysqlMgr.MysqlIndexes(serverID, dbName, table)
}

func (a *App) MysqlCreateIndex(serverID, dbName, table, name, colsCSV string, unique bool) error {
	return a.mysqlMgr.MysqlCreateIndex(serverID, dbName, table, name, colsCSV, unique)
}

func (a *App) MysqlDropIndex(serverID, dbName, table, name string) error {
	return a.mysqlMgr.MysqlDropIndex(serverID, dbName, table, name)
}

func (a *App) MysqlUsers(serverID string) ([]map[string]any, error) {
	return a.mysqlMgr.MysqlUsers(serverID)
}

func (a *App) MysqlGrants(serverID, user, host string) (string, error) {
	return a.mysqlMgr.MysqlGrants(serverID, user, host)
}

func (a *App) MysqlStatus(serverID string) (map[string]any, error) {
	return a.mysqlMgr.MysqlStatus(serverID)
}

func (a *App) MysqlVariables(serverID string) (map[string]any, error) {
	return a.mysqlMgr.MysqlVariables(serverID)
}

func (a *App) MysqlProcessList(serverID string) ([]map[string]any, error) {
	return a.mysqlMgr.MysqlProcessList(serverID)
}

func (a *App) MysqlSlowLog(serverID string, limit int) ([]map[string]any, error) {
	return a.mysqlMgr.MysqlSlowLog(serverID, limit)
}

func (a *App) MysqlSchema(serverID, dbName string) (map[string]any, error) {
	return a.mysqlMgr.MysqlSchema(serverID, dbName)
}

func (a *App) MysqlExportJSON(serverID, dbName, source, table, sqlText string, limit int) (string, error) {
	return a.mysqlMgr.MysqlExportJSON(serverID, dbName, source, table, sqlText, limit)
}

func (a *App) MysqlImportJSON(serverID, dbName, table, content string) (string, error) {
	return a.mysqlMgr.MysqlImportJSON(serverID, dbName, table, content)
}

func (a *App) MysqlExportToFileEx(serverID, dbName, mode, source, table, sqlText string, limit int) (string, error) {
	if a.ctx != nil {
		a.mysqlMgr.SetContext(a.ctx)
	}
	return a.mysqlMgr.MysqlExportToFileEx(serverID, dbName, mode, source, table, sqlText, limit)
}

func (a *App) MysqlImportFromFileEx(serverID, dbName, mode, table string) (string, error) {
	if a.ctx != nil {
		a.mysqlMgr.SetContext(a.ctx)
	}
	return a.mysqlMgr.MysqlImportFromFileEx(serverID, dbName, mode, table)
}

func (a *App) MysqlQueryCSV(serverID, dbName, sqlText string, limit int) (string, error) {
	return a.mysqlMgr.MysqlQueryCSV(serverID, dbName, sqlText, limit)
}

func (a *App) MysqlBackup(serverID, dbName string) (string, error) {
	return a.mysqlMgr.MysqlBackup(serverID, dbName)
}

func (a *App) MysqlBackupToFile(serverID, dbName string) (string, error) {
	if a.ctx != nil {
		a.mysqlMgr.SetContext(a.ctx)
	}
	return a.mysqlMgr.MysqlBackupToFile(serverID, dbName)
}
