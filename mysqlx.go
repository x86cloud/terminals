package main

import (
	"crypto/tls"
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

	"github.com/go-sql-driver/mysql"
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
func openSSHTunnel(cfg ServerConfig, target string) (*sshTunnel, error) {
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
	} else {
		auths = append(auths, ssh.Password(cfg.MysqlSSHPassphrase))
	}

	sshHost := fmt.Sprintf("%s:%d", cfg.MysqlSSHHost, cfg.MysqlSSHHostPortOr())
	sshCfg := &ssh.ClientConfig{
		User:            cfg.MysqlSSHUser,
		Auth:            auths,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // 跳板机主机密钥不做校验（与现有 SSH 行为一致）
		Timeout:         10 * time.Second,
	}
	client, err := ssh.Dial("tcp", sshHost, sshCfg)
	if err != nil {
		return nil, fmt.Errorf("SSH 隧道连接失败: %w", err)
	}

	localPort := cfg.MysqlSSHProxyLocalPort
	if localPort == 0 {
		localPort = 13306
	}
	local := fmt.Sprintf("127.0.0.1:%d", localPort)
	// 若端口被占用，尝试递增
	var l net.Listener
	for i := 0; i < 20; i++ {
		l, err = net.Listen("tcp", local)
		if err == nil {
			break
		}
		localPort++
		local = fmt.Sprintf("127.0.0.1:%d", localPort)
	}
	if err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("SSH 隧道本地端口监听失败: %w", err)
	}

	t := &sshTunnel{client: client, local: local, l: l}
	go func() {
		for {
			conn, e := l.Accept()
			if e != nil {
				return
			}
			remote, e2 := client.Dial("tcp", target)
			if e2 != nil {
				_ = conn.Close()
				continue
			}
			go tunnelCopy(conn, remote)
		}
	}()
	return t, nil
}

func tunnelCopy(a, b net.Conn) {
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); io.Copy(a, b) }()
	go func() { defer wg.Done(); io.Copy(b, a) }()
	wg.Wait()
	_ = a.Close()
	_ = b.Close()
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
func (c ServerConfig) MysqlSSHHostPortOr() int {
	if c.MysqlSSHHostPort > 0 {
		return c.MysqlSSHHostPort
	}
	return 22
}

// ===================== DSN 构造（含 SSL / 连接池 / SSH） =====================

// buildMysqlDSNExtended 在原有 DSN 基础上支持 SSL 与 SSH 隧道。
// 若启用 SSH 隧道，addr 会被替换为本地转发地址。
func buildMysqlDSNExtended(cfg ServerConfig) (string, *sshTunnel, error) {
	user := cfg.Username
	pass := cfg.Password

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.displayPort())
	var tunnel *sshTunnel
	if cfg.MysqlSSHEnabled {
		t, err := openSSHTunnel(cfg, addr)
		if err != nil {
			return "", nil, err
		}
		tunnel = t
		addr = t.local // 使用本地转发地址
	}

	params := []string{
		"parseTime=true",
		"charset=utf8mb4",
		"timeout=10s",
		"readTimeout=60s",
		"writeTimeout=60s",
		"loc=Local",
	}

	// TLS / SSL
	if cfg.MysqlSSLEnabled || cfg.MysqlTLS != "" {
		tlsName := "xclient_custom"
		if cfg.MysqlTLS == "skip-verify" {
			_ = mysql.RegisterTLSConfig(tlsName, &tls.Config{InsecureSkipVerify: true})
		} else if cfg.MysqlTLS == "preferred" {
			// 尝试 TLS，失败回退明文：go-sql-driver 不支持 preferred，统一用 skip-verify 近似
			_ = mysql.RegisterTLSConfig(tlsName, &tls.Config{InsecureSkipVerify: true})
		} else {
			_ = mysql.RegisterTLSConfig(tlsName, &tls.Config{InsecureSkipVerify: false})
		}
		params = append(params, "tls="+tlsName)
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s)/", user, pass, addr)
	if strings.TrimSpace(cfg.Database) != "" {
		dsn += cfg.Database + "?"
	} else {
		dsn += "?"
	}
	dsn += strings.Join(params, "&")
	return dsn, tunnel, nil
}

// ---- 扩展 mysqlConn：携带 SSH 隧道以便关闭时释放 ----
type mysqlConnEx struct {
	db     *sql.DB
	cfg    ServerConfig
	curDb  string
	tunnel *sshTunnel
}

// 将 mysqlManager 的 open 重写以使用扩展 DSN；为最小改动，这里单独提供扩展连接管理。

type mysqlManagerEx struct {
	mu    sync.Mutex
	conns map[string]*mysqlConnEx
}

