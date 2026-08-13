package db

import (
	"fmt"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

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

// MysqlQueryResult 表示单次 SQL 执行的统一输出。
type MysqlQueryResult struct {
	Columns  []string         `json:"columns"`
	Rows     []map[string]any `json:"rows"`
	Affected int64            `json:"affected"`
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
