package main

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/go-sql-driver/mysql"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// mysqlConn 保存一个 MySQL 连接及其当前选中的数据库。
type mysqlConn struct {
	db    *sql.DB
	cfg   ServerConfig
	curDb string
}

// mysqlManager 按会话 ID 维护已建立的 MySQL 连接。
type mysqlManager struct {
	mu    sync.Mutex
	conns map[string]*mysqlConn
}

func newMysqlManager() *mysqlManager {
	return &mysqlManager{conns: make(map[string]*mysqlConn)}
}

// open 建立（或重建）一个 MySQL 连接。
func (m *mysqlManager) open(id string, cfg ServerConfig) error {
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

// get 返回已有的 MySQL 连接。
func (m *mysqlManager) get(id string) (*mysqlConn, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.conns[id]
	return c, ok
}

// close 关闭并移除指定连接。
func (m *mysqlManager) close(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if c, ok := m.conns[id]; ok {
		_ = c.db.Close()
		delete(m.conns, id)
	}
}

// closeAll 关闭全部连接（应用退出时调用）。
func (m *mysqlManager) closeAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, c := range m.conns {
		_ = c.db.Close()
	}
	m.conns = make(map[string]*mysqlConn)
}

// buildMysqlDSN 根据配置构造 MySQL 连接串。
func buildMysqlDSN(cfg ServerConfig) string {
	user := cfg.Username
	pass := cfg.Password
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.displayPort())
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
	if b, ok := v.([]byte); ok {
		return string(b)
	}
	return fmt.Sprint(v)
}

// firstColumn 提取每行第一列的值（用于 SHOW 类查询）。
func firstColumn(rows []map[string]any) []string {
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		for _, v := range r {
			out = append(out, asString(v))
			break
		}
	}
	return out
}

// queryMysql 执行一条查询并返回列名与行数据。
func (m *mysqlManager) queryMysql(id, dbName, sqlText string) (columns []string, rows []map[string]any, err error) {
	mc, ok := mysqlExMgr.get(id)
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
	if e := res.Err(); e != nil {
		return nil, nil, e
	}
	return cols, out, nil
}

func quoteIdent(name string) string {
	return "`" + strings.ReplaceAll(name, "`", "``") + "`"
}

// isReadQuery 判断一条 SQL 是否为只读查询（返回结果集）。
func isReadQuery(s string) bool {
	up := strings.ToUpper(strings.TrimSpace(s))
	up = strings.TrimLeft(up, "(")
	for _, p := range []string{"SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "WITH", "CALL"} {
		if strings.HasPrefix(up, p+" ") || strings.HasPrefix(up, p+"(") || up == p {
			return true
		}
	}
	return false
}

// ---- App 暴露给前端的 MySQL 方法 ----

// MysqlConnect 建立 MySQL 连接。
func (a *App) MysqlConnect(id string) (bool, error) {
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

// MysqlClose 关闭 MySQL 连接。
func (a *App) MysqlClose(id string) {
	mysqlExMgr.close(id)
}

// MysqlDatabases 返回所有数据库名。
func (a *App) MysqlDatabases(id string) ([]string, error) {
	_, rows, err := a.mysqlMgr.queryMysql(id, "", "SHOW DATABASES")
	if err != nil {
		return nil, err
	}
	return firstColumn(rows), nil
}

// MysqlTables 返回指定数据库下的表名。
func (a *App) MysqlTables(id, db string) ([]string, error) {
	_, rows, err := a.mysqlMgr.queryMysql(id, db, "SHOW TABLES")
	if err != nil {
		return nil, err
	}
	return firstColumn(rows), nil
}

// MysqlSelect 返回表的前 limit 行数据。
func (a *App) MysqlSelect(id, db, table string, limit, offset int) (map[string]any, error) {
	if limit <= 0 || limit > 1000 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}
	sqlText := fmt.Sprintf("SELECT * FROM %s LIMIT %d OFFSET %d", quoteIdent(table), limit, offset)
	cols, rows, err := a.mysqlMgr.queryMysql(id, db, sqlText)
	if err != nil {
		return nil, err
	}
	return map[string]any{"columns": cols, "rows": rows, "rowCount": len(rows)}, nil
}

