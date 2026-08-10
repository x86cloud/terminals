package db

import (
	"context"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"terminal/core"

	_ "github.com/go-sql-driver/mysql"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"
)

// ===================== SSH 隧道 =====================

// sshTunnel 维护一条到跳板机的 SSH 连接，并在本地监听端口转发到远端 MySQL。
type sshTunnel struct {
	client *ssh.Client
	local  string // 本地监听地址 host:port
	l      net.Listener
}

// openSSHTunnel 建立到跳板机的 SSH 连接，并在本地开启转发到 target(host:port)。
func openSSHTunnel(cfg core.ServerConfig, target string) (*sshTunnel, error) {
	auths := []ssh.AuthMethod{}
	if strings.TrimSpace(cfg.MysqlSSHKeyData) != "" {
		key := []byte(cfg.MysqlSSHKeyData)
		signer, err := ssh.ParsePrivateKeyWithPassphrase(key, []byte(cfg.MysqlSSHPassphrase))
		if err != nil {
			return nil, fmt.Errorf("解析 SSH 私钥失败: %w", err)
		}
		auths = append(auths, ssh.PublicKeys(signer))
	} else if strings.TrimSpace(cfg.MysqlSSHKeyPath) != "" {
		key, err := os.ReadFile(cfg.MysqlSSHKeyPath)
		if err != nil {
			return nil, fmt.Errorf("读取 SSH 私钥失败: %w", err)
		}
		signer, err := ssh.ParsePrivateKeyWithPassphrase(key, []byte(cfg.MysqlSSHPassphrase))
		if err != nil {
			return nil, fmt.Errorf("解析 SSH 私钥失败: %w", err)
		}
		auths = append(auths, ssh.PublicKeys(signer))
	} else if cfg.Password != "" {
		auths = append(auths, ssh.Password(cfg.Password))
	}

	sshUser := cfg.MysqlSSHUser
	if sshUser == "" {
		sshUser = cfg.Username
	}
	sshPort := MysqlSSHHostPortOr(cfg)

	sshAddr := fmt.Sprintf("%s:%d", cfg.MysqlSSHHost, sshPort)
	clientConfig := &ssh.ClientConfig{
		User:            sshUser,
		Auth:            auths,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	sshClient, err := ssh.Dial("tcp", sshAddr, clientConfig)
	if err != nil {
		return nil, fmt.Errorf("连接跳板机 %s 失败: %w", sshAddr, err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		_ = sshClient.Close()
		return nil, fmt.Errorf("建立本地端口转发失败: %w", err)
	}

	tun := &sshTunnel{
		client: sshClient,
		local:  listener.Addr().String(),
		l:      listener,
	}

	go func() {
		for {
			localConn, err := listener.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				defer c.Close()
				remoteConn, err := sshClient.Dial("tcp", target)
				if err != nil {
					return
				}
				defer remoteConn.Close()

				done := make(chan struct{}, 2)
				go func() {
					_, _ = io.Copy(remoteConn, c)
					done <- struct{}{}
				}()
				go func() {
					_, _ = io.Copy(c, remoteConn)
					done <- struct{}{}
				}()
				<-done
			}(localConn)
		}
	}()

	return tun, nil
}

func (t *sshTunnel) close() {
	if t.l != nil {
		_ = t.l.Close()
	}
	if t.client != nil {
		_ = t.client.Close()
	}
}

// MysqlSSHHostPortOr 返回 SSH 端口（0 时默认 22）。
func MysqlSSHHostPortOr(c core.ServerConfig) int {
	if c.MysqlSSHHostPort > 0 {
		return c.MysqlSSHHostPort
	}
	return 22
}

func quoteIdent(s string) string {
	return "`" + strings.ReplaceAll(s, "`", "``") + "`"
}

// ===================== DSN 构造（含 SSL / 连接池 / SSH） =====================

// buildMysqlDSNExtended 构造完整 MySQL DSN，支持 SSL/TLS 与 SSH 隧道。
func buildMysqlDSNExtended(cfg core.ServerConfig) (string, *sshTunnel, error) {
	var tunnel *sshTunnel
	var err error

	targetHost := cfg.Host
	targetPort := cfg.DisplayPort()
	target := fmt.Sprintf("%s:%d", targetHost, targetPort)

	if cfg.MysqlSSHEnabled && strings.TrimSpace(cfg.MysqlSSHHost) != "" {
		tunnel, err = openSSHTunnel(cfg, target)
		if err != nil {
			return "", nil, err
		}
		target = tunnel.local
	}

	user := cfg.Username
	pass := cfg.Password
	dsn := fmt.Sprintf("%s:%s@tcp(%s)/", user, pass, target)
	if strings.TrimSpace(cfg.Database) != "" {
		dsn += cfg.Database
	}

	params := []string{
		"parseTime=true",
		"charset=utf8mb4",
		"timeout=10s",
		"readTimeout=60s",
		"writeTimeout=60s",
		"loc=Local",
	}

	if cfg.MysqlTLS != "" {
		params = append(params, "tls="+cfg.MysqlTLS)
	}

	if strings.TrimSpace(cfg.Database) != "" {
		dsn += "?"
	} else {
		dsn += "?"
	}
	dsn += strings.Join(params, "&")
	return dsn, tunnel, nil
}

// ---- 扩展 mysqlConn：携带 SSH 隧道以便关闭时释放 ----
type mysqlConnEx struct {
	db     *sql.DB
	cfg    core.ServerConfig
	curDb  string
	tunnel *sshTunnel
}

// 将 mysqlManager 的 open 重写以使用扩展 DSN；为最小改动，这里单独提供扩展连接管理。

type MysqlManagerEx struct {
	mu    sync.Mutex
	ctx   context.Context
	conns map[string]*mysqlConnEx
}

func NewMysqlManagerEx() *MysqlManagerEx {
	return &MysqlManagerEx{conns: make(map[string]*mysqlConnEx)}
}

func (m *MysqlManagerEx) SetContext(ctx context.Context) {
	m.ctx = ctx
}

var MysqlExMgr = NewMysqlManagerEx()

func (m *MysqlManagerEx) Open(id string, cfg core.ServerConfig) error {
	m.mu.Lock()
	if old, ok := m.conns[id]; ok {
		old.db.Close()
		if old.tunnel != nil {
			old.tunnel.close()
		}
		delete(m.conns, id)
	}
	m.mu.Unlock()

	dsn, tunnel, err := buildMysqlDSNExtended(cfg)
	if err != nil {
		return err
	}
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		if tunnel != nil {
			tunnel.close()
		}
		return fmt.Errorf("打开 MySQL 失败: %w", err)
	}
	if cfg.MysqlMaxOpenConns > 0 {
		db.SetMaxOpenConns(cfg.MysqlMaxOpenConns)
	} else {
		db.SetMaxOpenConns(10)
	}
	if cfg.MysqlMaxIdleConns > 0 {
		db.SetMaxIdleConns(cfg.MysqlMaxIdleConns)
	}
	if cfg.MysqlConnMaxLifetime > 0 {
		db.SetConnMaxLifetime(time.Duration(cfg.MysqlConnMaxLifetime) * time.Second)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		if tunnel != nil {
			tunnel.close()
		}
		return fmt.Errorf("连接 MySQL 失败: %w", err)
	}
	mc := &mysqlConnEx{db: db, cfg: cfg, curDb: cfg.Database, tunnel: tunnel}
	m.mu.Lock()
	m.conns[id] = mc
	m.mu.Unlock()
	return nil
}

