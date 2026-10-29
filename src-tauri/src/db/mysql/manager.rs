use crate::core::ServerConfig;
use crate::db::utils::{as_string, parse_csv_records, write_csv_string};
use crate::tunnel::SshTunnel;
use mysql_async::prelude::*;
use mysql_async::{OptsBuilder, Params, Pool, PoolConstraints, PoolOpts, SslOpts, Value as MyVal};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MysqlSessionInfo {
    pub id: String,
    pub server_id: String,
    pub title: String,
    pub host: String,
    pub port: i32,
    pub database: String,
    pub connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MysqlQueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Map<String, Value>>,
    pub row_count: usize,
    pub affected: i64,
    pub last_insert_id: i64,
    pub duration_ms: i64,
    pub message: String,
}

#[allow(dead_code)]
pub(crate) struct MysqlConnEx {
    pub(crate) pool: Pool,
    pub(crate) cfg: ServerConfig,
    pub(crate) cur_db: RwLock<String>,
    pub(crate) tunnel: Option<SshTunnel>,
}

pub struct MysqlManager {
    conns: RwLock<HashMap<String, Arc<MysqlConnEx>>>,
}

impl Default for MysqlManager {
    fn default() -> Self {
        Self::new()
    }
}

pub fn quote_ident(s: &str) -> String {
    format!("`{}`", s.replace('`', "``"))
}

pub fn quote_literal(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

pub fn quote_user_host(user: &str, host: &str) -> String {
    let h = if host.is_empty() { "%" } else { host };
    format!("{}@{}", quote_literal(user), quote_literal(h))
}

pub fn is_read_query(sql: &str) -> bool {
    let mut s = sql.trim();
    loop {
        if s.starts_with("/*") {
            if let Some(idx) = s.find("*/") {
                s = s[idx + 2..].trim();
                continue;
            }
            break;
        }
        if s.starts_with("--") || s.starts_with('#') {
            if let Some(idx) = s.find('\n') {
                s = s[idx + 1..].trim();
                continue;
            } else {
                s = "";
                break;
            }
        }
        break;
    }
    let upper = s.to_uppercase();
    for p in ["SELECT", "SHOW", "EXPLAIN", "DESC", "DESCRIBE", "WITH"] {
        if upper.starts_with(p) {
            return true;
        }
    }
    false
}

pub fn mysql_val_to_json(v: &MyVal) -> Value {
    match v {
        MyVal::NULL => Value::Null,
        MyVal::Bytes(b) => Value::String(String::from_utf8_lossy(b).to_string()),
        MyVal::Int(i) => json!(*i),
        MyVal::UInt(u) => json!(*u),
        MyVal::Float(f) => json!(*f),
        MyVal::Double(d) => json!(*d),
        MyVal::Date(y, m, d, h, min, s, _us) => Value::String(format!(
            "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
            y, m, d, h, min, s
        )),
        MyVal::Time(neg, days, h, m, s, _us) => {
            let sign = if *neg { "-" } else { "" };
            let total_hours = (*days) * 24 + (*h as u32);
            Value::String(format!("{}{:02}:{:02}:{:02}", sign, total_hours, m, s))
        }
    }
}

pub fn json_to_mysql_val(v: &Value) -> MyVal {
    match v {
        Value::Null => MyVal::NULL,
        Value::Bool(b) => MyVal::Int(if *b { 1 } else { 0 }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                MyVal::Int(i)
            } else if let Some(u) = n.as_u64() {
                MyVal::UInt(u)
            } else if let Some(f) = n.as_f64() {
                MyVal::Double(f)
            } else {
                MyVal::Bytes(n.to_string().into_bytes())
            }
        }
        Value::String(s) => MyVal::Bytes(s.as_bytes().to_vec()),
        other => MyVal::Bytes(other.to_string().into_bytes()),
    }
}

pub fn format_sql_value(v: Option<&Value>) -> String {
    match v {
        None | Some(Value::Null) => "NULL".to_string(),
        Some(Value::String(s)) => {
            let escaped = s.replace('\\', "\\\\").replace('\'', "\\'");
            format!("'{}'", escaped)
        }
        Some(Value::Bool(b)) => {
            if *b {
                "1".to_string()
            } else {
                "0".to_string()
            }
        }
        Some(Value::Number(n)) => n.to_string(),
        Some(other) => {
            let s = other.to_string();
            let escaped = s.replace('\\', "\\\\").replace('\'', "\\'");
            format!("'{}'", escaped)
        }
    }
}

fn is_same_mysql_config(a: &ServerConfig, b: &ServerConfig) -> bool {
    a.host == b.host
        && a.display_port() == b.display_port()
        && a.username == b.username
        && a.password == b.password
        && a.database == b.database
        && a.mysql_tls == b.mysql_tls
        && a.mysql_ssl_enabled == b.mysql_ssl_enabled
        && a.mysql_ssh_enabled == b.mysql_ssh_enabled
        && a.mysql_ssh_host == b.mysql_ssh_host
        && a.mysql_ssh_host_port == b.mysql_ssh_host_port
        && a.mysql_ssh_user == b.mysql_ssh_user
        && a.mysql_ssh_key_path == b.mysql_ssh_key_path
        && a.mysql_ssh_key_data == b.mysql_ssh_key_data
        && a.mysql_ssh_passphrase == b.mysql_ssh_passphrase
}