// MysqlCount 返回表的总行数，用于分页。
func (a *App) MysqlCount(id, db, table string) (int64, error) {
	_, rows, err := a.mysqlMgr.queryMysql(id, db, fmt.Sprintf("SELECT COUNT(*) AS cnt FROM %s", quoteIdent(table)))
	if err != nil {
		return 0, err
	}
	if len(rows) == 0 {
		return 0, nil
	}
	switch v := rows[0]["cnt"].(type) {
	case int64:
		return v, nil
	case float64:
		return int64(v), nil
	case []byte:
		var n int64
		fmt.Sscanf(string(v), "%d", &n)
		return n, nil
	case string:
		var n int64
		fmt.Sscanf(v, "%d", &n)
		return n, nil
	default:
		return 0, nil
	}
}

// MysqlDescribe 返回表结构信息。
func (a *App) MysqlDescribe(id, db, table string) (map[string]any, error) {
	sqlText := fmt.Sprintf("DESCRIBE %s", quoteIdent(table))
	cols, rows, err := a.mysqlMgr.queryMysql(id, db, sqlText)
	if err != nil {
		return nil, err
	}
	return map[string]any{"columns": cols, "rows": rows}, nil
}

// MysqlRun 执行任意 SQL 语句。只读查询返回结果集，写操作返回影响行数。
func (a *App) MysqlRun(id, db, sqlText string) (map[string]any, error) {
	mc, ok := mysqlExMgr.get(id)
	if !ok {
		return nil, errors.New("MySQL 连接不存在或已断开，请重新连接")
	}
	if strings.TrimSpace(db) != "" {
		if _, e := mc.db.Exec("USE " + quoteIdent(db)); e != nil {
			return nil, fmt.Errorf("切换数据库失败: %w", e)
		}
		mc.curDb = db
	}
	trimmed := strings.TrimSpace(sqlText)
	if isReadQuery(trimmed) {
		cols, rows, err := a.mysqlMgr.queryMysql(id, db, trimmed)
		if err != nil {
			return nil, err
		}
		return map[string]any{"columns": cols, "rows": rows, "rowCount": len(rows), "affected": 0}, nil
	}
	res, err := mc.db.Exec(trimmed)
	if err != nil {
		return nil, err
	}
	affected, _ := res.RowsAffected()
	return map[string]any{"columns": []string{}, "rows": []any{}, "rowCount": 0, "affected": affected}, nil
}

// ---- 增删改（CRUD） ----

// columnTypes 返回表各列的类型（用于写入前做类型转换）。
func (m *mysqlManager) columnTypes(id, db, table string) (map[string]string, error) {
	cols, rows, err := mysqlExMgr.queryEx(id, db, "DESCRIBE "+quoteIdent(table))
	if err != nil {
		return nil, err
	}
	_ = cols
	out := make(map[string]string, len(rows))
	for _, r := range rows {
		field, _ := r["Field"].(string)
		typ, _ := r["Type"].(string)
		if field != "" {
			out[field] = typ
		}
	}
	return out, nil
}

// parseBoolStr 将常见布尔表示解析为 bool。
func parseBoolStr(s string) (bool, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "1", "true", "t", "yes", "y":
		return true, nil
	case "0", "false", "f", "no", "n", "":
		return false, nil
	}
	return strconv.ParseBool(s)
}

// coerceMysqlValue 根据列类型把前端传入的原始值转换为合适的 Go 类型。
func coerceMysqlValue(raw any, colType string) (any, error) {
	if raw == nil {
		return nil, nil
	}
	t := strings.ToLower(colType)
	isInt := strings.Contains(t, "int")
	isFloat := strings.Contains(t, "decimal") || strings.Contains(t, "float") ||
		strings.Contains(t, "double") || strings.Contains(t, "numeric") || strings.Contains(t, "real")
	isBool := strings.Contains(t, "bool")
	// tinyint(1) 视为布尔
	if isInt && strings.HasPrefix(t, "tinyint(1)") {
		isBool = true
		isInt = false
	}

	switch v := raw.(type) {
	case string:
		s := strings.TrimSpace(v)
		if strings.EqualFold(s, "NULL") {
			return nil, nil
		}
		if isBool {
			b, err := parseBoolStr(s)
			if err != nil {
				return nil, fmt.Errorf("列 %s 需要布尔值，收到 %q", colType, s)
			}
			return b, nil
		}
		if isInt {
			n, err := strconv.ParseInt(s, 10, 64)
			if err != nil {
				return nil, fmt.Errorf("列 %s 需要整数，收到 %q", colType, s)
			}
			return n, nil
		}
		if isFloat {
			f, err := strconv.ParseFloat(s, 64)
			if err != nil {
				return nil, fmt.Errorf("列 %s 需要数值，收到 %q", colType, s)
			}
			return f, nil
		}
		return s, nil
	case float64:
		if isInt {
			return int64(v), nil
		}
		if isBool {
			return v != 0, nil
		}
		return v, nil
	case float32:
		if isInt {
			return int64(v), nil
		}
		if isBool {
			return v != 0, nil
		}
		return float64(v), nil
	case int:
		if isBool {
			return v != 0, nil
		}
		return int64(v), nil
	case int32:
		if isBool {
			return v != 0, nil
		}
		return int64(v), nil
	case int64:
		if isBool {
			return v != 0, nil
		}
		return v, nil
	case bool:
		return v, nil
	default:
		return raw, nil
	}
}

