package services

import (
	"errors"
	"terminal/core"
	"terminal/db"
	"terminal/logger"
)

type MysqlService struct{}

func NewMysqlService() *MysqlService {
	return &MysqlService{}
}

func (s *MysqlService) MysqlConnect(serverID string) (bool, error) {
	c := GetContainer()
	cfg, ok := c.Store.Get(serverID)
	if !ok {
		err := errors.New("服务器配置不存在")
		logger.Errorf("MySQL 连接失败: 服务器配置不存在 [ServerID=%s]", serverID)
		return false, err
	}
	logger.Infof("正在发起 MySQL 连接: ServerID=%s, 名称=%s, 主机=%s:%d, 用户=%s", cfg.ID, cfg.Name, cfg.Host, cfg.Port, cfg.Username)
	ok, err := c.MysqlMgr.MysqlConnectEx(cfg)
	if err != nil {
		logger.Errorf("MySQL 连接失败 [ServerID=%s, 主机=%s:%d]: %v", serverID, cfg.Host, cfg.Port, err)
		return false, err
	}
	logger.Infof("MySQL 连接成功: ServerID=%s, 主机=%s:%d", serverID, cfg.Host, cfg.Port)
	return ok, nil
}

func (s *MysqlService) MysqlClose(serverID string) error {
	logger.Infof("关闭 MySQL 连接: ServerID=%s", serverID)
	GetContainer().MysqlMgr.MysqlCloseEx(serverID)
	return nil
}

func (s *MysqlService) MysqlDatabases(serverID string) ([]string, error) {
	dbs, err := GetContainer().MysqlMgr.MysqlDatabases(serverID)
	if err != nil {
		logger.Errorf("获取 MySQL 数据库列表失败 [ServerID=%s]: %v", serverID, err)
		return nil, err
	}
	return dbs, nil
}

func (s *MysqlService) MysqlTables(serverID, dbName string) ([]string, error) {
	tables, err := GetContainer().MysqlMgr.MysqlTables(serverID, dbName)
	if err != nil {
		logger.Errorf("获取 MySQL 数据表列表失败 [ServerID=%s, DB=%s]: %v", serverID, dbName, err)
		return nil, err
	}
	return tables, nil
}

func (s *MysqlService) MysqlSelect(serverID, dbName, table string, limit, offset int) (db.MysqlQueryResult, error) {
	res, err := GetContainer().MysqlMgr.MysqlSelect(serverID, dbName, table, limit, offset)
	if err != nil {
		logger.Errorf("MySQL 查询表数据失败 [ServerID=%s, DB=%s, Table=%s]: %v", serverID, dbName, table, err)
		return res, err
	}
	return res, nil
}

func (s *MysqlService) MysqlCount(serverID, dbName, table string) (int64, error) {
	count, err := GetContainer().MysqlMgr.MysqlCount(serverID, dbName, table)
	if err != nil {
		logger.Errorf("MySQL 统计记录数失败 [ServerID=%s, DB=%s, Table=%s]: %v", serverID, dbName, table, err)
		return 0, err
	}
	return count, nil
}

func (s *MysqlService) MysqlDescribe(serverID, dbName, table string) (db.MysqlQueryResult, error) {
	res, err := GetContainer().MysqlMgr.MysqlDescribe(serverID, dbName, table)
	if err != nil {
		logger.Errorf("MySQL Describe 表结构失败 [ServerID=%s, DB=%s, Table=%s]: %v", serverID, dbName, table, err)
		return res, err
	}
	return res, nil
}

func (s *MysqlService) MysqlRun(serverID, dbName, sqlText string) (db.MysqlQueryResult, error) {
	logger.Infof("MySQL 执行 SQL [ServerID=%s, DB=%s, SQL=%s]", serverID, dbName, sqlText)
	res, err := GetContainer().MysqlMgr.MysqlRun(serverID, dbName, sqlText)
	if err != nil {
		logger.Errorf("MySQL 执行 SQL 失败 [ServerID=%s, DB=%s]: %v", serverID, dbName, err)
		return res, err
	}
	return res, nil
}

func (s *MysqlService) MysqlInsert(serverID, dbName, table string, columns []string, values []any) (int64, error) {
	logger.Infof("MySQL 插入数据 [ServerID=%s, DB=%s, Table=%s, Cols=%v]", serverID, dbName, table, columns)
	rows, err := GetContainer().MysqlMgr.MysqlInsert(serverID, dbName, table, columns, values)
	if err != nil {
		logger.Errorf("MySQL 插入数据失败 [ServerID=%s, DB=%s, Table=%s]: %v", serverID, dbName, table, err)
		return 0, err
	}
	return rows, nil
}

