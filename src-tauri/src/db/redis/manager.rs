use crate::core::ServerConfig;
use chrono::Utc;
use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{oneshot, Mutex};

// ===================== 熔断器 =====================

pub(crate) struct CircuitBreaker {
    failures: AtomicI64,
    threshold: i64,
    cooldown_ms: i64,
    open_until_ms: AtomicI64,
}

impl CircuitBreaker {
    pub(crate) fn new(threshold: i32, cooldown_sec: i32) -> Self {
        let th = if threshold <= 0 { 5 } else { threshold as i64 };
        let cd = if cooldown_sec <= 0 {
            10_000
        } else {
            (cooldown_sec as i64) * 1000
        };
        Self {
            failures: AtomicI64::new(0),
            threshold: th,
            cooldown_ms: cd,
            open_until_ms: AtomicI64::new(0),
        }
    }

    pub(crate) fn allow(&self) -> bool {
        let open_until = self.open_until_ms.load(Ordering::SeqCst);
        if open_until == 0 {
            return true;
        }
        Utc::now().timestamp_millis() > open_until
    }

    pub(crate) fn on_success(&self) {
        self.failures.store(0, Ordering::SeqCst);
        self.open_until_ms.store(0, Ordering::SeqCst);
    }

    pub(crate) fn on_failure(&self) {
        let fails = self.failures.fetch_add(1, Ordering::SeqCst) + 1;
        if fails >= self.threshold {
            let until = Utc::now().timestamp_millis() + self.cooldown_ms;
            self.open_until_ms.store(until, Ordering::SeqCst);
        }
    }

    pub(crate) fn state(&self) -> String {
        let open_until = self.open_until_ms.load(Ordering::SeqCst);
        if open_until == 0 {
            return "closed".to_string();
        }
        if Utc::now().timestamp_millis() > open_until {
            "half-open".to_string()
        } else {
            "open".to_string()
        }
    }
}

// ===================== Redis 连接封装 =====================

#[derive(Clone)]
pub(crate) enum RedisConnection {
    Single(redis::aio::MultiplexedConnection),
    Cluster(redis::cluster_async::ClusterConnection),
}

impl RedisConnection {
    pub(crate) async fn query_cmd(&mut self, cmd: &redis::Cmd) -> Result<redis::Value, redis::RedisError> {
        match self {
            RedisConnection::Single(c) => cmd.query_async(c).await,
            RedisConnection::Cluster(c) => cmd.query_async(c).await,
        }
    }

    pub(crate) async fn query_pipe(
        &mut self,
        pipe: &redis::Pipeline,
    ) -> Result<redis::Value, redis::RedisError> {
        match self {
            RedisConnection::Single(c) => pipe.query_async(c).await,
            RedisConnection::Cluster(c) => pipe.query_async(c).await,
        }
    }
}

#[allow(dead_code)]
pub(crate) struct RedisClientEntry {
    pub(crate) id: String,
    pub(crate) cfg: ServerConfig,
    pub(crate) mode: String,
    pub(crate) ser: String,
    pub(crate) conn: Mutex<RedisConnection>,
    pub(crate) single_client: Option<redis::Client>,
    pub(crate) breaker: CircuitBreaker,
    pub(crate) pubsubs: Mutex<HashMap<String, oneshot::Sender<()>>>,
    pub(crate) kssub: Mutex<Option<oneshot::Sender<()>>>,
}

impl RedisClientEntry {
    pub(crate) async fn close(&self) {
        let mut subs = self.pubsubs.lock().await;
        for (_, tx) in subs.drain() {
            let _ = tx.send(());
        }
        let mut ks = self.kssub.lock().await;
        if let Some(tx) = ks.take() {
            let _ = tx.send(());
        }
    }

    pub(crate) async fn exec_cmd(&self, cmd: &redis::Cmd) -> Result<redis::Value, String> {
        if !self.breaker.allow() {
            return Err("熔断器开启中：Redis 持续失败，暂时拒绝请求".to_string());
        }
        let mut conn = self.conn.lock().await;
        match conn.query_cmd(cmd).await {
            Ok(v) => {
                self.breaker.on_success();
                Ok(v)
            }
            Err(e) => {
                if e.kind() != redis::ErrorKind::TypeError {
                    self.breaker.on_failure();
                }
                Err(e.to_string())
            }
        }
    }

