package services

import (
	"errors"
	"terminal/core"
	"terminal/db"
	"terminal/logger"
)

type PostgresService struct{}

func NewPostgresService() *PostgresService {
	return &PostgresService{}
}

func (s *PostgresService) PostgresTestConnection(cfg core.ServerConfig) (map[string]any, error) {
	logger.Infof("测试 PostgreSQL 连通性: 主机=%s:%d, 用户=%s", cfg.Host, cfg.Port, cfg.Username)
	res, err := GetContainer().PostgresMgr.PostgresTestConnection(cfg)
	if err != nil {
		logger.Errorf("测试 PostgreSQL 连通性失败 [主机=%s:%d]: %v", cfg.Host, cfg.Port, err)
		return nil, err
	}
	return res, nil
}

func (s *PostgresService) PostgresConnect(serverID string) (bool, error) {
	c := GetContainer()
	cfg, ok := c.Store.Get(serverID)
	if !ok {
		err := errors.New("服务器配置不存在")
		logger.Errorf("PostgreSQL 连接失败: 服务器配置不存在 [ServerID=%s]", serverID)
		return false, err
	}
	logger.Infof("正在发起 PostgreSQL 连接: ServerID=%s, 名称=%s, 主机=%s:%d, 用户=%s", cfg.ID, cfg.Name, cfg.Host, cfg.Port, cfg.Username)
	ok, err := c.PostgresMgr.PostgresConnectEx(cfg)
	if err != nil {
		logger.Errorf("PostgreSQL 连接失败 [ServerID=%s, 主机=%s:%d]: %v", serverID, cfg.Host, cfg.Port, err)
		return false, err
	}
	logger.Infof("PostgreSQL 连接成功: ServerID=%s, 主机=%s:%d", serverID, cfg.Host, cfg.Port)
	return ok, nil
}

func (s *PostgresService) PostgresClose(serverID string) error {
	logger.Infof("关闭 PostgreSQL 连接: ServerID=%s", serverID)
	GetContainer().PostgresMgr.PostgresCloseEx(serverID)
	return nil
}

func (s *PostgresService) PostgresDatabases(serverID string) ([]db.PgDatabase, error) {
	dbs, err := GetContainer().PostgresMgr.PostgresDatabases(serverID)
	if err != nil {
		logger.Errorf("获取 PostgreSQL 数据库列表失败 [ServerID=%s]: %v", serverID, err)
		return nil, err
	}
	return dbs, nil
}

func (s *PostgresService) PostgresSchemas(serverID, dbName string) ([]db.PgSchema, error) {
	schemas, err := GetContainer().PostgresMgr.PostgresSchemas(serverID, dbName)
	if err != nil {
		logger.Errorf("获取 PostgreSQL 模式列表失败 [ServerID=%s, DB=%s]: %v", serverID, dbName, err)
		return nil, err
	}
	return schemas, nil
}

func (s *PostgresService) PostgresTables(serverID, dbName, schema string) ([]db.PgTable, error) {
	tables, err := GetContainer().PostgresMgr.PostgresTables(serverID, dbName, schema)
	if err != nil {
		logger.Errorf("获取 PostgreSQL 数据表列表失败 [ServerID=%s, DB=%s, Schema=%s]: %v", serverID, dbName, schema, err)
		return nil, err
	}
	return tables, nil
}

func (s *PostgresService) PostgresSequences(serverID, dbName, schema string) ([]db.PgSequence, error) {
	return GetContainer().PostgresMgr.PostgresSequences(serverID, dbName, schema)
}

func (s *PostgresService) PostgresFunctions(serverID, dbName, schema string) ([]db.PgFunction, error) {
	return GetContainer().PostgresMgr.PostgresFunctions(serverID, dbName, schema)
}

func (s *PostgresService) PostgresDescribe(serverID, dbName, schema, table string) (map[string]any, error) {
	res, err := GetContainer().PostgresMgr.PostgresDescribe(serverID, dbName, schema, table)
	if err != nil {
		logger.Errorf("PostgreSQL Describe 表结构失败 [ServerID=%s, DB=%s, Schema=%s, Table=%s]: %v", serverID, dbName, schema, table, err)
		return res, err
	}
	return res, nil
}

func (s *PostgresService) PostgresTableDDL(serverID, dbName, schema, table string) (string, error) {
	return GetContainer().PostgresMgr.PostgresTableDDL(serverID, dbName, schema, table)
}

