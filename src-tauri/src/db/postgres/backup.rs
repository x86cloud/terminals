use crate::db::postgres::manager::{quote_pg_ident, row_val};
use crate::db::utils::{parse_csv_records, write_csv_string};
use crate::storage;
use crate::AppState;
use serde_json::Map;
use std::fs;
use std::time::Duration;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn postgres_export(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
    mode: String,
    source: String,
    table: String,
    sql_text: String,
    limit: i64,
) -> Result<String, String> {
    storage::log_info(format!(
        "PostgreSQL 导出数据 [ServerID={}, DB={}, Schema={}, Mode={}, Table={}]",
        server_id, db_name, schema, mode, table
    ));
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let schema_str = if schema.trim().is_empty() {
        "public"
    } else {
        schema.trim()
    };

    let mut query = sql_text.trim().to_string();
    if source == "table" {
        query = format!(
            "SELECT * FROM {}.{}",
            quote_pg_ident(schema_str),
            quote_pg_ident(&table)
        );
        if limit > 0 {
            query.push_str(&format!(" LIMIT {}", limit));
        }
    } else if limit > 0 && !query.to_uppercase().contains("LIMIT") {
        query = format!("{} LIMIT {}", query, limit);
    }

    let rows = tokio::time::timeout(Duration::from_secs(600), client.query(&query, &[]))
        .await
        .map_err(|_| "导出查询超时".to_string())?
        .map_err(|e| e.to_string())?;

    let mut columns = Vec::new();
    if let Some(first) = rows.first() {
        for c in first.columns() {
            columns.push(c.name().to_string());
        }
    } else if let Ok(stmt) = client.prepare(&query).await {
        for c in stmt.columns() {
            columns.push(c.name().to_string());
        }
    }

    let mut list = Vec::with_capacity(rows.len());
    for r in rows {
        let mut row_map = Map::with_capacity(columns.len());
        for (i, col) in columns.iter().enumerate() {
            row_map.insert(col.clone(), row_val(&r, i));
        }
        list.push(row_map);
    }

    if mode == "json" {
        return serde_json::to_string_pretty(&list).map_err(|e| e.to_string());
    }

    Ok(write_csv_string(&columns, &list))
}

#[tauri::command]
pub async fn postgres_export_to_file(
    _app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
    mode: String,
    source: String,
    table: String,
    sql_text: String,
    limit: i64,
) -> Result<String, String> {
    storage::log_info(format!(
        "PostgreSQL 导出至文件 [ServerID={}, DB={}, Schema={}, Mode={}, Table={}]",
        server_id, db_name, schema, mode, table
    ));
    let content = postgres_export(
        state,
        server_id,
        db_name.clone(),
        schema.clone(),
        mode.clone(),
        source.clone(),
        table.clone(),
        sql_text,
        limit,
    )
    .await?;

    let ext = if mode == "json" { ".json" } else { ".csv" };
    let default_name = if source == "table" {
        format!("{}_{}_{}{}", db_name, schema, table, ext)
    } else {
        format!("{}_query_export{}", db_name, ext)
    };

    let picked = rfd::AsyncFileDialog::new()
        .set_title("保存导出文件")
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
pub async fn postgres_import(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
    mode: String,
    table: String,
    content: String,
) -> Result<String, String> {
    storage::log_info(format!(
        "PostgreSQL 导入数据 [ServerID={}, DB={}, Schema={}, Mode={}, Table={}, Bytes={}]",
        server_id,
        db_name,
        schema,
        mode,
        table,
        content.len()
    ));
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let schema_str = if schema.trim().is_empty() {
        "public"
    } else {
        schema.trim()
    };

    if mode == "sql" {
        client
            .batch_execute(&content)
            .await
            .map_err(|e| e.to_string())?;
        return Ok("SQL 执行成功".to_string());
    }

    if mode == "csv" {
        let records = parse_csv_records(&content);
        if records.is_empty() {
            return Err("解析 CSV 表头失败: 空文件".to_string());
        }
        let headers = &records[0];
        let quoted_cols: Vec<String> = headers.iter().map(|h| quote_pg_ident(h.trim())).collect();

        client
            .batch_execute("BEGIN")
            .await
            .map_err(|e| e.to_string())?;

        let mut count = 0usize;
        for (i, record) in records.iter().enumerate().skip(1) {
            let mut val_literals = Vec::with_capacity(headers.len());
            for j in 0..headers.len() {
                if let Some(val) = record.get(j) {
                    if val.is_empty() {
                        val_literals.push("NULL".to_string());
                    } else {
                        val_literals.push(format!("'{}'", val.replace('\'', "''")));
                    }
                } else {
                    val_literals.push("NULL".to_string());
                }
            }

            let insert_sql = format!(
                "INSERT INTO {}.{} ({}) VALUES ({})",
                quote_pg_ident(schema_str),
                quote_pg_ident(&table),
                quoted_cols.join(", "),
                val_literals.join(", ")
            );

            if let Err(e) = client.execute(&insert_sql, &[]).await {
                let _ = client.batch_execute("ROLLBACK").await;
                return Err(format!("第 {} 行插入失败: {}", i, e));
            }
            count += 1;
        }

        client
            .batch_execute("COMMIT")
            .await
            .map_err(|e| e.to_string())?;
        return Ok(format!("CSV 导入成功，共写入 {} 条记录", count));
    }

    Err(format!("不支持的导入模式: {}", mode))
}

#[tauri::command]
pub async fn postgres_import_from_file(
    _app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
    mode: String,
    table: String,
) -> Result<String, String> {
    storage::log_info(format!(
        "PostgreSQL 从文件导入 [ServerID={}, DB={}, Schema={}, Mode={}, Table={}]",
        server_id, db_name, schema, mode, table
    ));
    let picked = rfd::AsyncFileDialog::new()
        .set_title("选择要导入的文件")
        .pick_file()
        .await;
    let Some(file) = picked else {
        return Ok(String::new());
    };
    let data = fs::read_to_string(file.path()).map_err(|e| e.to_string())?;
    match mode.as_str() {
        "csv" | "sql" => {
            postgres_import(state, server_id, db_name, schema, mode, table, data).await
        }
        _ => Err(format!("不支持的导入格式: {}", mode)),
    }
}