    pub(crate) async fn exec_pipe(&self, pipe: &redis::Pipeline) -> Result<redis::Value, String> {
        if !self.breaker.allow() {
            return Err("熔断器开启中：Redis 持续失败，暂时拒绝请求".to_string());
        }
        let mut conn = self.conn.lock().await;
        match conn.query_pipe(pipe).await {
            Ok(v) => {
                self.breaker.on_success();
                Ok(v)
            }
            Err(e) => {
                self.breaker.on_failure();
                Err(e.to_string())
            }
        }
    }
}

pub(crate) fn build_redis_url(host_port: &str, cfg: &ServerConfig, include_db: bool) -> String {
    let scheme = if cfg.use_tls { "rediss" } else { "redis" };
    let db_path = if include_db && cfg.db > 0 {
        format!("/{}", cfg.db)
    } else {
        String::new()
    };
    let base = format!("{}://{}{}", scheme, host_port.trim(), db_path);
    if let Ok(mut u) = url::Url::parse(&base) {
        if !cfg.redis_username.trim().is_empty() {
            let _ = u.set_username(cfg.redis_username.trim());
        }
        if !cfg.password.is_empty() {
            let _ = u.set_password(Some(&cfg.password));
        }
        return u.to_string();
    }
    base
}

pub(crate) async fn connect_redis_entry(id: String, cfg: ServerConfig) -> Result<Arc<RedisClientEntry>, String> {
    let mode = if cfg.redis_mode.trim().is_empty() {
        "single".to_string()
    } else {
        cfg.redis_mode.trim().to_string()
    };
    let ser = if cfg.redis_serialization.trim().is_empty() {
        "none".to_string()
    } else {
        cfg.redis_serialization.trim().to_string()
    };

    let dial_timeout = if cfg.redis_dial_timeout <= 0 {
        Duration::from_secs(5)
    } else {
        Duration::from_secs(cfg.redis_dial_timeout as u64)
    };
    let resp_timeout = if cfg.redis_read_timeout <= 0 {
        Duration::from_secs(5)
    } else {
        Duration::from_secs(cfg.redis_read_timeout as u64)
    };

    let (conn, single_client) = if mode == "cluster" {
        let mut urls = Vec::new();
        if !cfg.redis_cluster_nodes.trim().is_empty() {
            for part in cfg.redis_cluster_nodes.split(',') {
                let p = part.trim();
                if !p.is_empty() {
                    urls.push(build_redis_url(p, &cfg, false));
                }
            }
        }
        if urls.is_empty() {
            let addr = format!("{}:{}", cfg.host.trim(), cfg.display_port());
            urls.push(build_redis_url(&addr, &cfg, false));
        }
        let mut builder = redis::cluster::ClusterClientBuilder::new(urls)
            .connection_timeout(dial_timeout)
            .response_timeout(resp_timeout);
        if !cfg.redis_username.trim().is_empty() {
            builder = builder.username(cfg.redis_username.trim().to_string());
        }
        if !cfg.password.is_empty() {
            builder = builder.password(cfg.password.clone());
        }
        let cluster_cli = builder
            .build()
            .map_err(|e| format!("构造 Redis 集群客户端失败: {}", e))?;
        let mut c = tokio::time::timeout(dial_timeout, cluster_cli.get_async_connection())
            .await
            .map_err(|_| "连接 Redis 集群超时".to_string())?
            .map_err(|e| format!("连接 Redis 集群失败: {}", e))?;
        let _: redis::Value = redis::cmd("PING")
            .query_async(&mut c)
            .await
            .map_err(|e| format!("连接 Redis 失败: {}", e))?;
        (RedisConnection::Cluster(c), None)
    } else {
        let addr = if mode == "sentinel" && !cfg.redis_sentinels.trim().is_empty() {
            cfg.redis_sentinels
                .split(',')
                .next()
                .unwrap_or("")
                .trim()
                .to_string()
        } else {
            format!("{}:{}", cfg.host.trim(), cfg.display_port())
        };
        let url_str = build_redis_url(&addr, &cfg, true);
        let cli = redis::Client::open(url_str)
            .map_err(|e| format!("构造 Redis 客户端失败: {}", e))?;
        let mut c = cli
            .get_multiplexed_tokio_connection_with_response_timeouts(resp_timeout, dial_timeout)
            .await
            .map_err(|e| format!("连接 Redis 失败: {}", e))?;
        let _: redis::Value = redis::cmd("PING")
            .query_async(&mut c)
            .await
            .map_err(|e| format!("连接 Redis 失败: {}", e))?;
        (RedisConnection::Single(c), Some(cli))
    };

    Ok(Arc::new(RedisClientEntry {
        id,
        breaker: CircuitBreaker::new(cfg.redis_breaker_threshold, cfg.redis_breaker_cooldown),
        cfg,
        mode,
        ser,
        conn: Mutex::new(conn),
        single_client,
        pubsubs: Mutex::new(HashMap::new()),
        kssub: Mutex::new(None),
    }))
}

