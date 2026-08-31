package db

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"terminal/core"
)

// ===================== 表结构与元数据详细提取 =====================

// PostgresDescribe 获取表或视图的详细结构（字段、主键、外键、约束、索引）。
func (m *PostgresManager) PostgresDescribe(serverID, dbName, schema, table string) (map[string]any, error) {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return nil, err
	}
	if schema == "" {
		schema = "public"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 1. 获取主键字段
	pkQuery := `
		SELECT kcu.column_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu 
		  ON tc.constraint_name = kcu.constraint_name 
		 AND tc.table_schema = kcu.table_schema
		WHERE tc.constraint_type = 'PRIMARY KEY'
		  AND tc.table_schema = $1
		  AND tc.table_name = $2;
	`
	pkRows, err := pool.Query(ctx, pkQuery, schema, table)
	pkMap := make(map[string]bool)
	if err == nil {
		for pkRows.Next() {
			var col string
			if err := pkRows.Scan(&col); err == nil {
				pkMap[col] = true
			}
		}
		pkRows.Close()
	}

	// 2. 获取外键字段
	fkQuery := `
		SELECT kcu.column_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu 
		  ON tc.constraint_name = kcu.constraint_name 
		 AND tc.table_schema = kcu.table_schema
		WHERE tc.constraint_type = 'FOREIGN KEY'
		  AND tc.table_schema = $1
		  AND tc.table_name = $2;
	`
	fkRows, err := pool.Query(ctx, fkQuery, schema, table)
	fkMap := make(map[string]bool)
	if err == nil {
		for fkRows.Next() {
			var col string
			if err := fkRows.Scan(&col); err == nil {
				fkMap[col] = true
			}
		}
		fkRows.Close()
	}

	// 3. 获取所有列信息
	colQuery := `
		SELECT 
			c.column_name,
			c.ordinal_position,
			c.data_type,
			c.udt_name,
			c.is_nullable = 'YES' AS is_nullable,
			COALESCE(c.column_default, '') AS column_default,
			COALESCE(c.character_maximum_length, 0) AS char_max_len,
			COALESCE(c.numeric_precision, 0) AS num_precision,
			COALESCE(c.numeric_scale, 0) AS num_scale,
			COALESCE(pg_catalog.col_description(cls.oid, c.ordinal_position::int), '') AS comment
		FROM information_schema.columns c
		JOIN pg_catalog.pg_class cls ON cls.relname = c.table_name
		JOIN pg_catalog.pg_namespace n ON n.oid = cls.relnamespace AND n.nspname = c.table_schema
		WHERE c.table_schema = $1
		  AND c.table_name = $2
		ORDER BY c.ordinal_position ASC;
	`
	colRows, err := pool.Query(ctx, colQuery, schema, table)
	if err != nil {
		return nil, fmt.Errorf("查询列结构失败: %w", err)
	}
	defer colRows.Close()

	var columns []PgColumn
	for colRows.Next() {
		var col PgColumn
		if err := colRows.Scan(&col.Name, &col.OrdinalPos, &col.DataType, &col.UdtName, &col.IsNullable,
			&col.DefaultVal, &col.CharMaxLength, &col.NumPrecision, &col.NumScale, &col.Comment); err != nil {
			continue
		}
		col.IsPrimaryKey = pkMap[col.Name]
		col.IsForeignKey = fkMap[col.Name]
		columns = append(columns, col)
	}

	// 4. 获取约束列表
	constraintQuery := `
		SELECT
			tc.constraint_name,
			tc.constraint_type,
			COALESCE(cc.check_clause, '') AS def,
			COALESCE(ccu.table_name, '') AS foreign_table,
			COALESCE(ccu.table_schema, '') AS foreign_schema,
			COALESCE(ccu.column_name, '') AS foreign_column
		FROM information_schema.table_constraints tc
		LEFT JOIN information_schema.check_constraints cc 
		       ON tc.constraint_name = cc.constraint_name AND tc.table_schema = cc.constraint_schema
		LEFT JOIN information_schema.constraint_column_usage ccu 
		       ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.constraint_schema
		WHERE tc.table_schema = $1
		  AND tc.table_name = $2
		GROUP BY tc.constraint_name, tc.constraint_type, cc.check_clause, ccu.table_name, ccu.table_schema, ccu.column_name;
	`
	consRows, err := pool.Query(ctx, constraintQuery, schema, table)
	var constraints []PgConstraint
	if err == nil {
		for consRows.Next() {
			var c PgConstraint
			if err := consRows.Scan(&c.Name, &c.Type, &c.Def, &c.ForeignTable, &c.ForeignSchema, &c.ForeignColumn); err == nil {
				constraints = append(constraints, c)
			}
		}
		consRows.Close()
	}

	// 5. 获取索引信息
	idxQuery := `
		SELECT
			i.relname AS index_name,
			pg_get_indexdef(i.oid) AS index_def,
			ix.indisprimary AS is_primary,
			ix.indisunique AS is_unique,
			pg_size_pretty(pg_relation_size(i.oid)) AS index_size
		FROM pg_catalog.pg_class c
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		JOIN pg_catalog.pg_index ix ON ix.indrelid = c.oid
		JOIN pg_catalog.pg_class i ON i.oid = ix.indexrelid
		WHERE n.nspname = $1
		  AND c.relname = $2
		ORDER BY i.relname ASC;
	`
	idxRows, err := pool.Query(ctx, idxQuery, schema, table)
	var indexes []PgIndex
	if err == nil {
		for idxRows.Next() {
			var idx PgIndex
			idx.Schema = schema
			idx.Table = table
			if err := idxRows.Scan(&idx.Name, &idx.Def, &idx.IsPrimary, &idx.IsUnique, &idx.Size); err == nil {
				indexes = append(indexes, idx)
			}
		}
		idxRows.Close()
	}

	return map[string]any{
		"schema":      schema,
		"table":       table,
		"columns":     columns,
		"constraints": constraints,
		"indexes":     indexes,
		"primaryKeys": pkMap,
	}, nil
}

