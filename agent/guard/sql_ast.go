package guard

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/xwb1989/sqlparser"
)

// SQLAuditResult 包含 AST 解析出的详细语义特征与审计结果
type SQLAuditResult struct {
	Level        PermissionLevel
	Reason       string
	Tables       []string
	StmtTypes    []string
	IsReadOnly   bool
	HasTautology bool
}

// AuditSQLAST 基于 AST 抽象语法树对输入的 SQL 执行深度安全与越权审计
func AuditSQLAST(ctx context.Context, input string, blockHighRisk bool) (PermissionLevel, string) {
	clean := strings.TrimSpace(input)
	if clean == "" {
		return LevelAllow, ""
	}

	var obj struct {
		SQL string `json:"sql"`
	}
	sqlText := clean
	if err := json.Unmarshal([]byte(clean), &obj); err == nil && obj.SQL != "" {
		sqlText = obj.SQL
	}
	cleanSQL := strings.TrimSpace(sqlText)
	if cleanSQL == "" {
		return LevelAllow, ""
	}

	res := auditSQLText(cleanSQL, blockHighRisk)
	return res.Level, res.Reason
}

func auditSQLText(sqlText string, blockHighRisk bool) SQLAuditResult {
	// 1. 处理可能的多语句堆叠（Stacked Statements）
	trimmed := strings.TrimRight(sqlText, "; \t\r\n")
	statements := splitStatements(trimmed)

	var allTables []string
	var allTypes []string
	overallLevel := LevelAllow
	var overallReason string

	for _, stmtSQL := range statements {
		stmtSQL = strings.TrimSpace(stmtSQL)
		if stmtSQL == "" {
			continue
		}

		subRes := auditSingleStatement(stmtSQL, blockHighRisk)
		allTables = append(allTables, subRes.Tables...)
		allTypes = append(allTypes, subRes.StmtTypes...)

		// 优先级: Forbidden > Confirm > Allow
		if subRes.Level == LevelForbidden {
			return subRes // 任一语句命中 Forbidden，直接阻断
		}
		if subRes.Level == LevelConfirm && overallLevel != LevelForbidden {
			overallLevel = LevelConfirm
			if overallReason == "" {
				overallReason = subRes.Reason
			} else {
				overallReason += "; " + subRes.Reason
			}
		}
	}

	if overallReason == "" && overallLevel == LevelConfirm {
		overallReason = "执行非只读 SQL 语句需人工审批确认"
	}

	return SQLAuditResult{
		Level:      overallLevel,
		Reason:     overallReason,
		Tables:     allTables,
		StmtTypes:  allTypes,
		IsReadOnly: overallLevel == LevelAllow,
	}
}

