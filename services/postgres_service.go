package services

import (
	"errors"
	"terminal/core"
	"terminal/db"
)

type PostgresService struct{}

func NewPostgresService() *PostgresService {
	return &PostgresService{}
}

func (s *PostgresService) PostgresTestConnection(cfg core.ServerConfig) (map[string]any, error) {
	return GetContainer().PostgresMgr.PostgresTestConnection(cfg)
}

func (s *PostgresService) PostgresConnect(serverID string) (bool, error) {
	c := GetContainer()
	cfg, ok := c.Store.Get(serverID)
	if !ok {
		return false, errors.New("服务器配置不存在")
	}
	return c.PostgresMgr.PostgresConnectEx(cfg)
}

func (s *PostgresService) PostgresClose(serverID string) error {
	GetContainer().PostgresMgr.PostgresCloseEx(serverID)
	return nil
}

func (s *PostgresService) PostgresDatabases(serverID string) ([]db.PgDatabase, error) {
	return GetContainer().PostgresMgr.PostgresDatabases(serverID)
}

func (s *PostgresService) PostgresSchemas(serverID, dbName string) ([]db.PgSchema, error) {
	return GetContainer().PostgresMgr.PostgresSchemas(serverID, dbName)
}

func (s *PostgresService) PostgresTables(serverID, dbName, schema string) ([]db.PgTable, error) {
	return GetContainer().PostgresMgr.PostgresTables(serverID, dbName, schema)
}

func (s *PostgresService) PostgresSequences(serverID, dbName, schema string) ([]db.PgSequence, error) {
	return GetContainer().PostgresMgr.PostgresSequences(serverID, dbName, schema)
}

func (s *PostgresService) PostgresFunctions(serverID, dbName, schema string) ([]db.PgFunction, error) {
	return GetContainer().PostgresMgr.PostgresFunctions(serverID, dbName, schema)
}

func (s *PostgresService) PostgresDescribe(serverID, dbName, schema, table string) (map[string]any, error) {
	return GetContainer().PostgresMgr.PostgresDescribe(serverID, dbName, schema, table)
}

func (s *PostgresService) PostgresTableDDL(serverID, dbName, schema, table string) (string, error) {
	return GetContainer().PostgresMgr.PostgresTableDDL(serverID, dbName, schema, table)
}

func (s *PostgresService) PostgresSelect(serverID, dbName, schema, table string, limit, offset int, sortCol, sortOrder, whereClause string) (db.PostgresQueryResult, error) {
	return GetContainer().PostgresMgr.PostgresSelect(serverID, dbName, schema, table, limit, offset, sortCol, sortOrder, whereClause)
}

func (s *PostgresService) PostgresCount(serverID, dbName, schema, table, whereClause string) (int64, error) {
	return GetContainer().PostgresMgr.PostgresCount(serverID, dbName, schema, table, whereClause)
}

func (s *PostgresService) PostgresInsert(serverID, dbName, schema, table string, columns []string, values []any) (int64, error) {
	return GetContainer().PostgresMgr.PostgresInsert(serverID, dbName, schema, table, columns, values)
}

func (s *PostgresService) PostgresUpdate(serverID, dbName, schema, table string, setCols []string, setVals []any, whereCols []string, whereVals []any) (int64, error) {
	return GetContainer().PostgresMgr.PostgresUpdate(serverID, dbName, schema, table, setCols, setVals, whereCols, whereVals)
}

func (s *PostgresService) PostgresDelete(serverID, dbName, schema, table string, whereCols []string, whereVals []any) (int64, error) {
	return GetContainer().PostgresMgr.PostgresDelete(serverID, dbName, schema, table, whereCols, whereVals)
}

func (s *PostgresService) PostgresRun(serverID, dbName, sqlText string) (db.PostgresQueryResult, error) {
	return GetContainer().PostgresMgr.PostgresRun(serverID, dbName, sqlText)
}

func (s *PostgresService) PostgresExplain(serverID, dbName, sqlText string, analyze, buffers, verbose bool) (string, error) {
	return GetContainer().PostgresMgr.PostgresExplain(serverID, dbName, sqlText, analyze, buffers, verbose)
}