func newMysqlManagerEx() *mysqlManagerEx {
	return &mysqlManagerEx{conns: make(map[string]*mysqlConnEx)}
}

func (m *mysqlManagerEx) open(id string, cfg ServerConfig) error {
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

func (m *mysqlManagerEx) get(id string) (*mysqlConnEx, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.conns[id]
	return c, ok
}

func (m *mysqlManagerEx) close(id string) {
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

func (m *mysqlManagerEx) closeAll() {
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
func (m *mysqlManagerEx) queryEx(id, dbName, sqlText string) (columns []string, rows []map[string]any, err error) {
	mc, ok := m.get(id)
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

// 复用全局 mysqlMgr；但 SSH/SSL 需要扩展管理。这里新增一个 exMgr 单例。
var mysqlExMgr = newMysqlManagerEx()

// MysqlConnectEx 支持 SSH/SSL/连接池的连接入口（与 MysqlConnect 并存，前端优先使用）。
func (a *App) MysqlConnectEx(id string) (bool, error) {
	cfg, ok := a.store.Get(id)
	if !ok {
		return false, errors.New("找不到该服务器配置")
	}
	if cfg.connType() != ConnMysql {
		return false, errors.New("该连接不是 MySQL 类型")
	}
	if err := mysqlExMgr.open(id, cfg); err != nil {
		return false, err
	}
	return true, nil
}

func (a *App) MysqlCloseEx(id string) {
	mysqlExMgr.close(id)
}

// ===================== 库 / 表管理 =====================

func (a *App) MysqlCreateDatabase(id, name, charset string) error {
	mc, ok := mysqlExMgr.get(id)
	if !ok {
		return errors.New("MySQL 连接不存在或已断开")
	}
	if charset == "" {
		charset = "utf8mb4"
	}
	_, err := mc.db.Exec(fmt.Sprintf("CREATE DATABASE IF NOT EXISTS %s CHARACTER SET %s", quoteIdent(name), charset))
	return err
}

func (a *App) MysqlDropDatabase(id, name string) error {
	mc, ok := mysqlExMgr.get(id)
	if !ok {
		return errors.New("MySQL 连接不存在或已断开")
	}
	_, err := mc.db.Exec("DROP DATABASE " + quoteIdent(name))
	return err
}

func (a *App) MysqlCreateTable(id, db, table, defs string) error {
	if strings.TrimSpace(defs) == "" {
		return errors.New("请提供列定义")
	}
	mc, ok := mysqlExMgr.get(id)
	if !ok {
		return errors.New("MySQL 连接不存在或已断开")
	}
	if _, e := mc.db.Exec("USE " + quoteIdent(db)); e != nil {
		return e
	}
	_, err := mc.db.Exec(fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s (%s)", quoteIdent(table), defs))
	return err
}

func (a *App) MysqlDropTable(id, db, table string) error {
	mc, ok := mysqlExMgr.get(id)
	if !ok {
		return errors.New("MySQL 连接不存在或已断开")
	}
	if _, e := mc.db.Exec("USE " + quoteIdent(db)); e != nil {
		return e
	}
	_, err := mc.db.Exec("DROP TABLE " + quoteIdent(table))
	return err
}

func (a *App) MysqlTruncateTable(id, db, table string) error {
	mc, ok := mysqlExMgr.get(id)
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
func (a *App) MysqlTableStatus(id, db string) ([]map[string]any, error) {
	_, rows, err := mysqlExMgr.queryEx(id, db, "SHOW TABLE STATUS")
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// MysqlIndexes 返回表的索引信息。
func (a *App) MysqlIndexes(id, db, table string) ([]map[string]any, error) {
	_, rows, err := mysqlExMgr.queryEx(id, db, fmt.Sprintf("SHOW INDEX FROM %s", quoteIdent(table)))
	if err != nil {
		return nil, err
	}
	return rows, nil
}

func (a *App) MysqlCreateIndex(id, db, table, name, colsCSV string, unique bool) error {
	if strings.TrimSpace(colsCSV) == "" {
		return errors.New("请提供索引列")
	}
	mc, ok := mysqlExMgr.get(id)
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

func (a *App) MysqlDropIndex(id, db, table, name string) error {
	mc, ok := mysqlExMgr.get(id)
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

func (a *App) MysqlUsers(id string) ([]map[string]any, error) {
	_, rows, err := mysqlExMgr.queryEx(id, "mysql",
		"SELECT User, Host, account_locked AS locked, password_expired AS expired FROM mysql.user")
	if err != nil {
		return nil, err
	}
	return rows, nil
}

func (a *App) MysqlGrants(id, user, host string) (string, error) {
	mc, ok := mysqlExMgr.get(id)
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

func (a *App) MysqlStatus(id string) (map[string]any, error) {
	_, rows, err := mysqlExMgr.queryEx(id, "", "SHOW GLOBAL STATUS")
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

func (a *App) MysqlVariables(id string) (map[string]any, error) {
	_, rows, err := mysqlExMgr.queryEx(id, "", "SHOW GLOBAL VARIABLES")
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

func (a *App) MysqlProcessList(id string) ([]map[string]any, error) {
	_, rows, err := mysqlExMgr.queryEx(id, "", "SHOW PROCESSLIST")
	if err != nil {
		return nil, err
	}
	return rows, nil
}

// MysqlSlowLog 返回慢查询日志内容（需开启 log_output=FILE 且 slow_query_log=ON）。
func (a *App) MysqlSlowLog(id string, limit int) ([]map[string]any, error) {
	if limit <= 0 {
		limit = 50
	}
	_, rows, err := mysqlExMgr.queryEx(id, "mysql",
		fmt.Sprintf("SELECT start_time, user_host, query_time, lock_time, rows_examined, sql_text FROM mysql.slow_log ORDER BY start_time DESC LIMIT %d", limit))
	if err != nil {
		// 部分发行版无 mysql.slow_log 表，回退到performance_schema
		_, rows2, err2 := mysqlExMgr.queryEx(id, "performance_schema",
			fmt.Sprintf("SELECT TIMER_START, SQL_TEXT FROM performance_schema.events_statements_summary_by_digest ORDER BY SUM_TIMER_WAIT DESC LIMIT %d", limit))
		if err2 != nil {
			return nil, err
		}
		return rows2, nil
	}
	return rows, nil
}

// ===================== ER 图数据 =====================

// MysqlSchema 返回数据库所有表的列与之间外键关系，供前端绘制 ER 图。
func (a *App) MysqlSchema(id, db string) (map[string]any, error) {
	tables, err := a.MysqlTables(id, db)
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
		_, drows, e := mysqlExMgr.queryEx(id, db, "DESCRIBE "+quoteIdent(t))
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
		_, fkrows, e2 := mysqlExMgr.queryEx(id, db,
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

func (a *App) MysqlExportJSON(id, db, source, table, sqlText string, limit int) (string, error) {
	mc, ok := mysqlExMgr.get(id)
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
	_, rows, err := mysqlExMgr.queryEx(id, db, query)
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
func (a *App) MysqlImportJSON(id, db, table, content string) (string, error) {
	mc, ok := mysqlExMgr.get(id)
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
func (a *App) MysqlExportToFileEx(id, db, mode, source, table, sqlText string, limit int) (string, error) {
	var content string
	var err error
	switch mode {
	case "json":
		content, err = a.MysqlExportJSON(id, db, source, table, sqlText, limit)
	case "csv", "sql":
		content, err = a.MysqlExport(id, db, mode, source, table, sqlText, limit)
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
	path, err := wruntime.SaveFileDialog(a.ctx, wruntime.SaveDialogOptions{
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
func (a *App) MysqlImportFromFileEx(id, db, mode, table string) (string, error) {
	pattern := "*.sql"
	switch mode {
	case "csv":
		pattern = "*.csv"
	case "json":
		pattern = "*.json"
	}
	path, err := wruntime.OpenFileDialog(a.ctx, wruntime.OpenDialogOptions{
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
		return a.MysqlImportJSON(id, db, table, string(data))
	case "csv", "sql":
		return a.MysqlImport(id, db, mode, table, string(data))
	default:
		return "", errors.New("不支持的导入格式: " + mode)
	}
}

// MysqlQueryCSV 以 CSV 字符串返回查询结果（供前端下载/复制）。
func (a *App) MysqlQueryCSV(id, db, sqlText string, limit int) (string, error) {
	if limit > 0 {
		sqlText = strings.TrimSpace(sqlText)
		if !strings.HasSuffix(strings.ToUpper(sqlText), "LIMIT") {
			sqlText = fmt.Sprintf("%s LIMIT %d", sqlText, limit)
		}
	}
	cols, rows, err := mysqlExMgr.queryEx(id, db, sqlText)
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
func (a *App) MysqlBackup(id, db string) (string, error) {
	tables, err := a.MysqlTables(id, db)
	if err != nil {
		return "", err
	}
	var sb strings.Builder
	sb.WriteString("SET FOREIGN_KEY_CHECKS=0;\n")
	for _, t := range tables {
		content, e := a.MysqlExport(id, db, "sql", "table", t, "", 0)
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