// auditSingleStatement 审计单个独立 SQL 语句
func auditSingleStatement(stmtSQL string, blockHighRisk bool) SQLAuditResult {
	upperStmt := strings.ToUpper(stmtSQL)
	if strings.Contains(upperStmt, "INTO OUTFILE") || strings.Contains(upperStmt, "INTO DUMPFILE") {
		if blockHighRisk {
			return SQLAuditResult{
				Level:  LevelForbidden,
				Reason: "禁止使用 SELECT ... INTO OUTFILE / DUMPFILE 导出或写入服务器文件",
			}
		}
		return SQLAuditResult{
			Level:  LevelConfirm,
			Reason: "检测到 SELECT ... INTO 导出文件操作，需人工审批",
		}
	}

	stmt, err := sqlparser.Parse(stmtSQL)
	if err != nil {
		// 当 SQL 语法包含特殊方言（如 SQLite PRAGMA 或 PostgreSQL 特有语法）导致 sqlparser 解析失败时，
		// 进入方言容错深度词法分析，避免漏防与误放。
		return auditNonStandardDialect(stmtSQL, blockHighRisk)
	}

	switch node := stmt.(type) {
	case *sqlparser.Select:
		// 检查是否有锁表意向 (FOR UPDATE / LOCK IN SHARE MODE)
		if node.Lock != "" {
			return SQLAuditResult{
				Level:     LevelConfirm,
				Reason:    fmt.Sprintf("SELECT 查询包含行锁锁定语句 (%s)，需人工审批", node.Lock),
				StmtTypes: []string{"SELECT_FOR_UPDATE"},
			}
		}
		return SQLAuditResult{
			Level:      LevelAllow,
			StmtTypes:  []string{"SELECT"},
			IsReadOnly: true,
		}

	case *sqlparser.ParenSelect:
		return SQLAuditResult{
			Level:      LevelAllow,
			StmtTypes:  []string{"SELECT"},
			IsReadOnly: true,
		}

	case *sqlparser.Union:
		return SQLAuditResult{
			Level:      LevelAllow,
			StmtTypes:  []string{"UNION"},
			IsReadOnly: true,
		}

	case *sqlparser.Show:
		return SQLAuditResult{
			Level:      LevelAllow,
			StmtTypes:  []string{"SHOW"},
			IsReadOnly: true,
		}

	case *sqlparser.OtherRead:
		// DESCRIBE, EXPLAIN 等
		return SQLAuditResult{
			Level:      LevelAllow,
			StmtTypes:  []string{"EXPLAIN/DESCRIBE"},
			IsReadOnly: true,
		}

	case *sqlparser.DDL:
		action := strings.ToLower(node.Action)
		tableName := node.Table.Name.String()
		if action == "drop" || action == "truncate" {
			if blockHighRisk {
				return SQLAuditResult{
					Level:     LevelForbidden,
					Reason:    fmt.Sprintf("禁止执行不可逆破坏性 DDL 语句: %s 表 [%s]", strings.ToUpper(action), tableName),
					Tables:    []string{tableName},
					StmtTypes: []string{strings.ToUpper(action)},
				}
			}
			return SQLAuditResult{
				Level:     LevelConfirm,
				Reason:    fmt.Sprintf("检测到不可逆破坏性 DDL 语句 (%s %s)，需人工审批", strings.ToUpper(action), tableName),
				Tables:    []string{tableName},
				StmtTypes: []string{strings.ToUpper(action)},
			}
		}
		return SQLAuditResult{
			Level:     LevelConfirm,
			Reason:    fmt.Sprintf("执行结构定义变更 DDL 语句 (%s %s) 需人工审批", strings.ToUpper(action), tableName),
			Tables:    []string{tableName},
			StmtTypes: []string{strings.ToUpper(action)},
		}

	case *sqlparser.DBDDL:
		action := strings.ToLower(node.Action)
		dbName := node.DBName
		if action == "drop" {
			if blockHighRisk {
				return SQLAuditResult{
					Level:     LevelForbidden,
					Reason:    fmt.Sprintf("禁止执行不可逆破坏性 DDL 语句: DROP DATABASE [%s]", dbName),
					StmtTypes: []string{"DROP_DATABASE"},
				}
			}
			return SQLAuditResult{
				Level:     LevelConfirm,
				Reason:    fmt.Sprintf("检测到删除数据库操作 (DROP DATABASE %s)，需人工审批", dbName),
				StmtTypes: []string{"DROP_DATABASE"},
			}
		}
		return SQLAuditResult{
			Level:     LevelConfirm,
			Reason:    fmt.Sprintf("执行数据库级 DDL (%s %s) 需人工审批", strings.ToUpper(action), dbName),
			StmtTypes: []string{strings.ToUpper(action)},
		}

	case *sqlparser.Delete:
		var tables []string
		for _, te := range node.TableExprs {
			if aliased, ok := te.(*sqlparser.AliasedTableExpr); ok {
				if tab, ok := aliased.Expr.(sqlparser.TableName); ok {
					tables = append(tables, tab.Name.String())
				}
			}
		}
		tabStr := strings.Join(tables, ", ")
		if tabStr == "" {
			tabStr = "目标表"
		}

		// 核心拦截：无 WHERE 条件或恒真条件（WHERE 1=1）的全表删除
		if node.Where == nil {
			if blockHighRisk {
				return SQLAuditResult{
					Level:     LevelForbidden,
					Reason:    fmt.Sprintf("禁止执行无 WHERE 过滤条件的全表 DELETE 误操作 [目标: %s]", tabStr),
					Tables:    tables,
					StmtTypes: []string{"DELETE_WITHOUT_WHERE"},
				}
			}
			return SQLAuditResult{
				Level:     LevelConfirm,
				Reason:    fmt.Sprintf("警告: 正在执行无 WHERE 条件的全表清空 [目标: %s]，需人工严格审批", tabStr),
				Tables:    tables,
				StmtTypes: []string{"DELETE_WITHOUT_WHERE"},
			}
		}

		if isTautology(node.Where.Expr) {
			if blockHighRisk {
				return SQLAuditResult{
					Level:        LevelForbidden,
					Reason:       fmt.Sprintf("禁止执行使用恒真条件 (如 WHERE 1=1) 绕过的全表 DELETE 破坏操作 [目标: %s]", tabStr),
					Tables:       tables,
					StmtTypes:    []string{"DELETE_TAUTOLOGY"},
					HasTautology: true,
				}
			}
			return SQLAuditResult{
				Level:        LevelConfirm,
				Reason:       fmt.Sprintf("警告: DELETE 条件为恒真表达式 [目标: %s]，将导致全表删除，需人工严格审批", tabStr),
				Tables:       tables,
				StmtTypes:    []string{"DELETE_TAUTOLOGY"},
				HasTautology: true,
			}
		}

		return SQLAuditResult{
			Level:     LevelConfirm,
			Reason:    fmt.Sprintf("执行表 [%s] 数据删除操作需人工审批确认", tabStr),
			Tables:    tables,
			StmtTypes: []string{"DELETE"},
		}

	case *sqlparser.Update:
		var tables []string
		for _, te := range node.TableExprs {
			if aliased, ok := te.(*sqlparser.AliasedTableExpr); ok {
				if tab, ok := aliased.Expr.(sqlparser.TableName); ok {
					tables = append(tables, tab.Name.String())
				}
			}
		}
		tabStr := strings.Join(tables, ", ")
		if tabStr == "" {
			tabStr = "目标表"
		}

		// 核心拦截：无 WHERE 条件或恒真条件的全表更新
		if node.Where == nil {
			if blockHighRisk {
				return SQLAuditResult{
					Level:     LevelForbidden,
					Reason:    fmt.Sprintf("禁止执行无 WHERE 过滤条件的全表 UPDATE 误操作 [目标: %s]", tabStr),
					Tables:    tables,
					StmtTypes: []string{"UPDATE_WITHOUT_WHERE"},
				}
			}
			return SQLAuditResult{
				Level:     LevelConfirm,
				Reason:    fmt.Sprintf("警告: 正在执行无 WHERE 条件的全表修改 [目标: %s]，需人工严格审批", tabStr),
				Tables:    tables,
				StmtTypes: []string{"UPDATE_WITHOUT_WHERE"},
			}
		}

		if isTautology(node.Where.Expr) {
			if blockHighRisk {
				return SQLAuditResult{
					Level:        LevelForbidden,
					Reason:       fmt.Sprintf("禁止执行使用恒真条件 (如 WHERE 1=1) 绕过的全表 UPDATE 批量修改 [目标: %s]", tabStr),
					Tables:       tables,
					StmtTypes:    []string{"UPDATE_TAUTOLOGY"},
					HasTautology: true,
				}
			}
			return SQLAuditResult{
				Level:        LevelConfirm,
				Reason:       fmt.Sprintf("警告: UPDATE 条件为恒真表达式 [目标: %s]，将修改全表所有记录，需人工严格审批", tabStr),
				Tables:       tables,
				StmtTypes:    []string{"UPDATE_TAUTOLOGY"},
				HasTautology: true,
			}
		}

		return SQLAuditResult{
			Level:     LevelConfirm,
			Reason:    fmt.Sprintf("执行表 [%s] 数据更新操作需人工审批确认", tabStr),
			Tables:    tables,
			StmtTypes: []string{"UPDATE"},
		}

	case *sqlparser.Insert:
		tableName := node.Table.Name.String()
		return SQLAuditResult{
			Level:     LevelConfirm,
			Reason:    fmt.Sprintf("执行表 [%s] 数据插入 (INSERT) 操作需人工审批确认", tableName),
			Tables:    []string{tableName},
			StmtTypes: []string{"INSERT"},
		}

	case *sqlparser.OtherAdmin:
		adminSQL := strings.ToUpper(stmtSQL)
		if blockHighRisk {
			for _, kw := range []string{"SHUTDOWN", "RESET MASTER", "RESET SLAVE", "KILL"} {
				if strings.Contains(adminSQL, kw) {
					return SQLAuditResult{
						Level:     LevelForbidden,
						Reason:    fmt.Sprintf("禁止执行数据库高危管理维护指令 (%s)", kw),
						StmtTypes: []string{"ADMIN_COMMAND"},
					}
				}
			}
		}
		return SQLAuditResult{
			Level:     LevelConfirm,
			Reason:    "执行数据库管理指令需人工审批确认",
			StmtTypes: []string{"ADMIN_COMMAND"},
		}
	}

	upper := strings.ToUpper(strings.TrimSpace(stmtSQL))
	if strings.HasPrefix(upper, "USE ") || strings.HasPrefix(upper, "SET ") || upper == "BEGIN" || upper == "COMMIT" || upper == "ROLLBACK" {
		return SQLAuditResult{
			Level:      LevelAllow,
			StmtTypes:  []string{"SESSION_TX"},
			IsReadOnly: true,
		}
	}

	return SQLAuditResult{
		Level:     LevelConfirm,
		Reason:    "执行该 SQL 语句可能对数据库状态造成变更，需人工审批确认",
		StmtTypes: []string{"UNKNOWN"},
	}
}