// PostgresTableDDL 获取指定表的 DDL 创建脚本。
func (m *PostgresManager) PostgresTableDDL(serverID, dbName, schema, table string) (string, error) {
	desc, err := m.PostgresDescribe(serverID, dbName, schema, table)
	if err != nil {
		return "", err
	}

	cols, _ := desc["columns"].([]PgColumn)
	var colDefs []string
	var pks []string

	for _, col := range cols {
		typeStr := col.UdtName
		if col.DataType == "character varying" {
			if col.CharMaxLength > 0 {
				typeStr = fmt.Sprintf("VARCHAR(%d)", col.CharMaxLength)
			} else {
				typeStr = "VARCHAR"
			}
		} else if col.DataType == "character" {
			if col.CharMaxLength > 0 {
				typeStr = fmt.Sprintf("CHAR(%d)", col.CharMaxLength)
			} else {
				typeStr = "CHAR"
			}
		} else if col.DataType == "numeric" && col.NumPrecision > 0 {
			typeStr = fmt.Sprintf("NUMERIC(%d,%d)", col.NumPrecision, col.NumScale)
		}

		colDef := fmt.Sprintf("  \"%s\" %s", col.Name, strings.ToUpper(typeStr))
		if !col.IsNullable {
			colDef += " NOT NULL"
		}
		if col.DefaultVal != "" {
			colDef += fmt.Sprintf(" DEFAULT %s", col.DefaultVal)
		}
		colDefs = append(colDefs, colDef)

		if col.IsPrimaryKey {
			pks = append(pks, fmt.Sprintf("\"%s\"", col.Name))
		}
	}

	if len(pks) > 0 {
		colDefs = append(colDefs, fmt.Sprintf("  PRIMARY KEY (%s)", strings.Join(pks, ", ")))
	}

	ddl := fmt.Sprintf("CREATE TABLE \"%s\".\"%s\" (\n%s\n);", schema, table, strings.Join(colDefs, ",\n"))

	// 追加索引语句
	indexes, _ := desc["indexes"].([]PgIndex)
	for _, idx := range indexes {
		if !idx.IsPrimary && idx.Def != "" {
			ddl += fmt.Sprintf("\n%s;", idx.Def)
		}
	}

	return ddl, nil
}

// ===================== CRUD 与分页查询 =====================

