use crate::core::ServerConfig;
use crate::db::postgres::manager::{
    is_pg_read_query, pg_sql_literal, quote_pg_ident, row_i64, row_str, row_val, PostgresManager,
};
use crate::db::postgres::types::PostgresQueryResult;
use crate::storage;
use crate::AppState;
use serde_json::{Map, Value};
use std::time::{Duration, Instant};
use tauri::State;

#[tauri::command]
pub async fn postgres_test_connection(cfg: ServerConfig) -> Result<Value, String> {
    storage::log_info(format!(
        "测试 PostgreSQL 连通性: 主机={}:{}, 用户={}",
        cfg.host, cfg.port, cfg.username
    ));
    let mgr = PostgresManager::new();
    mgr.test_connection(cfg.clone()).await.map_err(|e| {
        storage::log_error(format!(
            "测试 PostgreSQL 连通性失败 [主机={}:{}]: {}",
            cfg.host, cfg.port, e
        ));
        e
    })
}

#[tauri::command]
pub async fn postgres_connect(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<bool, String> {
    let cfg = state.store.get(&server_id).ok_or_else(|| {
        storage::log_error(format!(
            "PostgreSQL 连接失败: 服务器配置不存在 [ServerID={}]",
            server_id
        ));
        "服务器配置不存在".to_string()
    })?;
    storage::log_info(format!(
        "正在发起 PostgreSQL 连接: ServerID={}, 名称={}, 主机={}:{}, 用户={}",
        cfg.id, cfg.name, cfg.host, cfg.port, cfg.username
    ));
    match state.postgres.connect_ex(cfg.clone()).await {
        Ok(ok) => {
            storage::log_info(format!(
                "PostgreSQL 连接成功: ServerID={}, 主机={}:{}",
                server_id, cfg.host, cfg.port
            ));
            Ok(ok)
        }
        Err(e) => {
            storage::log_error(format!(
                "PostgreSQL 连接失败 [ServerID={}, 主机={}:{}]: {}",
                server_id, cfg.host, cfg.port, e
            ));
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn postgres_close(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<(), String> {
    storage::log_info(format!("关闭 PostgreSQL 连接: ServerID={}", server_id));
    state.postgres.close(&server_id).await;
    Ok(())
}

#[tauri::command]
pub async fn postgres_select(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
    table: String,
    limit: i64,
    offset: i64,
    sort_col: String,
    sort_order: String,
    where_clause: String,
) -> Result<Value, String> {
    let start = Instant::now();
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let schema_str = if schema.trim().is_empty() {
        "public"
    } else {
        schema.trim()
    };
    let lim = if limit <= 0 {
        100
    } else if limit > 2000 {
        2000
    } else {
        limit
    };
    let off = if offset < 0 { 0 } else { offset };

    let mut sql = format!(
        "SELECT * FROM {}.{}",
        quote_pg_ident(schema_str),
        quote_pg_ident(&table)
    );
    if !where_clause.trim().is_empty() {
        sql.push_str(&format!(" WHERE {}", where_clause));
    }
    if !sort_col.trim().is_empty() {
        let order = if sort_order.trim().eq_ignore_ascii_case("DESC") {
            "DESC"
        } else {
            "ASC"
        };
        sql.push_str(&format!(" ORDER BY {} {}", quote_pg_ident(sort_col.trim()), order));
    }
    sql.push_str(&format!(" LIMIT {} OFFSET {}", lim, off));

    let rows = tokio::time::timeout(Duration::from_secs(30), client.query(&sql, &[]))
        .await
        .map_err(|_| "PostgreSQL 查询超时".to_string())?
        .map_err(|e| {
            let msg = e.to_string();
            storage::log_error(format!(
                "PostgreSQL 查询表数据失败 [ServerID={}, DB={}, Schema={}, Table={}]: {}",
                server_id, db_name, schema_str, table, msg
            ));
            msg
        })?;

    let mut columns = Vec::new();
    let mut column_types = Vec::new();
    if let Some(first) = rows.first() {
        for c in first.columns() {
            columns.push(c.name().to_string());
            column_types.push(format!("oid:{}", c.type_().oid()));
        }
    } else if let Ok(stmt) = client.prepare(&sql).await {
        for c in stmt.columns() {
            columns.push(c.name().to_string());
            column_types.push(format!("oid:{}", c.type_().oid()));
        }
    }

    let mut row_data = Vec::with_capacity(rows.len());
    for r in rows {
        let mut row_map = Map::with_capacity(columns.len());
        for (i, col) in columns.iter().enumerate() {
            row_map.insert(col.clone(), row_val(&r, i));
        }
        row_data.push(row_map);
    }

    let res = PostgresQueryResult {
        columns,
        column_types,
        affected: row_data.len() as i64,
        rows: row_data,
        duration_ms: start.elapsed().as_millis() as i64,
        error: String::new(),
    };
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn postgres_count(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
    table: String,
    where_clause: String,
) -> Result<i64, String> {
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let schema_str = if schema.trim().is_empty() {
        "public"
    } else {
        schema.trim()
    };
    let mut sql = format!(
        "SELECT count(1) FROM {}.{}",
        quote_pg_ident(schema_str),
        quote_pg_ident(&table)
    );
    if !where_clause.trim().is_empty() {
        sql.push_str(&format!(" WHERE {}", where_clause));
    }
    let row = client.query_one(&sql, &[]).await.map_err(|e| {
        let msg = e.to_string();
        storage::log_error(format!(
            "PostgreSQL 统计记录数失败 [ServerID={}, DB={}, Schema={}, Table={}]: {}",
            server_id, db_name, schema_str, table, msg
        ));
        msg
    })?;
    Ok(row_i64(&row, 0))
}

#[tauri::command]
pub async fn postgres_insert(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
    table: String,
    columns: Vec<String>,
    values: Vec<Value>,
) -> Result<i64, String> {
    storage::log_info(format!(
        "PostgreSQL 插入数据 [ServerID={}, DB={}, Schema={}, Table={}, Cols={:?}]",
        server_id, db_name, schema, table, columns
    ));
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let schema_str = if schema.trim().is_empty() {
        "public"
    } else {
        schema.trim()
    };
    let quoted_cols: Vec<String> = columns.iter().map(|c| quote_pg_ident(c)).collect();
    let val_literals: Vec<String> = values.iter().map(pg_sql_literal).collect();

    let sql = format!(
        "INSERT INTO {}.{} ({}) VALUES ({})",
        quote_pg_ident(schema_str),
        quote_pg_ident(&table),
        quoted_cols.join(", "),
        val_literals.join(", ")
    );

    let affected = client.execute(&sql, &[]).await.map_err(|e| {
        let msg = format!("插入数据失败: {}", e);
        storage::log_error(format!(
            "PostgreSQL 插入数据失败 [ServerID={}, DB={}, Schema={}, Table={}]: {}",
            server_id, db_name, schema_str, table, msg
        ));
        msg
    })?;
    Ok(affected as i64)
}

#[tauri::command]
pub async fn postgres_update(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
    table: String,
    set_cols: Vec<String>,
    set_vals: Vec<Value>,
    where_cols: Vec<String>,
    where_vals: Vec<Value>,
) -> Result<i64, String> {
    storage::log_info(format!(
        "PostgreSQL 更新数据 [ServerID={}, DB={}, Schema={}, Table={}, SetCols={:?}, WhereCols={:?}]",
        server_id, db_name, schema, table, set_cols, where_cols
    ));
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let schema_str = if schema.trim().is_empty() {
        "public"
    } else {
        schema.trim()
    };

    let mut set_clauses = Vec::with_capacity(set_cols.len());
    for (i, c) in set_cols.iter().enumerate() {
        let v = set_vals.get(i).unwrap_or(&Value::Null);
        set_clauses.push(format!("{} = {}", quote_pg_ident(c), pg_sql_literal(v)));
    }

    let mut where_clauses = Vec::with_capacity(where_cols.len());
    for (i, c) in where_cols.iter().enumerate() {
        let v = where_vals.get(i).unwrap_or(&Value::Null);
        if v.is_null() {
            where_clauses.push(format!("{} IS NULL", quote_pg_ident(c)));
        } else {
            where_clauses.push(format!("{} = {}", quote_pg_ident(c), pg_sql_literal(v)));
        }
    }

    let sql = format!(
        "UPDATE {}.{} SET {} WHERE {}",
        quote_pg_ident(schema_str),
        quote_pg_ident(&table),
        set_clauses.join(", "),
        where_clauses.join(" AND ")
    );

    let affected = client.execute(&sql, &[]).await.map_err(|e| {
        let msg = format!("更新数据失败: {}", e);
        storage::log_error(format!(
            "PostgreSQL 更新数据失败 [ServerID={}, DB={}, Schema={}, Table={}]: {}",
            server_id, db_name, schema_str, table, msg
        ));
        msg
    })?;
    Ok(affected as i64)
}

#[tauri::command]
pub async fn postgres_delete(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
    table: String,
    where_cols: Vec<String>,
    where_vals: Vec<Value>,
) -> Result<i64, String> {
    storage::log_info(format!(
        "PostgreSQL 删除数据 [ServerID={}, DB={}, Schema={}, Table={}, WhereCols={:?}]",
        server_id, db_name, schema, table, where_cols
    ));
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let schema_str = if schema.trim().is_empty() {
        "public"
    } else {
        schema.trim()
    };

    let mut where_clauses = Vec::with_capacity(where_cols.len());
    for (i, c) in where_cols.iter().enumerate() {
        let v = where_vals.get(i).unwrap_or(&Value::Null);
        if v.is_null() {
            where_clauses.push(format!("{} IS NULL", quote_pg_ident(c)));
        } else {
            where_clauses.push(format!("{} = {}", quote_pg_ident(c), pg_sql_literal(v)));
        }
    }

    let sql = format!(
        "DELETE FROM {}.{} WHERE {}",
        quote_pg_ident(schema_str),
        quote_pg_ident(&table),
        where_clauses.join(" AND ")
    );

    let affected = client.execute(&sql, &[]).await.map_err(|e| {
        let msg = format!("删除数据失败: {}", e);
        storage::log_error(format!(
            "PostgreSQL 删除数据失败 [ServerID={}, DB={}, Schema={}, Table={}]: {}",
            server_id, db_name, schema_str, table, msg
        ));
        msg
    })?;
    Ok(affected as i64)
}

#[tauri::command]
pub async fn postgres_run(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    sql_text: String,
) -> Result<Value, String> {
    storage::log_info(format!(
        "PostgreSQL 执行 SQL [ServerID={}, DB={}, SQL={}]",
        server_id, db_name, sql_text
    ));
    let start = Instant::now();
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let trimmed = sql_text.trim();

    if is_pg_read_query(trimmed) {
        let rows = tokio::time::timeout(Duration::from_secs(60), client.query(trimmed, &[]))
            .await
            .map_err(|_| "PostgreSQL 查询超时".to_string())?
            .map_err(|e| {
                let msg = e.to_string();
                storage::log_error(format!(
                    "PostgreSQL 执行 SQL 失败 [ServerID={}, DB={}]: {}",
                    server_id, db_name, msg
                ));
                msg
            })?;

        let mut columns = Vec::new();
        if let Some(first) = rows.first() {
            for c in first.columns() {
                columns.push(c.name().to_string());
            }
        } else if let Ok(stmt) = client.prepare(trimmed).await {
            for c in stmt.columns() {
                columns.push(c.name().to_string());
            }
        }

        let mut row_data = Vec::with_capacity(rows.len());
        for r in rows {
            let mut row_map = Map::with_capacity(columns.len());
            for (i, col) in columns.iter().enumerate() {
                row_map.insert(col.clone(), row_val(&r, i));
            }
            row_data.push(row_map);
        }

        let res = PostgresQueryResult {
            columns,
            column_types: Vec::new(),
            affected: row_data.len() as i64,
            rows: row_data,
            duration_ms: start.elapsed().as_millis() as i64,
            error: String::new(),
        };
        return serde_json::to_value(res).map_err(|e| e.to_string());
    }

    let affected = tokio::time::timeout(Duration::from_secs(60), client.execute(trimmed, &[]))
        .await
        .map_err(|_| "PostgreSQL 执行超时".to_string())?
        .map_err(|e| {
            let msg = e.to_string();
            storage::log_error(format!(
                "PostgreSQL 执行 SQL 失败 [ServerID={}, DB={}]: {}",
                server_id, db_name, msg
            ));
            msg
        })?;

    let res = PostgresQueryResult {
        columns: Vec::new(),
        column_types: Vec::new(),
        rows: Vec::new(),
        affected: affected as i64,
        duration_ms: start.elapsed().as_millis() as i64,
        error: String::new(),
    };
    serde_json::to_value(res).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn postgres_explain(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    sql_text: String,
    analyze: bool,
    buffers: bool,
    verbose: bool,
) -> Result<String, String> {
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let mut opts = vec!["FORMAT JSON"];
    if analyze {
        opts.push("ANALYZE true");
    }
    if buffers {
        opts.push("BUFFERS true");
    }
    if verbose {
        opts.push("VERBOSE true");
    }
    let explain_sql = format!("EXPLAIN ({}) {}", opts.join(", "), sql_text);
    let row = client
        .query_one(&explain_sql, &[])
        .await
        .map_err(|e| format!("执行 EXPLAIN 失败: {}", e))?;
    Ok(row_str(&row, 0))
}

