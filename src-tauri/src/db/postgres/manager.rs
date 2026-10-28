use crate::core::ServerConfig;
use crate::db::postgres::types::{PgColumn, PgConstraint, PgIndex};
use crate::tunnel::SshTunnel;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::error::Error;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tokio_postgres::types::{FromSql, Type};
use tokio_postgres::{Client, Config, NoTls, Row};

pub(crate) struct PgAnyValue(pub(crate) Value);

pub(crate) fn decode_pg_numeric(raw: &[u8]) -> Option<String> {
    if raw.len() < 8 {
        return None;
    }
    let ndigits = u16::from_be_bytes([raw[0], raw[1]]) as usize;
    let weight = i16::from_be_bytes([raw[2], raw[3]]) as i32;
    let sign = u16::from_be_bytes([raw[4], raw[5]]);
    let dscale = u16::from_be_bytes([raw[6], raw[7]]) as usize;
    if sign == 0xC000 {
        return Some("NaN".to_string());
    }
    if raw.len() < 8 + ndigits * 2 {
        return None;
    }
    if ndigits == 0 {
        if dscale > 0 {
            return Some(format!("0.{}", "0".repeat(dscale)));
        }
        return Some("0".to_string());
    }
    let mut digits = Vec::with_capacity(ndigits);
    for i in 0..ndigits {
        let off = 8 + i * 2;
        digits.push(u16::from_be_bytes([raw[off], raw[off + 1]]));
    }

    let mut out = String::new();
    if sign == 0x4000 {
        out.push('-');
    }

    if weight < 0 {
        out.push('0');
    } else {
        for idx in 0..=weight {
            let d = digits.get(idx as usize).copied().unwrap_or(0);
            if idx == 0 {
                out.push_str(&d.to_string());
            } else {
                out.push_str(&format!("{:04}", d));
            }
        }
    }

    if dscale > 0 {
        out.push('.');
        let mut frac = String::new();
        for idx in (weight + 1)..(weight + 1 + ((dscale as i32 + 3) / 4)) {
            if idx < 0 {
                frac.push_str("0000");
            } else {
                let d = digits.get(idx as usize).copied().unwrap_or(0);
                frac.push_str(&format!("{:04}", d));
            }
        }
        frac.truncate(dscale);
        while frac.len() < dscale {
            frac.push('0');
        }
        out.push_str(&frac);
    }

    Some(out)
}

impl<'a> FromSql<'a> for PgAnyValue {
    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        if *ty == Type::BOOL {
            let b = bool::from_sql(ty, raw)?;
            return Ok(PgAnyValue(Value::Bool(b)));
        }
        if *ty == Type::INT2 {
            let v = i16::from_sql(ty, raw)?;
            return Ok(PgAnyValue(json!(v)));
        }
        if *ty == Type::INT4 {
            let v = i32::from_sql(ty, raw)?;
            return Ok(PgAnyValue(json!(v)));
        }
        if *ty == Type::INT8 {
            let v = i64::from_sql(ty, raw)?;
            return Ok(PgAnyValue(json!(v)));
        }
        if *ty == Type::OID {
            let v = u32::from_sql(ty, raw)?;
            return Ok(PgAnyValue(json!(v)));
        }
        if *ty == Type::FLOAT4 {
            let v = f32::from_sql(ty, raw)?;
            return Ok(PgAnyValue(json!(v)));
        }
        if *ty == Type::FLOAT8 {
            let v = f64::from_sql(ty, raw)?;
            return Ok(PgAnyValue(json!(v)));
        }
        if *ty == Type::NUMERIC {
            if let Some(s) = decode_pg_numeric(raw) {
                return Ok(PgAnyValue(Value::String(s)));
            }
        }
        if *ty == Type::TIMESTAMP {
            if let Ok(dt) = chrono::NaiveDateTime::from_sql(ty, raw) {
                return Ok(PgAnyValue(Value::String(
                    dt.format("%Y-%m-%d %H:%M:%S%.6f").to_string(),
                )));
            }
        }
        if *ty == Type::TIMESTAMPTZ {
            if let Ok(dt) = chrono::DateTime::<chrono::Utc>::from_sql(ty, raw) {
                return Ok(PgAnyValue(Value::String(
                    dt.with_timezone(&chrono::Local)
                        .format("%Y-%m-%d %H:%M:%S%.6f%:z")
                        .to_string(),
                )));
            }
        }
        if *ty == Type::DATE {
            if let Ok(d) = chrono::NaiveDate::from_sql(ty, raw) {
                return Ok(PgAnyValue(Value::String(d.format("%Y-%m-%d").to_string())));
            }
        }
        if *ty == Type::TIME {
            if let Ok(t) = chrono::NaiveTime::from_sql(ty, raw) {
                return Ok(PgAnyValue(Value::String(t.format("%H:%M:%S").to_string())));
            }
        }
        if *ty == Type::UUID && raw.len() == 16 {
            if let Ok(u) = uuid::Uuid::from_slice(raw) {
                return Ok(PgAnyValue(Value::String(u.to_string())));
            }
        }
        if *ty == Type::JSON || *ty == Type::JSONB {
            if let Ok(v) = Value::from_sql(ty, raw) {
                return Ok(PgAnyValue(Value::String(v.to_string())));
            }
        }
        Ok(PgAnyValue(Value::String(
            String::from_utf8_lossy(raw).to_string(),
        )))
    }

    fn from_sql_null(_ty: &Type) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(PgAnyValue(Value::Null))
    }

    fn accepts(_ty: &Type) -> bool {
        true
    }
}