// PostgresSelect 执行带分页、排序与过滤的数据表查询。
func (m *PostgresManager) PostgresSelect(serverID, dbName, schema, table string, limit, offset int, sortCol, sortOrder, whereClause string) (PostgresQueryResult, error) {
	start := time.Now()
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return PostgresQueryResult{}, err
	}
	if schema == "" {
		schema = "public"
	}
	if limit <= 0 {
		limit = 100
	}
	if limit > 2000 {
		limit = 2000
	}
	if offset < 0 {
		offset = 0
	}

	sql := fmt.Sprintf("SELECT * FROM \"%s\".\"%s\"", schema, table)
	if strings.TrimSpace(whereClause) != "" {
		sql += fmt.Sprintf(" WHERE %s", whereClause)
	}
	if strings.TrimSpace(sortCol) != "" {
		order := "ASC"
		if strings.ToUpper(sortOrder) == "DESC" {
			order = "DESC"
		}
		sql += fmt.Sprintf(" ORDER BY \"%s\" %s", sortCol, order)
	}
	sql += fmt.Sprintf(" LIMIT %d OFFSET %d", limit, offset)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	rows, err := pool.Query(ctx, sql)
	if err != nil {
		return PostgresQueryResult{DurationMs: time.Since(start).Milliseconds(), Error: err.Error()}, err
	}
	defer rows.Close()

	fieldDescs := rows.FieldDescriptions()
	columns := make([]string, len(fieldDescs))
	columnTypes := make([]string, len(fieldDescs))
	for i, fd := range fieldDescs {
		columns[i] = fd.Name
		columnTypes[i] = fmt.Sprintf("oid:%d", fd.DataTypeOID)
	}

	var rowData []map[string]any
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			continue
		}
		rowMap := make(map[string]any, len(columns))
		for i, col := range columns {
			rowMap[col] = normalizePgVal(values[i])
		}
		rowData = append(rowData, rowMap)
	}

	return PostgresQueryResult{
		Columns:     columns,
		ColumnTypes: columnTypes,
		Rows:        rowData,
		Affected:    int64(len(rowData)),
		DurationMs:  time.Since(start).Milliseconds(),
	}, nil
}

// PostgresCount 获取指定表在过滤条件下的记录总数。
func (m *PostgresManager) PostgresCount(serverID, dbName, schema, table, whereClause string) (int64, error) {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return 0, err
	}
	if schema == "" {
		schema = "public"
	}

	sql := fmt.Sprintf("SELECT count(1) FROM \"%s\".\"%s\"", schema, table)
	if strings.TrimSpace(whereClause) != "" {
		sql += fmt.Sprintf(" WHERE %s", whereClause)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	var count int64
	err = pool.QueryRow(ctx, sql).Scan(&count)
	return count, err
}

// PostgresInsert 向指定表插入一行新记录。
func (m *PostgresManager) PostgresInsert(serverID, dbName, schema, table string, columns []string, values []any) (int64, error) {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return 0, err
	}
	if schema == "" {
		schema = "public"
	}

	quotedCols := make([]string, len(columns))
	placeholders := make([]string, len(columns))
	for i, c := range columns {
		quotedCols[i] = fmt.Sprintf("\"%s\"", c)
		placeholders[i] = fmt.Sprintf("$%d", i+1)
	}

	sql := fmt.Sprintf("INSERT INTO \"%s\".\"%s\" (%s) VALUES (%s)",
		schema, table, strings.Join(quotedCols, ", "), strings.Join(placeholders, ", "))

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tag, err := pool.Exec(ctx, sql, values...)
	if err != nil {
		return 0, fmt.Errorf("插入数据失败: %w", err)
	}
	return tag.RowsAffected(), nil
}

// PostgresUpdate 根据主键定位更新单行或多行记录。
func (m *PostgresManager) PostgresUpdate(serverID, dbName, schema, table string, setCols []string, setVals []any, whereCols []string, whereVals []any) (int64, error) {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return 0, err
	}
	if schema == "" {
		schema = "public"
	}

	var setClauses []string
	var args []any
	argIdx := 1

	for i, c := range setCols {
		setClauses = append(setClauses, fmt.Sprintf("\"%s\" = $%d", c, argIdx))
		args = append(args, setVals[i])
		argIdx++
	}

	var whereClauses []string
	for i, c := range whereCols {
		if whereVals[i] == nil {
			whereClauses = append(whereClauses, fmt.Sprintf("\"%s\" IS NULL", c))
		} else {
			whereClauses = append(whereClauses, fmt.Sprintf("\"%s\" = $%d", c, argIdx))
			args = append(args, whereVals[i])
			argIdx++
		}
	}

	sql := fmt.Sprintf("UPDATE \"%s\".\"%s\" SET %s WHERE %s",
		schema, table, strings.Join(setClauses, ", "), strings.Join(whereClauses, " AND "))

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tag, err := pool.Exec(ctx, sql, args...)
	if err != nil {
		return 0, fmt.Errorf("更新数据失败: %w", err)
	}
	return tag.RowsAffected(), nil
}