pub async fn build_mysql_pool_and_tunnel(cfg: &ServerConfig) -> Result<(Pool, Option<SshTunnel>), String> {
    let mut target_host = cfg.host.trim().to_string();
    let mut target_port = cfg.display_port() as u16;
    let mut tunnel = None;

    if cfg.mysql_ssh_enabled && !cfg.mysql_ssh_host.trim().is_empty() {
        let ssh_host = cfg.mysql_ssh_host.trim();
        let ssh_port = if cfg.mysql_ssh_host_port > 0 {
            cfg.mysql_ssh_host_port as u16
        } else {
            22
        };
        let ssh_user = if cfg.mysql_ssh_user.trim().is_empty() {
            cfg.username.trim()
        } else {
            cfg.mysql_ssh_user.trim()
        };
        let (auth_type, ssh_key) = if !cfg.mysql_ssh_key_data.trim().is_empty() {
            ("key", cfg.mysql_ssh_key_data.as_str())
        } else if !cfg.mysql_ssh_key_path.trim().is_empty() {
            ("key", cfg.mysql_ssh_key_path.as_str())
        } else {
            ("password", "")
        };
        let tun = SshTunnel::start_tcp_forward(
            ssh_host,
            ssh_port,
            ssh_user,
            auth_type,
            &cfg.password,
            ssh_key,
            &cfg.mysql_ssh_passphrase,
            &target_host,
            target_port,
        )
        .await?;
        target_host = "127.0.0.1".to_string();
        target_port = tun.local_port;
        tunnel = Some(tun);
    }

    let max_conns = if cfg.mysql_max_open_conns > 0 {
        cfg.mysql_max_open_conns as usize
    } else {
        15
    };
    let min_conns = if cfg.mysql_max_idle_conns > 0 {
        (cfg.mysql_max_idle_conns as usize).min(max_conns)
    } else {
        5usize.min(max_conns)
    };

    let mut builder = OptsBuilder::default()
        .ip_or_hostname(target_host)
        .tcp_port(target_port)
        .user(if cfg.username.trim().is_empty() {
            None
        } else {
            Some(cfg.username.clone())
        })
        .pass(if cfg.password.is_empty() {
            None
        } else {
            Some(cfg.password.clone())
        })
        .db_name(if cfg.database.trim().is_empty() {
            None
        } else {
            Some(cfg.database.trim().to_string())
        });

    let tls_str = cfg.mysql_tls.trim().to_lowercase();
    let use_ssl = cfg.mysql_ssl_enabled
        || (!tls_str.is_empty() && tls_str != "false" && tls_str != "disable" && tls_str != "none");
    if use_ssl {
        let ssl_opts = SslOpts::default().with_danger_accept_invalid_certs(true);
        builder = builder.ssl_opts(Some(ssl_opts));
    }

    if let Some(constraints) = PoolConstraints::new(min_conns, max_conns) {
        let pool_opts = PoolOpts::default().with_constraints(constraints);
        builder = builder.pool_opts(pool_opts);
    }

    let pool = Pool::new(builder);
    Ok((pool, tunnel))
}

pub fn split_sql_statements(sql_text: &str) -> Vec<String> {
    let mut stmts = Vec::new();
    let mut current = String::new();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut in_backtick = false;

    for line in sql_text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("--") || (trimmed.starts_with("/*") && trimmed.ends_with("*/")) {
            continue;
        }
        for ch in line.chars() {
            if ch == '\'' && !in_double_quote && !in_backtick {
                in_single_quote = !in_single_quote;
            } else if ch == '"' && !in_single_quote && !in_backtick {
                in_double_quote = !in_double_quote;
            } else if ch == '`' && !in_single_quote && !in_double_quote {
                in_backtick = !in_backtick;
            }

            if ch == ';' && !in_single_quote && !in_double_quote && !in_backtick {
                let stmt = current.trim().to_string();
                if !stmt.is_empty() {
                    stmts.push(stmt);
                }
                current.clear();
            } else {
                current.push(ch);
            }
        }
        current.push('\n');
    }
    let stmt = current.trim().to_string();
    if !stmt.is_empty() {
        stmts.push(stmt);
    }
    stmts
}

pub fn truncate_str(s: &str, max_len: usize) -> String {
    if s.chars().count() <= max_len {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max_len).collect();
        format!("{}...", truncated)
    }
}

pub fn build_export_query(
    source: &str,
    table: &str,
    sql_text: &str,
    limit: i64,
) -> Result<String, String> {
    if source == "table" {
        let t = table.trim();
        if t.is_empty() {
            return Err("未指定表名".to_string());
        }
        if limit > 0 {
            Ok(format!("SELECT * FROM {} LIMIT {}", quote_ident(t), limit))
        } else {
            Ok(format!("SELECT * FROM {}", quote_ident(t)))
        }
    } else {
        let query = sql_text.trim();
        if query.is_empty() {
            return Err("未指定查询语句".to_string());
        }
        if limit > 0 && !query.to_uppercase().contains("LIMIT") {
            Ok(format!("{} LIMIT {}", query, limit))
        } else {
            Ok(query.to_string())
        }
    }
}

impl MysqlManager {
    pub fn new() -> Self {
        Self {
            conns: RwLock::new(HashMap::new()),
        }
    }