pub(crate) fn row_val(row: &Row, idx: usize) -> Value {
    row.try_get::<_, PgAnyValue>(idx)
        .map(|v| v.0)
        .unwrap_or(Value::Null)
}

pub(crate) fn row_str(row: &Row, idx: usize) -> String {
    match row_val(row, idx) {
        Value::Null => String::new(),
        Value::String(s) => s,
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        other => other.to_string(),
    }
}

pub(crate) fn row_i64(row: &Row, idx: usize) -> i64 {
    match row_val(row, idx) {
        Value::Number(n) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)).unwrap_or(0),
        Value::String(s) => s.trim().parse::<i64>().unwrap_or(0),
        Value::Bool(b) => i64::from(b),
        _ => 0,
    }
}

pub(crate) fn row_i32(row: &Row, idx: usize) -> i32 {
    row_i64(row, idx) as i32
}

pub(crate) fn row_bool(row: &Row, idx: usize) -> bool {
    match row_val(row, idx) {
        Value::Bool(b) => b,
        Value::Number(n) => n.as_i64().unwrap_or(0) != 0,
        Value::String(s) => matches!(s.trim().to_lowercase().as_str(), "t" | "true" | "1" | "yes"),
        _ => false,
    }
}

pub(crate) fn pg_sql_literal(v: &Value) -> String {
    match v {
        Value::Null => "NULL".to_string(),
        Value::Bool(b) => {
            if *b {
                "TRUE".to_string()
            } else {
                "FALSE".to_string()
            }
        }
        Value::Number(n) => format!("'{}'", n),
        Value::String(s) => format!("'{}'", s.replace('\'', "''")),
        other => format!("'{}'", other.to_string().replace('\'', "''")),
    }
}

pub(crate) fn quote_pg_ident(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}

pub(crate) fn is_pg_read_query(sql: &str) -> bool {
    let upper = sql.trim().to_uppercase();
    for p in ["SELECT", "SHOW", "EXPLAIN", "WITH", "TABLE", "VALUES"] {
        if upper.starts_with(p) {
            return true;
        }
    }
    false
}

pub struct PostgresManager {
    clients: RwLock<HashMap<String, Arc<Client>>>,
    tunnels: RwLock<HashMap<String, SshTunnel>>,
    configs: RwLock<HashMap<String, ServerConfig>>,
}

impl Default for PostgresManager {
    fn default() -> Self {
        Self::new()
    }
}

async fn open_pg_ssh_tunnel(
    cfg: &ServerConfig,
    target_host: &str,
    target_port: u16,
) -> Result<SshTunnel, String> {
    let ssh_host = cfg.postgres_ssh_host.trim();
    let ssh_port = if cfg.postgres_ssh_host_port > 0 {
        cfg.postgres_ssh_host_port as u16
    } else {
        22
    };
    let ssh_user = if cfg.postgres_ssh_user.trim().is_empty() {
        cfg.username.trim()
    } else {
        cfg.postgres_ssh_user.trim()
    };
    let ssh_pass = if !cfg.postgres_ssh_password.is_empty() {
        cfg.postgres_ssh_password.as_str()
    } else {
        cfg.password.as_str()
    };
    let (auth_type, ssh_key) = if !cfg.postgres_ssh_key_data.trim().is_empty() {
        ("key", cfg.postgres_ssh_key_data.as_str())
    } else if !cfg.postgres_ssh_key_path.trim().is_empty() {
        ("key", cfg.postgres_ssh_key_path.as_str())
    } else if cfg.postgres_ssh_auth_type == "key" && !cfg.private_key.trim().is_empty() {
        ("key", cfg.private_key.as_str())
    } else {
        ("password", "")
    };

    SshTunnel::start_tcp_forward(
        ssh_host,
        ssh_port,
        ssh_user,
        auth_type,
        ssh_pass,
        ssh_key,
        &cfg.postgres_ssh_passphrase,
        target_host,
        target_port,
    )
    .await
}