// PostgresDelete 根据主键定位删除记录。
func (m *PostgresManager) PostgresDelete(serverID, dbName, schema, table string, whereCols []string, whereVals []any) (int64, error) {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return 0, err
	}
	if schema == "" {
		schema = "public"
	}

	var whereClauses []string
	var args []any
	argIdx := 1

	for i, c := range whereCols {
		if whereVals[i] == nil {
			whereClauses = append(whereClauses, fmt.Sprintf("\"%s\" IS NULL", c))
		} else {
			whereClauses = append(whereClauses, fmt.Sprintf("\"%s\" = $%d", c, argIdx))
			args = append(args, whereVals[i])
			argIdx++
		}
	}

	sql := fmt.Sprintf("DELETE FROM \"%s\".\"%s\" WHERE %s",
		schema, table, strings.Join(whereClauses, " AND "))

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	tag, err := pool.Exec(ctx, sql, args...)
	if err != nil {
		return 0, fmt.Errorf("删除数据失败: %w", err)
	}
	return tag.RowsAffected(), nil
}

// ===================== 自定义 SQL 执行与 EXPLAIN =====================

// isPgReadQuery 判断是否为查询类语句。
func isPgReadQuery(sql string) bool {
	upper := strings.ToUpper(strings.TrimSpace(sql))
	prefixes := []string{"SELECT", "SHOW", "EXPLAIN", "WITH", "TABLE", "VALUES"}
	for _, p := range prefixes {
		if strings.HasPrefix(upper, p) {
			return true
		}
	}
	return false
}

// PostgresRun 执行自定义 SQL 语句。
func (m *PostgresManager) PostgresRun(serverID, dbName, sqlText string) (PostgresQueryResult, error) {
	start := time.Now()
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return PostgresQueryResult{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	trimmed := strings.TrimSpace(sqlText)
	if isPgReadQuery(trimmed) {
		rows, err := pool.Query(ctx, trimmed)
		if err != nil {
			return PostgresQueryResult{DurationMs: time.Since(start).Milliseconds(), Error: err.Error()}, err
		}
		defer rows.Close()

		fieldDescs := rows.FieldDescriptions()
		columns := make([]string, len(fieldDescs))
		for i, fd := range fieldDescs {
			columns[i] = fd.Name
		}

		var rowData []map[string]any
		for rows.Next() {
			values, err := rows.Values()
			if err != nil {
				continue
			}
			rowMap := make(map[string]any, len(columns))
			for i, col := range columns {
				rowMap[col] = normalizePgVal(values[i])
			}
			rowData = append(rowData, rowMap)
		}

		return PostgresQueryResult{
			Columns:    columns,
			Rows:       rowData,
			Affected:   int64(len(rowData)),
			DurationMs: time.Since(start).Milliseconds(),
		}, nil
	}

	// 写操作 / DDL
	tag, err := pool.Exec(ctx, trimmed)
	if err != nil {
		return PostgresQueryResult{DurationMs: time.Since(start).Milliseconds(), Error: err.Error()}, err
	}

	return PostgresQueryResult{
		Affected:   tag.RowsAffected(),
		DurationMs: time.Since(start).Milliseconds(),
	}, nil
}

// PostgresExplain 执行 EXPLAIN ANALYZE 并返回格式化执行计划。
func (m *PostgresManager) PostgresExplain(serverID, dbName, sqlText string, analyze, buffers, verbose bool) (string, error) {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return "", err
	}

	var opts []string
	opts = append(opts, "FORMAT JSON")
	if analyze {
		opts = append(opts, "ANALYZE true")
	}
	if buffers {
		opts = append(opts, "BUFFERS true")
	}
	if verbose {
		opts = append(opts, "VERBOSE true")
	}

	explainSql := fmt.Sprintf("EXPLAIN (%s) %s", strings.Join(opts, ", "), sqlText)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var jsonStr string
	err = pool.QueryRow(ctx, explainSql).Scan(&jsonStr)
	if err != nil {
		return "", fmt.Errorf("执行 EXPLAIN 失败: %w", err)
	}
	return jsonStr, nil
}

// ===================== 会话管理与监控 =====================