// ===================== RedisManager =====================

pub struct RedisManager {
    clients: Mutex<HashMap<String, Arc<RedisClientEntry>>>,
}

impl Default for RedisManager {
    fn default() -> Self {
        Self::new()
    }
}

impl RedisManager {
    pub fn new() -> Self {
        Self {
            clients: Mutex::new(HashMap::new()),
        }
    }

    pub(crate) async fn get(&self, id: &str) -> Result<Arc<RedisClientEntry>, String> {
        let guard = self.clients.lock().await;
        guard
            .get(id)
            .cloned()
            .ok_or_else(|| "Redis 连接不存在或已断开".to_string())
    }

    pub async fn open(&self, id: String, cfg: ServerConfig) -> Result<(), String> {
        let entry = connect_redis_entry(id.clone(), cfg).await?;
        let old = {
            let mut guard = self.clients.lock().await;
            guard.insert(id, entry)
        };
        if let Some(old_entry) = old {
            old_entry.close().await;
        }
        Ok(())
    }

    pub async fn close(&self, id: &str) {
        let old = {
            let mut guard = self.clients.lock().await;
            guard.remove(id)
        };
        if let Some(entry) = old {
            entry.close().await;
        }
    }

    pub async fn close_all(&self) {
        let all: Vec<Arc<RedisClientEntry>> = {
            let mut guard = self.clients.lock().await;
            guard.drain().map(|(_, v)| v).collect()
        };
        for entry in all {
            entry.close().await;
        }
    }

    pub async fn list_connections(&self) -> Vec<serde_json::Value> {
        let guard = self.clients.lock().await;
        guard
            .iter()
            .map(|(id, rc)| {
                serde_json::json!({
                    "id": id,
                    "name": rc.cfg.name,
                    "host": rc.cfg.host,
                    "port": rc.cfg.port,
                    "mode": rc.mode,
                })
            })
            .collect()
    }