    pub async fn open(&self, id: &str, cfg: ServerConfig) -> Result<(), String> {
        let existing = {
            let guard = self.conns.read().await;
            guard.get(id).cloned()
        };

        if let Some(old) = existing {
            if is_same_mysql_config(&old.cfg, &cfg) {
                let ping_res = tokio::time::timeout(Duration::from_secs(2), async {
                    let mut conn = old.pool.get_conn().await.map_err(|e| e.to_string())?;
                    conn.ping().await.map_err(|e| e.to_string())
                })
                .await;
                if matches!(ping_res, Ok(Ok(()))) {
                    return Ok(());
                }
            }
        }

        let (pool, tunnel) = build_mysql_pool_and_tunnel(&cfg).await?;

        let ping_res = tokio::time::timeout(Duration::from_secs(10), async {
            let mut conn = pool.get_conn().await.map_err(|e| e.to_string())?;
            conn.ping().await.map_err(|e| e.to_string())
        })
        .await;

        match ping_res {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                let _ = pool.disconnect().await;
                return Err(format!("连接 MySQL 失败: {}", e));
            }
            Err(_) => {
                let _ = pool.disconnect().await;
                return Err("连接 MySQL 超时".to_string());
            }
        }

        let mc = Arc::new(MysqlConnEx {
            pool,
            cur_db: RwLock::new(cfg.database.clone()),
            cfg,
            tunnel,
        });

        let to_close = {
            let mut guard = self.conns.write().await;
            guard.insert(id.to_string(), mc)
        };

        if let Some(old) = to_close {
            let _ = old.pool.clone().disconnect().await;
        }