// PostgresSessions 查询当前数据库活跃会话 (pg_stat_activity)。
func (m *PostgresManager) PostgresSessions(serverID, dbName string) ([]PgSession, error) {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := `
		SELECT 
			pid,
			COALESCE(usename, '') AS user,
			COALESCE(datname, '') AS database,
			COALESCE(client_addr::text, 'local') AS client_addr,
			COALESCE(client_port, 0) AS client_port,
			COALESCE(backend_start::text, '') AS backend_start,
			COALESCE(query_start::text, '') AS query_start,
			COALESCE(state_change::text, '') AS state_change,
			COALESCE(wait_event_type, '') AS wait_event_type,
			COALESCE(wait_event, '') AS wait_event,
			COALESCE(state, 'unknown') AS state,
			COALESCE(query, '') AS query,
			COALESCE(EXTRACT(EPOCH FROM (now() - query_start))::bigint, 0) AS duration_sec
		FROM pg_stat_activity
		ORDER BY 
			CASE WHEN state = 'active' THEN 0 ELSE 1 END,
			query_start DESC NULLS LAST;
	`

	rows, err := pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("获取会话列表失败: %w", err)
	}
	defer rows.Close()

	var result []PgSession
	for rows.Next() {
		var s PgSession
		if err := rows.Scan(&s.Pid, &s.User, &s.Database, &s.ClientAddr, &s.ClientPort,
			&s.BackendStart, &s.QueryStart, &s.StateChange, &s.WaitEventType, &s.WaitEvent,
			&s.State, &s.Query, &s.DurationSec); err != nil {
			continue
		}
		result = append(result, s)
	}
	return result, nil
}

// PostgresKillSession 终止或取消指定会话。
func (m *PostgresManager) PostgresKillSession(serverID, dbName string, pid int, terminate bool) (bool, error) {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return false, err
	}

	funcName := "pg_cancel_backend"
	if terminate {
		funcName = "pg_terminate_backend"
	}

	sql := fmt.Sprintf("SELECT %s($1)", funcName)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var ok bool
	err = pool.QueryRow(ctx, sql, pid).Scan(&ok)
	if err != nil {
		return false, fmt.Errorf("终止会话失败: %w", err)
	}
	return ok, nil
}

// PostgresStatus 获取 PostgreSQL 运行状态指标。
func (m *PostgresManager) PostgresStatus(serverID, dbName string) (PgStatus, error) {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return PgStatus{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var st PgStatus

	// 1. 版本与运行时间
	_ = pool.QueryRow(ctx, "SELECT version()").Scan(&st.Version)
	
	var uptimeSec int64
	errUptime := pool.QueryRow(ctx, "SELECT COALESCE(EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time()))::bigint, 0)").Scan(&uptimeSec)
	if errUptime == nil && uptimeSec > 0 {
		d := uptimeSec / 86400
		h := (uptimeSec % 86400) / 3600
		m := (uptimeSec % 3600) / 60
		s := uptimeSec % 60
		if d > 0 {
			st.Uptime = fmt.Sprintf("%d天 %d小时 %d分", d, h, m)
		} else if h > 0 {
			st.Uptime = fmt.Sprintf("%d小时 %d分 %d秒", h, m, s)
		} else {
			st.Uptime = fmt.Sprintf("%d分 %d秒", m, s)
		}
	}
	if st.Uptime == "" {
		_ = pool.QueryRow(ctx, "SELECT COALESCE(date_trunc('second', now() - pg_postmaster_start_time())::text, '-')").Scan(&st.Uptime)
	}

	// 2. 连接数
	_ = pool.QueryRow(ctx, "SELECT count(1) FROM pg_stat_activity").Scan(&st.ActiveConnections)
	_ = pool.QueryRow(ctx, "SELECT current_setting('max_connections')::int").Scan(&st.MaxConnections)

	// 3. 数据库大小
	_ = pool.QueryRow(ctx, "SELECT pg_size_pretty(pg_database_size(current_database()))").Scan(&st.DatabaseSize)

	// 4. 缓存命中率
	hitRatioQuery := `
		SELECT 
			COALESCE(
				ROUND(
					(sum(heap_blks_hit) * 100.0 / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0)), 2
				)::text || '%',
				'100%'
			)
		FROM pg_statio_user_tables;
	`
	_ = pool.QueryRow(ctx, hitRatioQuery).Scan(&st.CacheHitRatio)
	if st.CacheHitRatio == "" {
		st.CacheHitRatio = "100%"
	}

	// 5. 死锁数与临时文件
	deadlocksQuery := "SELECT COALESCE(deadlocks, 0), COALESCE(temp_files, 0), pg_size_pretty(COALESCE(temp_bytes, 0)) FROM pg_stat_database WHERE datname = current_database();"
	_ = pool.QueryRow(ctx, deadlocksQuery).Scan(&st.Deadlocks, &st.TempFiles, &st.TempBytes)

	return st, nil
}

// ===================== 角色与用户管理 =====================

// PostgresRoles 获取数据库角色列表。
func (m *PostgresManager) PostgresRoles(serverID string) ([]PgRole, error) {
	pool, err := m.GetPool(serverID, "postgres")
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := `
		SELECT 
			r.rolname,
			r.rolsuper,
			r.rolinherit,
			r.rolcreaterole,
			r.rolcreatedb,
			r.rolcanlogin,
			r.rolreplication,
			r.rolconnlimit,
			COALESCE(r.rolvaliduntil::text, 'infinity') AS valuntil,
			ARRAY(SELECT b.rolname FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles b ON (m.roleid = b.oid) WHERE m.member = r.oid)::text AS member_of
		FROM pg_catalog.pg_roles r
		ORDER BY r.rolname ASC;
	`

	rows, err := pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("获取角色列表失败: %w", err)
	}
	defer rows.Close()

	var result []PgRole
	for rows.Next() {
		var r PgRole
		if err := rows.Scan(&r.Name, &r.Super, &r.Inherit, &r.CreateRole, &r.CreateDB,
			&r.CanLogin, &r.Replication, &r.ConnLimit, &r.ValidUntil, &r.MemberOf); err != nil {
			continue
		}
		result = append(result, r)
	}
	return result, nil
}