async fn connect_pg_client(
    cfg: &ServerConfig,
    target_host: &str,
    target_port: u16,
    db_name: &str,
) -> Result<Client, String> {
    let resolved_db = if !db_name.trim().is_empty() {
        db_name.trim()
    } else if !cfg.postgres_database.trim().is_empty() {
        cfg.postgres_database.trim()
    } else {
        "postgres"
    };

    let conn_timeout = if cfg.postgres_connect_timeout > 0 {
        cfg.postgres_connect_timeout as u64
    } else {
        10
    };

    let mut pg_cfg = Config::new();
    pg_cfg.host(target_host);
    pg_cfg.port(target_port);
    pg_cfg.user(cfg.username.trim());
    if !cfg.password.is_empty() {
        pg_cfg.password(&cfg.password);
    }
    pg_cfg.dbname(resolved_db);
    pg_cfg.connect_timeout(Duration::from_secs(conn_timeout));

    let connect_fut = pg_cfg.connect(NoTls);
    let (client, connection) = tokio::time::timeout(Duration::from_secs(conn_timeout), connect_fut)
        .await
        .map_err(|_| "连接 PostgreSQL 超时".to_string())?
        .map_err(|e| format!("连接 PostgreSQL 失败: {}", e))?;

    tokio::spawn(async move {
        let _ = connection.await;
    });

    Ok(client)
}

impl PostgresManager {
    pub fn new() -> Self {
        Self {
            clients: RwLock::new(HashMap::new()),
            tunnels: RwLock::new(HashMap::new()),
            configs: RwLock::new(HashMap::new()),
        }
    }

    pub async fn get_client(&self, server_id: &str, db_name: &str) -> Result<Arc<Client>, String> {
        let cfg = {
            let guard = self.configs.read().await;
            guard
                .get(server_id)
                .cloned()
                .ok_or_else(|| format!("服务器配置未加载: {}", server_id))?
        };

        let resolved_db = if !db_name.trim().is_empty() {
            db_name.trim().to_string()
        } else if !cfg.postgres_database.trim().is_empty() {
            cfg.postgres_database.trim().to_string()
        } else {
            "postgres".to_string()
        };

        let pool_key = format!("{}:{}", server_id, resolved_db);

        let existing = {
            let guard = self.clients.read().await;
            guard.get(&pool_key).cloned()
        };

        if let Some(client) = existing {
            if !client.is_closed() {
                let ping_ok = tokio::time::timeout(
                    Duration::from_secs(2),
                    client.simple_query("SELECT 1"),
                )
                .await
                .map(|r| r.is_ok())
                .unwrap_or(false);
                if ping_ok {
                    return Ok(client);
                }
            }
            let mut guard = self.clients.write().await;
            guard.remove(&pool_key);
        }

        let mut host = cfg.host.trim().to_string();
        let mut port = if cfg.port > 0 {
            cfg.port as u16
        } else {
            5432
        };

        if cfg.postgres_ssh_enabled && !cfg.postgres_ssh_host.trim().is_empty() {
            let local_port = {
                let guard = self.tunnels.read().await;
                guard.get(server_id).map(|t| t.local_port)
            };
            if let Some(lp) = local_port {
                host = "127.0.0.1".to_string();
                port = lp;
            } else {
                let tun = open_pg_ssh_tunnel(&cfg, &host, port)
                    .await
                    .map_err(|e| format!("建立 SSH 隧道失败: {}", e))?;
                let lp = tun.local_port;
                let mut guard = self.tunnels.write().await;
                guard.insert(server_id.to_string(), tun);
                host = "127.0.0.1".to_string();
                port = lp;
            }
        }

        let client = connect_pg_client(&cfg, &host, port, &resolved_db).await?;
        let arc_client = Arc::new(client);
        {
            let mut guard = self.clients.write().await;
            guard.insert(pool_key, arc_client.clone());
        }
        Ok(arc_client)
    }