// isTautology 判定 WHERE 条件是否为恒真表达式（如 1=1, 'a'='a', TRUE 等）
func isTautology(expr sqlparser.Expr) bool {
	if expr == nil {
		return false
	}

	switch node := expr.(type) {
	case *sqlparser.ComparisonExpr:
		if node.Operator == sqlparser.EqualStr {
			leftStr := sqlparser.String(node.Left)
			rightStr := sqlparser.String(node.Right)
			if leftStr == rightStr {
				return true
			}
			// 比较如 1 = 1 或 '1' = 1
			if (leftStr == "1" || leftStr == "'1'") && (rightStr == "1" || rightStr == "'1'") {
				return true
			}
			if (leftStr == "0" || leftStr == "'0'") && (rightStr == "0" || rightStr == "'0'") {
				return true
			}
		}
		return false

	case *sqlparser.OrExpr:
		// 如果任何一侧分支为恒真表达式，例如 `WHERE id = 5 OR 1=1`，整个条件就是恒真的！
		return isTautology(node.Left) || isTautology(node.Right)

	case *sqlparser.ParenExpr:
		return isTautology(node.Expr)

	case *sqlparser.ColName:
		name := strings.ToLower(node.Name.String())
		return name == "true"

	case *sqlparser.SQLVal:
		if node.Type == sqlparser.IntVal && string(node.Val) == "1" {
			return true
		}
		if node.Type == sqlparser.StrVal && (strings.ToLower(string(node.Val)) == "true" || string(node.Val) == "1") {
			return true
		}
		return false
	}

	return false
}