// PostgresCreateRole 创建新角色。
func (m *PostgresManager) PostgresCreateRole(serverID, roleName, password string, super, canLogin, createDB, createRole bool, connLimit int) error {
	pool, err := m.GetPool(serverID, "postgres")
	if err != nil {
		return err
	}

	var opts []string
	if canLogin {
		opts = append(opts, "LOGIN")
	} else {
		opts = append(opts, "NOLOGIN")
	}
	if super {
		opts = append(opts, "SUPERUSER")
	} else {
		opts = append(opts, "NOSUPERUSER")
	}
	if createDB {
		opts = append(opts, "CREATEDB")
	} else {
		opts = append(opts, "NOCREATEDB")
	}
	if createRole {
		opts = append(opts, "CREATEROLE")
	} else {
		opts = append(opts, "NOCREATEROLE")
	}
	if connLimit > 0 {
		opts = append(opts, fmt.Sprintf("CONNECTION LIMIT %d", connLimit))
	}
	if strings.TrimSpace(password) != "" {
		escapedPass := strings.ReplaceAll(password, "'", "''")
		opts = append(opts, fmt.Sprintf("PASSWORD '%s'", escapedPass))
	}

	sql := fmt.Sprintf("CREATE ROLE \"%s\" WITH %s", roleName, strings.Join(opts, " "))

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err = pool.Exec(ctx, sql)
	return err
}

// PostgresUpdateRolePassword 修改角色密码。
func (m *PostgresManager) PostgresUpdateRolePassword(serverID, roleName, newPassword string) error {
	pool, err := m.GetPool(serverID, "postgres")
	if err != nil {
		return err
	}

	escapedPass := strings.ReplaceAll(newPassword, "'", "''")
	sql := fmt.Sprintf("ALTER ROLE \"%s\" WITH PASSWORD '%s'", roleName, escapedPass)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err = pool.Exec(ctx, sql)
	return err
}

// PostgresDropRole 删除角色。
func (m *PostgresManager) PostgresDropRole(serverID, roleName string) error {
	pool, err := m.GetPool(serverID, "postgres")
	if err != nil {
		return err
	}

	sql := fmt.Sprintf("DROP ROLE \"%s\"", roleName)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err = pool.Exec(ctx, sql)
	return err
}

