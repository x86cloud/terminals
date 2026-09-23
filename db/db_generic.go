package db

import (
	"context"
	"database/sql"
)

// QuerySingleColumn 直接将 SQL 查询的第一列强类型扫描并装配为切片 []T，避免中间 map 分配与动态类型断言。
func QuerySingleColumn[T any](ctx context.Context, db *sql.DB, query string, args ...any) ([]T, error) {
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []T
	for rows.Next() {
		var val T
		if err := rows.Scan(&val); err != nil {
			return nil, err
		}
		result = append(result, val)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if result == nil {
		return []T{}, nil
	}
	return result, nil
}

// QueryScalar 查询单行第一列的标量值（如 COUNT、VERSION、配置项等），直接返回强类型 T。
func QueryScalar[T any](ctx context.Context, db *sql.DB, query string, args ...any) (T, error) {
	var val T
	err := db.QueryRowContext(ctx, query, args...).Scan(&val)
	if err != nil {
		var zero T
		return zero, err
	}
	return val, nil
}
