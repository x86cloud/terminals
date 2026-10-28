use crate::db::mysql::manager::quote_ident;
use crate::db::utils::write_csv_string;
use crate::storage;
use crate::AppState;
use chrono::Local;
use std::fs;
use std::time::Duration;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn mysql_export(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    mode: String,
    source: String,
    table: String,
    sql_text: String,
    limit: i64,
) -> Result<String, String> {
    storage::log_info(format!(
        "MySQL 导出数据 [ServerID={}, DB={}, Mode={}, Table={}]",
        server_id, db_name, mode, table
    ));
    state
        .mysql
        .export(&server_id, &db_name, &mode, &source, &table, &sql_text, limit)
        .await
}

#[tauri::command]
pub async fn mysql_export_to_file(
    _app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    mode: String,
    source: String,
    table: String,
    sql_text: String,
    limit: i64,
) -> Result<String, String> {
    storage::log_info(format!(
        "MySQL 导出至文件 [ServerID={}, DB={}, Mode={}, Table={}]",
        server_id, db_name, mode, table
    ));
    let content = state
        .mysql
        .export(&server_id, &db_name, &mode, &source, &table, &sql_text, limit)
        .await?;
    let base = if table.trim().is_empty() {
        "query_result"
    } else {
        table.trim()
    };
    let default_name = format!("{}.{}", base, mode);
    let picked = rfd::AsyncFileDialog::new()
        .set_title("导出数据")
        .set_file_name(&default_name)
        .save_file()
        .await;
    let Some(file) = picked else {
        return Ok(String::new());
    };
    let path = file.path().to_string_lossy().to_string();
    fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path)
}

#[tauri::command]
pub async fn mysql_import(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    mode: String,
    table: String,
    content: String,
) -> Result<String, String> {
    storage::log_info(format!(
        "MySQL 导入数据 [ServerID={}, DB={}, Mode={}, Table={}, Bytes={}]",
        server_id,
        db_name,
        mode,
        table,
        content.len()
    ));
    state
        .mysql
        .import(&server_id, &db_name, &mode, &table, &content)
        .await
}

#[tauri::command]
pub async fn mysql_import_from_file(
    _app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    mode: String,
    table: String,
) -> Result<String, String> {
    storage::log_info(format!(
        "MySQL 从文件导入 [ServerID={}, DB={}, Mode={}, Table={}]",
        server_id, db_name, mode, table
    ));
    let picked = rfd::AsyncFileDialog::new()
        .set_title("选择要导入的文件")
        .pick_file()
        .await;
    let Some(file) = picked else {
        return Ok(String::new());
    };
    let data = fs::read_to_string(file.path()).map_err(|e| e.to_string())?;
    state
        .mysql
        .import(&server_id, &db_name, &mode, &table, &data)
        .await
}

#[tauri::command]
pub async fn mysql_export_json(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    source: String,
    table: String,
    sql_text: String,
    limit: i64,
) -> Result<String, String> {
    state
        .mysql
        .export_json(&server_id, &db_name, &source, &table, &sql_text, limit)
        .await
}

#[tauri::command]
pub async fn mysql_import_json(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    table: String,
    content: String,
) -> Result<String, String> {
    storage::log_info(format!(
        "MySQL 导入 JSON 数据 [ServerID={}, DB={}, Table={}, Bytes={}]",
        server_id,
        db_name,
        table,
        content.len()
    ));
    state
        .mysql
        .import_json(&server_id, &db_name, &table, &content)
        .await
}

#[tauri::command]
pub async fn mysql_query_csv(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    sql_text: String,
    limit: i64,
) -> Result<String, String> {
    let mut query = sql_text.trim().to_string();
    if limit > 0 && !query.to_uppercase().ends_with("LIMIT") && !query.to_uppercase().contains(" LIMIT ") {
        query = format!("{} LIMIT {}", query, limit);
    }
    let max_rows = if limit > 0 { limit as usize } else { 0 };
    let (cols, rows) = state
        .mysql
        .query_ex_with_timeout_limit(
            &server_id,
            &db_name,
            &query,
            Duration::from_secs(600),
            max_rows,
        )
        .await?;
    Ok(write_csv_string(&cols, &rows))
}

#[tauri::command]
pub async fn mysql_backup(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
) -> Result<String, String> {
    storage::log_info(format!(
        "MySQL 执行备份 [ServerID={}, DB={}]",
        server_id, db_name
    ));
    let tables = state.mysql.tables(&server_id, &db_name).await?;
    let mut sb = String::new();
    sb.push_str(&format!("-- MySQL Database Backup: `{}`\n", db_name));
    sb.push_str(&format!(
        "-- Backup Date: {}\n\n",
        Local::now().format("%Y-%m-%d %H:%M:%S")
    ));
    sb.push_str("SET FOREIGN_KEY_CHECKS=0;\n\n");

    for t in tables {
        sb.push_str("-- ----------------------------\n");
        sb.push_str(&format!("-- Table structure for `{}`\n", t));
        sb.push_str("-- ----------------------------\n");
        sb.push_str(&format!("DROP TABLE IF EXISTS {};\n", quote_ident(&t)));

        let show_create = format!("SHOW CREATE TABLE {}", quote_ident(&t));
        if let Ok((_cols, drows)) = state.mysql.query_ex(&server_id, &db_name, &show_create).await {
            if let Some(first) = drows.first() {
                if let Some(create_sql) = first
                    .get("Create Table")
                    .or_else(|| first.get("Create View"))
                    .and_then(|v| v.as_str())
                {
                    sb.push_str(create_sql);
                    sb.push_str(";\n\n");
                }
            }
        }

        sb.push_str("-- ----------------------------\n");
        sb.push_str(&format!("-- Records of `{}`\n", t));
        sb.push_str("-- ----------------------------\n");
        if let Ok(data_sql) = state
            .mysql
            .export_sql(&server_id, &db_name, "table", &t, "", 0)
            .await
        {
            sb.push_str(&data_sql);
            sb.push('\n');
        }
    }
    sb.push_str("SET FOREIGN_KEY_CHECKS=1;\n");
    Ok(sb)
}

#[tauri::command]
pub async fn mysql_backup_to_file(
    _app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
) -> Result<String, String> {
    storage::log_info(format!(
        "MySQL 执行备份至文件 [ServerID={}, DB={}]",
        server_id, db_name
    ));
    let content = mysql_backup(state, server_id, db_name.clone()).await?;
    let default_name = format!("{}_backup.sql", db_name);
    let picked = rfd::AsyncFileDialog::new()
        .set_title("备份数据库")
        .set_file_name(&default_name)
        .save_file()
        .await;
    let Some(file) = picked else {
        return Ok(String::new());
    };
    let path = file.path().to_string_lossy().to_string();
    fs::write(&path, content.as_bytes()).map_err(|e| format!("写入备份文件失败: {}", e))?;
    Ok(path)
}

