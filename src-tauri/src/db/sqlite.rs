use crate::storage;
use crate::AppState;
use rusqlite::types::ValueRef;
use rusqlite::Connection;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::fs;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

struct SqliteConn {
    conn: Connection,
    path: String,
}

pub struct SqliteManager {
    conns: Mutex<HashMap<String, Arc<Mutex<SqliteConn>>>>,
}

impl Default for SqliteManager {
    fn default() -> Self {
        Self::new()
    }
}

fn quote_sqlite_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

fn sqlite_is_read_query(s: &str) -> bool {
    let trimmed = s.trim().trim_start_matches('(').trim();
    let up = trimmed.to_uppercase();
    for p in ["SELECT", "PRAGMA", "EXPLAIN", "WITH"] {
        if up.starts_with(&format!("{} ", p))
            || up.starts_with(&format!("{}(", p))
            || up.starts_with(&format!("{}\t", p))
            || up.starts_with(&format!("{}\n", p))
            || up.starts_with(&format!("{}\r", p))
            || up == p
        {
            return true;
        }
    }
    false
}

fn value_ref_to_json(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => json!(i),
        ValueRef::Real(f) => json!(f),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).to_string()),
        ValueRef::Blob(b) => Value::String(String::from_utf8_lossy(b).to_string()),
    }
}

fn value_ref_to_string(v: ValueRef<'_>) -> String {
    match v {
        ValueRef::Null => String::new(),
        ValueRef::Integer(i) => i.to_string(),
        ValueRef::Real(f) => f.to_string(),
        ValueRef::Text(t) => String::from_utf8_lossy(t).to_string(),
        ValueRef::Blob(b) => String::from_utf8_lossy(b).to_string(),
    }
}

fn value_ref_to_i64(v: ValueRef<'_>) -> i64 {
    match v {
        ValueRef::Null => 0,
        ValueRef::Integer(i) => i,
        ValueRef::Real(f) => f as i64,
        ValueRef::Text(t) => String::from_utf8_lossy(t).trim().parse::<i64>().unwrap_or(0),
        ValueRef::Blob(b) => String::from_utf8_lossy(b).trim().parse::<i64>().unwrap_or(0),
    }
}

impl SqliteManager {
    pub fn new() -> Self {
        Self {
            conns: Mutex::new(HashMap::new()),
        }
    }

    pub fn open(&self, id: &str, path: &str) -> Result<(), String> {
        let trimmed_path = path.trim();
        if trimmed_path.is_empty() {
            return Err("未指定 SQLite 文件".to_string());
        }
        if let Err(e) = fs::metadata(trimmed_path) {
            return Err(format!("找不到文件: {}", e));
        }

        {
            let mut guard = self.conns.lock().map_err(|e| e.to_string())?;
            guard.remove(id);
        }

        let conn = Connection::open(trimmed_path)
            .map_err(|e| format!("打开 SQLite 失败: {}", e))?;

        // 验证连接可用性（文件非 SQLite 格式或已损坏时会报错）
        conn.query_row("PRAGMA schema_version;", [], |_| Ok(()))
            .map_err(|e| format!("连接 SQLite 失败（文件可能已损坏或非 SQLite 格式）: {}", e))?;

        let sc = Arc::new(Mutex::new(SqliteConn {
            conn,
            path: trimmed_path.to_string(),
        }));

        let mut guard = self.conns.lock().map_err(|e| e.to_string())?;
        guard.insert(id.to_string(), sc);
        Ok(())
    }

    fn get(&self, id: &str) -> Result<Arc<Mutex<SqliteConn>>, String> {
        let guard = self.conns.lock().map_err(|e| e.to_string())?;
        guard
            .get(id)
            .cloned()
            .ok_or_else(|| "SQLite 连接不存在或已断开，请重新打开文件".to_string())
    }

    pub fn close(&self, id: &str) {
        if let Ok(mut guard) = self.conns.lock() {
            guard.remove(id);
        }
    }

    pub fn close_all(&self) {
        if let Ok(mut guard) = self.conns.lock() {
            guard.clear();
        }
    }

    pub fn list_connections(&self) -> Vec<Value> {
        let guard = match self.conns.lock() {
            Ok(g) => g,
            Err(_) => return Vec::new(),
        };
        let mut list = Vec::with_capacity(guard.len());
        for (id, sc) in guard.iter() {
            if let Ok(c) = sc.lock() {
                list.push(json!({
                    "id": id,
                    "path": c.path,
                }));
            }
        }
        list
    }

