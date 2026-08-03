package main

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// sqliteConn 保存一个本地 SQLite 文件连接。
type sqliteConn struct {
	db   *sql.DB
	path string
}

// sqliteManager 按会话（连接）ID 维护已打开的 SQLite 文件。
type sqliteManager struct {
	mu    sync.Mutex
	conns map[string]*sqliteConn
}

func newSqliteManager() *sqliteManager {
	return &sqliteManager{conns: make(map[string]*sqliteConn)}
}

// open 打开（或重建）一个 SQLite 数据库文件连接。
func (m *sqliteManager) open(id string, path string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return errors.New("未指定 SQLite 文件")
	}
	// 允许新建：文件不存在时由 driver 创建，但需可写目录。
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("找不到文件: %w", err)
	}

	m.mu.Lock()
	if old, ok := m.conns[id]; ok {
		_ = old.db.Close()
		delete(m.conns, id)
	}
	m.mu.Unlock()

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return fmt.Errorf("打开 SQLite 失败: %w", err)
	}
	db.SetMaxOpenConns(1)
	db.SetConnMaxLifetime(0)
	// 验证连接可用性
	if pingErr := db.Ping(); pingErr != nil {
		_ = db.Close()
		// modernc 驱动在文件非 SQLite 格式时会失败
		return fmt.Errorf("连接 SQLite 失败（文件可能已损坏或非 SQLite 格式）: %w", pingErr)
	}
	mc := &sqliteConn{db: db, path: path}
	m.mu.Lock()
	m.conns[id] = mc
	m.mu.Unlock()
	return nil
}

func (m *sqliteManager) get(id string) (*sqliteConn, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.conns[id]
	return c, ok
}

func (m *sqliteManager) close(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if c, ok := m.conns[id]; ok {
		_ = c.db.Close()
		delete(m.conns, id)
	}
}

func (m *sqliteManager) closeAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, c := range m.conns {
		_ = c.db.Close()
	}
	m.conns = make(map[string]*sqliteConn)
}

// normalizeSqliteVal 将驱动原生值转换为前端友好的类型。
func normalizeSqliteVal(v any) any {
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

func sqliteAsString(v any) string {
	if v == nil {
		return ""
	}
	if b, ok := v.([]byte); ok {
		return string(b)
	}
	return fmt.Sprint(v)
}

// firstColumn 提取每行第一列的值。
func sqliteFirstColumn(rows []map[string]any) []string {
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		for _, v := range r {
			out = append(out, sqliteAsString(v))
			break
		}
	}
	return out
}

// querySqlite 执行查询并返回列名与行数据。
func (m *sqliteManager) querySqlite(id, sqlText string) (columns []string, rows []map[string]any, err error) {
	mc, ok := sqliteMgr.get(id)
	if !ok {
		return nil, nil, errors.New("SQLite 连接不存在或已断开，请重新打开文件")
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
			rec[c] = normalizeSqliteVal(vals[i])
		}
		out = append(out, rec)
	}
	if e := res.Err(); e != nil {
		return nil, nil, e
	}
	return cols, out, nil
}

func quoteSqliteIdent(name string) string {
	return "\"" + strings.ReplaceAll(name, "\"", "\"\"") + "\""
}

func sqliteIsReadQuery(s string) bool {
	up := strings.ToUpper(strings.TrimSpace(s))
	up = strings.TrimLeft(up, "(")
	for _, p := range []string{"SELECT", "PRAGMA", "EXPLAIN", "WITH"} {
		if strings.HasPrefix(up, p+" ") || strings.HasPrefix(up, p+"(") || up == p {
			return true
		}
	}
	return false
}

// ---- App 暴露给前端的方法 ----

// SqliteOpenFile 弹出系统文件选择框，返回选中的本地 SQLite 文件路径。
func (a *App) SqliteOpenFile() (string, error) {
	return wruntime.OpenFileDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "选择 SQLite 数据库文件",
		Filters: []wruntime.FileFilter{
			{DisplayName: "SQLite 数据库", Pattern: "*.db;*.sqlite;*.sqlite3;*.db3"},
		},
	})
}

// SqliteConnect 打开指定路径的 SQLite 文件。
func (a *App) SqliteConnect(id, path string) (bool, error) {
	if err := sqliteMgr.open(id, path); err != nil {
		return false, err
	}
	return true, nil
}

// SqliteClose 关闭 SQLite 连接。
func (a *App) SqliteClose(id string) {
	sqliteMgr.close(id)
}

// SqliteInfo 返回当前连接的基本信息：文件路径与大小。
func (a *App) SqliteInfo(id string) (map[string]any, error) {
	mc, ok := sqliteMgr.get(id)
	if !ok {
		return nil, errors.New("SQLite 连接不存在或已断开")
	}
	info := map[string]any{
		"path": mc.path,
		"size": int64(0),
	}
	if fi, e := os.Stat(mc.path); e == nil {
		info["size"] = fi.Size()
	}
	return info, nil
}

