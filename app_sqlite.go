package main

import (
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// ---------- SQLite API ----------

func (a *App) SqliteOpenFile() (string, error) {
	return wruntime.OpenFileDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "选择 SQLite 数据库文件",
	})
}

func (a *App) SqliteConnect(id string, filePath string) (bool, error) {
	if a.ctx != nil {
		a.sqliteMgr.SetContext(a.ctx)
	}
	return a.sqliteMgr.SqliteConnect(id, filePath)
}

func (a *App) SqliteClose(id string) error {
	a.sqliteMgr.SqliteClose(id)
	return nil
}

func (a *App) SqliteInfo(id string) (map[string]any, error) {
	return a.sqliteMgr.SqliteInfo(id)
}

func (a *App) SqliteTables(id string) ([]map[string]any, error) {
	return a.sqliteMgr.SqliteTables(id)
}

func (a *App) SqliteDescribe(id string, table string) ([]map[string]any, error) {
	return a.sqliteMgr.SqliteDescribe(id, table)
}

func (a *App) SqliteSelect(id string, table string, limit int, offset int) (map[string]any, error) {
	return a.sqliteMgr.SqliteSelect(id, table, limit, offset)
}

func (a *App) SqliteCount(id string, table string) (int64, error) {
	return a.sqliteMgr.SqliteCount(id, table)
}

func (a *App) SqliteIndexes(id string, table string) ([]map[string]any, error) {
	return a.sqliteMgr.SqliteIndexes(id, table)
}

func (a *App) SqliteRun(id string, sqlText string) (map[string]any, error) {
	return a.sqliteMgr.SqliteRun(id, sqlText)
}

func (a *App) SqliteSchema(id string) (map[string]any, error) {
	return a.sqliteMgr.SqliteSchema(id)
}