func (s *MysqlService) MysqlUpdate(serverID, dbName, table string, setCols []string, setVals []any, whereCols []string, whereVals []any) (int64, error) {
	logger.Infof("MySQL 更新数据 [ServerID=%s, DB=%s, Table=%s, SetCols=%v, WhereCols=%v]", serverID, dbName, table, setCols, whereCols)
	rows, err := GetContainer().MysqlMgr.MysqlUpdate(serverID, dbName, table, setCols, setVals, whereCols, whereVals)
	if err != nil {
		logger.Errorf("MySQL 更新数据失败 [ServerID=%s, DB=%s, Table=%s]: %v", serverID, dbName, table, err)
		return 0, err
	}
	return rows, nil
}

func (s *MysqlService) MysqlDelete(serverID, dbName, table string, whereCols []string, whereVals []any) (int64, error) {
	logger.Infof("MySQL 删除数据 [ServerID=%s, DB=%s, Table=%s, WhereCols=%v]", serverID, dbName, table, whereCols)
	rows, err := GetContainer().MysqlMgr.MysqlDelete(serverID, dbName, table, whereCols, whereVals)
	if err != nil {
		logger.Errorf("MySQL 删除数据失败 [ServerID=%s, DB=%s, Table=%s]: %v", serverID, dbName, table, err)
		return 0, err
	}
	return rows, nil
}

func (s *MysqlService) MysqlExport(serverID, dbName, mode, source, table, sqlText string, limit int) (string, error) {
	logger.Infof("MySQL 导出数据 [ServerID=%s, DB=%s, Mode=%s, Table=%s]", serverID, dbName, mode, table)
	return GetContainer().MysqlMgr.MysqlExport(serverID, dbName, mode, source, table, sqlText, limit)
}

func (s *MysqlService) MysqlExportToFile(serverID, dbName, mode, source, table, sqlText string, limit int) (string, error) {
	logger.Infof("MySQL 导出至文件 [ServerID=%s, DB=%s, Mode=%s, Table=%s]", serverID, dbName, mode, table)
	return GetContainer().MysqlMgr.MysqlExportToFileEx(serverID, dbName, mode, source, table, sqlText, limit)
}

func (s *MysqlService) MysqlImport(serverID, dbName, mode, table, content string) (string, error) {
	logger.Infof("MySQL 导入数据 [ServerID=%s, DB=%s, Mode=%s, Table=%s, Bytes=%d]", serverID, dbName, mode, table, len(content))
	return GetContainer().MysqlMgr.MysqlImport(serverID, dbName, mode, table, content)
}

func (s *MysqlService) MysqlImportFromFile(serverID, dbName, mode, table string) (string, error) {
	logger.Infof("MySQL 从文件导入 [ServerID=%s, DB=%s, Mode=%s, Table=%s]", serverID, dbName, mode, table)
	return GetContainer().MysqlMgr.MysqlImportFromFileEx(serverID, dbName, mode, table)
}

func (s *MysqlService) MysqlCreateDatabase(serverID, name, charset string) error {
	logger.Infof("MySQL 创建数据库 [ServerID=%s, DB=%s, Charset=%s]", serverID, name, charset)
	if err := GetContainer().MysqlMgr.MysqlCreateDatabase(serverID, name, charset); err != nil {
		logger.Errorf("MySQL 创建数据库失败 [ServerID=%s, DB=%s]: %v", serverID, name, err)
		return err
	}
	return nil
}

func (s *MysqlService) MysqlDropDatabase(serverID, name string) error {
	logger.Infof("MySQL 删除数据库 [ServerID=%s, DB=%s]", serverID, name)
	if err := GetContainer().MysqlMgr.MysqlDropDatabase(serverID, name); err != nil {
		logger.Errorf("MySQL 删除数据库失败 [ServerID=%s, DB=%s]: %v", serverID, name, err)
		return err
	}
	return nil
}