func (s *PostgresService) PostgresSessions(serverID, dbName string) ([]db.PgSession, error) {
	return GetContainer().PostgresMgr.PostgresSessions(serverID, dbName)
}

func (s *PostgresService) PostgresKillSession(serverID, dbName string, pid int, terminate bool) (bool, error) {
	return GetContainer().PostgresMgr.PostgresKillSession(serverID, dbName, pid, terminate)
}

func (s *PostgresService) PostgresStatus(serverID, dbName string) (db.PgStatus, error) {
	return GetContainer().PostgresMgr.PostgresStatus(serverID, dbName)
}

func (s *PostgresService) PostgresRoles(serverID string) ([]db.PgRole, error) {
	return GetContainer().PostgresMgr.PostgresRoles(serverID)
}

func (s *PostgresService) PostgresCreateRole(serverID, roleName, password string, super, canLogin, createDB, createRole bool, connLimit int) error {
	return GetContainer().PostgresMgr.PostgresCreateRole(serverID, roleName, password, super, canLogin, createDB, createRole, connLimit)
}

func (s *PostgresService) PostgresUpdateRolePassword(serverID, roleName, newPassword string) error {
	return GetContainer().PostgresMgr.PostgresUpdateRolePassword(serverID, roleName, newPassword)
}

func (s *PostgresService) PostgresDropRole(serverID, roleName string) error {
	return GetContainer().PostgresMgr.PostgresDropRole(serverID, roleName)
}

func (s *PostgresService) PostgresGrantPrivileges(serverID, dbName, roleName, schema, table, privileges string, isGrant bool) error {
	return GetContainer().PostgresMgr.PostgresGrantPrivileges(serverID, dbName, roleName, schema, table, privileges, isGrant)
}

func (s *PostgresService) PostgresCreateDatabase(serverID, name, owner, encoding, template string) error {
	return GetContainer().PostgresMgr.PostgresCreateDatabase(serverID, name, owner, encoding, template)
}

func (s *PostgresService) PostgresDropDatabase(serverID, name string) error {
	return GetContainer().PostgresMgr.PostgresDropDatabase(serverID, name)
}

func (s *PostgresService) PostgresCreateSchema(serverID, dbName, schema, owner string) error {
	return GetContainer().PostgresMgr.PostgresCreateSchema(serverID, dbName, schema, owner)
}

func (s *PostgresService) PostgresDropSchema(serverID, dbName, schema string, cascade bool) error {
	return GetContainer().PostgresMgr.PostgresDropSchema(serverID, dbName, schema, cascade)
}

func (s *PostgresService) PostgresCreateTable(serverID, dbName, schema, table, defs string) error {
	return GetContainer().PostgresMgr.PostgresCreateTable(serverID, dbName, schema, table, defs)
}

func (s *PostgresService) PostgresDropTable(serverID, dbName, schema, table string, cascade bool) error {
	return GetContainer().PostgresMgr.PostgresDropTable(serverID, dbName, schema, table, cascade)
}

func (s *PostgresService) PostgresTruncateTable(serverID, dbName, schema, table string, restartIdentity, cascade bool) error {
	return GetContainer().PostgresMgr.PostgresTruncateTable(serverID, dbName, schema, table, restartIdentity, cascade)
}

func (s *PostgresService) PostgresExport(serverID, dbName, schema, mode, source, table, sqlText string, limit int) (string, error) {
	return GetContainer().PostgresMgr.PostgresExport(serverID, dbName, schema, mode, source, table, sqlText, limit)
}

func (s *PostgresService) PostgresExportToFile(serverID, dbName, schema, mode, source, table, sqlText string, limit int) (string, error) {
	return GetContainer().PostgresMgr.PostgresExportToFile(serverID, dbName, schema, mode, source, table, sqlText, limit)
}

func (s *PostgresService) PostgresImport(serverID, dbName, schema, mode, table, content string) (string, error) {
	return GetContainer().PostgresMgr.PostgresImport(serverID, dbName, schema, mode, table, content)
}

func (s *PostgresService) PostgresImportFromFile(serverID, dbName, schema, mode, table string) (string, error) {
	return GetContainer().PostgresMgr.PostgresImportFromFile(serverID, dbName, schema, mode, table)
}