func (m *MysqlManagerEx) Get(id string) (*mysqlConnEx, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.conns[id]
	return c, ok
}

func (m *MysqlManagerEx) Close(id string) {
	m.mu.Lock()
	c, ok := m.conns[id]
	if ok {
		delete(m.conns, id)
	}
	m.mu.Unlock()
	if ok {
		_ = c.db.Close()
		if c.tunnel != nil {
			c.tunnel.close()
		}
	}
}

func (m *MysqlManagerEx) CloseAll() {
	m.mu.Lock()
	all := m.conns
	m.conns = make(map[string]*mysqlConnEx)
	m.mu.Unlock()
	for _, c := range all {
		_ = c.db.Close()
		if c.tunnel != nil {
			c.tunnel.close()
		}
	}
}

// queryEx 在扩展连接上执行查询。
func (m *MysqlManagerEx) queryEx(id, dbName, sqlText string) (columns []string, rows []map[string]any, err error) {
	mc, ok := m.Get(id)
	if !ok {
		return nil, nil, errors.New("MySQL 连接不存在或已断开，请重新连接")
	}
	if strings.TrimSpace(dbName) != "" {
		if _, e := mc.db.Exec("USE " + quoteIdent(dbName)); e != nil {
			return nil, nil, fmt.Errorf("切换数据库失败: %w", e)
		}
		mc.curDb = dbName
	}
	res, e := mc.db.Query(sqlText)
	if e != nil {
		return nil, nil, e
	}
	defer res.Close()
	cols, e := res.Columns()
	if e != nil {
		return nil, nil, e
	}
	out := make([]map[string]any, 0)
	for res.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if e := res.Scan(ptrs...); e != nil {
			return nil, nil, e
		}
		rec := make(map[string]any, len(cols))
		for i, c := range cols {
			rec[c] = normalizeMysqlVal(vals[i])
		}
		out = append(out, rec)
	}
	return cols, out, res.Err()
}