// PostgresGrantPrivileges 授予或撤销权限。
func (m *PostgresManager) PostgresGrantPrivileges(serverID, dbName, roleName, schema, table, privileges string, isGrant bool) error {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return err
	}
	if schema == "" {
		schema = "public"
	}

	verb := "GRANT"
	toFrom := "TO"
	if !isGrant {
		verb = "REVOKE"
		toFrom = "FROM"
	}

	var target string
	if table != "" {
		target = fmt.Sprintf("ON \"%s\".\"%s\"", schema, table)
	} else {
		target = fmt.Sprintf("ON SCHEMA \"%s\"", schema)
	}

	sql := fmt.Sprintf("%s %s %s %s \"%s\"", verb, privileges, target, toFrom, roleName)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err = pool.Exec(ctx, sql)
	return err
}

// ===================== DDL 管理操作 =====================

// PostgresCreateDatabase 创建数据库。
func (m *PostgresManager) PostgresCreateDatabase(serverID, name, owner, encoding, template string) error {
	pool, err := m.GetPool(serverID, "postgres")
	if err != nil {
		return err
	}

	sql := fmt.Sprintf("CREATE DATABASE \"%s\"", name)
	var opts []string
	if owner != "" {
		opts = append(opts, fmt.Sprintf("OWNER = \"%s\"", owner))
	}
	if encoding != "" {
		opts = append(opts, fmt.Sprintf("ENCODING = '%s'", encoding))
	}
	if template != "" {
		opts = append(opts, fmt.Sprintf("TEMPLATE = \"%s\"", template))
	}
	if len(opts) > 0 {
		sql += " WITH " + strings.Join(opts, " ")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	_, err = pool.Exec(ctx, sql)
	return err
}

// PostgresDropDatabase 删除数据库。
func (m *PostgresManager) PostgresDropDatabase(serverID, name string) error {
	pool, err := m.GetPool(serverID, "postgres")
	if err != nil {
		return err
	}

	sql := fmt.Sprintf("DROP DATABASE \"%s\"", name)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	_, err = pool.Exec(ctx, sql)
	return err
}

// PostgresCreateSchema 创建 Schema。
func (m *PostgresManager) PostgresCreateSchema(serverID, dbName, schema, owner string) error {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return err
	}

	sql := fmt.Sprintf("CREATE SCHEMA \"%s\"", schema)
	if owner != "" {
		sql += fmt.Sprintf(" AUTHORIZATION \"%s\"", owner)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err = pool.Exec(ctx, sql)
	return err
}

// PostgresDropSchema 删除 Schema。
func (m *PostgresManager) PostgresDropSchema(serverID, dbName, schema string, cascade bool) error {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return err
	}

	sql := fmt.Sprintf("DROP SCHEMA \"%s\"", schema)
	if cascade {
		sql += " CASCADE"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_, err = pool.Exec(ctx, sql)
	return err
}

// PostgresCreateTable 创建数据表。
func (m *PostgresManager) PostgresCreateTable(serverID, dbName, schema, table, defs string) error {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return err
	}
	if schema == "" {
		schema = "public"
	}

	sql := fmt.Sprintf("CREATE TABLE \"%s\".\"%s\" (\n%s\n);", schema, table, defs)

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_, err = pool.Exec(ctx, sql)
	return err
}

// PostgresDropTable 删除数据表。
func (m *PostgresManager) PostgresDropTable(serverID, dbName, schema, table string, cascade bool) error {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return err
	}
	if schema == "" {
		schema = "public"
	}

	sql := fmt.Sprintf("DROP TABLE \"%s\".\"%s\"", schema, table)
	if cascade {
		sql += " CASCADE"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_, err = pool.Exec(ctx, sql)
	return err
}

// PostgresTruncateTable 清空数据表。
func (m *PostgresManager) PostgresTruncateTable(serverID, dbName, schema, table string, restartIdentity, cascade bool) error {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return err
	}
	if schema == "" {
		schema = "public"
	}

	sql := fmt.Sprintf("TRUNCATE TABLE \"%s\".\"%s\"", schema, table)
	if restartIdentity {
		sql += " RESTART IDENTITY"
	}
	if cascade {
		sql += " CASCADE"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_, err = pool.Exec(ctx, sql)
	return err
}

// ===================== 数据流式导出与导入 =====================