// splitStatements 安全分割可能存在的以分号分隔的多条 SQL 语句（忽略单双引号内的分号）
func splitStatements(sql string) []string {
	var statements []string
	var current strings.Builder
	inSingleQuote := false
	inDoubleQuote := false
	inBacktick := false

	chars := []rune(sql)
	length := len(chars)

	for i := 0; i < length; i++ {
		ch := chars[i]

		// 处理转义字符
		if ch == '\\' && i+1 < length {
			current.WriteRune(ch)
			i++
			current.WriteRune(chars[i])
			continue
		}

		if ch == '\'' && !inDoubleQuote && !inBacktick {
			inSingleQuote = !inSingleQuote
		} else if ch == '"' && !inSingleQuote && !inBacktick {
			inDoubleQuote = !inDoubleQuote
		} else if ch == '`' && !inSingleQuote && !inDoubleQuote {
			inBacktick = !inBacktick
		} else if ch == ';' && !inSingleQuote && !inDoubleQuote && !inBacktick {
			stmt := strings.TrimSpace(current.String())
			if stmt != "" {
				statements = append(statements, stmt)
			}
			current.Reset()
			continue
		}

		current.WriteRune(ch)
	}

	last := strings.TrimSpace(current.String())
	if last != "" {
		statements = append(statements, last)
	}

	return statements
}

