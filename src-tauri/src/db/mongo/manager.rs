use crate::core::ServerConfig;
use crate::db::mongo::types::MongoURIInfo;
use mongodb::bson::{doc, Bson, Document};
use mongodb::options::{
    AuthMechanism, ClientOptions, Credential, ReadPreference, SelectionCriteria, Tls, TlsOptions,
};
use mongodb::Client;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{oneshot, Mutex};

// ===================== 统计与客户端连接封装 =====================

pub(crate) struct MongoStats {
    ops: AtomicI64,
    failures: AtomicI64,
    total_nano: AtomicI64,
    slow_ops: AtomicI64,
}

impl MongoStats {
    pub(crate) fn new() -> Self {
        Self {
            ops: AtomicI64::new(0),
            failures: AtomicI64::new(0),
            total_nano: AtomicI64::new(0),
            slow_ops: AtomicI64::new(0),
        }
    }

    pub(crate) fn record(&self, d: Duration, is_err: bool) {
        self.ops.fetch_add(1, Ordering::SeqCst);
        self.total_nano
            .fetch_add(d.as_nanos() as i64, Ordering::SeqCst);
        if is_err {
            self.failures.fetch_add(1, Ordering::SeqCst);
        }
        if d >= Duration::from_millis(100) {
            self.slow_ops.fetch_add(1, Ordering::SeqCst);
        }
    }

    pub(crate) fn snapshot(&self) -> serde_json::Value {
        let ops = self.ops.load(Ordering::SeqCst);
        let total = self.total_nano.load(Ordering::SeqCst);
        let avg = if ops > 0 {
            (total as f64) / (ops as f64) / 1e6
        } else {
            0.0
        };
        serde_json::json!({
            "ops": ops,
            "failures": self.failures.load(Ordering::SeqCst),
            "slowOps": self.slow_ops.load(Ordering::SeqCst),
            "avgMs": avg,
            "totalMs": (total as f64) / 1e6,
        })
    }
}

#[allow(dead_code)]
pub(crate) struct MongoClientEntry {
    pub(crate) id: String,
    pub(crate) cfg: ServerConfig,
    pub(crate) client: Client,
    pub(crate) stats: MongoStats,
    pub(crate) streams: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

impl MongoClientEntry {
    pub(crate) async fn close(&self) {
        let mut streams = self.streams.lock().await;
        for (_, tx) in streams.drain() {
            let _ = tx.send(());
        }
    }

    pub(crate) fn track(&self, start: Instant, is_err: bool) {
        self.stats.record(start.elapsed(), is_err);
    }
}

pub struct MongoManager {
    clients: Mutex<HashMap<String, Arc<MongoClientEntry>>>,
}

impl Default for MongoManager {
    fn default() -> Self {
        Self::new()
    }
}

impl MongoManager {
    pub fn new() -> Self {
        Self {
            clients: Mutex::new(HashMap::new()),
        }
    }

    pub(crate) async fn must_mongo(&self, id: &str) -> Result<Arc<MongoClientEntry>, String> {
        let guard = self.clients.lock().await;
        guard
            .get(id)
            .cloned()
            .ok_or_else(|| "MongoDB 连接不存在或已断开".to_string())
    }

