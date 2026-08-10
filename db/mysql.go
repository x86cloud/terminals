package db

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"terminal/core"

	_ "github.com/go-sql-driver/mysql"
)

// mysqlConn 保存一个 MySQL 连接及其当前选中的数据库。
type mysqlConn struct {
	db    *sql.DB
	cfg   core.ServerConfig
	curDb string
}

// MysqlManager 按会话 ID 维护已建立的 MySQL 连接。
type MysqlManager struct {
	mu    sync.Mutex
	conns map[string]*mysqlConn
}

func NewMysqlManager() *MysqlManager {
	return &MysqlManager{conns: make(map[string]*mysqlConn)}
}

// Open 建立（或重建）一个 MySQL 连接。
func (m *MysqlManager) Open(id string, cfg core.ServerConfig) error {
	m.mu.Lock()
	if old, ok := m.conns[id]; ok {
		_ = old.db.Close()
		delete(m.conns, id)
	}
	m.mu.Unlock()

	dsn := buildMysqlDSN(cfg)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return fmt.Errorf("打开 MySQL 失败: %w", err)
	}
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return fmt.Errorf("连接 MySQL 失败: %w", err)
	}
	mc := &mysqlConn{db: db, cfg: cfg, curDb: cfg.Database}
	m.mu.Lock()
	m.conns[id] = mc
	m.mu.Unlock()
	return nil
}

// Get 返回已有的 MySQL 连接。
func (m *MysqlManager) Get(id string) (*mysqlConn, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.conns[id]
	return c, ok
}

// Close 关闭并移除指定连接。
func (m *MysqlManager) Close(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if c, ok := m.conns[id]; ok {
		_ = c.db.Close()
		delete(m.conns, id)
	}
}

// CloseAll 关闭全部连接（应用退出时调用）。
func (m *MysqlManager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, c := range m.conns {
		_ = c.db.Close()
	}
	m.conns = make(map[string]*mysqlConn)
}

// buildMysqlDSN 根据配置构造 MySQL 连接串。
func buildMysqlDSN(cfg core.ServerConfig) string {
	user := cfg.Username
	pass := cfg.Password
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.DisplayPort())
	params := "parseTime=true&charset=utf8mb4&timeout=10s&readTimeout=60s&writeTimeout=60s&loc=Local"
	dsn := fmt.Sprintf("%s:%s@tcp(%s)/", user, pass, addr)
	if strings.TrimSpace(cfg.Database) != "" {
		dsn += cfg.Database + "?"
	} else {
		dsn += "?" + params
		return dsn
	}
	dsn += "&" + params
	return dsn
}

// normalizeMysqlVal 将数据库驱动原生值转换为前端友好的类型。
func normalizeMysqlVal(v any) any {
	switch t := v.(type) {
	case nil:
		return nil
	case []byte:
		return string(t)
	case time.Time:
		return t.Format("2006-01-02 15:04:05")
	default:
		return v
	}
}

func asString(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case []byte:
		return string(t)
	case string:
		return t
	default:
		return fmt.Sprintf("%v", v)
	}
}

// MysqlSessionInfo 是暴露给前端的 MySQL 连接状态。
type MysqlSessionInfo struct {
	ID        string `json:"id"`
	ServerID  string `json:"serverId"`
	Title     string `json:"title"`
	Host      string `json:"host"`
	Port      int    `json:"port"`
	Database  string `json:"database"`
	Connected bool   `json:"connected"`
}

func (mc *mysqlConn) info() MysqlSessionInfo {
	return MysqlSessionInfo{
		ID:        mc.cfg.ID,
		ServerID:  mc.cfg.ID,
		Title:     mc.cfg.Label(),
		Host:      mc.cfg.Host,
		Port:      mc.cfg.DisplayPort(),
		Database:  mc.curDb,
		Connected: true,
	}
}

func (m *MysqlManager) Connect(cfg core.ServerConfig) (MysqlSessionInfo, error) {
	id := cfg.ID
	if id == "" {
		return MysqlSessionInfo{}, errors.New("服务器 ID 不能为空")
	}
	if err := m.Open(id, cfg); err != nil {
		return MysqlSessionInfo{}, err
	}
	mc, _ := m.Get(id)
	return mc.info(), nil
}

