use crate::core::ServerConfig;
use crate::db::mysql::manager::{
    format_sql_value, quote_ident, MysqlQueryResult, MysqlSessionInfo,
};
use crate::storage;
use crate::AppState;
use serde_json::{Map, Value};
use tauri::State;

#[tauri::command]
pub async fn mysql_connect(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<MysqlSessionInfo, String> {
    let cfg = state
        .store
        .get(&server_id)
        .ok_or_else(|| "服务器配置不存在".to_string())?;

    storage::log_info(format!(
        "正在发起 MySQL 连接: ServerID={}, 主机={}:{}, 库={}",
        cfg.id,
        cfg.host,
        cfg.display_port(),
        cfg.database
    ));

    state.mysql.open(&server_id, cfg.clone()).await?;
    storage::log_info(format!("MySQL 连接成功: ServerID={}", server_id));

    Ok(MysqlSessionInfo {
        id: server_id.clone(),
        server_id: server_id.clone(),
        title: cfg.label(),
        host: cfg.host.clone(),
        port: cfg.display_port(),
        database: cfg.database,
        connected: true,
    })
}

#[tauri::command]
pub async fn mysql_test_connection(cfg: ServerConfig) -> Result<Value, String> {
    let mgr = crate::db::mysql::manager::MysqlManager::new();
    mgr.test_connection(cfg).await
}

#[tauri::command]
pub async fn mysql_close(state: State<'_, AppState>, server_id: String) -> Result<(), String> {
    storage::log_info(format!("关闭 MySQL 连接: ServerID={}", server_id));
    state.mysql.close(&server_id).await;
    Ok(())
}

#[tauri::command]
pub async fn mysql_databases(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<String>, String> {
    state.mysql.databases(&server_id).await.map_err(|e| {
        storage::log_error(format!("获取数据库列表失败 [ID={}]: {}", server_id, e));
        e
    })
}

#[tauri::command]
pub async fn mysql_tables(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
) -> Result<Vec<String>, String> {
    state
        .mysql
        .tables(&server_id, &db_name)
        .await
        .map_err(|e| {
            storage::log_error(format!(
                "获取表列表失败 [ID={}, DB={}]: {}",
                server_id, db_name, e
            ));
            e
        })
}

#[tauri::command]
pub async fn mysql_select(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    table: String,
    limit: i64,
    offset: i64,
) -> Result<MysqlQueryResult, String> {
    state
        .mysql
        .select(&server_id, &db_name, &table, limit, offset)
        .await
        .map_err(|e| {
            storage::log_error(format!(
                "MySQL 查询失败 [ID={}, DB={}, Table={}]: {}",
                server_id, db_name, table, e
            ));
            e
        })
}

#[tauri::command]
pub async fn mysql_count(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    table: String,
) -> Result<i64, String> {
    state
        .mysql
        .count(&server_id, &db_name, &table)
        .await
        .map_err(|e| {
            storage::log_error(format!(
                "MySQL 统计失败 [ID={}, DB={}, Table={}]: {}",
                server_id, db_name, table, e
            ));
            e
        })
}

#[tauri::command]
pub async fn mysql_describe(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    table: String,
) -> Result<Vec<Map<String, Value>>, String> {
    state
        .mysql
        .describe(&server_id, &db_name, &table)
        .await
        .map_err(|e| {
            storage::log_error(format!(
                "获取表结构失败 [ID={}, DB={}, Table={}]: {}",
                server_id, db_name, table, e
            ));
            e
        })
}

#[tauri::command]
pub async fn mysql_run(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    sql_text: String,
) -> Result<MysqlQueryResult, String> {
    storage::log_info(format!(
        "MySQL 执行 SQL [ID={}, DB={}]: {}",
        server_id, db_name, sql_text
    ));
    state
        .mysql
        .run(&server_id, &db_name, &sql_text)
        .await
        .map_err(|e| {
            storage::log_error(format!("MySQL 执行失败: {}", e));
            e
        })
}

#[tauri::command]
pub async fn mysql_insert(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    table: String,
    columns: Vec<String>,
    values: Vec<Value>,
) -> Result<i64, String> {
    if columns.is_empty() {
        return Err("插入字段不能为空".to_string());
    }
    let quoted_cols: Vec<String> = columns.iter().map(|c| quote_ident(c)).collect();
    let val_literals: Vec<String> = values.iter().map(|v| format_sql_value(Some(v))).collect();
    let sql = format!(
        "INSERT INTO {} ({}) VALUES ({})",
        quote_ident(&table),
        quoted_cols.join(", "),
        val_literals.join(", ")
    );
    let res = state.mysql.run(&server_id, &db_name, &sql).await.map_err(|e| {
        storage::log_error(format!(
            "MySQL 插入失败 [ID={}, DB={}, Table={}]: {}",
            server_id, db_name, table, e
        ));
        e
    })?;
    Ok(res.affected)
}

#[tauri::command]
pub async fn mysql_update(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    table: String,
    set_cols: Vec<String>,
    set_vals: Vec<Value>,
    where_cols: Vec<String>,
    where_vals: Vec<Value>,
) -> Result<i64, String> {
    if set_cols.is_empty() {
        return Err("更新字段不能为空".to_string());
    }
    let mut set_clauses = Vec::with_capacity(set_cols.len());
    for (i, c) in set_cols.iter().enumerate() {
        let v = set_vals.get(i);
        set_clauses.push(format!("{} = {}", quote_ident(c), format_sql_value(v)));
    }
    let mut where_clauses = Vec::with_capacity(where_cols.len());
    for (i, c) in where_cols.iter().enumerate() {
        let v = where_vals.get(i);
        match v {
            None | Some(Value::Null) => {
                where_clauses.push(format!("{} IS NULL", quote_ident(c)));
            }
            Some(val) => {
                where_clauses.push(format!("{} = {}", quote_ident(c), format_sql_value(Some(val))));
            }
        }
    }
    if where_clauses.is_empty() {
        return Err("为防止全表更新，必须指定更新条件".to_string());
    }
    let sql = format!(
        "UPDATE {} SET {} WHERE {}",
        quote_ident(&table),
        set_clauses.join(", "),
        where_clauses.join(" AND ")
    );
    let res = state.mysql.run(&server_id, &db_name, &sql).await.map_err(|e| {
        storage::log_error(format!(
            "MySQL 更新失败 [ID={}, DB={}, Table={}]: {}",
            server_id, db_name, table, e
        ));
        e
    })?;
    Ok(res.affected)
}

#[tauri::command]
pub async fn mysql_delete(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    table: String,
    where_cols: Vec<String>,
    where_vals: Vec<Value>,
) -> Result<i64, String> {
    let mut where_clauses = Vec::with_capacity(where_cols.len());
    for (i, c) in where_cols.iter().enumerate() {
        let v = where_vals.get(i);
        match v {
            None | Some(Value::Null) => {
                where_clauses.push(format!("{} IS NULL", quote_ident(c)));
            }
            Some(val) => {
                where_clauses.push(format!("{} = {}", quote_ident(c), format_sql_value(Some(val))));
            }
        }
    }
    if where_clauses.is_empty() {
        return Err("为防止全表删除，必须指定删除条件".to_string());
    }
    let sql = format!(
        "DELETE FROM {} WHERE {}",
        quote_ident(&table),
        where_clauses.join(" AND ")
    );
    let res = state.mysql.run(&server_id, &db_name, &sql).await.map_err(|e| {
        storage::log_error(format!(
            "MySQL 删除失败 [ID={}, DB={}, Table={}]: {}",
            server_id, db_name, table, e
        ));
        e
    })?;
    Ok(res.affected)
}
