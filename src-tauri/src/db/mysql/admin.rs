use crate::db::mysql::manager::quote_ident;
use crate::storage;
use crate::AppState;
use mysql_async::prelude::Queryable;
use serde_json::{Map, Value};
use tauri::State;

#[tauri::command]
pub async fn mysql_create_database(
    state: State<'_, AppState>,
    server_id: String,
    name: String,
    charset: String,
) -> Result<(), String> {
    storage::log_info(format!(
        "MySQL 创建数据库 [ServerID={}, DB={}, Charset={}]",
        server_id, name, charset
    ));
    let cs = if charset.trim().is_empty() {
        "utf8mb4"
    } else {
        charset.trim()
    };
    let (_mc, mut conn) = state.mysql.get_conn_with_db(&server_id, "").await?;
    let sql = format!(
        "CREATE DATABASE IF NOT EXISTS {} CHARACTER SET {}",
        quote_ident(&name),
        cs
    );
    conn.query_drop(sql).await.map_err(|e| {
        storage::log_error(format!(
            "MySQL 创建数据库失败 [ServerID={}, DB={}]: {}",
            server_id, name, e
        ));
        e.to_string()
    })
}

#[tauri::command]
pub async fn mysql_drop_database(
    state: State<'_, AppState>,
    server_id: String,
    name: String,
) -> Result<(), String> {
    storage::log_info(format!("MySQL 删除数据库 [ServerID={}, DB={}]", server_id, name));
    let (_mc, mut conn) = state.mysql.get_conn_with_db(&server_id, "").await?;
    let sql = format!("DROP DATABASE {}", quote_ident(&name));
    conn.query_drop(sql).await.map_err(|e| {
        storage::log_error(format!(
            "MySQL 删除数据库失败 [ServerID={}, DB={}]: {}",
            server_id, name, e
        ));
        e.to_string()
    })
}

#[tauri::command]
pub async fn mysql_create_table(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    table: String,
    defs: String,
) -> Result<(), String> {
    if defs.trim().is_empty() {
        return Err("请提供列定义".to_string());
    }
    storage::log_info(format!(
        "MySQL 创建数据表 [ServerID={}, DB={}, Table={}]",
        server_id, db_name, table
    ));
    let (_mc, mut conn) = state.mysql.get_conn_with_db(&server_id, &db_name).await?;
    let sql = format!("CREATE TABLE IF NOT EXISTS {} ({})", quote_ident(&table), defs);
    conn.query_drop(sql).await.map_err(|e| {
        storage::log_error(format!(
            "MySQL 创建数据表失败 [ServerID={}, DB={}, Table={}]: {}",
            server_id, db_name, table, e
        ));
        e.to_string()
    })
}

#[tauri::command]
pub async fn mysql_drop_table(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    table: String,
) -> Result<(), String> {
    storage::log_info(format!(
        "MySQL 删除数据表 [ServerID={}, DB={}, Table={}]",
        server_id, db_name, table
    ));
    let (_mc, mut conn) = state.mysql.get_conn_with_db(&server_id, &db_name).await?;
    let sql = format!("DROP TABLE {}", quote_ident(&table));
    conn.query_drop(sql).await.map_err(|e| {
        storage::log_error(format!(
            "MySQL 删除数据表失败 [ServerID={}, DB={}, Table={}]: {}",
            server_id, db_name, table, e
        ));
        e.to_string()
    })
}

#[tauri::command]
pub async fn mysql_truncate_table(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    table: String,
) -> Result<(), String> {
    storage::log_info(format!(
        "MySQL 清空数据表 [ServerID={}, DB={}, Table={}]",
        server_id, db_name, table
    ));
    let (_mc, mut conn) = state.mysql.get_conn_with_db(&server_id, &db_name).await?;
    let sql = format!("TRUNCATE TABLE {}", quote_ident(&table));
    conn.query_drop(sql).await.map_err(|e| {
        storage::log_error(format!(
            "MySQL 清空数据表失败 [ServerID={}, DB={}, Table={}]: {}",
            server_id, db_name, table, e
        ));
        e.to_string()
    })
}

#[tauri::command]
pub async fn mysql_table_status(
    state: State<'_, AppState>,
    server_id: String,
    database: String,
    table: String,
) -> Result<Map<String, Value>, String> {
    state.mysql.table_status(&server_id, &database, &table).await
}