// MysqlInsert 向表中插入一行（参数化，避免注入）。
func (a *App) MysqlInsert(id, db, table string, columns []string, values []any) (int64, error) {
	if len(columns) == 0 {
		return 0, errors.New("缺少插入字段，请至少填写一列")
	}
	types, err := a.mysqlMgr.columnTypes(id, db, table)
	if err != nil {
		return 0, err
	}
	cols := make([]string, len(columns))
	args := make([]any, len(columns))
	ph := make([]string, len(columns))
	for i, c := range columns {
		cols[i] = quoteIdent(c)
		ph[i] = "?"
		v, e := coerceMysqlValue(values[i], types[c])
		if e != nil {
			return 0, e
		}
		args[i] = v
	}
	sqlText := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		quoteIdent(table), strings.Join(cols, ","), strings.Join(ph, ","))
	mc, ok := mysqlExMgr.get(id)
	if !ok {
		return 0, errors.New("MySQL 连接不存在或已断开，请重新连接")
	}
	if strings.TrimSpace(db) != "" {
		if _, e := mc.db.Exec("USE " + quoteIdent(db)); e != nil {
			return 0, fmt.Errorf("切换数据库失败: %w", e)
		}
	}
	res, err := mc.db.Exec(sqlText, args...)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// MysqlUpdate 按条件更新指定列（参数化）。