    pub async fn open(&self, id: String, cfg: ServerConfig) -> Result<(), String> {
        let opts = build_mongo_options(&cfg).await?;
        let client = Client::with_options(opts).map_err(|e| format!("连接 MongoDB 失败: {}", e))?;

        let connect_to = if cfg.mongo_connect_timeout <= 0 {
            Duration::from_secs(10)
        } else {
            Duration::from_secs(cfg.mongo_connect_timeout as u64)
        };
        let ping_db = if !cfg.mongo_database.trim().is_empty() {
            cfg.mongo_database.trim()
        } else if !cfg.mongo_auth_source.trim().is_empty() {
            cfg.mongo_auth_source.trim()
        } else {
            "admin"
        };
        tokio::time::timeout(
            connect_to,
            client.database(ping_db).run_command(doc! { "ping": 1 }),
        )
        .await
        .map_err(|_| "MongoDB 探活超时".to_string())?
        .map_err(|e| format!("MongoDB 探活失败: {}", e))?;

        let entry = Arc::new(MongoClientEntry {
            id: id.clone(),
            cfg,
            client,
            stats: MongoStats::new(),
            streams: Mutex::new(HashMap::new()),
        });

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
        let all: Vec<Arc<MongoClientEntry>> = {
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
            .map(|(id, mc)| {
                serde_json::json!({
                    "id": id,
                    "name": mc.cfg.name,
                    "host": mc.cfg.host,
                    "port": mc.cfg.port,
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
            return Err(
                "当前暂无已连通的 MongoDB 连接，请先在 MongoDB 界面中连接服务器".to_string(),
            );
        }
        Err(format!(
            "存在多个活跃的 MongoDB 连接，请指定明确的 server_id (当前活跃连接数: {})",
            guard.len()
        ))
    }
}

// ===================== URI 与 BSON 辅助函数 =====================

pub(crate) fn parse_mongo_uri_inner(raw: &str) -> Result<MongoURIInfo, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err("连接字符串不能为空".to_string());
    }
    if !raw.starts_with("mongodb://") && !raw.starts_with("mongodb+srv://") {
        return Err("连接字符串必须以 mongodb:// 或 mongodb+srv:// 开头".to_string());
    }

    let (scheme, rest) = raw
        .split_once("://")
        .ok_or_else(|| "连接字符串格式错误".to_string())?;
    let srv = scheme == "mongodb+srv";

    let (authority_and_path, query_str) = match rest.split_once('?') {
        Some((ap, q)) => (ap, q),
        None => (rest, ""),
    };

    let (authority, path_str) = match authority_and_path.split_once('/') {
        Some((a, p)) => (a, p),
        None => (authority_and_path, ""),
    };

    let (userinfo, hosts_part) = match authority.rsplit_once('@') {
        Some((u, h)) => (Some(u), h),
        None => (None, authority),
    };

    let mut username = String::new();
    let mut password = String::new();
    if let Some(ui) = userinfo {
        match ui.split_once(':') {
            Some((u, p)) => {
                username = url::form_urlencoded::parse(u.as_bytes())
                    .map(|(k, v)| if v.is_empty() { k } else { format!("{}={}", k, v).into() })
                    .collect();
                password = url::form_urlencoded::parse(p.as_bytes())
                    .map(|(k, v)| if v.is_empty() { k } else { format!("{}={}", k, v).into() })
                    .collect();
            }
            None => {
                username = ui.to_string();
            }
        }
    }

    let hosts: Vec<String> = hosts_part
        .split(',')
        .map(|h| h.trim().to_string())
        .filter(|h| !h.is_empty())
        .collect();

    let database = path_str.trim_start_matches('/').to_string();

    let mut options = HashMap::new();
    for (k, v) in url::form_urlencoded::parse(query_str.as_bytes()) {
        options.insert(k.to_string(), v.to_string());
    }

    let auth_source = options.get("authSource").cloned().unwrap_or_default();
    let auth_mech = options.get("authMechanism").cloned().unwrap_or_default();
    let replica_set = options.get("replicaSet").cloned().unwrap_or_default();
    let tls_flag = options
        .get("tls")
        .or_else(|| options.get("ssl"))
        .map(|v| v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    Ok(MongoURIInfo {
        scheme: scheme.to_string(),
        hosts,
        username,
        password,
        database,
        auth_source,
        auth_mech,
        replica_set,
        tls: srv || tls_flag,
        srv,
        options,
    })
}

pub(crate) fn build_mongo_uri(cfg: &ServerConfig) -> String {
    let uri = cfg.mongo_uri.trim();
    if !uri.is_empty() {
        return uri.to_string();
    }
    let scheme = if cfg.mongo_srv {
        "mongodb+srv"
    } else {
        "mongodb"
    };
    let hosts = if !cfg.mongo_hosts.trim().is_empty() {
        cfg.mongo_hosts.trim().to_string()
    } else if cfg.mongo_srv {
        cfg.host.trim().to_string()
    } else {
        format!("{}:{}", cfg.host.trim(), cfg.display_port())
    };

    let mut out = format!("{}://", scheme);
    let user = cfg.username.trim();
    if !user.is_empty() {
        let enc_u: String = url::form_urlencoded::byte_serialize(user.as_bytes()).collect();
        out.push_str(&enc_u);
        if !cfg.password.is_empty() {
            let enc_p: String =
                url::form_urlencoded::byte_serialize(cfg.password.as_bytes()).collect();
            out.push(':');
            out.push_str(&enc_p);
        }
        out.push('@');
    }
    out.push_str(&hosts);
    out.push('/');
    if !cfg.mongo_database.trim().is_empty() {
        out.push_str(cfg.mongo_database.trim());
    }

    let mut q = url::form_urlencoded::Serializer::new(String::new());
    if !cfg.mongo_auth_source.trim().is_empty() {
        q.append_pair("authSource", cfg.mongo_auth_source.trim());
    }
    if !cfg.mongo_replica_set.trim().is_empty() {
        q.append_pair("replicaSet", cfg.mongo_replica_set.trim());
    }
    let q_str = q.finish();
    if !q_str.is_empty() {
        out.push('?');
        out.push_str(&q_str);
    }
    out
}

pub(crate) async fn build_mongo_options(cfg: &ServerConfig) -> Result<ClientOptions, String> {
    let uri = build_mongo_uri(cfg);
    let mut opts = ClientOptions::parse(&uri)
        .await
        .map_err(|e| format!("解析 MongoDB 连接配置失败: {}", e))?;

    let mech = cfg.mongo_auth_mech.trim();
    match mech {
        "MONGODB-X509" => {
            opts.credential = Some(
                Credential::builder()
                    .mechanism(AuthMechanism::MongoDbX509)
                    .source("$external".to_string())
                    .build(),
            );
        }
        "SCRAM-SHA-1" | "SCRAM-SHA-256" => {
            let src = if cfg.mongo_auth_source.trim().is_empty() {
                "admin".to_string()
            } else {
                cfg.mongo_auth_source.trim().to_string()
            };
            let m = if mech == "SCRAM-SHA-1" {
                AuthMechanism::ScramSha1
            } else {
                AuthMechanism::ScramSha256
            };
            opts.credential = Some(
                Credential::builder()
                    .mechanism(m)
                    .source(src)
                    .username(cfg.username.clone())
                    .password(cfg.password.clone())
                    .build(),
            );
        }
        "none" | "" => {
            if !cfg.username.trim().is_empty() && cfg.mongo_uri.trim().is_empty() {
                let src = if cfg.mongo_auth_source.trim().is_empty() {
                    "admin".to_string()
                } else {
                    cfg.mongo_auth_source.trim().to_string()
                };
                opts.credential = Some(
                    Credential::builder()
                        .source(src)
                        .username(cfg.username.clone())
                        .password(cfg.password.clone())
                        .build(),
                );
            }
        }
        other => return Err(format!("不支持的认证机制: {}", other)),
    }

    if cfg.mongo_tls_enabled || mech == "MONGODB-X509" {
        let mut tls_opts = TlsOptions::default();
        if cfg.mongo_tls_insecure {
            tls_opts.allow_invalid_certificates = Some(true);
        }
        if !cfg.mongo_tls_ca_cert.trim().is_empty() {
            tls_opts.ca_file_path = Some(PathBuf::from(cfg.mongo_tls_ca_cert.trim()));
        }
        if !cfg.mongo_tls_client_cert.trim().is_empty() {
            tls_opts.cert_key_file_path = Some(PathBuf::from(cfg.mongo_tls_client_cert.trim()));
        }
        opts.tls = Some(Tls::Enabled(tls_opts));
    }

    if cfg.mongo_max_pool_size > 0 {
        opts.max_pool_size = Some(cfg.mongo_max_pool_size as u32);
    }
    if cfg.mongo_min_pool_size > 0 {
        opts.min_pool_size = Some(cfg.mongo_min_pool_size as u32);
    }
    if cfg.mongo_max_conn_idle_time > 0 {
        opts.max_idle_time = Some(Duration::from_secs(cfg.mongo_max_conn_idle_time as u64));
    }

    let connect_to = if cfg.mongo_connect_timeout <= 0 {
        10
    } else {
        cfg.mongo_connect_timeout as u64
    };
    opts.connect_timeout = Some(Duration::from_secs(connect_to));

    let sel_to = if cfg.mongo_server_select_timeout <= 0 {
        10
    } else {
        cfg.mongo_server_select_timeout as u64
    };
    opts.server_selection_timeout = Some(Duration::from_secs(sel_to));

    if !cfg.mongo_replica_set.trim().is_empty() {
        opts.repl_set_name = Some(cfg.mongo_replica_set.trim().to_string());
    }

    if !cfg.mongo_read_preference.trim().is_empty() {
        let rp = match cfg.mongo_read_preference.trim().to_lowercase().as_str() {
            "primarypreferred" => ReadPreference::PrimaryPreferred {
                options: Default::default(),
            },
            "secondary" => ReadPreference::Secondary {
                options: Default::default(),
            },
            "secondarypreferred" => ReadPreference::SecondaryPreferred {
                options: Default::default(),
            },
            "nearest" => ReadPreference::Nearest {
                options: Default::default(),
            },
            _ => ReadPreference::Primary,
        };
        opts.selection_criteria = Some(SelectionCriteria::ReadPreference(rp));
    }

    opts.retry_writes = Some(true);
    opts.retry_reads = Some(true);
    opts.app_name = Some(if !cfg.mongo_app_name.trim().is_empty() {
        cfg.mongo_app_name.trim().to_string()
    } else {
        "xTerminal".to_string()
    });

    Ok(opts)
}

pub(crate) fn parse_json_doc(text: &str) -> Result<Document, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(Document::new());
    }
    let val: serde_json::Value =
        serde_json::from_str(trimmed).map_err(|e| format!("JSON 解析失败: {}", e))?;
    let bson_val = Bson::try_from(val).map_err(|e| format!("BSON 转换失败: {}", e))?;
    match bson_val {
        Bson::Document(d) => Ok(d),
        _ => Err("JSON 必须是一个对象文档".to_string()),
    }
}

pub(crate) fn parse_json_array(text: &str) -> Result<Vec<Document>, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    if trimmed.starts_with('{') {
        return Ok(vec![parse_json_doc(trimmed)?]);
    }
    let val: serde_json::Value =
        serde_json::from_str(trimmed).map_err(|e| format!("JSON 数组解析失败: {}", e))?;
    let arr = val
        .as_array()
        .ok_or_else(|| "JSON 必须是数组格式".to_string())?;
    let mut out = Vec::with_capacity(arr.len());
    for (i, item) in arr.iter().enumerate() {
        let b = Bson::try_from(item.clone())
            .map_err(|e| format!("第 {} 个元素解析失败: {}", i + 1, e))?;
        match b {
            Bson::Document(d) => out.push(d),
            _ => return Err(format!("第 {} 个元素不是对象文档", i + 1)),
        }
    }
    Ok(out)
}

pub(crate) fn doc_to_json(doc: &Document) -> String {
    let ext = Bson::Document(doc.clone()).into_relaxed_extjson();
    serde_json::to_string(&ext).unwrap_or_else(|_| "{}".to_string())
}

pub(crate) fn bson_to_json(b: &Bson) -> String {
    let ext = b.clone().into_relaxed_extjson();
    serde_json::to_string(&ext).unwrap_or_else(|_| "{}".to_string())
}

pub(crate) fn normalize_bson_value(b: &Bson) -> serde_json::Value {
    match b {
        Bson::Null | Bson::Undefined => serde_json::Value::Null,
        Bson::Boolean(v) => serde_json::Value::Bool(*v),
        Bson::Int32(v) => serde_json::json!(*v),
        Bson::Int64(v) => serde_json::json!(*v),
        Bson::Double(v) => serde_json::json!(*v),
        Bson::String(s) => serde_json::Value::String(s.clone()),
        Bson::Array(arr) => serde_json::Value::Array(arr.iter().map(normalize_bson_value).collect()),
        Bson::Document(d) => {
            let mut map = serde_json::Map::new();
            for (k, v) in d.iter() {
                map.insert(k.clone(), normalize_bson_value(v));
            }
            serde_json::Value::Object(map)
        }
        other => other.clone().into_relaxed_extjson(),
    }
}

pub(crate) fn bson_type_name(b: &Bson) -> &'static str {
    match b {
        Bson::Null => "null",
        Bson::Boolean(_) => "bool",
        Bson::Int32(_) => "int",
        Bson::Int64(_) => "long",
        Bson::Double(_) => "double",
        Bson::String(_) => "string",
        Bson::Document(_) => "object",
        Bson::Array(_) => "array",
        Bson::ObjectId(_) => "objectId",
        Bson::DateTime(_) => "date",
        Bson::Binary(_) => "binData",
        Bson::Decimal128(_) => "decimal",
        Bson::RegularExpression(_) => "regex",
        Bson::Timestamp(_) => "timestamp",
        _ => "unknown",
    }
}