func (m *MysqlManager) Disconnect(id string) error {
	m.Close(id)
	return nil
}

func (m *MysqlManager) ListDatabases(id string) ([]string, error) {
	mc, ok := m.Get(id)
	if !ok {
		return nil, errors.New("MySQL 连接不存在或已断开")
	}
	rows, err := mc.db.Query("SHOW DATABASES")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var dbs []string
	for rows.Next() {
		var db string
		if err := rows.Scan(&db); err == nil {
			dbs = append(dbs, db)
		}
	}
	return dbs, rows.Err()
}

func (m *MysqlManager) UseDatabase(id, dbName string) error {
	mc, ok := m.Get(id)
	if !ok {
		return errors.New("MySQL 连接不存在或已断开")
	}
	if _, err := mc.db.Exec("USE `" + strings.ReplaceAll(dbName, "`", "``") + "`"); err != nil {
		return err
	}
	mc.curDb = dbName
	return nil
}

func (m *MysqlManager) ListTables(id, dbName string) ([]map[string]any, error) {
	mc, ok := m.Get(id)
	if !ok {
		return nil, errors.New("MySQL 连接不存在或已断开")
	}
	targetDb := dbName
	if targetDb == "" {
		targetDb = mc.curDb
	}
	if targetDb == "" {
		return nil, errors.New("请先选择数据库")
	}
	query := `SELECT TABLE_NAME, ENGINE, TABLE_ROWS, DATA_LENGTH, TABLE_COMMENT 
	          FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`
	rows, err := mc.db.Query(query, targetDb)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var tables []map[string]any
	for rows.Next() {
		var name string
		var engine, comment sql.NullString
		var tableRows, dataLength sql.NullInt64
		if err := rows.Scan(&name, &engine, &tableRows, &dataLength, &comment); err != nil {
			continue
		}
		tables = append(tables, map[string]any{
			"name":       name,
			"engine":     engine.String,
			"rows":       tableRows.Int64,
			"dataLength": dataLength.Int64,
			"comment":    comment.String,
		})
	}
	return tables, rows.Err()
}

// MysqlQueryResult 表示单次 SQL 执行的统一输出。
type MysqlQueryResult struct {
	Columns  []string         `json:"columns"`
	Rows     []map[string]any `json:"rows"`
	Affected int64            `json:"affected"`
}

func (m *MysqlManager) RunSQL(id, sqlText string) (MysqlQueryResult, error) {
	mc, ok := m.Get(id)
	if !ok {
		return MysqlQueryResult{}, errors.New("MySQL 连接不存在或已断开")
	}
	trimmed := strings.TrimSpace(sqlText)
	if isReadQuery(trimmed) {
		rows, err := mc.db.Query(trimmed)
		if err != nil {
			return MysqlQueryResult{}, err
		}
		defer rows.Close()
		cols, err := rows.Columns()
		if err != nil {
			return MysqlQueryResult{}, err
		}
		var resultRows []map[string]any
		scanBuf := make([]any, len(cols))
		scanPointers := make([]any, len(cols))
		for i := range scanBuf {
			scanPointers[i] = &scanBuf[i]
		}
		for rows.Next() {
			if err := rows.Scan(scanPointers...); err != nil {
				continue
			}
			rowMap := make(map[string]any, len(cols))
			for i, col := range cols {
				rowMap[col] = normalizeMysqlVal(scanBuf[i])
			}
			resultRows = append(resultRows, rowMap)
		}
		return MysqlQueryResult{Columns: cols, Rows: resultRows, Affected: 0}, rows.Err()
	}
	res, err := mc.db.Exec(trimmed)
	if err != nil {
		return MysqlQueryResult{}, err
	}
	affected, _ := res.RowsAffected()
	return MysqlQueryResult{Columns: []string{}, Rows: []map[string]any{}, Affected: affected}, nil
}

func isReadQuery(sql string) bool {
	upper := strings.ToUpper(strings.TrimSpace(sql))
	readPrefixes := []string{"SELECT", "SHOW", "EXPLAIN", "DESC", "DESCRIBE"}
	for _, p := range readPrefixes {
		if strings.HasPrefix(upper, p) {
			return true
		}
	}
	return false
}