func (s *PostgresService) PostgresSelect(serverID, dbName, schema, table string, limit, offset int, sortCol, sortOrder, whereClause string) (db.PostgresQueryResult, error) {
	res, err := GetContainer().PostgresMgr.PostgresSelect(serverID, dbName, schema, table, limit, offset, sortCol, sortOrder, whereClause)
	if err != nil {
		logger.Errorf("PostgreSQL 查询表数据失败 [ServerID=%s, DB=%s, Schema=%s, Table=%s]: %v", serverID, dbName, schema, table, err)
		return res, err
	}
	return res, nil
}

func (s *PostgresService) PostgresCount(serverID, dbName, schema, table, whereClause string) (int64, error) {
	count, err := GetContainer().PostgresMgr.PostgresCount(serverID, dbName, schema, table, whereClause)
	if err != nil {
		logger.Errorf("PostgreSQL 统计记录数失败 [ServerID=%s, DB=%s, Schema=%s, Table=%s]: %v", serverID, dbName, schema, table, err)
		return 0, err
	}
	return count, nil
}

func (s *PostgresService) PostgresInsert(serverID, dbName, schema, table string, columns []string, values []any) (int64, error) {
	logger.Infof("PostgreSQL 插入数据 [ServerID=%s, DB=%s, Schema=%s, Table=%s, Cols=%v]", serverID, dbName, schema, table, columns)
	rows, err := GetContainer().PostgresMgr.PostgresInsert(serverID, dbName, schema, table, columns, values)
	if err != nil {
		logger.Errorf("PostgreSQL 插入数据失败 [ServerID=%s, DB=%s, Schema=%s, Table=%s]: %v", serverID, dbName, schema, table, err)
		return 0, err
	}
	return rows, nil
}

func (s *PostgresService) PostgresUpdate(serverID, dbName, schema, table string, setCols []string, setVals []any, whereCols []string, whereVals []any) (int64, error) {
	logger.Infof("PostgreSQL 更新数据 [ServerID=%s, DB=%s, Schema=%s, Table=%s, SetCols=%v, WhereCols=%v]", serverID, dbName, schema, table, setCols, whereCols)
	rows, err := GetContainer().PostgresMgr.PostgresUpdate(serverID, dbName, schema, table, setCols, setVals, whereCols, whereVals)
	if err != nil {
		logger.Errorf("PostgreSQL 更新数据失败 [ServerID=%s, DB=%s, Schema=%s, Table=%s]: %v", serverID, dbName, schema, table, err)
		return 0, err
	}
	return rows, nil
}

func (s *PostgresService) PostgresDelete(serverID, dbName, schema, table string, whereCols []string, whereVals []any) (int64, error) {
	logger.Infof("PostgreSQL 删除数据 [ServerID=%s, DB=%s, Schema=%s, Table=%s, WhereCols=%v]", serverID, dbName, schema, table, whereCols)
	rows, err := GetContainer().PostgresMgr.PostgresDelete(serverID, dbName, schema, table, whereCols, whereVals)
	if err != nil {
		logger.Errorf("PostgreSQL 删除数据失败 [ServerID=%s, DB=%s, Schema=%s, Table=%s]: %v", serverID, dbName, schema, table, err)
		return 0, err
	}
	return rows, nil
}

func (s *PostgresService) PostgresRun(serverID, dbName, sqlText string) (db.PostgresQueryResult, error) {
	logger.Infof("PostgreSQL 执行 SQL [ServerID=%s, DB=%s, SQL=%s]", serverID, dbName, sqlText)
	res, err := GetContainer().PostgresMgr.PostgresRun(serverID, dbName, sqlText)
	if err != nil {
		logger.Errorf("PostgreSQL 执行 SQL 失败 [ServerID=%s, DB=%s]: %v", serverID, dbName, err)
		return res, err
	}
	return res, nil
}

func (s *PostgresService) PostgresExplain(serverID, dbName, sqlText string, analyze, buffers, verbose bool) (string, error) {
	return GetContainer().PostgresMgr.PostgresExplain(serverID, dbName, sqlText, analyze, buffers, verbose)
}

func (s *PostgresService) PostgresSessions(serverID, dbName string) ([]db.PgSession, error) {
	return GetContainer().PostgresMgr.PostgresSessions(serverID, dbName)
}