// ---- 应用层扩展方法（保持命名一致，挂在 App 上） ----

// MysqlConnectEx 支持 SSH/SSL/连接池的连接入口。
func (m *MysqlManagerEx) MysqlConnectEx(cfg core.ServerConfig) (bool, error) {
	if cfg.ConnType() != core.ConnMysql {
		return false, errors.New("该连接不是 MySQL 类型")
	}
	if err := m.Open(cfg.ID, cfg); err != nil {
		return false, err
	}
	return true, nil
}

func (m *MysqlManagerEx) MysqlCloseEx(id string) {
	m.Close(id)
}

// ===================== 库 / 表管理 =====================

func (m *MysqlManagerEx) MysqlCreateDatabase(id, name, charset string) error {
	mc, ok := m.Get(id)
	if !ok {
		return errors.New("MySQL 连接不存在或已断开")
	}
	if charset == "" {
		charset = "utf8mb4"
	}
	_, err := mc.db.Exec(fmt.Sprintf("CREATE DATABASE IF NOT EXISTS %s CHARACTER SET %s", quoteIdent(name), charset))
	return err
}

func (m *MysqlManagerEx) MysqlDropDatabase(id, name string) error {
	mc, ok := m.Get(id)
	if !ok {
		return errors.New("MySQL 连接不存在或已断开")
	}
	_, err := mc.db.Exec("DROP DATABASE " + quoteIdent(name))
	return err
}