pub(crate) fn collect_fields(prefix: &str, doc: &Document, emit: &mut dyn FnMut(String, &'static str)) {
    for (k, v) in doc.iter() {
        let path = if prefix.is_empty() {
            k.clone()
        } else {
            format!("{}.{}", prefix, k)
        };
        emit(path.clone(), bson_type_name(v));
        if let Bson::Document(sub) = v {
            if path.matches('.').count() < 2 {
                collect_fields(&path, sub, emit);
            }
        }
    }
}

pub(crate) fn detect_topology(hello: &Document) -> String {
    if let Ok("isdbgrid") = hello.get_str("msg") {
        return "sharded".to_string();
    }
    if hello.contains_key("setName") {
        return "replicaSet".to_string();
    }
    "standalone".to_string()
}

pub(crate) async fn server_version(client: &Client) -> String {
    if let Ok(res) = client
        .database("admin")
        .run_command(doc! { "buildInfo": 1 })
        .await
    {
        if let Ok(v) = res.get_str("version") {
            return v.to_string();
        }
    }
    String::new()
}

pub(crate) fn ensure_update_operators(update: Document) -> Document {
    if let Some((first_key, _)) = update.iter().next() {
        if !first_key.starts_with('$') {
            return doc! { "$set": update };
        }
    }
    update
}

