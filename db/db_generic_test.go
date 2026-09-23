package db

import (
	"context"
	"database/sql"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

func TestQuerySingleColumnAndScalar(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open in-memory sqlite: %v", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 初始化测试表
	_, err = db.ExecContext(ctx, `
		CREATE TABLE users (
			id INTEGER PRIMARY KEY,
			name TEXT,
			age INTEGER
		);
		INSERT INTO users (name, age) VALUES ('alice', 25), ('bob', 30), ('charlie', 35);
	`)
	if err != nil {
		t.Fatalf("failed to create table: %v", err)
	}

	// 测试 QuerySingleColumn[string]
	names, err := QuerySingleColumn[string](ctx, db, "SELECT name FROM users ORDER BY age ASC")
	if err != nil {
		t.Fatalf("QuerySingleColumn[string] failed: %v", err)
	}
	if len(names) != 3 || names[0] != "alice" || names[1] != "bob" || names[2] != "charlie" {
		t.Errorf("unexpected names: %v", names)
	}

	// 测试 QuerySingleColumn[int]
	ages, err := QuerySingleColumn[int](ctx, db, "SELECT age FROM users ORDER BY age DESC")
	if err != nil {
		t.Fatalf("QuerySingleColumn[int] failed: %v", err)
	}
	if len(ages) != 3 || ages[0] != 35 || ages[1] != 30 || ages[2] != 25 {
		t.Errorf("unexpected ages: %v", ages)
	}

	// 测试 QuerySingleColumn 空结果集
	empty, err := QuerySingleColumn[string](ctx, db, "SELECT name FROM users WHERE age > 100")
	if err != nil {
		t.Fatalf("QuerySingleColumn for empty failed: %v", err)
	}
	if len(empty) != 0 {
		t.Errorf("expected empty slice, got %v", empty)
	}

	// 测试 QueryScalar[int]
	count, err := QueryScalar[int](ctx, db, "SELECT count(*) FROM users")
	if err != nil {
		t.Fatalf("QueryScalar[int] failed: %v", err)
	}
	if count != 3 {
		t.Errorf("expected count 3, got %d", count)
	}

	// 测试 QueryScalar[string]
	maxName, err := QueryScalar[string](ctx, db, "SELECT name FROM users WHERE age = 35")
	if err != nil {
		t.Fatalf("QueryScalar[string] failed: %v", err)
	}
	if maxName != "charlie" {
		t.Errorf("expected charlie, got %s", maxName)
	}
}