func (a *App) MysqlUpdate(id, db, table string, setCols []string, setVals []any, whereCols []string, whereVals []any) (int64, error) {
	if len(setCols) == 0 {
		return 0, errors.New("没有需要更新的字段")
	}
	types, err := a.mysqlMgr.columnTypes(id, db, table)
	if err != nil {
		return 0, err
	}
	setParts := make([]string, len(setCols))
	args := make([]any, 0, len(setCols)+len(whereCols))
	for i, c := range setCols {
		v, e := coerceMysqlValue(setVals[i], types[c])
		if e != nil {
			return 0, e
		}
		setParts[i] = quoteIdent(c) + " = ?"
		args = append(args, v)
	}
	whereParts := make([]string, 0, len(whereCols))
	for i, c := range whereCols {
		v, e := coerceMysqlValue(whereVals[i], types[c])
		if e != nil {
			return 0, e
		}
		whereParts = append(whereParts, quoteIdent(c)+" = ?")
		args = append(args, v)
	}
	w := ""
	if len(whereParts) > 0 {
		w = " WHERE " + strings.Join(whereParts, " AND ")
	}
	sqlText := "UPDATE " + quoteIdent(table) + " SET " + strings.Join(setParts, ", ") + w
	mc, ok := mysqlExMgr.get(id)
	if !ok {
		return 0, errors.New("MySQL 连接不存在或已断开，请重新连接")
	}
	if strings.TrimSpace(db) != "" {
		if _, e := mc.db.Exec("USE " + quoteIdent(db)); e != nil {
			return 0, fmt.Errorf("切换数据库失败: %w", e)
		}
	}
	res, err := mc.db.Exec(sqlText, args...)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// MysqlExport 导出数据。
// mode: "sql" 导出为 INSERT 语句；"csv" 导出为逗号分隔值。
// source: "table" 按表名整表导出；"query" 按自定义 SQL 语句导出。
func (a *App) MysqlExport(id, db, mode, source, table, sqlText string, limit int) (string, error) {
	mc, ok := mysqlExMgr.get(id)
	if !ok {
		return "", errors.New("MySQL 连接不存在或已断开，请重新连接")
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

	rows, err := mc.db.Query(query)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	if mode == "sql" {
		if db != "" {
			sb.WriteString(fmt.Sprintf("USE `%s`;\n", db))
		}
		target := table
		if target == "" {
			target = "exported_table"
		}
		sb.WriteString(fmt.Sprintf("INSERT INTO `%s` (`%s`) VALUES\n", target, strings.Join(cols, "`,`")))
	}

	first := true
	for rows.Next() {
		cells := make([]sql.RawBytes, len(cols))
		ptrs := make([]any, len(cols))
		for i := range cells {
			ptrs[i] = &cells[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return "", err
		}
		if mode == "sql" {
			if !first {
				sb.WriteString(",\n")
			}
			sb.WriteString("(")
			for i, c := range cells {
				if i > 0 {
					sb.WriteString(",")
				}
				sb.WriteString(sqlLiteral(c))
			}
			sb.WriteString(")")
		} else {
			if first {
				sb.WriteString(strings.Join(escCsv(cols), ","))
				sb.WriteString("\n")
			}
			sb.WriteString(strings.Join(escCsvRaw(cells), ","))
			sb.WriteString("\n")
		}
		first = false
	}
	if err := rows.Err(); err != nil {
		return "", err
	}

	if mode == "sql" {
		if first {
			// 无数据，输出占位注释
			sb.Reset()
			if db != "" {
				sb.WriteString(fmt.Sprintf("USE `%s`;\n", db))
			}
			sb.WriteString(fmt.Sprintf("-- 表 `%s` 无数据\n", table))
		} else {
			sb.WriteString(";\n")
		}
	}

	return sb.String(), nil
}

// MysqlImport 导入数据。
// mode: "sql" 按语句批量执行；"csv" 将 CSV 内容导入到指定表（首行为列名）。
func (a *App) MysqlImport(id, db, mode, table, content string) (string, error) {
	mc, ok := mysqlExMgr.get(id)
	if !ok {
		return "", errors.New("MySQL 连接不存在或已断开，请重新连接")
	}
	if db != "" {
		if _, err := mc.db.Exec("USE " + quoteIdent(db)); err != nil {
			return "", err
		}
	}

	if mode == "sql" {
		stmts := splitSqlStatements(content)
		var affected int64
		for _, s := range stmts {
			s = strings.TrimSpace(s)
			if s == "" {
				continue
			}
			res, err := mc.db.Exec(s)
			if err != nil {
				return "", fmt.Errorf("执行失败: %s\nSQL: %s", err.Error(), truncateStr(s, 200))
			}
			if n, e := res.RowsAffected(); e == nil {
				affected += n
			}
		}
		return fmt.Sprintf("成功执行 %d 条语句，影响 %d 行", len(stmts), affected), nil
	}

	// CSV 模式
	if table == "" {
		return "", errors.New("未指定目标表名")
	}
	normalized := strings.ReplaceAll(content, "\r\n", "\n")
	lines := strings.Split(normalized, "\n")
	for len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) == "" {
		lines = lines[:len(lines)-1]
	}
	if len(lines) < 2 {
		return "", errors.New("CSV 文件至少需要表头行和一行数据")
	}
	header := parseCsvLine(lines[0])
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(header)), ",")
	insertSQL := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		quoteIdent(table), "`"+strings.Join(header, "`,`")+"`", placeholders)

	var count int64
	for _, line := range lines[1:] {
		if strings.TrimSpace(line) == "" {
			continue
		}
		fields := parseCsvLine(line)
		if len(fields) != len(header) {
			return "", fmt.Errorf("CSV 行字段数(%d)与表头(%d)不一致", len(fields), len(header))
		}
		args := make([]any, len(fields))
		for i, f := range fields {
			if strings.EqualFold(f, "NULL") {
				args[i] = nil
			} else {
				args[i] = f
			}
		}
		if _, err := mc.db.Exec(insertSQL, args...); err != nil {
			return "", fmt.Errorf("插入失败: %s", err.Error())
		}
		count++
	}
	return fmt.Sprintf("成功导入 %d 行到表 `%s`", count, table), nil
}