func (s *PostgresService) PostgresKillSession(serverID, dbName string, pid int, terminate bool) (bool, error) {
	logger.Infof("PostgreSQL 终止会话 [ServerID=%s, DB=%s, PID=%d, Terminate=%v]", serverID, dbName, pid, terminate)
	ok, err := GetContainer().PostgresMgr.PostgresKillSession(serverID, dbName, pid, terminate)
	if err != nil {
		logger.Errorf("PostgreSQL 终止会话失败 [ServerID=%s, PID=%d]: %v", serverID, pid, err)
		return false, err
	}
	return ok, nil
}

func (s *PostgresService) PostgresStatus(serverID, dbName string) (db.PgStatus, error) {
	return GetContainer().PostgresMgr.PostgresStatus(serverID, dbName)
}

func (s *PostgresService) PostgresRoles(serverID string) ([]db.PgRole, error) {
	return GetContainer().PostgresMgr.PostgresRoles(serverID)
}

func (s *PostgresService) PostgresCreateRole(serverID, roleName, password string, super, canLogin, createDB, createRole bool, connLimit int) error {
	logger.Infof("PostgreSQL 创建角色 [ServerID=%s, Role=%s, Super=%v, Login=%v]", serverID, roleName, super, canLogin)
	if err := GetContainer().PostgresMgr.PostgresCreateRole(serverID, roleName, password, super, canLogin, createDB, createRole, connLimit); err != nil {
		logger.Errorf("PostgreSQL 创建角色失败 [ServerID=%s, Role=%s]: %v", serverID, roleName, err)
		return err
	}
	return nil
}

func (s *PostgresService) PostgresUpdateRolePassword(serverID, roleName, newPassword string) error {
	logger.Infof("PostgreSQL 修改角色密码 [ServerID=%s, Role=%s]", serverID, roleName)
	if err := GetContainer().PostgresMgr.PostgresUpdateRolePassword(serverID, roleName, newPassword); err != nil {
		logger.Errorf("PostgreSQL 修改角色密码失败 [ServerID=%s, Role=%s]: %v", serverID, roleName, err)
		return err
	}
	return nil
}

func (s *PostgresService) PostgresDropRole(serverID, roleName string) error {
	logger.Infof("PostgreSQL 删除角色 [ServerID=%s, Role=%s]", serverID, roleName)
	if err := GetContainer().PostgresMgr.PostgresDropRole(serverID, roleName); err != nil {
		logger.Errorf("PostgreSQL 删除角色失败 [ServerID=%s, Role=%s]: %v", serverID, roleName, err)
		return err
	}
	return nil
}

func (s *PostgresService) PostgresGrantPrivileges(serverID, dbName, roleName, schema, table, privileges string, isGrant bool) error {
	logger.Infof("PostgreSQL 权限管理 [ServerID=%s, DB=%s, Role=%s, Schema=%s, Table=%s, Privs=%s, IsGrant=%v]", serverID, dbName, roleName, schema, table, privileges, isGrant)
	if err := GetContainer().PostgresMgr.PostgresGrantPrivileges(serverID, dbName, roleName, schema, table, privileges, isGrant); err != nil {
		logger.Errorf("PostgreSQL 权限管理操作失败 [ServerID=%s, Role=%s]: %v", serverID, roleName, err)
		return err
	}
	return nil
}

func (s *PostgresService) PostgresCreateDatabase(serverID, name, owner, encoding, template string) error {
	logger.Infof("PostgreSQL 创建数据库 [ServerID=%s, Name=%s, Owner=%s, Encoding=%s]", serverID, name, owner, encoding)
	if err := GetContainer().PostgresMgr.PostgresCreateDatabase(serverID, name, owner, encoding, template); err != nil {
		logger.Errorf("PostgreSQL 创建数据库失败 [ServerID=%s, Name=%s]: %v", serverID, name, err)
		return err
	}
	return nil
}

func (s *PostgresService) PostgresDropDatabase(serverID, name string) error {
	logger.Infof("PostgreSQL 删除数据库 [ServerID=%s, Name=%s]", serverID, name)
	if err := GetContainer().PostgresMgr.PostgresDropDatabase(serverID, name); err != nil {
		logger.Errorf("PostgreSQL 删除数据库失败 [ServerID=%s, Name=%s]: %v", serverID, name, err)
		return err
	}
	return nil
}

func (s *PostgresService) PostgresCreateSchema(serverID, dbName, schema, owner string) error {
	logger.Infof("PostgreSQL 创建模式 [ServerID=%s, DB=%s, Schema=%s, Owner=%s]", serverID, dbName, schema, owner)
	if err := GetContainer().PostgresMgr.PostgresCreateSchema(serverID, dbName, schema, owner); err != nil {
		logger.Errorf("PostgreSQL 创建模式失败 [ServerID=%s, DB=%s, Schema=%s]: %v", serverID, dbName, schema, err)
		return err
	}
	return nil
}