// SqliteTables 返回数据库中的用户表与视图（排除 SQLite 内部表）。
func (a *App) SqliteTables(id string) ([]map[string]any, error) {
	mc, ok := sqliteMgr.get(id)
	if !ok {
		return nil, errors.New("SQLite 连接不存在或已断开")
	}
	rows, err := mc.db.Query(
		"SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := make([]map[string]any, 0)
	for rows.Next() {
		var name, typ string
		if e := rows.Scan(&name, &typ); e != nil {
			return nil, e
		}
		list = append(list, map[string]any{"name": name, "type": typ})
	}
	return list, rows.Err()
}

// SqliteDescribe 返回表结构（列名、类型、可否为空、默认值、是否主键）。
func (a *App) SqliteDescribe(id, table string) ([]map[string]any, error) {
	mc, ok := sqliteMgr.get(id)
	if !ok {
		return nil, errors.New("SQLite 连接不存在或已断开")
	}
	rows, err := mc.db.Query(fmt.Sprintf("PRAGMA table_info(%s)", quoteSqliteIdent(table)))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	// PRAGMA table_info 列：cid,name,type,notnull,dflt_value,pk
	list := make([]map[string]any, 0)
	for rows.Next() {
		var cid int
		var name, typ string
		var notnull, pk int
		var dflt sql.NullString
		if e := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); e != nil {
			return nil, e
		}
		list = append(list, map[string]any{
			"cid":     cid,
			"name":    name,
			"type":    typ,
			"notnull": notnull,
			"default": dflt,
			"pk":      pk,
		})
	}
	return list, rows.Err()
}

// SqliteSelect 返回表前 limit 行数据（分页）。
func (a *App) SqliteSelect(id, table string, limit, offset int) (map[string]any, error) {
	if limit <= 0 || limit > 1000 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}
	sqlText := fmt.Sprintf("SELECT * FROM %s LIMIT %d OFFSET %d", quoteSqliteIdent(table), limit, offset)
	cols, rows, err := sqliteMgr.querySqlite(id, sqlText)
	if err != nil {
		return nil, err
	}
	return map[string]any{"columns": cols, "rows": rows, "rowCount": len(rows)}, nil
}

// SqliteCount 返回表总行数。
func (a *App) SqliteCount(id, table string) (int64, error) {
	cols, rows, err := sqliteMgr.querySqlite(id, fmt.Sprintf("SELECT COUNT(*) AS cnt FROM %s", quoteSqliteIdent(table)))
	if err != nil {
		return 0, err
	}
	if len(rows) == 0 || len(cols) == 0 {
		return 0, nil
	}
	switch v := rows[0][cols[0]].(type) {
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

// SqliteIndexes 返回表的索引信息。
func (a *App) SqliteIndexes(id, table string) ([]map[string]any, error) {
	mc, ok := sqliteMgr.get(id)
	if !ok {
		return nil, errors.New("SQLite 连接不存在或已断开")
	}
	rows, err := mc.db.Query(fmt.Sprintf("PRAGMA index_list(%s)", quoteSqliteIdent(table)))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	// PRAGMA index_list 列：seq, name, unique, origin, partial
	list := make([]map[string]any, 0)
	for rows.Next() {
		var seq int
		var name string
		var unique int
		var origin, partial string
		if e := rows.Scan(&seq, &name, &unique, &origin, &partial); e != nil {
			return nil, e
		}
		list = append(list, map[string]any{
			"seq":    seq,
			"name":   name,
			"unique": unique,
			"origin": origin,
			"partial": partial,
		})
	}
	return list, rows.Err()
}

// SqliteRun 执行任意 SQL：只读查询返回结果集，写操作返回影响行数。
func (a *App) SqliteRun(id, sqlText string) (map[string]any, error) {
	mc, ok := sqliteMgr.get(id)
	if !ok {
		return nil, errors.New("SQLite 连接不存在或已断开")
	}
	trimmed := strings.TrimSpace(sqlText)
	if sqliteIsReadQuery(trimmed) && !strings.HasPrefix(strings.ToUpper(trimmed), "PRAGMA") {
		cols, rows, err := sqliteMgr.querySqlite(id, trimmed)
		if err != nil {
			return nil, err
		}
		return map[string]any{"columns": cols, "rows": rows, "rowCount": len(rows), "affected": 0}, nil
	}
	if strings.HasPrefix(strings.ToUpper(trimmed), "PRAGMA") {
		cols, rows, err := sqliteMgr.querySqlite(id, trimmed)
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

// SqliteSchema 返回所有表的列信息，供前端绘制 ER 图（外键作为关系）。
func (a *App) SqliteSchema(id string) (map[string]any, error) {
	tables, err := a.SqliteTables(id)
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
		name, _ := t["name"].(string)
		if name == "" {
			continue
		}
		cols, e := a.SqliteDescribe(id, name)
		if e != nil {
			continue
		}
		outCols := make([]col, 0, len(cols))
		for _, c := range cols {
			cn, _ := c["name"].(string)
			ct, _ := c["type"].(string)
			key := ""
			if pk, ok := c["pk"].(int); ok && pk > 0 {
				key = "PRI"
			}
			outCols = append(outCols, col{Name: cn, Type: ct, Key: key})
		}
		outTables = append(outTables, tbl{Name: name, Columns: outCols})

		// 外键
		mc, _ := sqliteMgr.get(id)
		if mc != nil {
			fkRows, e2 := mc.db.Query(fmt.Sprintf("PRAGMA foreign_key_list(%s)", quoteSqliteIdent(name)))
			if e2 == nil {
				for fkRows.Next() {
					var idCol, seq int
					var tableRef, from, to, onUpdate, onDelete, match string
					if e3 := fkRows.Scan(&idCol, &seq, &tableRef, &from, &to, &onUpdate, &onDelete, &match); e3 != nil {
						break
					}
					fks = append(fks, map[string]any{
						"fromTable":  name,
						"fromColumn": from,
						"toTable":    tableRef,
						"toColumn":   to,
						"name":       fmt.Sprintf("fk_%s_%d", name, idCol),
					})
				}
				fkRows.Close()
			}
		}
	}
	return map[string]any{"tables": outTables, "foreignKeys": fks}, nil
}

// sqliteMgr 全局 SQLite 连接管理器单例。
var sqliteMgr = newSqliteManager()
