package main

import (
	"terminal/db"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// ---------- SQLite API ----------

func (a *App) SqliteOpenFile() (string, error) {
	return wruntime.OpenFileDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "选择 SQLite 数据库文件",
	})
}

func (a *App) SqliteConnect(id string, filePath string) (bool, error) {
	return db.SqliteMgr.SqliteConnect(id, filePath)
}

func (a *App) SqliteClose(id string) error {
	db.SqliteMgr.SqliteClose(id)
	return nil
}

func (a *App) SqliteInfo(id string) (map[string]any, error) {
	return db.SqliteMgr.SqliteInfo(id)
}

func (a *App) SqliteTables(id string) ([]map[string]any, error) {
	return db.SqliteMgr.SqliteTables(id)
}

func (a *App) SqliteDescribe(id string, table string) ([]map[string]any, error) {
	return db.SqliteMgr.SqliteDescribe(id, table)
}

func (a *App) SqliteSelect(id string, table string, limit int, offset int) (map[string]any, error) {
	return db.SqliteMgr.SqliteSelect(id, table, limit, offset)
}

func (a *App) SqliteCount(id string, table string) (int64, error) {
	return db.SqliteMgr.SqliteCount(id, table)
}

func (a *App) SqliteIndexes(id string, table string) ([]map[string]any, error) {
	return db.SqliteMgr.SqliteIndexes(id, table)
}

func (a *App) SqliteRun(id string, sqlText string) (map[string]any, error) {
	return db.SqliteMgr.SqliteRun(id, sqlText)
}

func (a *App) SqliteSchema(id string) (map[string]any, error) {
	return db.SqliteMgr.SqliteSchema(id)
}