func (s *MysqlService) MysqlCreateTable(serverID, dbName, table, defs string) error {
	logger.Infof("MySQL 创建数据表 [ServerID=%s, DB=%s, Table=%s]", serverID, dbName, table)
	if err := GetContainer().MysqlMgr.MysqlCreateTable(serverID, dbName, table, defs); err != nil {
		logger.Errorf("MySQL 创建数据表失败 [ServerID=%s, DB=%s, Table=%s]: %v", serverID, dbName, table, err)
		return err
	}
	return nil
}

func (s *MysqlService) MysqlDropTable(serverID, dbName, table string) error {
	logger.Infof("MySQL 删除数据表 [ServerID=%s, DB=%s, Table=%s]", serverID, dbName, table)
	if err := GetContainer().MysqlMgr.MysqlDropTable(serverID, dbName, table); err != nil {
		logger.Errorf("MySQL 删除数据表失败 [ServerID=%s, DB=%s, Table=%s]: %v", serverID, dbName, table, err)
		return err
	}
	return nil
}

func (s *MysqlService) MysqlTruncateTable(serverID, dbName, table string) error {
	logger.Infof("MySQL 清空数据表 [ServerID=%s, DB=%s, Table=%s]", serverID, dbName, table)
	if err := GetContainer().MysqlMgr.MysqlTruncateTable(serverID, dbName, table); err != nil {
		logger.Errorf("MySQL 清空数据表失败 [ServerID=%s, DB=%s, Table=%s]: %v", serverID, dbName, table, err)
		return err
	}
	return nil
}

func (s *MysqlService) MysqlTableStatus(serverID, dbName string) ([]map[string]any, error) {
	return GetContainer().MysqlMgr.MysqlTableStatus(serverID, dbName)
}

func (s *MysqlService) MysqlIndexes(serverID, dbName, table string) ([]map[string]any, error) {
	return GetContainer().MysqlMgr.MysqlIndexes(serverID, dbName, table)
}

func (s *MysqlService) MysqlCreateIndex(serverID, dbName, table, name, colsCSV string, unique bool) error {
	logger.Infof("MySQL 创建索引 [ServerID=%s, DB=%s, Table=%s, Index=%s, Unique=%v]", serverID, dbName, table, name, unique)
	if err := GetContainer().MysqlMgr.MysqlCreateIndex(serverID, dbName, table, name, colsCSV, unique); err != nil {
		logger.Errorf("MySQL 创建索引失败 [ServerID=%s, Index=%s]: %v", serverID, name, err)
		return err
	}
	return nil
}

func (s *MysqlService) MysqlDropIndex(serverID, dbName, table, name string) error {
	logger.Infof("MySQL 删除索引 [ServerID=%s, DB=%s, Table=%s, Index=%s]", serverID, dbName, table, name)
	if err := GetContainer().MysqlMgr.MysqlDropIndex(serverID, dbName, table, name); err != nil {
		logger.Errorf("MySQL 删除索引失败 [ServerID=%s, Index=%s]: %v", serverID, name, err)
		return err
	}
	return nil
}

func (s *MysqlService) MysqlUsers(serverID string) ([]map[string]any, error) {
	return GetContainer().MysqlMgr.MysqlUsers(serverID)
}

func (s *MysqlService) MysqlGrants(serverID, user, host string) (string, error) {
	return GetContainer().MysqlMgr.MysqlGrants(serverID, user, host)
}

func (s *MysqlService) MysqlCreateUser(serverID, user, host, password, authPlugin string, lock bool) error {
	logger.Infof("MySQL 创建用户 [ServerID=%s, User=%s, Host=%s, Plugin=%s, Lock=%v]", serverID, user, host, authPlugin, lock)
	if err := GetContainer().MysqlMgr.MysqlCreateUser(serverID, user, host, password, authPlugin, lock); err != nil {
		logger.Errorf("MySQL 创建用户失败 [ServerID=%s, User=%s@%s]: %v", serverID, user, host, err)
		return err
	}
	return nil
}

func (s *MysqlService) MysqlDropUser(serverID, user, host string) error {
	logger.Infof("MySQL 删除用户 [ServerID=%s, User=%s, Host=%s]", serverID, user, host)
	if err := GetContainer().MysqlMgr.MysqlDropUser(serverID, user, host); err != nil {
		logger.Errorf("MySQL 删除用户失败 [ServerID=%s, User=%s@%s]: %v", serverID, user, host, err)
		return err
	}
	return nil
}