    pub fn resolve_id(&self, id_or_path: &str) -> Result<String, String> {
        let guard = self.conns.lock().map_err(|e| e.to_string())?;
        let trimmed = id_or_path.trim();
        if !trimmed.is_empty() {
            if guard.contains_key(trimmed) {
                return Ok(trimmed.to_string());
            }
            for (id, sc) in guard.iter() {
                if id.eq_ignore_ascii_case(trimmed) {
                    return Ok(id.clone());
                }
                if let Ok(c) = sc.lock() {
                    if c.path.eq_ignore_ascii_case(trimmed) {
                        return Ok(id.clone());
                    }
                }
            }
        }
        if guard.len() == 1 {
            if let Some(id) = guard.keys().next() {
                return Ok(id.clone());
            }
        }
        if guard.is_empty() {
            return Err("当前无已打开的 SQLite 数据库连接，请先打开 SQLite 文件".to_string());
        }
        Err("存在多个已打开的 SQLite 连接，请指定明确的 file_id 或文件路径".to_string())
    }

    pub fn query_sqlite(&self, id: &str, sql_text: &str) -> Result<(Vec<String>, Vec<Value>), String> {
        let sc = self.get(id)?;
        let guard = sc.lock().map_err(|e| e.to_string())?;

        let mut stmt = guard
            .conn
            .prepare(sql_text)
            .map_err(|e| e.to_string())?;

        let cols: Vec<String> = stmt
            .column_names()
            .into_iter()
            .map(|s| s.to_string())
            .collect();

        const MAX_QUERY_ROWS: usize = 50000;
        let mut out = Vec::new();
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;

        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            if out.len() >= MAX_QUERY_ROWS {
                break;
            }
            let mut rec = Map::with_capacity(cols.len());
            for (i, col_name) in cols.iter().enumerate() {
                let v = row.get_ref(i).map_err(|e| e.to_string())?;
                rec.insert(col_name.clone(), value_ref_to_json(v));
            }
            out.push(Value::Object(rec));
        }