#[tauri::command]
pub async fn mysql_indexes(
    state: State<'_, AppState>,
    server_id: String,
    database: String,
    table: String,
) -> Result<Vec<Map<String, Value>>, String> {
    state.mysql.indexes(&server_id, &database, &table).await
}

#[tauri::command]
pub async fn mysql_create_index(
    state: State<'_, AppState>,
    server_id: String,
    database: String,
    table: String,
    index_name: String,
    columns: Vec<String>,
    index_type: String,
) -> Result<(), String> {
    state
        .mysql
        .create_index(
            &server_id,
            &database,
            &table,
            &index_name,
            &columns,
            &index_type,
        )
        .await
}

#[tauri::command]
pub async fn mysql_drop_index(
    state: State<'_, AppState>,
    server_id: String,
    database: String,
    table: String,
    index_name: String,
) -> Result<(), String> {
    state
        .mysql
        .drop_index(&server_id, &database, &table, &index_name)
        .await
}

#[tauri::command]
pub async fn mysql_users(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<Map<String, Value>>, String> {
    state.mysql.users(&server_id).await
}

#[tauri::command]
pub async fn mysql_grants(
    state: State<'_, AppState>,
    server_id: String,
    user: String,
    host: String,
) -> Result<Vec<String>, String> {
    state.mysql.grants(&server_id, &user, &host).await
}

#[tauri::command]
pub async fn mysql_create_user(
    state: State<'_, AppState>,
    server_id: String,
    user: String,
    host: String,
    password: String,
) -> Result<(), String> {
    state
        .mysql
        .create_user(&server_id, &user, &host, &password)
        .await
}

#[tauri::command]
pub async fn mysql_drop_user(
    state: State<'_, AppState>,
    server_id: String,
    user: String,
    host: String,
) -> Result<(), String> {
    state.mysql.drop_user(&server_id, &user, &host).await
}

#[tauri::command]
pub async fn mysql_change_user_password(
    state: State<'_, AppState>,
    server_id: String,
    user: String,
    host: String,
    new_password: String,
) -> Result<(), String> {
    state
        .mysql
        .change_user_password(&server_id, &user, &host, &new_password)
        .await
}

#[tauri::command]
pub async fn mysql_toggle_user_lock(
    state: State<'_, AppState>,
    server_id: String,
    user: String,
    host: String,
    lock: bool,
) -> Result<(), String> {
    state
        .mysql
        .toggle_user_lock(&server_id, &user, &host, lock)
        .await
}

#[tauri::command]
pub async fn mysql_grant_privileges(
    state: State<'_, AppState>,
    server_id: String,
    user: String,
    host: String,
    privileges: Vec<String>,
    database: String,
    table: String,
) -> Result<(), String> {
    state
        .mysql
        .grant_privileges(
            &server_id, &user, &host, &privileges, &database, &table,
        )
        .await
}

#[tauri::command]
pub async fn mysql_revoke_privileges(
    state: State<'_, AppState>,
    server_id: String,
    user: String,
    host: String,
    privileges: Vec<String>,
    database: String,
    table: String,
) -> Result<(), String> {
    state
        .mysql
        .revoke_privileges(
            &server_id, &user, &host, &privileges, &database, &table,
        )
        .await
}

#[tauri::command]
pub async fn mysql_revoke_all_privileges(
    state: State<'_, AppState>,
    server_id: String,
    user: String,
    host: String,
) -> Result<(), String> {
    state
        .mysql
        .revoke_all_privileges(&server_id, &user, &host)
        .await
}

#[tauri::command]
pub async fn mysql_status(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<Map<String, Value>>, String> {
    state.mysql.status(&server_id).await
}

#[tauri::command]
pub async fn mysql_variables(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<Map<String, Value>>, String> {
    state.mysql.variables(&server_id).await
}

#[tauri::command]
pub async fn mysql_process_list(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<Map<String, Value>>, String> {
    state.mysql.process_list(&server_id).await
}

#[tauri::command]
pub async fn mysql_slow_log(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<Map<String, Value>>, String> {
    state.mysql.slow_log(&server_id).await
}

#[tauri::command]
pub async fn mysql_schema(
    state: State<'_, AppState>,
    server_id: String,
    database: String,
) -> Result<Value, String> {
    state.mysql.schema(&server_id, &database).await
}