    pub async fn test_connection(&self, cfg: ServerConfig) -> Result<Value, String> {
        let mut host = cfg.host.trim().to_string();
        if host.is_empty() {
            return Err("主机地址不能为空".to_string());
        }
        let mut port = if cfg.port > 0 {
            cfg.port as u16
        } else {
            5432
        };

        let mut _tun = None;
        if cfg.postgres_ssh_enabled && !cfg.postgres_ssh_host.trim().is_empty() {
            let t = open_pg_ssh_tunnel(&cfg, &host, port)
                .await
                .map_err(|e| format!("建立 SSH 隧道失败: {}", e))?;
            host = "127.0.0.1".to_string();
            port = t.local_port;
            _tun = Some(t);
        }

        let db_name = if cfg.postgres_database.trim().is_empty() {
            "postgres"
        } else {
            cfg.postgres_database.trim()
        };

        let start = Instant::now();
        let client = connect_pg_client(&cfg, &host, port, db_name).await?;
        client
            .simple_query("SELECT 1")
            .await
            .map_err(|e| format!("连接 PostgreSQL 失败: {}", e))?;
        let latency = start.elapsed().as_millis() as i64;

        Ok(json!({
            "connected": true,
            "pingMs": latency,
        }))
    }

    pub async fn connect_ex(&self, cfg: ServerConfig) -> Result<bool, String> {
        let id = cfg.id.clone();
        let db_name = if cfg.postgres_database.trim().is_empty() {
            "postgres".to_string()
        } else {
            cfg.postgres_database.trim().to_string()
        };
        {
            let mut guard = self.configs.write().await;
            guard.insert(id.clone(), cfg);
        }
        self.get_client(&id, &db_name).await?;
        Ok(true)
    }

    pub async fn close(&self, server_id: &str) {
        let prefix = format!("{}:", server_id);
        {
            let mut guard = self.clients.write().await;
            guard.retain(|k, _| !k.starts_with(&prefix));
        }
        {
            let mut guard = self.tunnels.write().await;
            guard.remove(server_id);
        }
        {
            let mut guard = self.configs.write().await;
            guard.remove(server_id);
        }
    }

    pub async fn close_all(&self) {
        self.clients.write().await.clear();
        self.tunnels.write().await.clear();
        self.configs.write().await.clear();
    }

    pub async fn list_connections(&self) -> Vec<Value> {
        let guard = self.configs.read().await;
        let mut list = Vec::with_capacity(guard.len());
        for cfg in guard.values() {
            list.push(json!({
                "id": cfg.id,
                "name": cfg.name,
                "host": cfg.host,
                "port": cfg.port,
                "database": cfg.postgres_database,
                "user": cfg.username,
            }));
        }
        list
    }

    pub async fn resolve_id(&self, id_or_name: &str) -> Result<String, String> {
        let guard = self.configs.read().await;
        let trimmed = id_or_name.trim();
        if !trimmed.is_empty() {
            if guard.contains_key(trimmed) {
                return Ok(trimmed.to_string());
            }
            for cfg in guard.values() {
                if cfg.name.eq_ignore_ascii_case(trimmed)
                    || cfg.host.eq_ignore_ascii_case(trimmed)
                    || cfg.id.eq_ignore_ascii_case(trimmed)
                {
                    return Ok(cfg.id.clone());
                }
            }
        }
        if guard.len() == 1 {
            if let Some(id) = guard.keys().next() {
                return Ok(id.clone());
            }
        }
        if guard.is_empty() {
            return Err(
                "当前暂无已连通的 PostgreSQL 数据库连接，请先在 PostgreSQL 界面中连接数据库"
                    .to_string(),
            );
        }
        Err(format!(
            "存在多个活跃的 PostgreSQL 连接，请指定明确的 server_id (当前活跃连接数: {})",
            guard.len()
        ))
    }