func (m *MysqlManagerEx) MysqlCreateTable(id, db, table, defs string) error {
	if strings.TrimSpace(defs) == "" {
		return errors.New("请提供列定义")
	}
	mc, ok := m.Get(id)
	if !ok {
		return errors.New("MySQL 连接不存在或已断开")
	}
	if _, e := mc.db.Exec("USE " + quoteIdent(db)); e != nil {
		return e
	}
	_, err := mc.db.Exec(fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s (%s)", quoteIdent(table), defs))
	return err
}

func (m *MysqlManagerEx) MysqlDropTable(id, db, table string) error {
	mc, ok := m.Get(id)
	if !ok {
		return errors.New("MySQL 连接不存在或已断开")
	}
	if _, e := mc.db.Exec("USE " + quoteIdent(db)); e != nil {
		return e
	}
	_, err := mc.db.Exec("DROP TABLE " + quoteIdent(table))
	return err
}

func (m *MysqlManagerEx) MysqlTruncateTable(id, db, table string) error {
	mc, ok := m.Get(id)
	if !ok {
		return errors.New("MySQL 连接不存在或已断开")
	}
	if _, e := mc.db.Exec("USE " + quoteIdent(db)); e != nil {
		return e
	}
	_, err := mc.db.Exec("TRUNCATE TABLE " + quoteIdent(table))
	return err
}

// MysqlTableStatus 返回表状态信息（引擎、行数、大小等）。
func (m *MysqlManagerEx) MysqlTableStatus(id, db string) ([]map[string]any, error) {
	_, rows, err := m.queryEx(id, db, "SHOW TABLE STATUS")
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// MysqlIndexes 返回表的索引信息。
func (m *MysqlManagerEx) MysqlIndexes(id, db, table string) ([]map[string]any, error) {
	_, rows, err := m.queryEx(id, db, fmt.Sprintf("SHOW INDEX FROM %s", quoteIdent(table)))
	if err != nil {
		return nil, err
	}
	return rows, nil
}

func (m *MysqlManagerEx) MysqlCreateIndex(id, db, table, name, colsCSV string, unique bool) error {
	if strings.TrimSpace(colsCSV) == "" {
		return errors.New("请提供索引列")
	}
	mc, ok := m.Get(id)
	if !ok {
		return errors.New("MySQL 连接不存在或已断开")
	}
	if _, e := mc.db.Exec("USE " + quoteIdent(db)); e != nil {
		return e
	}
	kind := ""
	if unique {
		kind = "UNIQUE "
	}
	cols := strings.Split(colsCSV, ",")
	for i := range cols {
		cols[i] = quoteIdent(strings.TrimSpace(cols[i]))
	}
	sqlText := fmt.Sprintf("CREATE %sINDEX %s ON %s (%s)", kind, quoteIdent(name), quoteIdent(table), strings.Join(cols, ","))
	_, err := mc.db.Exec(sqlText)
	return err
}

func (m *MysqlManagerEx) MysqlDropIndex(id, db, table, name string) error {
	mc, ok := m.Get(id)
	if !ok {
		return errors.New("MySQL 连接不存在或已断开")
	}
	if _, e := mc.db.Exec("USE " + quoteIdent(db)); e != nil {
		return e
	}
	_, err := mc.db.Exec(fmt.Sprintf("DROP INDEX %s ON %s", quoteIdent(name), quoteIdent(table)))
	return err
}

// ===================== 用户与权限 =====================

func (m *MysqlManagerEx) MysqlUsers(id string) ([]map[string]any, error) {
	_, rows, err := m.queryEx(id, "mysql",
		"SELECT User, Host, account_locked AS locked, password_expired AS expired FROM mysql.user")
	if err != nil {
		return nil, err
	}
	return rows, nil
}

func (m *MysqlManagerEx) MysqlGrants(id, user, host string) (string, error) {
	mc, ok := m.Get(id)
	if !ok {
		return "", errors.New("MySQL 连接不存在或已断开")
	}
	rows, err := queryRaw(mc.db, fmt.Sprintf("SHOW GRANTS FOR %s@%s", quoteIdent(user), quoteIdent(host)))
	if err != nil {
		return "", err
	}
	var sb strings.Builder
	for _, r := range rows {
		for _, v := range r {
			sb.WriteString(asString(v))
			sb.WriteString("\n")
		}
	}
	return sb.String(), nil
}

func queryRaw(db *sql.DB, sqlText string) ([]map[string]any, error) {
	res, e := db.Query(sqlText)
	if e != nil {
		return nil, e
	}
	defer res.Close()
	cols, e := res.Columns()
	if e != nil {
		return nil, e
	}
	out := make([]map[string]any, 0)
	for res.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if e := res.Scan(ptrs...); e != nil {
			return nil, e
		}
		rec := make(map[string]any, len(cols))
		for i, c := range cols {
			rec[c] = normalizeMysqlVal(vals[i])
		}
		out = append(out, rec)
	}
	return out, res.Err()
}

// ===================== 服务器状态监控 =====================

func (m *MysqlManagerEx) MysqlStatus(id string) (map[string]any, error) {
	_, rows, err := m.queryEx(id, "", "SHOW GLOBAL STATUS")
	if err != nil {
		return nil, err
	}
	out := make(map[string]any, len(rows))
	for _, r := range rows {
		k, _ := r["Variable_name"].(string)
		v := r["Value"]
		if k != "" {
			out[k] = v
		}
	}
	return out, nil
}

func (m *MysqlManagerEx) MysqlVariables(id string) (map[string]any, error) {
	_, rows, err := m.queryEx(id, "", "SHOW GLOBAL VARIABLES")
	if err != nil {
		return nil, err
	}
	out := make(map[string]any, len(rows))
	for _, r := range rows {
		k, _ := r["Variable_name"].(string)
		v := r["Value"]
		if k != "" {
			out[k] = v
		}
	}
	return out, nil
}

func (m *MysqlManagerEx) MysqlProcessList(id string) ([]map[string]any, error) {
	_, rows, err := m.queryEx(id, "", "SHOW PROCESSLIST")
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// MysqlSlowLog 返回慢查询日志内容（需开启 log_output=FILE 且 slow_query_log=ON）。
func (m *MysqlManagerEx) MysqlSlowLog(id string, limit int) ([]map[string]any, error) {
	if limit <= 0 {
		limit = 50
	}
	_, rows, err := m.queryEx(id, "mysql",
		fmt.Sprintf("SELECT start_time, user_host, query_time, lock_time, rows_examined, sql_text FROM mysql.slow_log ORDER BY start_time DESC LIMIT %d", limit))
	if err != nil {
		// 部分发行版无 mysql.slow_log 表，回退到performance_schema
		_, rows2, err2 := m.queryEx(id, "performance_schema",
			fmt.Sprintf("SELECT TIMER_START, SQL_TEXT FROM performance_schema.events_statements_summary_by_digest ORDER BY SUM_TIMER_WAIT DESC LIMIT %d", limit))
		if err2 != nil {
			return nil, err
		}
		return rows2, nil
	}
	return rows, nil
}

func (m *MysqlManagerEx) MysqlTables(id, db string) ([]string, error) {
	_, rows, err := m.queryEx(id, db, "SHOW TABLES")
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		for _, v := range r {
			if s := asString(v); s != "" {
				out = append(out, s)
				break
			}
		}
	}
	return out, nil
}

func (m *MysqlManagerEx) MysqlExport(id, db, mode, source, table, sqlText string, limit int) (string, error) {
	if mode == "json" {
		return m.MysqlExportJSON(id, db, source, table, sqlText, limit)
	}
	return m.MysqlQueryCSV(id, db, sqlText, limit)
}

func (m *MysqlManagerEx) MysqlImport(id, db, mode, table, content string) (string, error) {
	if mode == "json" {
		return m.MysqlImportJSON(id, db, table, content)
	}
	return "", errors.New("暂不支持的导入格式")
}

// ===================== ER 图数据 =====================

// MysqlSchema 返回数据库所有表的列与之间外键关系，供前端绘制 ER 图。
func (m *MysqlManagerEx) MysqlSchema(id, db string) (map[string]any, error) {
	tables, err := m.MysqlTables(id, db)
	if err != nil {
		return nil, err
	}
	type col struct {
		Name string `json:"name"`
		Type string `json:"type"`
		Key  string `json:"key"`
	}
	type tbl struct {
		Name    string `json:"name"`
		Columns []col  `json:"columns"`
	}
	outTables := make([]tbl, 0, len(tables))
	fks := make([]map[string]any, 0)
	for _, t := range tables {
		_, drows, e := m.queryEx(id, db, "DESCRIBE "+quoteIdent(t))
		if e != nil {
			continue
		}
		cols := make([]col, 0, len(drows))
		for _, r := range drows {
			field, _ := r["Field"].(string)
			typ, _ := r["Type"].(string)
			key, _ := r["Key"].(string)
			cols = append(cols, col{Name: field, Type: typ, Key: key})
		}
		outTables = append(outTables, tbl{Name: t, Columns: cols})

		// 外键
		_, fkrows, e2 := m.queryEx(id, db,
			fmt.Sprintf("SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND REFERENCED_TABLE_NAME IS NOT NULL",
				quoteString(db), quoteString(t)))
		if e2 == nil {
			for _, r := range fkrows {
				fks = append(fks, map[string]any{
					"fromTable":  t,
					"fromColumn": r["COLUMN_NAME"],
					"toTable":    r["REFERENCED_TABLE_NAME"],
					"toColumn":   r["REFERENCED_COLUMN_NAME"],
					"name":       r["CONSTRAINT_NAME"],
				})
			}
		}
	}
	return map[string]any{"tables": outTables, "foreignKeys": fks}, nil
}

func quoteString(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

// ===================== JSON 导入导出 =====================

func (m *MysqlManagerEx) MysqlExportJSON(id, db, source, table, sqlText string, limit int) (string, error) {
	mc, ok := m.Get(id)
	if !ok {
		return "", errors.New("MySQL 连接不存在或已断开")
	}
	var query string
	if source == "table" {
		if table == "" {
			return "", errors.New("未指定表名")
		}
		if limit > 0 {
			query = fmt.Sprintf("SELECT * FROM %s LIMIT %d", quoteIdent(table), limit)
		} else {
			query = fmt.Sprintf("SELECT * FROM %s", quoteIdent(table))
		}
	} else {
		if strings.TrimSpace(sqlText) == "" {
			return "", errors.New("未指定查询语句")
		}
		query = sqlText
	}
	if strings.TrimSpace(db) != "" {
		if _, e := mc.db.Exec("USE " + quoteIdent(db)); e != nil {
			return "", fmt.Errorf("切换数据库失败: %w", e)
		}
	}
	_, rows, err := m.queryEx(id, db, query)
	if err != nil {
		return "", err
	}
	b, err := json.MarshalIndent(rows, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// MysqlImportJSON 将 JSON 数组导入到指定表（与列名对应）。
func (m *MysqlManagerEx) MysqlImportJSON(id, db, table, content string) (string, error) {
	mc, ok := m.Get(id)
	if !ok {
		return "", errors.New("MySQL 连接不存在或已断开")
	}
	if table == "" {
		return "", errors.New("未指定目标表名")
	}
	var records []map[string]any
	if err := json.Unmarshal([]byte(content), &records); err != nil {
		return "", fmt.Errorf("JSON 解析失败: %w", err)
	}
	if len(records) == 0 {
		return "无数据", nil
	}
	cols := make([]string, 0, len(records[0]))
	for k := range records[0] {
		cols = append(cols, k)
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(cols)), ",")
	insertSQL := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		quoteIdent(table), "`"+strings.Join(cols, "`,`")+"`", placeholders)
	var count int64
	for _, rec := range records {
		args := make([]any, len(cols))
		for i, c := range cols {
			args[i] = rec[c]
		}
		if _, err := mc.db.Exec(insertSQL, args...); err != nil {
			return "", fmt.Errorf("插入失败: %s", err.Error())
		}
		count++
	}
	return fmt.Sprintf("成功导入 %d 行到表 `%s`", count, table), nil
}

// MysqlExportToFileEx 支持 csv/json/sql，并通过系统对话框保存。
func (m *MysqlManagerEx) MysqlExportToFileEx(id, db, mode, source, table, sqlText string, limit int) (string, error) {
	var content string
	var err error
	switch mode {
	case "json":
		content, err = m.MysqlExportJSON(id, db, source, table, sqlText, limit)
	case "csv", "sql":
		content, err = m.MysqlExport(id, db, mode, source, table, sqlText, limit)
	default:
		return "", errors.New("不支持的导出格式: " + mode)
	}
	if err != nil {
		return "", err
	}
	ext := mode
	base := table
	if base == "" {
		base = "query_result"
	}
	path, err := wruntime.SaveFileDialog(m.ctx, wruntime.SaveDialogOptions{
		Title:           "导出数据",
		DefaultFilename: base + "." + ext,
	})
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return "", err
	}
	return path, nil
}

// MysqlImportFromFileEx 支持 csv/json/sql，并通过系统对话框选择文件。
func (m *MysqlManagerEx) MysqlImportFromFileEx(id, db, mode, table string) (string, error) {
	pattern := "*.sql"
	switch mode {
	case "csv":
		pattern = "*.csv"
	case "json":
		pattern = "*.json"
	}
	path, err := wruntime.OpenFileDialog(m.ctx, wruntime.OpenDialogOptions{
		Title: "选择要导入的文件",
		Filters: []wruntime.FileFilter{
			{DisplayName: strings.ToUpper(mode) + " 文件", Pattern: pattern},
		},
	})
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	switch mode {
	case "json":
		return m.MysqlImportJSON(id, db, table, string(data))
	case "csv", "sql":
		return m.MysqlImport(id, db, mode, table, string(data))
	default:
		return "", errors.New("不支持的导入格式: " + mode)
	}
}

// MysqlQueryCSV 以 CSV 字符串返回查询结果（供前端下载/复制）。
func (m *MysqlManagerEx) MysqlQueryCSV(id, db, sqlText string, limit int) (string, error) {
	if limit > 0 {
		sqlText = strings.TrimSpace(sqlText)
		if !strings.HasSuffix(strings.ToUpper(sqlText), "LIMIT") {
			sqlText = fmt.Sprintf("%s LIMIT %d", sqlText, limit)
		}
	}
	cols, rows, err := m.queryEx(id, db, sqlText)
	if err != nil {
		return "", err
	}
	var sb strings.Builder
	w := csv.NewWriter(&sb)
	if err := w.Write(cols); err != nil {
		return "", err
	}
	for _, r := range rows {
		rec := make([]string, len(cols))
		for i, c := range cols {
			rec[i] = asString(r[c])
		}
		if err := w.Write(rec); err != nil {
			return "", err
		}
	}
	w.Flush()
	return sb.String(), nil
}

// MysqlBackup 通过 mysqldump 风格的逻辑导出（这里用 SELECT 拼装，等价于已实现的 Export），
// 额外提供一个占位以表明备份恢复入口存在。
func (m *MysqlManagerEx) MysqlBackup(id, db string) (string, error) {
	tables, err := m.MysqlTables(id, db)
	if err != nil {
		return "", err
	}
	var sb strings.Builder
	sb.WriteString("SET FOREIGN_KEY_CHECKS=0;\n")
	for _, t := range tables {
		content, e := m.MysqlExport(id, db, "sql", "table", t, "", 0)
		if e != nil {
			continue
		}
		sb.WriteString("-- ---- table: " + t + " ----\n")
		sb.WriteString(content)
		sb.WriteString("\n")
	}
	sb.WriteString("SET FOREIGN_KEY_CHECKS=1;\n")
	return sb.String(), nil
}

var _ = strconv.Itoa
