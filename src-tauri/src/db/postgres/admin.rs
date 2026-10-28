use crate::db::postgres::manager::{quote_pg_ident, row_bool, row_i32, row_i64, row_str};
use crate::db::postgres::types::{
    PgDatabase, PgFunction, PgRole, PgSchema, PgSequence, PgSession, PgStatus, PgTable,
};
use crate::storage;
use crate::AppState;
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub async fn postgres_databases(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<Value>, String> {
    let client = state.postgres.get_client(&server_id, "postgres").await?;
    let query = r#"
        SELECT 
            d.datname,
            COALESCE(pg_catalog.pg_get_userbyid(d.datdba), '') AS owner,
            COALESCE(pg_catalog.pg_encoding_to_char(d.encoding), '') AS encoding,
            COALESCE(d.datcollate, '') AS collate,
            '' AS size,
            0::bigint AS size_bytes
        FROM pg_catalog.pg_database d
        WHERE d.datistemplate = false
        ORDER BY d.datname ASC;
    "#;
    let rows = client.query(query, &[]).await.map_err(|e| {
        let msg = format!("获取数据库列表失败: {}", e);
        storage::log_error(format!(
            "获取 PostgreSQL 数据库列表失败 [ServerID={}]: {}",
            server_id, msg
        ));
        msg
    })?;
    let mut result = Vec::with_capacity(rows.len());
    for r in rows {
        let db = PgDatabase {
            name: row_str(&r, 0),
            owner: row_str(&r, 1),
            encoding: row_str(&r, 2),
            collate: row_str(&r, 3),
            size: row_str(&r, 4),
            size_bytes: row_i64(&r, 5),
            table_count: 0,
        };
        if let Ok(val) = serde_json::to_value(db) {
            result.push(val);
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn postgres_schemas(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
) -> Result<Vec<Value>, String> {
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let query = r#"
        SELECT 
            n.nspname AS schema_name,
            COALESCE(r.rolname, '') AS owner,
            COALESCE(t.table_count, 0) AS table_count,
            COALESCE(t.view_count, 0) AS view_count,
            COALESCE(p.function_count, 0) AS function_count
        FROM pg_catalog.pg_namespace n
        LEFT JOIN pg_catalog.pg_roles r ON r.oid = n.nspowner
        LEFT JOIN (
            SELECT 
                relnamespace,
                count(1) FILTER (WHERE relkind IN ('r', 'p', 'f')) AS table_count,
                count(1) FILTER (WHERE relkind IN ('v', 'm')) AS view_count
            FROM pg_catalog.pg_class
            GROUP BY relnamespace
        ) t ON t.relnamespace = n.oid
        LEFT JOIN (
            SELECT 
                pronamespace,
                count(1) AS function_count
            FROM pg_catalog.pg_proc
            GROUP BY pronamespace
        ) p ON p.pronamespace = n.oid
        WHERE n.nspname NOT LIKE 'pg_toast%'
        ORDER BY 
            CASE WHEN n.nspname = 'public' THEN 0 ELSE 1 END,
            n.nspname ASC;
    "#;
    let rows = client.query(query, &[]).await.map_err(|e| {
        let msg = format!("获取 Schema 列表失败: {}", e);
        storage::log_error(format!(
            "获取 PostgreSQL 模式列表失败 [ServerID={}, DB={}]: {}",
            server_id, db_name, msg
        ));
        msg
    })?;
    let mut result = Vec::with_capacity(rows.len());
    for r in rows {
        let s = PgSchema {
            name: row_str(&r, 0),
            owner: row_str(&r, 1),
            table_count: row_i32(&r, 2),
            view_count: row_i32(&r, 3),
            function_count: row_i32(&r, 4),
        };
        if let Ok(val) = serde_json::to_value(s) {
            result.push(val);
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn postgres_tables(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
) -> Result<Vec<Value>, String> {
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let schema_str = if schema.trim().is_empty() {
        "public"
    } else {
        schema.trim()
    };
    let query = r#"
        SELECT
            c.relname AS table_name,
            n.nspname AS schema_name,
            CASE c.relkind
                WHEN 'r' THEN 'BASE TABLE'
                WHEN 'v' THEN 'VIEW'
                WHEN 'm' THEN 'MATERIALIZED VIEW'
                WHEN 'f' THEN 'FOREIGN TABLE'
                WHEN 'p' THEN 'PARTITIONED TABLE'
                ELSE 'OTHER'
            END AS table_type,
            GREATEST(0, c.reltuples::bigint) AS row_count,
            '' AS total_size,
            '' AS table_size,
            '' AS index_size,
            '' AS comment
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relkind IN ('r', 'v', 'm', 'f', 'p')
        ORDER BY c.relname ASC;
    "#;
    let rows = client.query(query, &[&schema_str]).await.map_err(|e| {
        let msg = format!("获取表列表失败: {}", e);
        storage::log_error(format!(
            "获取 PostgreSQL 数据表列表失败 [ServerID={}, DB={}, Schema={}]: {}",
            server_id, db_name, schema_str, msg
        ));
        msg
    })?;
    let mut result = Vec::with_capacity(rows.len());
    for r in rows {
        let mut t = PgTable {
            name: row_str(&r, 0),
            schema: row_str(&r, 1),
            table_type: row_str(&r, 2),
            row_count: row_i64(&r, 3),
            total_size: row_str(&r, 4),
            table_size: row_str(&r, 5),
            index_size: row_str(&r, 6),
            comment: row_str(&r, 7),
        };
        if t.row_count < 0 {
            t.row_count = 0;
        }
        if let Ok(val) = serde_json::to_value(t) {
            result.push(val);
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn postgres_sequences(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
) -> Result<Vec<Value>, String> {
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let schema_str = if schema.trim().is_empty() {
        "public"
    } else {
        schema.trim()
    };
    let query = r#"
        SELECT
            c.relname AS sequence_name,
            n.nspname AS schema_name,
            s.seqtypid::regtype::text AS data_type,
            s.seqstart AS start_value,
            s.seqmin AS min_value,
            s.seqmax AS max_value,
            s.seqincrement AS increment
        FROM pg_catalog.pg_sequence s
        JOIN pg_catalog.pg_class c ON c.oid = s.seqrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
        ORDER BY c.relname ASC;
    "#;
    let rows = client
        .query(query, &[&schema_str])
        .await
        .map_err(|e| format!("获取序列列表失败: {}", e))?;
    let mut result = Vec::with_capacity(rows.len());
    for r in rows {
        let s = PgSequence {
            name: row_str(&r, 0),
            schema: row_str(&r, 1),
            data_type: row_str(&r, 2),
            start_value: row_i64(&r, 3),
            min_value: row_i64(&r, 4),
            max_value: row_i64(&r, 5),
            increment: row_i64(&r, 6),
            current_value: 0,
            last_value: 0,
        };
        if let Ok(val) = serde_json::to_value(s) {
            result.push(val);
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn postgres_functions(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
) -> Result<Vec<Value>, String> {
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let schema_str = if schema.trim().is_empty() {
        "public"
    } else {
        schema.trim()
    };
    let query = r#"
        SELECT
            p.proname AS func_name,
            n.nspname AS schema_name,
            pg_catalog.pg_get_function_result(p.oid) AS result_type,
            pg_catalog.pg_get_function_arguments(p.oid) AS arg_types,
            l.lanname AS language,
            COALESCE(pg_catalog.pg_get_functiondef(p.oid), '') AS def,
            COALESCE(pg_catalog.obj_description(p.oid, 'pg_proc'), '') AS comment,
            p.prokind = 'p' AS is_proc
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_catalog.pg_language l ON l.oid = p.prolang
        WHERE n.nspname = $1
        ORDER BY p.proname ASC;
    "#;
    let rows = client
        .query(query, &[&schema_str])
        .await
        .map_err(|e| format!("获取函数列表失败: {}", e))?;
    let mut result = Vec::with_capacity(rows.len());
    for r in rows {
        let f = PgFunction {
            name: row_str(&r, 0),
            schema: row_str(&r, 1),
            result_type: row_str(&r, 2),
            arg_types: row_str(&r, 3),
            arg_names: Vec::new(),
            language: row_str(&r, 4),
            def: row_str(&r, 5),
            comment: row_str(&r, 6),
            is_proc: row_bool(&r, 7),
        };
        if let Ok(val) = serde_json::to_value(f) {
            result.push(val);
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn postgres_describe(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
    table: String,
) -> Result<Value, String> {
    let schema_str = if schema.trim().is_empty() {
        "public".to_string()
    } else {
        schema.trim().to_string()
    };
    let (columns, constraints, indexes, pk_map) = state
        .postgres
        .describe_internal(&server_id, &db_name, &schema_str, &table)
        .await
        .map_err(|e| {
            storage::log_error(format!(
                "PostgreSQL Describe 表结构失败 [ServerID={}, DB={}, Schema={}, Table={}]: {}",
                server_id, db_name, schema_str, table, e
            ));
            e
        })?;

    Ok(json!({
        "schema": schema_str,
        "table": table,
        "columns": columns,
        "constraints": constraints,
        "indexes": indexes,
        "primaryKeys": pk_map,
    }))
}

#[tauri::command]
pub async fn postgres_table_ddl(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
    table: String,
) -> Result<String, String> {
    let schema_str = if schema.trim().is_empty() {
        "public".to_string()
    } else {
        schema.trim().to_string()
    };
    let (cols, _constraints, indexes, _pk_map) = state
        .postgres
        .describe_internal(&server_id, &db_name, &schema_str, &table)
        .await?;

    let mut col_defs = Vec::new();
    let mut pks = Vec::new();

    for col in cols {
        let mut type_str = col.udt_name.clone();
        if col.data_type == "character varying" {
            if col.char_max_length > 0 {
                type_str = format!("VARCHAR({})", col.char_max_length);
            } else {
                type_str = "VARCHAR".to_string();
            }
        } else if col.data_type == "character" {
            if col.char_max_length > 0 {
                type_str = format!("CHAR({})", col.char_max_length);
            } else {
                type_str = "CHAR".to_string();
            }
        } else if col.data_type == "numeric" && col.num_precision > 0 {
            type_str = format!("NUMERIC({},{})", col.num_precision, col.num_scale);
        }

        let mut col_def = format!("  \"{}\" {}", col.name, type_str.to_uppercase());
        if !col.is_nullable {
            col_def.push_str(" NOT NULL");
        }
        if !col.default_val.is_empty() {
            col_def.push_str(&format!(" DEFAULT {}", col.default_val));
        }
        col_defs.push(col_def);

        if col.is_primary_key {
            pks.push(format!("\"{}\"", col.name));
        }
    }

    if !pks.is_empty() {
        col_defs.push(format!("  PRIMARY KEY ({})", pks.join(", ")));
    }

    let mut ddl = format!(
        "CREATE TABLE \"{}\".\"{}\" (\n{}\n);",
        schema_str,
        table,
        col_defs.join(",\n")
    );

    for idx in indexes {
        if !idx.is_primary && !idx.def.is_empty() {
            ddl.push_str(&format!("\n{};", idx.def));
        }
    }

    Ok(ddl)
}

#[tauri::command]
pub async fn postgres_sessions(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
) -> Result<Vec<Value>, String> {
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let query = r#"
        SELECT 
            pid,
            COALESCE(usename, '') AS user,
            COALESCE(datname, '') AS database,
            COALESCE(client_addr::text, 'local') AS client_addr,
            COALESCE(client_port, 0) AS client_port,
            COALESCE(backend_start::text, '') AS backend_start,
            COALESCE(query_start::text, '') AS query_start,
            COALESCE(state_change::text, '') AS state_change,
            COALESCE(wait_event_type, '') AS wait_event_type,
            COALESCE(wait_event, '') AS wait_event,
            COALESCE(state, 'unknown') AS state,
            COALESCE(query, '') AS query,
            COALESCE(EXTRACT(EPOCH FROM (now() - query_start))::bigint, 0) AS duration_sec
        FROM pg_stat_activity
        ORDER BY 
            CASE WHEN state = 'active' THEN 0 ELSE 1 END,
            query_start DESC NULLS LAST;
    "#;
    let rows = client
        .query(query, &[])
        .await
        .map_err(|e| format!("获取会话列表失败: {}", e))?;
    let mut result = Vec::with_capacity(rows.len());
    for r in rows {
        let s = PgSession {
            pid: row_i32(&r, 0),
            user: row_str(&r, 1),
            database: row_str(&r, 2),
            client_addr: row_str(&r, 3),
            client_port: row_i32(&r, 4),
            backend_start: row_str(&r, 5),
            query_start: row_str(&r, 6),
            state_change: row_str(&r, 7),
            wait_event_type: row_str(&r, 8),
            wait_event: row_str(&r, 9),
            state: row_str(&r, 10),
            query: row_str(&r, 11),
            duration_sec: row_i64(&r, 12),
        };
        if let Ok(val) = serde_json::to_value(s) {
            result.push(val);
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn postgres_kill_session(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    pid: i32,
    terminate: bool,
) -> Result<bool, String> {
    storage::log_info(format!(
        "PostgreSQL 终止会话 [ServerID={}, DB={}, PID={}, Terminate={}]",
        server_id, db_name, pid, terminate
    ));
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let func_name = if terminate {
        "pg_terminate_backend"
    } else {
        "pg_cancel_backend"
    };
    let sql = format!("SELECT {}({})", func_name, pid);
    let row = client.query_one(&sql, &[]).await.map_err(|e| {
        let msg = format!("终止会话失败: {}", e);
        storage::log_error(format!(
            "PostgreSQL 终止会话失败 [ServerID={}, PID={}]: {}",
            server_id, pid, msg
        ));
        msg
    })?;
    Ok(row_bool(&row, 0))
}

#[tauri::command]
pub async fn postgres_status(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
) -> Result<Value, String> {
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let mut st = PgStatus::default();

    if let Ok(row) = client.query_one("SELECT version()", &[]).await {
        st.version = row_str(&row, 0);
    }

    if let Ok(row) = client
        .query_one(
            "SELECT COALESCE(EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time()))::bigint, 0)",
            &[],
        )
        .await
    {
        let uptime_sec = row_i64(&row, 0);
        if uptime_sec > 0 {
            let d = uptime_sec / 86400;
            let h = (uptime_sec % 86400) / 3600;
            let m = (uptime_sec % 3600) / 60;
            let s = uptime_sec % 60;
            if d > 0 {
                st.uptime = format!("{}天 {}小时 {}分", d, h, m);
            } else if h > 0 {
                st.uptime = format!("{}小时 {}分 {}秒", h, m, s);
            } else {
                st.uptime = format!("{}分 {}秒", m, s);
            }
        }
    }
    if st.uptime.is_empty() {
        st.uptime = "-".to_string();
    }

    if let Ok(row) = client.query_one("SELECT count(1) FROM pg_stat_activity", &[]).await {
        st.active_connections = row_i32(&row, 0);
    }
    if let Ok(row) = client
        .query_one("SELECT current_setting('max_connections')::int", &[])
        .await
    {
        st.max_connections = row_i32(&row, 0);
    }
    if let Ok(row) = client
        .query_one("SELECT pg_size_pretty(pg_database_size(current_database()))", &[])
        .await
    {
        st.database_size = row_str(&row, 0);
    }

    let hit_ratio_query = r#"
        SELECT 
            COALESCE(
                ROUND(
                    (sum(heap_blks_hit) * 100.0 / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0)), 2
                )::text || '%',
                '100%'
            )
        FROM pg_statio_user_tables;
    "#;
    if let Ok(row) = client.query_one(hit_ratio_query, &[]).await {
        st.cache_hit_ratio = row_str(&row, 0);
    }
    if st.cache_hit_ratio.is_empty() {
        st.cache_hit_ratio = "100%".to_string();
    }

    let deadlocks_query = "SELECT COALESCE(deadlocks, 0), COALESCE(temp_files, 0), pg_size_pretty(COALESCE(temp_bytes, 0)) FROM pg_stat_database WHERE datname = current_database();";
    if let Ok(row) = client.query_one(deadlocks_query, &[]).await {
        st.deadlocks = row_i64(&row, 0);
        st.temp_files = row_i64(&row, 1);
        st.temp_bytes = row_str(&row, 2);
    }

    serde_json::to_value(st).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn postgres_roles(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<Value>, String> {
    let client = state.postgres.get_client(&server_id, "postgres").await?;
    let query = r#"
        SELECT 
            r.rolname,
            r.rolsuper,
            r.rolinherit,
            r.rolcreaterole,
            r.rolcreatedb,
            r.rolcanlogin,
            r.rolreplication,
            r.rolconnlimit,
            COALESCE(r.rolvaliduntil::text, 'infinity') AS valuntil,
            ARRAY(SELECT b.rolname FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles b ON (m.roleid = b.oid) WHERE m.member = r.oid)::text AS member_of
        FROM pg_catalog.pg_roles r
        ORDER BY r.rolname ASC;
    "#;
    let rows = client
        .query(query, &[])
        .await
        .map_err(|e| format!("获取角色列表失败: {}", e))?;
    let mut result = Vec::with_capacity(rows.len());
    for r in rows {
        let role = PgRole {
            name: row_str(&r, 0),
            is_super: row_bool(&r, 1),
            inherit: row_bool(&r, 2),
            create_role: row_bool(&r, 3),
            create_db: row_bool(&r, 4),
            can_login: row_bool(&r, 5),
            replication: row_bool(&r, 6),
            conn_limit: row_i32(&r, 7),
            valid_until: row_str(&r, 8),
            member_of: row_str(&r, 9),
        };
        if let Ok(val) = serde_json::to_value(role) {
            result.push(val);
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn postgres_create_role(
    state: State<'_, AppState>,
    server_id: String,
    role_name: String,
    password: String,
    super_user: bool,
    can_login: bool,
    create_db: bool,
    create_role: bool,
    conn_limit: i32,
) -> Result<(), String> {
    storage::log_info(format!(
        "PostgreSQL 创建角色 [ServerID={}, Role={}, Super={}, Login={}]",
        server_id, role_name, super_user, can_login
    ));
    let client = state.postgres.get_client(&server_id, "postgres").await?;
    let mut opts = Vec::new();
    opts.push(if can_login {
        "LOGIN".to_string()
    } else {
        "NOLOGIN".to_string()
    });
    opts.push(if super_user {
        "SUPERUSER".to_string()
    } else {
        "NOSUPERUSER".to_string()
    });
    opts.push(if create_db {
        "CREATEDB".to_string()
    } else {
        "NOCREATEDB".to_string()
    });
    opts.push(if create_role {
        "CREATEROLE".to_string()
    } else {
        "NOCREATEROLE".to_string()
    });
    if conn_limit > 0 {
        opts.push(format!("CONNECTION LIMIT {}", conn_limit));
    }
    if !password.trim().is_empty() {
        let escaped_pass = password.replace('\'', "''");
        opts.push(format!("PASSWORD '{}'", escaped_pass));
    }

    let sql = format!(
        "CREATE ROLE {} WITH {}",
        quote_pg_ident(&role_name),
        opts.join(" ")
    );
    client
        .execute(&sql, &[])
        .await
        .map(|_| ())
        .map_err(|e| {
            storage::log_error(format!(
                "PostgreSQL 创建角色失败 [ServerID={}, Role={}]: {}",
                server_id, role_name, e
            ));
            e.to_string()
        })
}

#[tauri::command]
pub async fn postgres_update_role_password(
    state: State<'_, AppState>,
    server_id: String,
    role_name: String,
    new_password: String,
) -> Result<(), String> {
    storage::log_info(format!(
        "PostgreSQL 修改角色密码 [ServerID={}, Role={}]",
        server_id, role_name
    ));
    let client = state.postgres.get_client(&server_id, "postgres").await?;
    let escaped_pass = new_password.replace('\'', "''");
    let sql = format!(
        "ALTER ROLE {} WITH PASSWORD '{}'",
        quote_pg_ident(&role_name),
        escaped_pass
    );
    client
        .execute(&sql, &[])
        .await
        .map(|_| ())
        .map_err(|e| {
            storage::log_error(format!(
                "PostgreSQL 修改角色密码失败 [ServerID={}, Role={}]: {}",
                server_id, role_name, e
            ));
            e.to_string()
        })
}

#[tauri::command]
pub async fn postgres_drop_role(
    state: State<'_, AppState>,
    server_id: String,
    role_name: String,
) -> Result<(), String> {
    storage::log_info(format!(
        "PostgreSQL 删除角色 [ServerID={}, Role={}]",
        server_id, role_name
    ));
    let client = state.postgres.get_client(&server_id, "postgres").await?;
    let sql = format!("DROP ROLE {}", quote_pg_ident(&role_name));
    client
        .execute(&sql, &[])
        .await
        .map(|_| ())
        .map_err(|e| {
            storage::log_error(format!(
                "PostgreSQL 删除角色失败 [ServerID={}, Role={}]: {}",
                server_id, role_name, e
            ));
            e.to_string()
        })
}

#[tauri::command]
pub async fn postgres_grant_privileges(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    role_name: String,
    schema: String,
    table: String,
    privileges: String,
    is_grant: bool,
) -> Result<(), String> {
    storage::log_info(format!(
        "PostgreSQL 权限管理 [ServerID={}, DB={}, Role={}, Schema={}, Table={}, Privs={}, IsGrant={}]",
        server_id, db_name, role_name, schema, table, privileges, is_grant
    ));
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let schema_str = if schema.trim().is_empty() {
        "public"
    } else {
        schema.trim()
    };
    let (verb, to_from) = if is_grant {
        ("GRANT", "TO")
    } else {
        ("REVOKE", "FROM")
    };
    let target = if !table.trim().is_empty() {
        format!(
            "ON {}.{}",
            quote_pg_ident(schema_str),
            quote_pg_ident(table.trim())
        )
    } else {
        format!("ON SCHEMA {}", quote_pg_ident(schema_str))
    };
    let sql = format!(
        "{} {} {} {} {}",
        verb,
        privileges,
        target,
        to_from,
        quote_pg_ident(&role_name)
    );
    client
        .execute(&sql, &[])
        .await
        .map(|_| ())
        .map_err(|e| {
            storage::log_error(format!(
                "PostgreSQL 权限管理操作失败 [ServerID={}, Role={}]: {}",
                server_id, role_name, e
            ));
            e.to_string()
        })
}

#[tauri::command]
pub async fn postgres_create_database(
    state: State<'_, AppState>,
    server_id: String,
    name: String,
    owner: String,
    encoding: String,
    template: String,
) -> Result<(), String> {
    storage::log_info(format!(
        "PostgreSQL 创建数据库 [ServerID={}, Name={}, Owner={}, Encoding={}]",
        server_id, name, owner, encoding
    ));
    let client = state.postgres.get_client(&server_id, "postgres").await?;
    let mut sql = format!("CREATE DATABASE {}", quote_pg_ident(&name));
    let mut opts = Vec::new();
    if !owner.trim().is_empty() {
        opts.push(format!("OWNER = {}", quote_pg_ident(owner.trim())));
    }
    if !encoding.trim().is_empty() {
        opts.push(format!(
            "ENCODING = '{}'",
            encoding.trim().replace('\'', "''")
        ));
    }
    if !template.trim().is_empty() {
        opts.push(format!("TEMPLATE = {}", quote_pg_ident(template.trim())));
    }
    if !opts.is_empty() {
        sql.push_str(" WITH ");
        sql.push_str(&opts.join(" "));
    }
    client
        .execute(&sql, &[])
        .await
        .map(|_| ())
        .map_err(|e| {
            storage::log_error(format!(
                "PostgreSQL 创建数据库失败 [ServerID={}, Name={}]: {}",
                server_id, name, e
            ));
            e.to_string()
        })
}

#[tauri::command]
pub async fn postgres_drop_database(
    state: State<'_, AppState>,
    server_id: String,
    name: String,
) -> Result<(), String> {
    storage::log_info(format!(
        "PostgreSQL 删除数据库 [ServerID={}, Name={}]",
        server_id, name
    ));
    let client = state.postgres.get_client(&server_id, "postgres").await?;
    let sql = format!("DROP DATABASE {}", quote_pg_ident(&name));
    client
        .execute(&sql, &[])
        .await
        .map(|_| ())
        .map_err(|e| {
            storage::log_error(format!(
                "PostgreSQL 删除数据库失败 [ServerID={}, Name={}]: {}",
                server_id, name, e
            ));
            e.to_string()
        })
}

#[tauri::command]
pub async fn postgres_create_schema(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
    owner: String,
) -> Result<(), String> {
    storage::log_info(format!(
        "PostgreSQL 创建模式 [ServerID={}, DB={}, Schema={}, Owner={}]",
        server_id, db_name, schema, owner
    ));
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let mut sql = format!("CREATE SCHEMA {}", quote_pg_ident(&schema));
    if !owner.trim().is_empty() {
        sql.push_str(&format!(" AUTHORIZATION {}", quote_pg_ident(owner.trim())));
    }
    client
        .execute(&sql, &[])
        .await
        .map(|_| ())
        .map_err(|e| {
            storage::log_error(format!(
                "PostgreSQL 创建模式失败 [ServerID={}, DB={}, Schema={}]: {}",
                server_id, db_name, schema, e
            ));
            e.to_string()
        })
}

#[tauri::command]
pub async fn postgres_drop_schema(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
    cascade: bool,
) -> Result<(), String> {
    storage::log_info(format!(
        "PostgreSQL 删除模式 [ServerID={}, DB={}, Schema={}, Cascade={}]",
        server_id, db_name, schema, cascade
    ));
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let mut sql = format!("DROP SCHEMA {}", quote_pg_ident(&schema));
    if cascade {
        sql.push_str(" CASCADE");
    }
    client
        .execute(&sql, &[])
        .await
        .map(|_| ())
        .map_err(|e| {
            storage::log_error(format!(
                "PostgreSQL 删除模式失败 [ServerID={}, DB={}, Schema={}]: {}",
                server_id, db_name, schema, e
            ));
            e.to_string()
        })
}

#[tauri::command]
pub async fn postgres_create_table(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
    table: String,
    defs: String,
) -> Result<(), String> {
    storage::log_info(format!(
        "PostgreSQL 创建数据表 [ServerID={}, DB={}, Schema={}, Table={}]",
        server_id, db_name, schema, table
    ));
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let schema_str = if schema.trim().is_empty() {
        "public"
    } else {
        schema.trim()
    };
    let sql = format!(
        "CREATE TABLE {}.{}(\n{}\n);",
        quote_pg_ident(schema_str),
        quote_pg_ident(&table),
        defs
    );
    client
        .execute(&sql, &[])
        .await
        .map(|_| ())
        .map_err(|e| {
            storage::log_error(format!(
                "PostgreSQL 创建数据表失败 [ServerID={}, DB={}, Schema={}, Table={}]: {}",
                server_id, db_name, schema_str, table, e
            ));
            e.to_string()
        })
}

#[tauri::command]
pub async fn postgres_drop_table(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
    table: String,
    cascade: bool,
) -> Result<(), String> {
    storage::log_info(format!(
        "PostgreSQL 删除数据表 [ServerID={}, DB={}, Schema={}, Table={}, Cascade={}]",
        server_id, db_name, schema, table, cascade
    ));
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let schema_str = if schema.trim().is_empty() {
        "public"
    } else {
        schema.trim()
    };
    let mut sql = format!(
        "DROP TABLE {}.{}",
        quote_pg_ident(schema_str),
        quote_pg_ident(&table)
    );
    if cascade {
        sql.push_str(" CASCADE");
    }
    client
        .execute(&sql, &[])
        .await
        .map(|_| ())
        .map_err(|e| {
            storage::log_error(format!(
                "PostgreSQL 删除数据表失败 [ServerID={}, DB={}, Schema={}, Table={}]: {}",
                server_id, db_name, schema_str, table, e
            ));
            e.to_string()
        })
}

#[tauri::command]
pub async fn postgres_truncate_table(
    state: State<'_, AppState>,
    server_id: String,
    db_name: String,
    schema: String,
    table: String,
    restart_identity: bool,
    cascade: bool,
) -> Result<(), String> {
    storage::log_info(format!(
        "PostgreSQL 清空数据表 [ServerID={}, DB={}, Schema={}, Table={}]",
        server_id, db_name, schema, table
    ));
    let client = state.postgres.get_client(&server_id, &db_name).await?;
    let schema_str = if schema.trim().is_empty() {
        "public"
    } else {
        schema.trim()
    };
    let mut sql = format!(
        "TRUNCATE TABLE {}.{}",
        quote_pg_ident(schema_str),
        quote_pg_ident(&table)
    );
    if restart_identity {
        sql.push_str(" RESTART IDENTITY");
    }
    if cascade {
        sql.push_str(" CASCADE");
    }
    client
        .execute(&sql, &[])
        .await
        .map(|_| ())
        .map_err(|e| {
            storage::log_error(format!(
                "PostgreSQL 清空数据表失败 [ServerID={}, DB={}, Schema={}, Table={}]: {}",
                server_id, db_name, schema_str, table, e
            ));
            e.to_string()
        })
}