// MysqlExportToFile 生成导出内容并通过系统保存对话框写入指定文件，返回文件路径。
// 用户取消对话框时返回空字符串（无错误）。
func (a *App) MysqlExportToFile(id, db, mode, source, table, sqlText string, limit int) (string, error) {
	content, err := a.MysqlExport(id, db, mode, source, table, sqlText, limit)
	if err != nil {
		return "", err
	}
	ext := "sql"
	if mode == "csv" {
		ext = "csv"
	}
	base := "export"
	if source == "table" && table != "" {
		base = table
	} else {
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

// MysqlImportFromFile 通过系统打开对话框选择文件并导入，返回结果消息。
// 用户取消对话框时返回空字符串（无错误）。
func (a *App) MysqlImportFromFile(id, db, mode, table string) (string, error) {
	pattern := "*.sql"
	if mode != "sql" {
		pattern = "*.csv"
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
	return a.MysqlImport(id, db, mode, table, string(data))
}

// sqlLiteral 将数据库字节值转成 SQL 字面量
func sqlLiteral(b []byte) string {
	if b == nil {
		return "NULL"
	}
	s := string(b)
	esc := strings.ReplaceAll(s, "\\", "\\\\")
	esc = strings.ReplaceAll(esc, "'", "\\'")
	return "'" + esc + "'"
}

// escCsv 对字符串切片做 CSV 转义（表头已知为字符串）
func escCsv(cols []string) []string {
	out := make([]string, len(cols))
	for i, c := range cols {
		out[i] = escCsvField(c)
	}
	return out
}

// escCsvRaw 对 RawBytes 切片做 CSV 转义
func escCsvRaw(cells []sql.RawBytes) []string {
	out := make([]string, len(cells))
	for i, c := range cells {
		if c == nil {
			out[i] = ""
		} else {
			out[i] = escCsvField(string(c))
		}
	}
	return out
}

func escCsvField(s string) string {
	if strings.ContainsAny(s, ",\"\n\r") {
		return "\"" + strings.ReplaceAll(s, "\"", "\"\"") + "\""
	}
	return s
}

// parseCsvLine 简易 CSV 解析（支持双引号包裹与转义）
func parseCsvLine(line string) []string {
	var fields []string
	var cur strings.Builder
	inQuote := false
	for i := 0; i < len(line); i++ {
		c := line[i]
		switch {
		case c == '"':
			if inQuote && i+1 < len(line) && line[i+1] == '"' {
				cur.WriteByte('"')
				i++
			} else {
				inQuote = !inQuote
			}
		case c == ',' && !inQuote:
			fields = append(fields, cur.String())
			cur.Reset()
		default:
			cur.WriteByte(c)
		}
	}
	fields = append(fields, cur.String())
	return fields
}

// splitSqlStatements 按分号切分 SQL（忽略单引号/双引号/反引号内的分号）
func splitSqlStatements(s string) []string {
	var out []string
	var cur strings.Builder
	var quote rune
	for _, r := range s {
		switch {
		case quote != 0:
			cur.WriteRune(r)
			if r == quote {
				quote = 0
			}
		case r == '\'' || r == '"' || r == '`':
			quote = r
			cur.WriteRune(r)
		case r == ';':
			out = append(out, cur.String())
			cur.Reset()
		default:
			cur.WriteRune(r)
		}
	}
	if strings.TrimSpace(cur.String()) != "" {
		out = append(out, cur.String())
	}
	return out
}

func truncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// MysqlDelete 按条件删除行（参数化）。
func (a *App) MysqlDelete(id, db, table string, whereCols []string, whereVals []any) (int64, error) {
	if len(whereCols) == 0 {
		return 0, errors.New("无法确定删除条件（缺少主键），请改用 SQL 执行")
	}
	types, err := a.mysqlMgr.columnTypes(id, db, table)
	if err != nil {
		return 0, err
	}
	whereParts := make([]string, 0, len(whereCols))
	args := make([]any, 0, len(whereCols))
	for i, c := range whereCols {
		v, e := coerceMysqlValue(whereVals[i], types[c])
		if e != nil {
			return 0, e
		}
		whereParts = append(whereParts, quoteIdent(c)+" = ?")
		args = append(args, v)
	}
	sqlText := "DELETE FROM " + quoteIdent(table) + " WHERE " + strings.Join(whereParts, " AND ")
	mc, ok := mysqlExMgr.get(id)
	if !ok {
		return 0, errors.New("MySQL 连接不存在或已断开，请重新连接")
	}
	if strings.TrimSpace(db) != "" {
		if _, e := mc.db.Exec("USE " + quoteIdent(db)); e != nil {
			return 0, fmt.Errorf("切换数据库失败: %w", e)
		}
	}
	res, err := mc.db.Exec(sqlText, args...)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
