use crate::core::ServerConfig;
use crate::db::mysql::manager::{MysqlQueryResult, MysqlSessionInfo};
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
    database: String,
) -> Result<Vec<String>, String> {
    state
        .mysql
        .tables(&server_id, &database)
        .await
        .map_err(|e| {
            storage::log_error(format!(
                "获取表列表失败 [ID={}, DB={}]: {}",
                server_id, database, e
            ));
            e
        })
}

#[tauri::command]
pub async fn mysql_select(
    state: State<'_, AppState>,
    server_id: String,
    database: String,
    table: String,
    limit: i64,
    offset: i64,
) -> Result<MysqlQueryResult, String> {
    state
        .mysql
        .select(&server_id, &database, &table, limit, offset)
        .await
        .map_err(|e| {
            storage::log_error(format!(
                "MySQL 查询失败 [ID={}, DB={}, Table={}]: {}",
                server_id, database, table, e
            ));
            e
        })
}

#[tauri::command]
pub async fn mysql_count(
    state: State<'_, AppState>,
    server_id: String,
    database: String,
    table: String,
) -> Result<i64, String> {
    state
        .mysql
        .count(&server_id, &database, &table)
        .await
        .map_err(|e| {
            storage::log_error(format!(
                "MySQL 统计失败 [ID={}, DB={}, Table={}]: {}",
                server_id, database, table, e
            ));
            e
        })
}

#[tauri::command]
pub async fn mysql_describe(
    state: State<'_, AppState>,
    server_id: String,
    database: String,
    table: String,
) -> Result<Vec<Map<String, Value>>, String> {
    state
        .mysql
        .describe(&server_id, &database, &table)
        .await
        .map_err(|e| {
            storage::log_error(format!(
                "获取表结构失败 [ID={}, DB={}, Table={}]: {}",
                server_id, database, table, e
            ));
            e
        })
}

#[tauri::command]
pub async fn mysql_run(
    state: State<'_, AppState>,
    server_id: String,
    database: String,
    sql: String,
) -> Result<MysqlQueryResult, String> {
    storage::log_info(format!(
        "MySQL 执行 SQL [ID={}, DB={}]: {}",
        server_id, database, sql
    ));
    state
        .mysql
        .run(&server_id, &database, &sql)
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
    database: String,
    table: String,
    record: Map<String, Value>,
) -> Result<MysqlQueryResult, String> {
    state
        .mysql
        .insert(&server_id, &database, &table, record)
        .await
        .map_err(|e| {
            storage::log_error(format!(
                "MySQL 插入失败 [ID={}, DB={}, Table={}]: {}",
                server_id, database, table, e
            ));
            e
        })
}

#[tauri::command]
pub async fn mysql_update(
    state: State<'_, AppState>,
    server_id: String,
    database: String,
    table: String,
    record: Map<String, Value>,
    where_clause: String,
) -> Result<MysqlQueryResult, String> {
    state
        .mysql
        .update(&server_id, &database, &table, record, &where_clause)
        .await
        .map_err(|e| {
            storage::log_error(format!(
                "MySQL 更新失败 [ID={}, DB={}, Table={}]: {}",
                server_id, database, table, e
            ));
            e
        })
}

#[tauri::command]
pub async fn mysql_delete(
    state: State<'_, AppState>,
    server_id: String,
    database: String,
    table: String,
    where_clause: String,
) -> Result<MysqlQueryResult, String> {
    state
        .mysql
        .delete(&server_id, &database, &table, &where_clause)
        .await
        .map_err(|e| {
            storage::log_error(format!(
                "MySQL 删除失败 [ID={}, DB={}, Table={}]: {}",
                server_id, database, table, e
            ));
            e
        })
}