    pub async fn describe_internal(
        &self,
        server_id: &str,
        db_name: &str,
        schema: &str,
        table: &str,
    ) -> Result<(Vec<PgColumn>, Vec<PgConstraint>, Vec<PgIndex>, HashMap<String, bool>), String> {
        let client = self.get_client(server_id, db_name).await?;
        let schema = if schema.trim().is_empty() {
            "public"
        } else {
            schema.trim()
        };

        let pk_query = r#"
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
              ON tc.constraint_name = kcu.constraint_name 
             AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_schema = $1
              AND tc.table_name = $2;
        "#;
        let mut pk_map = HashMap::new();
        if let Ok(pk_rows) = client.query(pk_query, &[&schema, &table]).await {
            for r in pk_rows {
                let col = row_str(&r, 0);
                if !col.is_empty() {
                    pk_map.insert(col, true);
                }
            }
        }

        let fk_query = r#"
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
              ON tc.constraint_name = kcu.constraint_name 
             AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = $1
              AND tc.table_name = $2;
        "#;
        let mut fk_map = HashMap::new();
        if let Ok(fk_rows) = client.query(fk_query, &[&schema, &table]).await {
            for r in fk_rows {
                let col = row_str(&r, 0);
                if !col.is_empty() {
                    fk_map.insert(col, true);
                }
            }
        }

        let col_query = r#"
            SELECT 
                c.column_name,
                c.ordinal_position,
                c.data_type,
                c.udt_name,
                c.is_nullable = 'YES' AS is_nullable,
                COALESCE(c.column_default, '') AS column_default,
                COALESCE(c.character_maximum_length, 0) AS char_max_len,
                COALESCE(c.numeric_precision, 0) AS num_precision,
                COALESCE(c.numeric_scale, 0) AS num_scale,
                COALESCE(pg_catalog.col_description(cls.oid, c.ordinal_position::int), '') AS comment
            FROM information_schema.columns c
            JOIN pg_catalog.pg_class cls ON cls.relname = c.table_name
            JOIN pg_catalog.pg_namespace n ON n.oid = cls.relnamespace AND n.nspname = c.table_schema
            WHERE c.table_schema = $1
              AND c.table_name = $2
            ORDER BY c.ordinal_position ASC;
        "#;
        let col_rows = client
            .query(col_query, &[&schema, &table])
            .await
            .map_err(|e| format!("查询列结构失败: {}", e))?;

        let mut columns = Vec::with_capacity(col_rows.len());
        for r in col_rows {
            let name = row_str(&r, 0);
            let is_pk = pk_map.get(&name).copied().unwrap_or(false);
            let is_fk = fk_map.get(&name).copied().unwrap_or(false);
            columns.push(PgColumn {
                name,
                ordinal_pos: row_i32(&r, 1),
                data_type: row_str(&r, 2),
                udt_name: row_str(&r, 3),
                is_nullable: row_bool(&r, 4),
                default_val: row_str(&r, 5),
                is_primary_key: is_pk,
                is_foreign_key: is_fk,
                char_max_length: row_i32(&r, 6),
                num_precision: row_i32(&r, 7),
                num_scale: row_i32(&r, 8),
                comment: row_str(&r, 9),
            });
        }

        let constraint_query = r#"
            SELECT
                tc.constraint_name,
                tc.constraint_type,
                COALESCE(cc.check_clause, '') AS def,
                COALESCE(ccu.table_name, '') AS foreign_table,
                COALESCE(ccu.table_schema, '') AS foreign_schema,
                COALESCE(ccu.column_name, '') AS foreign_column
            FROM information_schema.table_constraints tc
            LEFT JOIN information_schema.check_constraints cc 
                   ON tc.constraint_name = cc.constraint_name AND tc.table_schema = cc.constraint_schema
            LEFT JOIN information_schema.constraint_column_usage ccu 
                   ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.constraint_schema
            WHERE tc.table_schema = $1
              AND tc.table_name = $2
            GROUP BY tc.constraint_name, tc.constraint_type, cc.check_clause, ccu.table_name, ccu.table_schema, ccu.column_name;
        "#;
        let mut constraints = Vec::new();
        if let Ok(cons_rows) = client.query(constraint_query, &[&schema, &table]).await {
            for r in cons_rows {
                constraints.push(PgConstraint {
                    name: row_str(&r, 0),
                    constraint_type: row_str(&r, 1),
                    def: row_str(&r, 2),
                    foreign_table: row_str(&r, 3),
                    foreign_schema: row_str(&r, 4),
                    foreign_column: row_str(&r, 5),
                });
            }
        }

        let idx_query = r#"
            SELECT
                i.relname AS index_name,
                pg_get_indexdef(i.oid) AS index_def,
                ix.indisprimary AS is_primary,
                ix.indisunique AS is_unique,
                pg_size_pretty(pg_relation_size(i.oid)) AS index_size
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_catalog.pg_index ix ON ix.indrelid = c.oid
            JOIN pg_catalog.pg_class i ON i.oid = ix.indexrelid
            WHERE n.nspname = $1
              AND c.relname = $2
            ORDER BY i.relname ASC;
        "#;
        let mut indexes = Vec::new();
        if let Ok(idx_rows) = client.query(idx_query, &[&schema, &table]).await {
            for r in idx_rows {
                indexes.push(PgIndex {
                    name: row_str(&r, 0),
                    table: table.to_string(),
                    schema: schema.to_string(),
                    def: row_str(&r, 1),
                    is_primary: row_bool(&r, 2),
                    is_unique: row_bool(&r, 3),
                    columns: Vec::new(),
                    size: row_str(&r, 4),
                });
            }
        }

        Ok((columns, constraints, indexes, pk_map))
    }
}