    pub async fn resolve_id(&self, id_or_name: &str) -> Result<String, String> {
        let guard = self.clients.lock().await;
        let trimmed = id_or_name.trim();
        if !trimmed.is_empty() {
            if guard.contains_key(trimmed) {
                return Ok(trimmed.to_string());
            }
            for (id, rc) in guard.iter() {
                if rc.cfg.name.eq_ignore_ascii_case(trimmed)
                    || rc.cfg.host.eq_ignore_ascii_case(trimmed)
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
            return Err("当前暂无已连通的 Redis 连接，请先在 Redis 界面中连接服务器".to_string());
        }
        Err(format!(
            "存在多个活跃的 Redis 连接，请指定明确的 server_id (当前活跃连接数: {})",
            guard.len()
        ))
    }
}

// ===================== 辅助函数 =====================

pub(crate) fn value_to_string(v: &redis::Value) -> String {
    match v {
        redis::Value::Nil => String::new(),
        redis::Value::Int(i) => i.to_string(),
        redis::Value::BulkString(b) => String::from_utf8_lossy(b).to_string(),
        redis::Value::SimpleString(s) => s.clone(),
        redis::Value::Okay => "OK".to_string(),
        redis::Value::Double(f) => f.to_string(),
        redis::Value::Boolean(b) => b.to_string(),
        redis::Value::VerbatimString { text, .. } => text.clone(),
        redis::Value::BigNumber(n) => format!("{:?}", n),
        redis::Value::Array(arr) | redis::Value::Set(arr) => arr
            .iter()
            .map(value_to_string)
            .collect::<Vec<_>>()
            .join("\n"),
        redis::Value::Map(pairs) => {
            let mut out = Vec::with_capacity(pairs.len() * 2);
            for (k, val) in pairs {
                out.push(value_to_string(k));
                out.push(value_to_string(val));
            }
            out.join("\n")
        }
        redis::Value::Attribute { data, .. } => value_to_string(data),
        redis::Value::Push { data, .. } => data
            .iter()
            .map(value_to_string)
            .collect::<Vec<_>>()
            .join("\n"),
        redis::Value::ServerError(e) => format!("{:?}", e),
    }
}

pub(crate) fn format_redis_result(v: &redis::Value) -> String {
    match v {
        redis::Value::Nil => "(nil)".to_string(),
        redis::Value::Int(i) => i.to_string(),
        redis::Value::BulkString(b) => String::from_utf8_lossy(b).to_string(),
        redis::Value::SimpleString(s) => s.clone(),
        redis::Value::Okay => "OK".to_string(),
        redis::Value::Double(f) => f.to_string(),
        redis::Value::Boolean(b) => b.to_string(),
        redis::Value::VerbatimString { text, .. } => text.clone(),
        redis::Value::BigNumber(n) => format!("{:?}", n),
        redis::Value::Array(arr) | redis::Value::Set(arr) => {
            let parts: Vec<String> = arr.iter().map(format_redis_result).collect();
            format!("[{}]", parts.join(", "))
        }
        redis::Value::Map(pairs) => {
            let parts: Vec<String> = pairs
                .iter()
                .map(|(k, val)| format!("{}: {}", format_redis_result(k), format_redis_result(val)))
                .collect();
            format!("{{{}}}", parts.join(", "))
        }
        redis::Value::Attribute { data, .. } => format_redis_result(data),
        redis::Value::Push { data, .. } => {
            let parts: Vec<String> = data.iter().map(format_redis_result).collect();
            format!("[{}]", parts.join(", "))
        }
        redis::Value::ServerError(e) => format!("{:?}", e),
    }
}

pub(crate) fn value_to_i64(v: &redis::Value) -> Option<i64> {
    match v {
        redis::Value::Int(i) => Some(*i),
        redis::Value::BulkString(b) => String::from_utf8_lossy(b).trim().parse::<i64>().ok(),
        redis::Value::SimpleString(s) => s.trim().parse::<i64>().ok(),
        _ => None,
    }
}

pub(crate) fn split_lines(s: &str) -> Vec<String> {
    let trimmed = s.trim_end_matches('\n');
    if trimmed.is_empty() {
        return Vec::new();
    }
    trimmed.split('\n').map(|x| x.to_string()).collect()
}

pub(crate) fn pairs_to_map(s: &str) -> Vec<(String, String)> {
    let lines: Vec<&str> = s.split('\n').collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i + 1 < lines.len() {
        out.push((lines[i].to_string(), lines[i + 1].to_string()));
        i += 2;
    }
    out
}

pub(crate) fn zset_to_pairs(s: &str) -> Vec<(String, f64)> {
    let lines: Vec<&str> = s.split('\n').collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i + 1 < lines.len() {
        let score = lines[i + 1].trim().parse::<f64>().unwrap_or(0.0);
        out.push((lines[i].to_string(), score));
        i += 2;
    }
    out
}

pub(crate) fn parse_cmd_line(line: &str) -> Option<redis::Cmd> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.is_empty() {
        return None;
    }
    let mut c = redis::cmd(parts[0]);
    for arg in &parts[1..] {
        c.arg(*arg);
    }
    Some(c)
}