        Ok((cols, out))
    }

    pub fn info(&self, id: &str) -> Result<Value, String> {
        let sc = self.get(id)?;
        let guard = sc.lock().map_err(|e| e.to_string())?;
        let size = fs::metadata(&guard.path)
            .map(|m| m.len() as i64)
            .unwrap_or(0);
        Ok(json!({
            "path": guard.path,
            "size": size,
        }))
    }

    pub fn tables(&self, id: &str) -> Result<Vec<Value>, String> {
        let sc = self.get(id)?;
        let guard = sc.lock().map_err(|e| e.to_string())?;
        let mut stmt = guard
            .conn
            .prepare(
                "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
            )
            .map_err(|e| e.to_string())?;

        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        let mut list = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let name = value_ref_to_string(row.get_ref(0).map_err(|e| e.to_string())?);
            let typ = value_ref_to_string(row.get_ref(1).map_err(|e| e.to_string())?);
            list.push(json!({
                "name": name,
                "type": typ,
            }));
        }
        Ok(list)
    }

    pub fn describe(&self, id: &str, table: &str) -> Result<Vec<Value>, String> {
        let sc = self.get(id)?;
        let guard = sc.lock().map_err(|e| e.to_string())?;
        let sql = format!("PRAGMA table_info({})", quote_sqlite_ident(table));
        let mut stmt = guard.conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        let mut list = Vec::new();

        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let cid = value_ref_to_i64(row.get_ref(0).map_err(|e| e.to_string())?);
            let name = value_ref_to_string(row.get_ref(1).map_err(|e| e.to_string())?);
            let typ = value_ref_to_string(row.get_ref(2).map_err(|e| e.to_string())?);
            let notnull = value_ref_to_i64(row.get_ref(3).map_err(|e| e.to_string())?);
            let dflt_ref = row.get_ref(4).map_err(|e| e.to_string())?;
            let dflt = match dflt_ref {
                ValueRef::Null => Value::Null,
                other => Value::String(value_ref_to_string(other)),
            };
            let pk = value_ref_to_i64(row.get_ref(5).map_err(|e| e.to_string())?);

            list.push(json!({
                "cid": cid,
                "name": name,
                "type": typ,
                "notnull": notnull,
                "default": dflt,
                "pk": pk,
            }));
        }
        Ok(list)
    }

    pub fn select(&self, id: &str, table: &str, limit: i64, offset: i64) -> Result<Value, String> {
        let lim = if limit <= 0 || limit > 1000 { 200 } else { limit };
        let off = if offset < 0 { 0 } else { offset };
        let sql_text = format!(
            "SELECT * FROM {} LIMIT {} OFFSET {}",
            quote_sqlite_ident(table),
            lim,
            off
        );
        let (cols, rows) = self.query_sqlite(id, &sql_text)?;
        let row_count = rows.len();
        Ok(json!({
            "columns": cols,
            "rows": rows,
            "rowCount": row_count,
        }))
    }

    pub fn count(&self, id: &str, table: &str) -> Result<i64, String> {
        let sql_text = format!("SELECT COUNT(*) AS cnt FROM {}", quote_sqlite_ident(table));
        let (cols, rows) = self.query_sqlite(id, &sql_text)?;
        if rows.is_empty() || cols.is_empty() {
            return Ok(0);
        }
        if let Some(first_row) = rows.first().and_then(|r| r.as_object()) {
            if let Some(val) = first_row.get(&cols[0]) {
                return Ok(match val {
                    Value::Number(n) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)).unwrap_or(0),
                    Value::String(s) => s.trim().parse::<i64>().unwrap_or(0),
                    _ => 0,
                });
            }
        }
        Ok(0)
    }

    pub fn indexes(&self, id: &str, table: &str) -> Result<Vec<Value>, String> {
        let sc = self.get(id)?;
        let guard = sc.lock().map_err(|e| e.to_string())?;
        let sql = format!("PRAGMA index_list({})", quote_sqlite_ident(table));
        let mut stmt = guard.conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        let mut list = Vec::new();

        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let seq = value_ref_to_i64(row.get_ref(0).map_err(|e| e.to_string())?);
            let name = value_ref_to_string(row.get_ref(1).map_err(|e| e.to_string())?);
            let unique = value_ref_to_i64(row.get_ref(2).map_err(|e| e.to_string())?);
            let origin = value_ref_to_string(row.get_ref(3).map_err(|e| e.to_string())?);
            let partial = value_ref_to_string(row.get_ref(4).map_err(|e| e.to_string())?);

            list.push(json!({
                "seq": seq,
                "name": name,
                "unique": unique,
                "origin": origin,
                "partial": partial,
            }));
        }
        Ok(list)
    }

    pub fn run(&self, id: &str, sql_text: &str) -> Result<Value, String> {
        let trimmed = sql_text.trim();
        let up = trimmed.to_uppercase();

        if up.starts_with("PRAGMA") {
            // 诸如 PRAGMA foreign_keys = OFF 等写指令不返回列，若 column_count > 0 则按查询执行
            let sc = self.get(id)?;
            let is_query_pragma = {
                let guard = sc.lock().map_err(|e| e.to_string())?;
                let has_cols = match guard.conn.prepare(trimmed) {
                    Ok(stmt) => stmt.column_count() > 0,
                    Err(_) => false,
                };
                has_cols
            };
            if is_query_pragma {
                let (cols, rows) = self.query_sqlite(id, trimmed)?;
                let row_count = rows.len();
                return Ok(json!({
                    "columns": cols,
                    "rows": rows,
                    "rowCount": row_count,
                    "affected": 0,
                }));
            }
        } else if sqlite_is_read_query(trimmed) {
            let (cols, rows) = self.query_sqlite(id, trimmed)?;
            let row_count = rows.len();
            return Ok(json!({
                "columns": cols,
                "rows": rows,
                "rowCount": row_count,
                "affected": 0,
            }));
        }

        let sc = self.get(id)?;
        let guard = sc.lock().map_err(|e| e.to_string())?;
        let affected = match guard.conn.execute(trimmed, []) {
            Ok(n) => n as i64,
            Err(_) => {
                guard.conn.execute_batch(trimmed).map_err(|e| e.to_string())?;
                guard.conn.changes() as i64
            }
        };

        Ok(json!({
            "columns": Vec::<String>::new(),
            "rows": Vec::<Value>::new(),
            "rowCount": 0,
            "affected": affected,
        }))
    }

    pub fn schema(&self, id: &str) -> Result<Value, String> {
        let tables = self.tables(id)?;
        let mut out_tables = Vec::with_capacity(tables.len());
        let mut fks = Vec::new();

        for t in tables {
            let name = t
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if name.is_empty() {
                continue;
            }
            let cols = match self.describe(id, &name) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let mut out_cols = Vec::with_capacity(cols.len());
            for c in cols {
                let cn = c.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let ct = c.get("type").and_then(|v| v.as_str()).unwrap_or("");
                let pk = c.get("pk").and_then(|v| v.as_i64()).unwrap_or(0);
                let key = if pk > 0 { "PRI" } else { "" };
                out_cols.push(json!({
                    "name": cn,
                    "type": ct,
                    "key": key,
                }));
            }
            out_tables.push(json!({
                "name": name,
                "columns": out_cols,
            }));

            if let Ok(sc) = self.get(id) {
                if let Ok(guard) = sc.lock() {
                    let fk_sql = format!("PRAGMA foreign_key_list({})", quote_sqlite_ident(&name));
                    if let Ok(mut stmt) = guard.conn.prepare(&fk_sql) {
                        if let Ok(mut fk_rows) = stmt.query([]) {
                            while let Ok(Some(row)) = fk_rows.next() {
                                let id_col = row.get_ref(0).map(value_ref_to_i64).unwrap_or(0);
                                let table_ref = row.get_ref(2).map(value_ref_to_string).unwrap_or_default();
                                let from = row.get_ref(3).map(value_ref_to_string).unwrap_or_default();
                                let to = row.get_ref(4).map(value_ref_to_string).unwrap_or_default();
                                fks.push(json!({
                                    "fromTable": name,
                                    "fromColumn": from,
                                    "toTable": table_ref,
                                    "toColumn": to,
                                    "name": format!("fk_{}_{}", name, id_col),
                                }));
                            }
                        }
                    }
                }
            }
        }

        Ok(json!({
            "tables": out_tables,
            "foreignKeys": fks,
        }))
    }
}