// auditNonStandardDialect 用于在标准 AST 解析失败时进行降级但严密的方言语法审计
func auditNonStandardDialect(sqlText string, blockHighRisk bool) SQLAuditResult {
	upper := strings.ToUpper(strings.TrimSpace(sqlText))

	// 1. 高危破坏性 DDL 拦截
	if blockHighRisk {
		highRiskPatterns := []string{
			"DROP DATABASE",
			"DROP SCHEMA",
			"DROP TABLE",
			"TRUNCATE TABLE",
			"TRUNCATE",
			"SHUTDOWN",
			"ATTACH DATABASE",
			"DETACH DATABASE",
			"VACUUM INTO",
			"COPY ",
		}
		for _, pat := range highRiskPatterns {
			if strings.HasPrefix(upper, pat+" ") || strings.Contains(upper, " "+pat+" ") || upper == pat {
				// 特殊处理 Postgres COPY ... TO PROGRAM 高危命令执行
				if pat == "COPY " && strings.Contains(upper, "PROGRAM") {
					return SQLAuditResult{
						Level:  LevelForbidden,
						Reason: "禁止使用 PostgreSQL COPY ... PROGRAM 执行外部命令",
					}
				}
				if pat == "DROP DATABASE" || pat == "DROP SCHEMA" || pat == "DROP TABLE" || pat == "TRUNCATE" || pat == "TRUNCATE TABLE" {
					return SQLAuditResult{
						Level:  LevelForbidden,
						Reason: fmt.Sprintf("禁止执行不可逆破坏性 DDL 指令: %s", pat),
					}
				}
				if pat == "ATTACH DATABASE" || pat == "VACUUM INTO" {
					return SQLAuditResult{
						Level:  LevelForbidden,
						Reason: fmt.Sprintf("禁止执行文件重定向/挂载高危操作: %s", pat),
					}
				}
			}
		}
	}

	// 2. 只读语句放行
	readPrefixes := []string{"SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "PRAGMA", "VALUES"}
	for _, p := range readPrefixes {
		if strings.HasPrefix(upper, p+" ") || upper == p {
			// 如果包含写入关键字，不视为纯只读
			if !strings.Contains(upper, "INTO ") {
				return SQLAuditResult{
					Level:      LevelAllow,
					StmtTypes:  []string{p},
					IsReadOnly: true,
				}
			}
		}
	}

	// 3. DELETE / UPDATE 无 WHERE 检查降级
	if strings.HasPrefix(upper, "DELETE ") || strings.HasPrefix(upper, "UPDATE ") {
		hasWhere := strings.Contains(upper, " WHERE ")
		isTaut := strings.Contains(upper, "WHERE 1=1") || strings.Contains(upper, "WHERE 1 = 1") || strings.Contains(upper, "WHERE '1'='1'")
		if !hasWhere || isTaut {
			if blockHighRisk {
				return SQLAuditResult{
					Level:  LevelForbidden,
					Reason: "禁止执行无 WHERE 过滤条件或恒真条件 (WHERE 1=1) 的批量删改语句",
				}
			}
		}
		return SQLAuditResult{
			Level:  LevelConfirm,
			Reason: "检测到数据库 UPDATE/DELETE 变更操作，需人工审批确认",
		}
	}

	// 4. 其他变更语句
	writeKeywords := []string{"INSERT", "ALTER", "CREATE", "REPLACE", "GRANT", "REVOKE"}
	for _, kw := range writeKeywords {
		if strings.HasPrefix(upper, kw+" ") || strings.Contains(upper, " "+kw+" ") {
			return SQLAuditResult{
				Level:  LevelConfirm,
				Reason: fmt.Sprintf("检测到数据库写/结构变更语句 (%s)，需人工审批确认", kw),
			}
		}
	}

	return SQLAuditResult{
		Level:  LevelConfirm,
		Reason: "执行该非标准 SQL 语句具有潜在数据风险，需人工审批确认",
	}
}