// PostgresExport 导出为 CSV 或 JSON 格式文本。
func (m *PostgresManager) PostgresExport(serverID, dbName, schema, mode, source, table, sqlText string, limit int) (string, error) {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return "", err
	}
	if schema == "" {
		schema = "public"
	}

	query := sqlText
	if source == "table" {
		query = fmt.Sprintf("SELECT * FROM \"%s\".\"%s\"", schema, table)
		if limit > 0 {
			query += fmt.Sprintf(" LIMIT %d", limit)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	rows, err := pool.Query(ctx, query)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	fieldDescs := rows.FieldDescriptions()
	columns := make([]string, len(fieldDescs))
	for i, fd := range fieldDescs {
		columns[i] = fd.Name
	}

	if mode == "json" {
		var list []map[string]any
		for rows.Next() {
			vals, err := rows.Values()
			if err != nil {
				continue
			}
			rowMap := make(map[string]any, len(columns))
			for i, col := range columns {
				rowMap[col] = normalizePgVal(vals[i])
			}
			list = append(list, rowMap)
		}
		bytes, err := json.MarshalIndent(list, "", "  ")
		return string(bytes), err
	}

	// CSV 模式
	var sb strings.Builder
	w := csv.NewWriter(&sb)
	_ = w.Write(columns)

	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			continue
		}
		record := make([]string, len(columns))
		for i, v := range vals {
			if v == nil {
				record[i] = ""
			} else {
				record[i] = fmt.Sprintf("%v", normalizePgVal(v))
			}
		}
		_ = w.Write(record)
	}
	w.Flush()
	return sb.String(), nil
}

// PostgresImport 导入数据。
func (m *PostgresManager) PostgresImport(serverID, dbName, schema, mode, table, content string) (string, error) {
	pool, err := m.GetPool(serverID, dbName)
	if err != nil {
		return "", err
	}
	if schema == "" {
		schema = "public"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	if mode == "sql" {
		tag, err := pool.Exec(ctx, content)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("SQL 执行成功，影响行数: %d", tag.RowsAffected()), nil
	}

	if mode == "csv" {
		r := csv.NewReader(strings.NewReader(content))
		headers, err := r.Read()
		if err != nil {
			return "", fmt.Errorf("解析 CSV 表头失败: %w", err)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return "", err
		}
		defer tx.Rollback(ctx)

		count := 0
		for {
			record, err := r.Read()
			if err == io.EOF {
				break
			}
			if err != nil {
				continue
			}

			var anyVals []any
			for _, val := range record {
				if val == "" {
					anyVals = append(anyVals, nil)
				} else {
					anyVals = append(anyVals, val)
				}
			}

			quotedCols := make([]string, len(headers))
			placeholders := make([]string, len(headers))
			for i, h := range headers {
				quotedCols[i] = fmt.Sprintf("\"%s\"", h)
				placeholders[i] = fmt.Sprintf("$%d", i+1)
			}

			insertSql := fmt.Sprintf("INSERT INTO \"%s\".\"%s\" (%s) VALUES (%s)",
				schema, table, strings.Join(quotedCols, ", "), strings.Join(placeholders, ", "))

			_, err = tx.Exec(ctx, insertSql, anyVals...)
			if err != nil {
				return "", fmt.Errorf("第 %d 行插入失败: %w", count+1, err)
			}
			count++
		}

		if err := tx.Commit(ctx); err != nil {
			return "", err
		}
		return fmt.Sprintf("CSV 导入成功，共写入 %d 条记录", count), nil
	}

	return "", fmt.Errorf("不支持的导入模式: %s", mode)
}

// PostgresExportToFile 弹出文件保存对话框并导出为文件。
func (m *PostgresManager) PostgresExportToFile(serverID, dbName, schema, mode, source, table, sqlText string, limit int) (string, error) {
	content, err := m.PostgresExport(serverID, dbName, schema, mode, source, table, sqlText, limit)
	if err != nil {
		return "", err
	}

	ext := ".csv"
	if mode == "json" {
		ext = ".json"
	}
	defaultName := fmt.Sprintf("%s_%s_%s%s", dbName, schema, table, ext)
	if source != "table" {
		defaultName = fmt.Sprintf("%s_query_export%s", dbName, ext)
	}

	path, err := core.SaveFileDialog("保存导出文件", defaultName)
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

// PostgresImportFromFile 弹出文件选择对话框并导入 CSV/SQL 文件。
func (m *PostgresManager) PostgresImportFromFile(serverID, dbName, schema, mode, table string) (string, error) {
	path, err := core.OpenFileDialog("选择要导入的文件")
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
	case "csv", "sql":
		return m.PostgresImport(serverID, dbName, schema, mode, table, string(data))
	default:
		return "", errors.New("不支持的导入格式: " + mode)
	}
}