#[tauri::command]
pub async fn sqlite_open_file(_app: AppHandle) -> Result<String, String> {
    let picked = rfd::AsyncFileDialog::new()
        .set_title("选择 SQLite 数据库文件")
        .pick_file()
        .await;
    Ok(picked
        .map(|f| f.path().to_string_lossy().to_string())
        .unwrap_or_default())
}

#[tauri::command]
pub async fn sqlite_connect(
    state: State<'_, AppState>,
    id: String,
    file_path: String,
) -> Result<bool, String> {
    storage::log_info(format!(
        "正在连接 SQLite 数据库 [ID={}, Path={}]",
        id, file_path
    ));
    match state.sqlite.open(&id, &file_path) {
        Ok(()) => {
            storage::log_info(format!(
                "SQLite 数据库连接成功 [ID={}, Path={}]",
                id, file_path
            ));
            Ok(true)
        }
        Err(e) => {
            storage::log_error(format!(
                "SQLite 数据库连接失败 [ID={}, Path={}]: {}",
                id, file_path, e
            ));
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn sqlite_close(state: State<'_, AppState>, id: String) -> Result<(), String> {
    storage::log_info(format!("关闭 SQLite 数据库连接 [ID={}]", id));
    state.sqlite.close(&id);
    Ok(())
}

#[tauri::command]
pub async fn sqlite_info(state: State<'_, AppState>, id: String) -> Result<Value, String> {
    state.sqlite.info(&id)
}

#[tauri::command]
pub async fn sqlite_tables(state: State<'_, AppState>, id: String) -> Result<Vec<Value>, String> {
    state.sqlite.tables(&id).map_err(|e| {
        storage::log_error(format!("获取 SQLite 表列表失败 [ID={}]: {}", id, e));
        e
    })
}

#[tauri::command]
pub async fn sqlite_describe(
    state: State<'_, AppState>,
    id: String,
    table: String,
) -> Result<Vec<Value>, String> {
    state.sqlite.describe(&id, &table).map_err(|e| {
        storage::log_error(format!(
            "获取 SQLite 表结构失败 [ID={}, Table={}]: {}",
            id, table, e
        ));
        e
    })
}

#[tauri::command]
pub async fn sqlite_select(
    state: State<'_, AppState>,
    id: String,
    table: String,
    limit: i64,
    offset: i64,
) -> Result<Value, String> {
    state.sqlite.select(&id, &table, limit, offset).map_err(|e| {
        storage::log_error(format!(
            "SQLite 查询数据失败 [ID={}, Table={}]: {}",
            id, table, e
        ));
        e
    })
}

#[tauri::command]
pub async fn sqlite_count(
    state: State<'_, AppState>,
    id: String,
    table: String,
) -> Result<i64, String> {
    state.sqlite.count(&id, &table).map_err(|e| {
        storage::log_error(format!(
            "SQLite 统计行数失败 [ID={}, Table={}]: {}",
            id, table, e
        ));
        e
    })
}

#[tauri::command]
pub async fn sqlite_indexes(
    state: State<'_, AppState>,
    id: String,
    table: String,
) -> Result<Vec<Value>, String> {
    state.sqlite.indexes(&id, &table)
}

#[tauri::command]
pub async fn sqlite_run(
    state: State<'_, AppState>,
    id: String,
    sql_text: String,
) -> Result<Value, String> {
    storage::log_info(format!("SQLite 执行 SQL [ID={}, SQL={}]", id, sql_text));
    state.sqlite.run(&id, &sql_text).map_err(|e| {
        storage::log_error(format!("SQLite 执行 SQL 失败 [ID={}]: {}", id, e));
        e
    })
}

#[tauri::command]
pub async fn sqlite_schema(state: State<'_, AppState>, id: String) -> Result<Value, String> {
    state.sqlite.schema(&id)
}