        Ok(())
    }

    pub async fn test_connection(&self, cfg: ServerConfig) -> Result<Value, String> {
        let (pool, _tunnel) = build_mysql_pool_and_tunnel(&cfg).await?;
        let start = Instant::now();
        let res = tokio::time::timeout(Duration::from_secs(5), async {
            let mut conn = pool.get_conn().await.map_err(|e| e.to_string())?;
            conn.ping().await.map_err(|e| e.to_string())
        })
        .await;
        let _ = pool.disconnect().await;

        match res {
            Ok(Ok(())) => Ok(json!({
                "connected": true,
                "pingMs": start.elapsed().as_millis() as i64,
            })),
            Ok(Err(e)) => Err(format!("连接 MySQL 失败: {}", e)),
            Err(_) => Err("连接 MySQL 超时".to_string()),
        }
    }

    pub(crate) async fn get(&self, id: &str) -> Result<Arc<MysqlConnEx>, String> {
        let guard = self.conns.read().await;
        guard
            .get(id)
            .cloned()
            .ok_or_else(|| "MySQL 连接不存在或已断开，请重新连接".to_string())
    }

    pub async fn close(&self, id: &str) {
        let removed = {
            let mut guard = self.conns.write().await;
            guard.remove(id)
        };
        if let Some(c) = removed {
            let _ = c.pool.clone().disconnect().await;
        }
    }

    pub async fn close_all(&self) {
        let all = {
            let mut guard = self.conns.write().await;
            std::mem::take(&mut *guard)
        };
        for (_, c) in all {
            let _ = c.pool.clone().disconnect().await;
        }
    }

    pub async fn list_connections(&self) -> Vec<Value> {
        let guard = self.conns.read().await;
        let mut list = Vec::with_capacity(guard.len());
        for (id, mc) in guard.iter() {
            let cur_db = mc.cur_db.read().await.clone();
            list.push(json!({
                "id": id,
                "name": mc.cfg.name,
                "host": mc.cfg.host,
                "port": mc.cfg.port,
                "database": cur_db,
                "user": mc.cfg.username,
            }));
        }
        list
    }

    pub async fn resolve_id(&self, id_or_name: &str) -> Result<String, String> {
        let guard = self.conns.read().await;
        let trimmed = id_or_name.trim();
        if !trimmed.is_empty() {
            if guard.contains_key(trimmed) {
                return Ok(trimmed.to_string());
            }
            for (id, mc) in guard.iter() {
                if mc.cfg.name.eq_ignore_ascii_case(trimmed)
                    || mc.cfg.host.eq_ignore_ascii_case(trimmed)
                    || id.eq_ignore_ascii_case(trimmed)
                {
                    return Ok(id.clone());
                }
            }
        }
        if guard.len() == 1 {
            if let Some(id) = guard.keys().next() {
                return Ok(id.clone());
            }
        }
        if guard.is_empty() {
            return Err("当前暂无已连通的 MySQL 数据库连接，请先在 MySQL 界面中连接数据库".to_string());
        }
        Err(format!(
            "存在多个活跃的 MySQL 连接，请指定明确的 server_id (当前活跃连接数: {})",
            guard.len()
        ))
    }

    pub(crate) async fn get_conn_with_db(
        &self,
        id: &str,
        db_name: &str,
    ) -> Result<(Arc<MysqlConnEx>, mysql_async::Conn), String> {
        let mc = self.get(id).await?;
        let mut conn = mc
            .pool
            .get_conn()
            .await
            .map_err(|e| format!("获取 MySQL 连接失败: {}", e))?;

        let trimmed_db = db_name.trim();
        if !trimmed_db.is_empty() {
            conn.query_drop(format!("USE {}", quote_ident(trimmed_db)))
                .await
                .map_err(|e| format!("切换数据库失败: {}", e))?;
            let mut cur = mc.cur_db.write().await;
            *cur = trimmed_db.to_string();
        } else {
            let cur = mc.cur_db.read().await.clone();
            if !cur.trim().is_empty() {
                let _ = conn.query_drop(format!("USE {}", quote_ident(cur.trim()))).await;
            }
        }
        Ok((mc, conn))
    }

    pub async fn query_ex_with_timeout_limit(
        &self,
        id: &str,
        db_name: &str,
        sql_text: &str,
        timeout: Duration,
        max_rows: usize,
    ) -> Result<(Vec<String>, Vec<Map<String, Value>>), String> {
        let (_mc, mut conn) = self.get_conn_with_db(id, db_name).await?;
        let to = if timeout.is_zero() {
            Duration::from_secs(30)
        } else {
            timeout
        };

        let fut = async move {
            let mut result = conn
                .query_iter(sql_text)
                .await
                .map_err(|e| e.to_string())?;
            let cols: Vec<String> = result
                .columns_ref()
                .iter()
                .map(|c| c.name_str().into_owned())
                .collect();
            let raw_rows: Vec<mysql_async::Row> = result
                .collect::<mysql_async::Row>()
                .await
                .map_err(|e| e.to_string())?;

            let cap = if max_rows > 0 {
                raw_rows.len().min(max_rows)
            } else {
                raw_rows.len()
            };
            let mut out = Vec::with_capacity(cap);
            for row in raw_rows {
                if max_rows > 0 && out.len() >= max_rows {
                    break;
                }
                let mut rec = Map::with_capacity(cols.len());
                for (i, c) in cols.iter().enumerate() {
                    let val = row
                        .as_ref(i)
                        .map(mysql_val_to_json)
                        .unwrap_or(Value::Null);
                    rec.insert(c.clone(), val);
                }
                out.push(rec);
            }
            Ok::<(Vec<String>, Vec<Map<String, Value>>), String>((cols, out))
        };

        tokio::time::timeout(to, fut)
            .await
            .map_err(|_| "MySQL 查询执行超时".to_string())?
    }

    pub async fn query_ex(
        &self,
        id: &str,
        db_name: &str,
        sql_text: &str,
    ) -> Result<(Vec<String>, Vec<Map<String, Value>>), String> {
        self.query_ex_with_timeout_limit(id, db_name, sql_text, Duration::from_secs(60), 0)
            .await
    }

    pub async fn databases(&self, id: &str) -> Result<Vec<String>, String> {
        let (_cols, rows) = self.query_ex(id, "", "SHOW DATABASES").await?;
        let mut out = Vec::with_capacity(rows.len());
        for r in rows {
            if let Some((_, v)) = r.into_iter().next() {
                out.push(as_string(Some(&v)));
            }
        }
        Ok(out)
    }

    pub async fn tables(&self, id: &str, db_name: &str) -> Result<Vec<String>, String> {
        let (_cols, rows) = self.query_ex(id, db_name, "SHOW TABLES").await?;
        let mut out = Vec::with_capacity(rows.len());
        for r in rows {
            if let Some((_, v)) = r.into_iter().next() {
                out.push(as_string(Some(&v)));
            }
        }
        Ok(out)
    }

    pub async fn run(
        &self,
        id: &str,
        db_name: &str,
        sql_text: &str,
    ) -> Result<MysqlQueryResult, String> {
        let start = Instant::now();
        let trimmed = sql_text.trim();
        if is_read_query(trimmed) {
            let (cols, rows) = self.query_ex(id, db_name, trimmed).await?;
            let row_count = rows.len();
            return Ok(MysqlQueryResult {
                columns: cols,
                rows,
                row_count,
                affected: 0,
                last_insert_id: 0,
                duration_ms: start.elapsed().as_millis() as i64,
                message: String::new(),
            });
        }

        let (_mc, mut conn) = self.get_conn_with_db(id, db_name).await?;
        let result = conn
            .query_iter(trimmed)
            .await
            .map_err(|e| e.to_string())?;

        let affected = result.affected_rows();
        let last_id = result.last_insert_id().unwrap_or(0) as i64;

        Ok(MysqlQueryResult {
            columns: Vec::new(),
            rows: Vec::new(),
            row_count: 0,
            affected: affected as i64,
            last_insert_id: last_id,
            duration_ms: start.elapsed().as_millis() as i64,
            message: format!("执行成功，影响行数: {}", affected),
        })
    }

    pub async fn select(
        &self,
        id: &str,
        db_name: &str,
        table: &str,
        limit: i64,
        offset: i64,
    ) -> Result<MysqlQueryResult, String> {
        let lim = if limit <= 0 { 200 } else { limit.min(1000) };
        let off = if offset < 0 { 0 } else { offset };
        let sql = format!(
            "SELECT * FROM {} LIMIT {} OFFSET {}",
            quote_ident(table),
            lim,
            off
        );
        self.run(id, db_name, &sql).await
    }

    pub async fn count(&self, id: &str, db_name: &str, table: &str) -> Result<i64, String> {
        let sql = format!("SELECT COUNT(*) AS total FROM {}", quote_ident(table));
        let (_cols, rows) = self.query_ex(id, db_name, &sql).await?;
        if let Some(r) = rows.first() {
            if let Some(v) = r.values().next() {
                if let Some(i) = v.as_i64() {
                    return Ok(i);
                }
                if let Some(s) = v.as_str() {
                    if let Ok(i) = s.parse::<i64>() {
                        return Ok(i);
                    }
                }
            }
        }
        Ok(0)
    }

    pub async fn describe(
        &self,
        id: &str,
        db_name: &str,
        table: &str,
    ) -> Result<Vec<Map<String, Value>>, String> {
        let sql = format!("DESCRIBE {}", quote_ident(table));
        let (_cols, rows) = self.query_ex(id, db_name, &sql).await?;
        Ok(rows)
    }

    pub async fn insert(
        &self,
        id: &str,
        db_name: &str,
        table: &str,
        record: Map<String, Value>,
    ) -> Result<MysqlQueryResult, String> {
        if record.is_empty() {
            return Err("插入记录不能为空".to_string());
        }
        let cols: Vec<String> = record.keys().map(|k| quote_ident(k)).collect();
        let vals: Vec<String> = record.values().map(|v| format_sql_value(Some(v))).collect();
        let sql = format!(
            "INSERT INTO {} ({}) VALUES ({})",
            quote_ident(table),
            cols.join(", "),
            vals.join(", ")
        );
        self.run(id, db_name, &sql).await
    }

    pub async fn update(
        &self,
        id: &str,
        db_name: &str,
        table: &str,
        record: Map<String, Value>,
        where_clause: &str,
    ) -> Result<MysqlQueryResult, String> {
        if record.is_empty() {
            return Err("更新字段不能为空".to_string());
        }
        let trimmed_where = where_clause.trim();
        if trimmed_where.is_empty() {
            return Err("为防止全表更新，必须指定更新条件".to_string());
        }
        let sets: Vec<String> = record
            .iter()
            .map(|(k, v)| format!("{} = {}", quote_ident(k), format_sql_value(Some(v))))
            .collect();
        let sql = format!(
            "UPDATE {} SET {} WHERE {}",
            quote_ident(table),
            sets.join(", "),
            trimmed_where
        );
        self.run(id, db_name, &sql).await
    }

    pub async fn delete(
        &self,
        id: &str,
        db_name: &str,
        table: &str,
        where_clause: &str,
    ) -> Result<MysqlQueryResult, String> {
        let trimmed_where = where_clause.trim();
        if trimmed_where.is_empty() {
            return Err("为防止全表删除，必须指定删除条件".to_string());
        }
        let sql = format!(
            "DELETE FROM {} WHERE {}",
            quote_ident(table),
            trimmed_where
        );
        self.run(id, db_name, &sql).await
    }

    pub async fn table_status(
        &self,
        id: &str,
        db_name: &str,
        table: &str,
    ) -> Result<Map<String, Value>, String> {
        let sql = format!("SHOW TABLE STATUS LIKE {}", quote_literal(table));
        let (_cols, rows) = self.query_ex(id, db_name, &sql).await?;
        rows.into_iter()
            .next()
            .ok_or_else(|| "未找到表状态信息".to_string())
    }

    pub async fn indexes(
        &self,
        id: &str,
        db_name: &str,
        table: &str,
    ) -> Result<Vec<Map<String, Value>>, String> {
        let sql = format!("SHOW INDEX FROM {}", quote_ident(table));
        let (_cols, rows) = self.query_ex(id, db_name, &sql).await?;
        Ok(rows)
    }

    pub async fn create_index(
        &self,
        id: &str,
        db_name: &str,
        table: &str,
        index_name: &str,
        columns: &[String],
        index_type: &str,
    ) -> Result<(), String> {
        if columns.is_empty() {
            return Err("索引列不能为空".to_string());
        }
        let quoted_cols: Vec<String> = columns.iter().map(|c| quote_ident(c)).collect();
        let type_prefix = match index_type.to_uppercase().as_str() {
            "UNIQUE" => "UNIQUE ",
            "FULLTEXT" => "FULLTEXT ",
            "SPATIAL" => "SPATIAL ",
            _ => "",
        };
        let sql = format!(
            "CREATE {}INDEX {} ON {} ({})",
            type_prefix,
            quote_ident(index_name),
            quote_ident(table),
            quoted_cols.join(", ")
        );
        self.run(id, db_name, &sql).await?;
        Ok(())
    }

    pub async fn drop_index(
        &self,
        id: &str,
        db_name: &str,
        table: &str,
        index_name: &str,
    ) -> Result<(), String> {
        let sql = format!(
            "DROP INDEX {} ON {}",
            quote_ident(index_name),
            quote_ident(table)
        );
        self.run(id, db_name, &sql).await?;
        Ok(())
    }

    pub async fn users(&self, id: &str) -> Result<Vec<Map<String, Value>>, String> {
        let sql = "SELECT User, Host, plugin, authentication_string, account_locked, password_expired FROM mysql.user ORDER BY User, Host";
        let (_cols, rows) = self.query_ex(id, "", sql).await?;
        Ok(rows)
    }

    pub async fn grants(&self, id: &str, user: &str, host: &str) -> Result<Vec<String>, String> {
        let target = quote_user_host(user, host);
        let sql = format!("SHOW GRANTS FOR {}", target);
        let (_cols, rows) = self.query_ex(id, "", &sql).await?;
        let mut out = Vec::with_capacity(rows.len());
        for r in rows {
            if let Some((_, v)) = r.into_iter().next() {
                out.push(as_string(Some(&v)));
            }
        }
        Ok(out)
    }

    pub async fn create_user(
        &self,
        id: &str,
        user: &str,
        host: &str,
        password: &str,
        auth_plugin: Option<&str>,
        lock: bool,
    ) -> Result<(), String> {
        let target = quote_user_host(user, host);
        let mut sql = format!("CREATE USER {}", target);
        if let Some(plugin) = auth_plugin.filter(|p| !p.trim().is_empty()) {
            if password.is_empty() {
                sql.push_str(&format!(" IDENTIFIED WITH {}", plugin));
            } else {
                sql.push_str(&format!(" IDENTIFIED WITH {} BY {}", plugin, quote_literal(password)));
            }
        } else if !password.is_empty() {
            sql.push_str(&format!(" IDENTIFIED BY {}", quote_literal(password)));
        }
        if lock {
            sql.push_str(" ACCOUNT LOCK");
        }
        self.run(id, "", &sql).await?;
        self.run(id, "", "FLUSH PRIVILEGES").await?;
        Ok(())
    }

    pub async fn drop_user(&self, id: &str, user: &str, host: &str) -> Result<(), String> {
        let target = quote_user_host(user, host);
        let sql = format!("DROP USER {}", target);
        self.run(id, "", &sql).await?;
        self.run(id, "", "FLUSH PRIVILEGES").await?;
        Ok(())
    }

    pub async fn change_user_password(
        &self,
        id: &str,
        user: &str,
        host: &str,
        new_password: &str,
    ) -> Result<(), String> {
        let target = quote_user_host(user, host);
        let sql = format!(
            "ALTER USER {} IDENTIFIED BY {}",
            target,
            quote_literal(new_password)
        );
        self.run(id, "", &sql).await?;
        self.run(id, "", "FLUSH PRIVILEGES").await?;
        Ok(())
    }

    pub async fn toggle_user_lock(
        &self,
        id: &str,
        user: &str,
        host: &str,
        lock: bool,
    ) -> Result<(), String> {
        let target = quote_user_host(user, host);
        let action = if lock { "ACCOUNT LOCK" } else { "ACCOUNT UNLOCK" };
        let sql = format!("ALTER USER {} {}", target, action);
        self.run(id, "", &sql).await?;
        self.run(id, "", "FLUSH PRIVILEGES").await?;
        Ok(())
    }

    pub async fn grant_privileges(
        &self,
        id: &str,
        user: &str,
        host: &str,
        privileges: &[String],
        db_name: &str,
        table: &str,
        with_grant_option: bool,
    ) -> Result<(), String> {
        let target = quote_user_host(user, host);
        let priv_str = if privileges.is_empty() {
            "ALL PRIVILEGES".to_string()
        } else {
            privileges.join(", ")
        };
        let scope = match (db_name.trim(), table.trim()) {
            ("", "") | ("*", "*") => "*.*".to_string(),
            (d, "") | (d, "*") => format!("{}.*", quote_ident(d)),
            (d, t) => format!("{}.{}", quote_ident(d), quote_ident(t)),
        };
        let with_grant = if with_grant_option { " WITH GRANT OPTION" } else { "" };
        let sql = format!("GRANT {} ON {} TO {}{}", priv_str, scope, target, with_grant);
        self.run(id, "", &sql).await?;
        self.run(id, "", "FLUSH PRIVILEGES").await?;
        Ok(())
    }

    pub async fn revoke_privileges(
        &self,
        id: &str,
        user: &str,
        host: &str,
        privileges: &[String],
        db_name: &str,
        table: &str,
    ) -> Result<(), String> {
        let target = quote_user_host(user, host);
        let priv_str = if privileges.is_empty() {
            "ALL PRIVILEGES".to_string()
        } else {
            privileges.join(", ")
        };
        let scope = match (db_name.trim(), table.trim()) {
            ("", "") | ("*", "*") => "*.*".to_string(),
            (d, "") | (d, "*") => format!("{}.*", quote_ident(d)),
            (d, t) => format!("{}.{}", quote_ident(d), quote_ident(t)),
        };
        let sql = format!("REVOKE {} ON {} FROM {}", priv_str, scope, target);
        self.run(id, "", &sql).await?;
        self.run(id, "", "FLUSH PRIVILEGES").await?;
        Ok(())
    }

    pub async fn revoke_all_privileges(
        &self,
        id: &str,
        user: &str,
        host: &str,
    ) -> Result<(), String> {
        let target = quote_user_host(user, host);
        let sql = format!("REVOKE ALL PRIVILEGES, GRANT OPTION FROM {}", target);
        self.run(id, "", &sql).await?;
        self.run(id, "", "FLUSH PRIVILEGES").await?;
        Ok(())
    }

    pub async fn status(&self, id: &str) -> Result<Map<String, Value>, String> {
        let (_cols, rows) = self.query_ex(id, "", "SHOW GLOBAL STATUS").await?;
        let mut map = Map::new();
        for row in rows {
            let key = row
                .get("Variable_name")
                .or_else(|| row.get("VARIABLE_NAME"))
                .and_then(|v| v.as_str());
            let val = row.get("Value").or_else(|| row.get("VALUE"));
            if let (Some(k), Some(v)) = (key, val) {
                map.insert(k.to_string(), v.clone());
            }
        }
        Ok(map)
    }

    pub async fn variables(&self, id: &str) -> Result<Map<String, Value>, String> {
        let (_cols, rows) = self.query_ex(id, "", "SHOW GLOBAL VARIABLES").await?;
        let mut map = Map::new();
        for row in rows {
            let key = row
                .get("Variable_name")
                .or_else(|| row.get("VARIABLE_NAME"))
                .and_then(|v| v.as_str());
            let val = row.get("Value").or_else(|| row.get("VALUE"));
            if let (Some(k), Some(v)) = (key, val) {
                map.insert(k.to_string(), v.clone());
            }
        }
        Ok(map)
    }

    pub async fn process_list(&self, id: &str) -> Result<Vec<Map<String, Value>>, String> {
        let (_cols, rows) = self.query_ex(id, "", "SHOW FULL PROCESSLIST").await?;
        Ok(rows)
    }

    pub async fn slow_log(&self, id: &str, limit: Option<i64>) -> Result<Vec<Map<String, Value>>, String> {
        let lim = limit.unwrap_or(100).max(1);
        let sql = format!("SELECT * FROM mysql.slow_log ORDER BY start_time DESC LIMIT {}", lim);
        match self.query_ex(id, "", &sql).await {
            Ok((_cols, rows)) => Ok(rows),
            Err(e) => {
                if e.contains("doesn't exist") || e.contains("denied") {
                    Ok(Vec::new())
                } else {
                    Err(e)
                }
            }
        }
    }

    pub async fn schema(&self, id: &str, db_name: &str) -> Result<Value, String> {
        let tables = self.tables(id, db_name).await?;
        let mut out_tables = Vec::with_capacity(tables.len());

        for t in &tables {
            let cols_raw = match self.describe(id, db_name, t).await {
                Ok(c) => c,
                Err(_) => continue,
            };
            let mut out_cols = Vec::with_capacity(cols_raw.len());
            for c in cols_raw {
                let name = as_string(c.get("Field"));
                let typ = as_string(c.get("Type"));
                let key = as_string(c.get("Key"));
                out_cols.push(json!({
                    "name": name,
                    "type": typ,
                    "key": key,
                }));
            }
            out_tables.push(json!({
                "name": t,
                "columns": out_cols,
            }));
        }

        let fk_sql = format!(
            "SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, CONSTRAINT_NAME \
             FROM information_schema.KEY_COLUMN_USAGE \
             WHERE TABLE_SCHEMA = {} AND REFERENCED_TABLE_NAME IS NOT NULL",
            quote_literal(db_name)
        );
        let mut fks = Vec::new();
        if let Ok((_c, rows)) = self.query_ex(id, db_name, &fk_sql).await {
            for r in rows {
                fks.push(json!({
                    "fromTable": as_string(r.get("TABLE_NAME")),
                    "fromColumn": as_string(r.get("COLUMN_NAME")),
                    "toTable": as_string(r.get("REFERENCED_TABLE_NAME")),
                    "toColumn": as_string(r.get("REFERENCED_COLUMN_NAME")),
                    "name": as_string(r.get("CONSTRAINT_NAME")),
                }));
            }
        }

        Ok(json!({
            "tables": out_tables,
            "foreignKeys": fks,
        }))
    }

    pub async fn export_csv(
        &self,
        id: &str,
        db: &str,
        source: &str,
        table: &str,
        sql_text: &str,
        limit: i64,
    ) -> Result<String, String> {
        let query = build_export_query(source, table, sql_text, limit)?;
        let max_rows = if limit > 0 { limit as usize } else { 0 };
        let (cols, rows) = self
            .query_ex_with_timeout_limit(id, db, &query, Duration::from_secs(600), max_rows)
            .await?;
        Ok(write_csv_string(&cols, &rows))
    }

    pub async fn export_sql(
        &self,
        id: &str,
        db: &str,
        source: &str,
        table: &str,
        sql_text: &str,
        limit: i64,
    ) -> Result<String, String> {
        let query = build_export_query(source, table, sql_text, limit)?;
        let max_rows = if limit > 0 { limit as usize } else { 0 };
        let (cols, rows) = self
            .query_ex_with_timeout_limit(id, db, &query, Duration::from_secs(600), max_rows)
            .await?;
        let target_table = if table.trim().is_empty() {
            "export_data"
        } else {
            table.trim()
        };
        let quoted_target = quote_ident(target_table);
        let quoted_cols: Vec<String> = cols.iter().map(|c| quote_ident(c)).collect();
        let col_header = quoted_cols.join(", ");

        let mut sb = String::new();
        sb.push_str(&format!("-- Exported data for table {}\n", quoted_target));
        sb.push_str("SET FOREIGN_KEY_CHECKS=0;\n\n");

        for r in rows {
            let val_strs: Vec<String> = cols.iter().map(|c| format_sql_value(r.get(c))).collect();
            sb.push_str(&format!(
                "INSERT INTO {} ({}) VALUES ({});\n",
                quoted_target,
                col_header,
                val_strs.join(", ")
            ));
        }
        sb.push_str("\nSET FOREIGN_KEY_CHECKS=1;\n");
        Ok(sb)
    }

    pub async fn export_json(
        &self,
        id: &str,
        db: &str,
        source: &str,
        table: &str,
        sql_text: &str,
        limit: i64,
    ) -> Result<String, String> {
        let query = build_export_query(source, table, sql_text, limit)?;
        let max_rows = if limit > 0 { limit as usize } else { 0 };
        let (_cols, rows) = self
            .query_ex_with_timeout_limit(id, db, &query, Duration::from_secs(600), max_rows)
            .await?;
        serde_json::to_string_pretty(&rows).map_err(|e| e.to_string())
    }

    pub async fn export(
        &self,
        id: &str,
        db: &str,
        mode: &str,
        source: &str,
        table: &str,
        sql_text: &str,
        limit: i64,
    ) -> Result<String, String> {
        match mode {
            "json" => self.export_json(id, db, source, table, sql_text, limit).await,
            "sql" => self.export_sql(id, db, source, table, sql_text, limit).await,
            "csv" => self.export_csv(id, db, source, table, sql_text, limit).await,
            _ => Err(format!("不支持的导出模式: {}", mode)),
        }
    }

    pub async fn import_sql(&self, id: &str, db: &str, content: &str) -> Result<String, String> {
        let (_mc, mut conn) = self.get_conn_with_db(id, db).await?;
        let stmts = split_sql_statements(content);
        if stmts.is_empty() {
            return Ok("SQL 内容为空或无有效 SQL 语句".to_string());
        }
        let mut count = 0usize;
        for s in stmts {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                continue;
            }
            conn.query_drop(trimmed).await.map_err(|e| {
                format!("执行 SQL 失败: {} (语句: {})", e, truncate_str(trimmed, 80))
            })?;
            count += 1;
        }
        Ok(format!("成功执行 {} 条 SQL 语句", count))
    }

    pub async fn import_csv(
        &self,
        id: &str,
        db: &str,
        table: &str,
        content: &str,
    ) -> Result<String, String> {
        let table = table.trim();
        if table.is_empty() {
            return Err("未指定目标表名".to_string());
        }
        let (_mc, mut conn) = self.get_conn_with_db(id, db).await?;
        let records = parse_csv_records(content);
        if records.len() < 2 {
            return Ok("CSV 文件无有效数据（需至少包含首行列名与一行数据）".to_string());
        }
        let headers = &records[0];
        let cols_quoted: Vec<String> = headers.iter().map(|h| quote_ident(h.trim())).collect();
        let placeholders: Vec<&str> = (0..headers.len()).map(|_| "?").collect();
        let insert_sql = format!(
            "INSERT INTO {} ({}) VALUES ({})",
            quote_ident(table),
            cols_quoted.join(", "),
            placeholders.join(", ")
        );

        let mut count = 0i64;
        for (i, row) in records.iter().enumerate().skip(1) {
            let mut args = Vec::with_capacity(headers.len());
            for j in 0..headers.len() {
                if let Some(cell) = row.get(j) {
                    let v = cell.trim();
                    if v.is_empty() || v.eq_ignore_ascii_case("NULL") {
                        args.push(MyVal::NULL);
                    } else {
                        args.push(MyVal::Bytes(v.as_bytes().to_vec()));
                    }
                } else {
                    args.push(MyVal::NULL);
                }
            }
            conn.exec_drop(&insert_sql, Params::Positional(args))
                .await
                .map_err(|e| format!("第 {} 行插入失败: {}", i + 1, e))?;
            count += 1;
        }
        Ok(format!("成功导入 {} 行数据到表 `{}`", count, table))
    }

    pub async fn import_json(
        &self,
        id: &str,
        db: &str,
        table: &str,
        content: &str,
    ) -> Result<String, String> {
        let table = table.trim();
        if table.is_empty() {
            return Err("未指定目标表名".to_string());
        }
        let (_mc, mut conn) = self.get_conn_with_db(id, db).await?;
        let records: Vec<Map<String, Value>> =
            serde_json::from_str(content).map_err(|e| format!("JSON 解析失败: {}", e))?;
        if records.is_empty() {
            return Ok("无数据".to_string());
        }
        let cols: Vec<String> = records[0].keys().cloned().collect();
        let quoted_cols: Vec<String> = cols.iter().map(|c| quote_ident(c)).collect();
        let placeholders: Vec<&str> = (0..cols.len()).map(|_| "?").collect();
        let insert_sql = format!(
            "INSERT INTO {} ({}) VALUES ({})",
            quote_ident(table),
            quoted_cols.join(","),
            placeholders.join(",")
        );

        let mut count = 0i64;
        for rec in records {
            let args: Vec<MyVal> = cols
                .iter()
                .map(|c| json_to_mysql_val(rec.get(c).unwrap_or(&Value::Null)))
                .collect();
            conn.exec_drop(&insert_sql, Params::Positional(args))
                .await
                .map_err(|e| format!("插入失败: {}", e))?;
            count += 1;
        }
        Ok(format!("成功导入 {} 行到表 `{}`", count, table))
    }

    pub async fn import(
        &self,
        id: &str,
        db: &str,
        mode: &str,
        table: &str,
        content: &str,
    ) -> Result<String, String> {
        match mode {
            "json" => self.import_json(id, db, table, content).await,
            "sql" => self.import_sql(id, db, content).await,
            "csv" => self.import_csv(id, db, table, content).await,
            _ => Err(format!("不支持的导入模式: {}", mode)),
        }
    }
}