func (s *PostgresService) PostgresDropSchema(serverID, dbName, schema string, cascade bool) error {
	logger.Infof("PostgreSQL 删除模式 [ServerID=%s, DB=%s, Schema=%s, Cascade=%v]", serverID, dbName, schema, cascade)
	if err := GetContainer().PostgresMgr.PostgresDropSchema(serverID, dbName, schema, cascade); err != nil {
		logger.Errorf("PostgreSQL 删除模式失败 [ServerID=%s, DB=%s, Schema=%s]: %v", serverID, dbName, schema, err)
		return err
	}
	return nil
}

func (s *PostgresService) PostgresCreateTable(serverID, dbName, schema, table, defs string) error {
	logger.Infof("PostgreSQL 创建数据表 [ServerID=%s, DB=%s, Schema=%s, Table=%s]", serverID, dbName, schema, table)
	if err := GetContainer().PostgresMgr.PostgresCreateTable(serverID, dbName, schema, table, defs); err != nil {
		logger.Errorf("PostgreSQL 创建数据表失败 [ServerID=%s, DB=%s, Schema=%s, Table=%s]: %v", serverID, dbName, schema, table, err)
		return err
	}
	return nil
}

func (s *PostgresService) PostgresDropTable(serverID, dbName, schema, table string, cascade bool) error {
	logger.Infof("PostgreSQL 删除数据表 [ServerID=%s, DB=%s, Schema=%s, Table=%s, Cascade=%v]", serverID, dbName, schema, table, cascade)
	if err := GetContainer().PostgresMgr.PostgresDropTable(serverID, dbName, schema, table, cascade); err != nil {
		logger.Errorf("PostgreSQL 删除数据表失败 [ServerID=%s, DB=%s, Schema=%s, Table=%s]: %v", serverID, dbName, schema, table, err)
		return err
	}
	return nil
}

func (s *PostgresService) PostgresTruncateTable(serverID, dbName, schema, table string, restartIdentity, cascade bool) error {
	logger.Infof("PostgreSQL 清空数据表 [ServerID=%s, DB=%s, Schema=%s, Table=%s]", serverID, dbName, schema, table)
	if err := GetContainer().PostgresMgr.PostgresTruncateTable(serverID, dbName, schema, table, restartIdentity, cascade); err != nil {
		logger.Errorf("PostgreSQL 清空数据表失败 [ServerID=%s, DB=%s, Schema=%s, Table=%s]: %v", serverID, dbName, schema, table, err)
		return err
	}
	return nil
}

func (s *PostgresService) PostgresExport(serverID, dbName, schema, mode, source, table, sqlText string, limit int) (string, error) {
	logger.Infof("PostgreSQL 导出数据 [ServerID=%s, DB=%s, Schema=%s, Mode=%s, Table=%s]", serverID, dbName, schema, mode, table)
	return GetContainer().PostgresMgr.PostgresExport(serverID, dbName, schema, mode, source, table, sqlText, limit)
}

func (s *PostgresService) PostgresExportToFile(serverID, dbName, schema, mode, source, table, sqlText string, limit int) (string, error) {
	logger.Infof("PostgreSQL 导出至文件 [ServerID=%s, DB=%s, Schema=%s, Mode=%s, Table=%s]", serverID, dbName, schema, mode, table)
	return GetContainer().PostgresMgr.PostgresExportToFile(serverID, dbName, schema, mode, source, table, sqlText, limit)
}

func (s *PostgresService) PostgresImport(serverID, dbName, schema, mode, table, content string) (string, error) {
	logger.Infof("PostgreSQL 导入数据 [ServerID=%s, DB=%s, Schema=%s, Mode=%s, Table=%s, Bytes=%d]", serverID, dbName, schema, mode, table, len(content))
	return GetContainer().PostgresMgr.PostgresImport(serverID, dbName, schema, mode, table, content)
}

func (s *PostgresService) PostgresImportFromFile(serverID, dbName, schema, mode, table string) (string, error) {
	logger.Infof("PostgreSQL 从文件导入 [ServerID=%s, DB=%s, Schema=%s, Mode=%s, Table=%s]", serverID, dbName, schema, mode, table)
	return GetContainer().PostgresMgr.PostgresImportFromFile(serverID, dbName, schema, mode, table)
}