func (s *MysqlService) MysqlChangeUserPassword(serverID, user, host, newPassword string) error {
	logger.Infof("MySQL 修改用户密码 [ServerID=%s, User=%s, Host=%s]", serverID, user, host)
	if err := GetContainer().MysqlMgr.MysqlChangeUserPassword(serverID, user, host, newPassword); err != nil {
		logger.Errorf("MySQL 修改用户密码失败 [ServerID=%s, User=%s@%s]: %v", serverID, user, host, err)
		return err
	}
	return nil
}

func (s *MysqlService) MysqlToggleUserLock(serverID, user, host string, lock bool) error {
	logger.Infof("MySQL 切换用户锁定状态 [ServerID=%s, User=%s, Host=%s, Lock=%v]", serverID, user, host, lock)
	if err := GetContainer().MysqlMgr.MysqlToggleUserLock(serverID, user, host, lock); err != nil {
		logger.Errorf("MySQL 切换用户锁定失败 [ServerID=%s, User=%s@%s]: %v", serverID, user, host, err)
		return err
	}
	return nil
}

func (s *MysqlService) MysqlGrantPrivileges(serverID, user, host, dbName, table string, privs []string, withGrantOption bool) error {
	logger.Infof("MySQL 授予权限 [ServerID=%s, User=%s@%s, DB=%s, Table=%s, Privs=%v]", serverID, user, host, dbName, table, privs)
	if err := GetContainer().MysqlMgr.MysqlGrantPrivileges(serverID, user, host, dbName, table, privs, withGrantOption); err != nil {
		logger.Errorf("MySQL 授予权限失败 [ServerID=%s, User=%s@%s]: %v", serverID, user, host, err)
		return err
	}
	return nil
}

func (s *MysqlService) MysqlRevokePrivileges(serverID, user, host, dbName, table string, privs []string) error {
	logger.Infof("MySQL 撤销权限 [ServerID=%s, User=%s@%s, DB=%s, Table=%s, Privs=%v]", serverID, user, host, dbName, table, privs)
	if err := GetContainer().MysqlMgr.MysqlRevokePrivileges(serverID, user, host, dbName, table, privs); err != nil {
		logger.Errorf("MySQL 撤销权限失败 [ServerID=%s, User=%s@%s]: %v", serverID, user, host, err)
		return err
	}
	return nil
}

func (s *MysqlService) MysqlRevokeAllPrivileges(serverID, user, host string) error {
	logger.Infof("MySQL 撤销全部权限 [ServerID=%s, User=%s@%s]", serverID, user, host)
	if err := GetContainer().MysqlMgr.MysqlRevokeAllPrivileges(serverID, user, host); err != nil {
		logger.Errorf("MySQL 撤销全部权限失败 [ServerID=%s, User=%s@%s]: %v", serverID, user, host, err)
		return err
	}
	return nil
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
	logger.Infof("MySQL 导入 JSON 数据 [ServerID=%s, DB=%s, Table=%s, Bytes=%d]", serverID, dbName, table, len(content))
	return GetContainer().MysqlMgr.MysqlImportJSON(serverID, dbName, table, content)
}

func (s *MysqlService) MysqlQueryCSV(serverID, dbName, sqlText string, limit int) (string, error) {
	return GetContainer().MysqlMgr.MysqlQueryCSV(serverID, dbName, sqlText, limit)
}

func (s *MysqlService) MysqlBackup(serverID, dbName string) (string, error) {
	logger.Infof("MySQL 执行备份 [ServerID=%s, DB=%s]", serverID, dbName)
	return GetContainer().MysqlMgr.MysqlBackup(serverID, dbName)
}

func (s *MysqlService) MysqlBackupToFile(serverID, dbName string) (string, error) {
	logger.Infof("MySQL 执行备份至文件 [ServerID=%s, DB=%s]", serverID, dbName)
	return GetContainer().MysqlMgr.MysqlBackupToFile(serverID, dbName)
}

func (s *MysqlService) MysqlTestConnection(cfg core.ServerConfig) (map[string]any, error) {
	logger.Infof("测试 MySQL 连通性: 主机=%s:%d, 用户=%s", cfg.Host, cfg.Port, cfg.Username)
	res, err := GetContainer().MysqlMgr.TestConnection(cfg)
	if err != nil {
		logger.Errorf("测试 MySQL 连通性失败 [主机=%s:%d]: %v", cfg.Host, cfg.Port, err)
		return nil, err
	}
	return res, nil
}
