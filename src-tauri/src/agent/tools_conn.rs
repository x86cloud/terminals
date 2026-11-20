use crate::agent::approval::authorize_conn_action;
use crate::agent::tool::{AgentTool, ToolCtx, ToolResult};
use crate::agent::AgentRuntime;
use crate::core::{ServerConfig, Store};
use crate::db::mongo::MongoManager;
use crate::db::mysql::MysqlManager;
use crate::db::postgres::PostgresManager;
use crate::db::redis::RedisManager;
use crate::k8s::K8sManager;
use crate::docker::DockerManager;
use crate::ssh::SshManager;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tauri::Emitter;

#[derive(Clone)]
pub struct ConnManagers {
    pub store: Arc<Store>,
    pub ssh: Arc<SshManager>,
    pub mysql: Arc<MysqlManager>,
    pub redis: Arc<RedisManager>,
    pub postgres: Arc<PostgresManager>,
    pub mongo: Arc<MongoManager>,
    pub docker: Arc<DockerManager>,
    pub k8s: Arc<K8sManager>,
}

fn mask_mongo_uri(uri: &str) -> String {
    let trimmed = uri.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if let Some(scheme_end) = trimmed.find("://") {
        let rest = &trimmed[scheme_end + 3..];
        if let Some(at_pos) = rest.find('@') {
            let auth = &rest[..at_pos];
            let host_part = &rest[at_pos + 1..];
            if let Some(colon_pos) = auth.find(':') {
                let user = &auth[..colon_pos];
                return format!("{}://{}:******@{}", &trimmed[..scheme_end], user, host_part);
            }
        }
    }
    trimmed.to_string()
}

fn format_target_display(cfg: &ServerConfig) -> String {
    let ct = cfg.normalized_type();
    match ct {
        "sqlite" => cfg.sqlite_path.clone(),
        "docker" => {
            if cfg.docker_endpoint_type == "unix"
                || (cfg.docker_endpoint_type.is_empty() && !cfg.docker_socket_path.is_empty())
            {
                format!("unix://{}", cfg.docker_socket_path)
            } else if cfg.docker_endpoint_type == "ssh" {
                let h = if cfg.docker_ssh_host.trim().is_empty() {
                    cfg.host.trim()
                } else {
                    cfg.docker_ssh_host.trim()
                };
                let u = if cfg.docker_ssh_user.trim().is_empty() {
                    cfg.username.trim()
                } else {
                    cfg.docker_ssh_user.trim()
                };
                format!("ssh://{}@{}:{}", u, h, cfg.docker_ssh_port.max(22))
            } else {
                format!("tcp://{}:{}", cfg.host, cfg.display_port())
            }
        }
        "k8s" => {
            if !cfg.k8s_api_server.trim().is_empty() {
                cfg.k8s_api_server.clone()
            } else if !cfg.k8s_kubeconfig_path.trim().is_empty() {
                format!("kubeconfig:{}", cfg.k8s_kubeconfig_path)
            } else if !cfg.k8s_context.trim().is_empty() {
                format!("context:{}", cfg.k8s_context)
            } else {
                cfg.label()
            }
        }
        "mongo" if !cfg.mongo_uri.trim().is_empty() => mask_mongo_uri(&cfg.mongo_uri),
        _ => {
            let db_suffix = match ct {
                "mysql" if !cfg.database.trim().is_empty() => format!("/{}", cfg.database.trim()),
                "postgres" if !cfg.postgres_database.trim().is_empty() => {
                    format!("/{}", cfg.postgres_database.trim())
                }
                "mongo" if !cfg.mongo_database.trim().is_empty() => {
                    format!("/{}", cfg.mongo_database.trim())
                }
                _ => String::new(),
            };
            if cfg.username.trim().is_empty() {
                format!("{}://{}:{}{}", ct, cfg.host, cfg.display_port(), db_suffix)
            } else {
                format!(
                    "{}://{}@{}:{}{}",
                    ct,
                    cfg.username.trim(),
                    cfg.host,
                    cfg.display_port(),
                    db_suffix
                )
            }
        }
    }
}

fn sanitize_server_config(
    cfg: &ServerConfig,
    connected: bool,
    agent_id: Option<&str>,
    agent_enabled: bool,
) -> Value {
    let ct = cfg.normalized_type();
    let has_password = !cfg.password.is_empty()
        || !cfg.postgres_ssh_password.is_empty()
        || !cfg.docker_ssh_password.is_empty()
        || !cfg.k8s_ssh_password.is_empty();
    let has_private_key = !cfg.private_key.trim().is_empty()
        || !cfg.mysql_ssh_key_data.trim().is_empty()
        || !cfg.postgres_ssh_key_data.trim().is_empty()
        || !cfg.docker_ssh_key_data.trim().is_empty()
        || !cfg.k8s_ssh_key_data.trim().is_empty();
    let has_passphrase = !cfg.passphrase.is_empty()
        || !cfg.mysql_ssh_passphrase.is_empty()
        || !cfg.postgres_ssh_passphrase.is_empty()
        || !cfg.docker_ssh_passphrase.is_empty()
        || !cfg.k8s_ssh_passphrase.is_empty();
    let has_token = !cfg.k8s_bearer_token.trim().is_empty();
    let has_kubeconfig_data = !cfg.k8s_kubeconfig_data.trim().is_empty();

    let mut obj = json!({
        "id": cfg.id,
        "name": cfg.label(),
        "type": ct,
        "groupId": cfg.group_id,
        "host": cfg.host,
        "port": cfg.display_port(),
        "username": cfg.username,
        "authType": cfg.auth_type,
        "target": format_target_display(cfg),
        "remark": cfg.remark,
        "connected": connected,
        "agentId": agent_id,
        "agentEnabled": agent_enabled,
        "credentials": {
            "hasPassword": has_password,
            "hasPrivateKey": has_private_key,
            "hasPassphrase": has_passphrase,
            "hasToken": has_token,
            "hasKubeconfigData": has_kubeconfig_data,
        },
    });

    if let Some(map) = obj.as_object_mut() {
        match ct {
            "mysql" => {
                map.insert("database".to_string(), json!(cfg.database));
                map.insert("sshTunnel".to_string(), json!(cfg.mysql_ssh_enabled));
            }
            "postgres" => {
                map.insert("database".to_string(), json!(cfg.postgres_database));
                map.insert("schema".to_string(), json!(cfg.postgres_schema));
                map.insert("sslMode".to_string(), json!(cfg.postgres_ssl_mode));
                map.insert("sshTunnel".to_string(), json!(cfg.postgres_ssh_enabled));
            }
            "redis" => {
                map.insert("redisMode".to_string(), json!(cfg.redis_mode));
                map.insert("db".to_string(), json!(cfg.db));
            }
            "mongo" => {
                map.insert("database".to_string(), json!(cfg.mongo_database));
                map.insert("authSource".to_string(), json!(cfg.mongo_auth_source));
                map.insert("uriMasked".to_string(), json!(mask_mongo_uri(&cfg.mongo_uri)));
            }
            "sqlite" => {
                map.insert("sqlitePath".to_string(), json!(cfg.sqlite_path));
            }
            "docker" => {
                map.insert("endpointType".to_string(), json!(cfg.docker_endpoint_type));
                map.insert("socketPath".to_string(), json!(cfg.docker_socket_path));
            }
            "k8s" => {
                map.insert("authMode".to_string(), json!(cfg.k8s_auth_mode));
                map.insert("context".to_string(), json!(cfg.k8s_context));
                map.insert("namespace".to_string(), json!(cfg.k8s_namespace));
                map.insert("kubeconfigPath".to_string(), json!(cfg.k8s_kubeconfig_path));
            }
            _ => {}
        }
    }

    obj
}

fn build_auth_summary(cfg: &ServerConfig) -> String {
    let mut parts = Vec::new();
    let ct = cfg.normalized_type();
    if !cfg.username.trim().is_empty() {
        parts.push(format!("用户: {}", cfg.username.trim()));
    }
    if !cfg.auth_type.trim().is_empty() {
        parts.push(format!("认证方式: {}", cfg.auth_type.trim()));
    }
    if !cfg.password.is_empty() {
        parts.push("密码: ****** (已提供)".to_string());
    } else if ct == "ssh" && cfg.auth_type != "key" {
        parts.push("密码: (未设置)".to_string());
    }
    if !cfg.private_key.trim().is_empty() {
        parts.push("私钥: ****** (已提供)".to_string());
    }
    if !cfg.passphrase.is_empty() {
        parts.push("私钥口令: ****** (已提供)".to_string());
    }
    if !cfg.k8s_bearer_token.trim().is_empty() {
        parts.push("Bearer Token: ****** (已提供)".to_string());
    }
    if !cfg.k8s_kubeconfig_path.trim().is_empty() {
        parts.push(format!("Kubeconfig: {}", cfg.k8s_kubeconfig_path.trim()));
    }
    if parts.is_empty() {
        "认证方式: 无密码 / 默认配置".to_string()
    } else {
        parts.join(" · ")
    }
}

fn extract_ids(list: Vec<Value>) -> HashSet<String> {
    list.into_iter()
        .filter_map(|v| {
            v.get("id")
                .or_else(|| v.get("serverId"))
                .and_then(|s| s.as_str())
                .map(|s| s.to_string())
        })
        .collect()
}

// ============================================================================
// conn_list (Read-only masked connection listing)
// ============================================================================

pub struct ConnListTool {
    pub runtime: Arc<AgentRuntime>,
    pub conns: ConnManagers,
}

#[async_trait]
impl AgentTool for ConnListTool {
    fn name(&self) -> &str {
        "conn_list"
    }

    fn description(&self) -> &str {
        "List all saved connection configurations (covering SSH, MySQL, Redis, PostgreSQL, MongoDB, Docker, Kubernetes, SQLite, MQTT, etc.). \
        Sensitive credentials such as passwords, private keys, and tokens are strictly masked; includes live connection status and sub-agent enablement."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "description": "Optional protocol filter: ssh / mysql / redis / postgres / mongo / docker / k8s / sqlite / mqtt"
                },
                "keyword": {
                    "type": "string",
                    "description": "Optional keyword to filter by connection name, host, or remark"
                }
            }
        })
    }

    fn format_title(&self, arguments: &str) -> String {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let typ = args.get("type").and_then(|v| v.as_str()).unwrap_or("").trim();
        if typ.is_empty() {
            "Listed saved connections".to_string()
        } else {
            format!("Listed saved {} connections", typ)
        }
    }

    async fn execute(&self, _ctx: &ToolCtx, arguments: &str) -> ToolResult {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let filter_type = args
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();
        let keyword = args
            .get("keyword")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase();

        let servers = self.conns.store.list();

        // Collect live connection maps
        let ssh_sessions = self.conns.ssh.list_sessions().await;
        let mut ssh_by_server: HashMap<String, String> = HashMap::new();
        for s in ssh_sessions {
            if s.connected {
                ssh_by_server.insert(s.server_id.clone(), s.id.clone());
            }
        }
        let mysql_ids: HashSet<String> = self
            .conns
            .mysql
            .list_sessions()
            .await
            .into_iter()
            .map(|(m, _)| m.id)
            .collect();
        let redis_ids = extract_ids(self.conns.redis.list_connections().await);
        let pg_ids = extract_ids(self.conns.postgres.list_connections().await);
        let mongo_ids = extract_ids(self.conns.mongo.list_connections().await);
        let docker_ids = extract_ids(self.conns.docker.list_connections().await);
        let k8s_ids = extract_ids(self.conns.k8s.list_connections().await);

        let mut items = Vec::new();
        for cfg in &servers {
            let ct = cfg.normalized_type();
            if !filter_type.is_empty() && ct != filter_type {
                continue;
            }
            if !keyword.is_empty() {
                let hay = format!(
                    "{} {} {} {} {}",
                    cfg.name, cfg.host, cfg.username, cfg.database, cfg.remark
                )
                .to_ascii_lowercase();
                if !hay.contains(&keyword) {
                    continue;
                }
            }

            let (connected, agent_id) = match ct {
                "ssh" => {
                    if let Some(sid) = ssh_by_server.get(&cfg.id) {
                        (true, Some(format!("ssh:{}", sid)))
                    } else {
                        (false, None)
                    }
                }
                "mysql" => {
                    let conn = mysql_ids.contains(&cfg.id);
                    (conn, if conn { Some(format!("mysql:{}", cfg.id)) } else { None })
                }
                "redis" => (redis_ids.contains(&cfg.id), None),
                "postgres" => (pg_ids.contains(&cfg.id), None),
                "mongo" => (mongo_ids.contains(&cfg.id), None),
                "docker" => (docker_ids.contains(&cfg.id), None),
                "k8s" => (k8s_ids.contains(&cfg.id), None),
                _ => (false, None),
            };
            let agent_enabled = agent_id
                .as_deref()
                .map(|aid| self.runtime.is_agent_enabled(aid))
                .unwrap_or(false);

            items.push(sanitize_server_config(
                cfg,
                connected,
                agent_id.as_deref(),
                agent_enabled,
            ));
        }

        ToolResult::success(json!({
            "count": items.len(),
            "connections": items,
        }))
    }
}

// ============================================================================
// conn_create (Create and persist a new ServerConfig with user confirmation)
// ============================================================================

pub struct ConnCreateTool {
    pub runtime: Arc<AgentRuntime>,
    pub conns: ConnManagers,
}

#[async_trait]
impl AgentTool for ConnCreateTool {
    fn name(&self) -> &str {
        "conn_create"
    }

    fn description(&self) -> &str {
        "Create and persist a new server/database/container connection configuration (supports ssh / mysql / redis / postgres / mongo / docker / k8s / sqlite / mqtt). \
        If required credentials such as password or private key are missing, ask the user via `ask_user` first before calling this tool. \
        Triggers a masked confirmation card for user approval and never echoes plaintext secrets in the tool result."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Connection display name (e.g. 'Production MySQL Primary')"
                },
                "type": {
                    "type": "string",
                    "enum": ["ssh", "mysql", "redis", "postgres", "mongo", "docker", "k8s", "sqlite", "mqtt"],
                    "description": "Connection protocol type"
                },
                "host": {
                    "type": "string",
                    "description": "Hostname or IP address"
                },
                "port": {
                    "type": "integer",
                    "description": "Port number (defaults automatically by protocol if omitted: 22/3306/6379/5432/27017)"
                },
                "username": {
                    "type": "string",
                    "description": "Login username"
                },
                "auth_type": {
                    "type": "string",
                    "enum": ["password", "key"],
                    "description": "SSH authentication method: password or key (default password)"
                },
                "password": {
                    "type": "string",
                    "description": "Login password (leave empty if none)"
                },
                "private_key": {
                    "type": "string",
                    "description": "SSH private key path or PEM content"
                },
                "passphrase": {
                    "type": "string",
                    "description": "Private key passphrase (if any)"
                },
                "database": {
                    "type": "string",
                    "description": "Default database name (for mysql / postgres / mongo)"
                },
                "remark": {
                    "type": "string",
                    "description": "Optional remark or notes"
                },
                "sqlite_path": {
                    "type": "string",
                    "description": "SQLite database file path (sqlite only)"
                },
                "docker_endpoint_type": {
                    "type": "string",
                    "enum": ["unix", "tcp", "ssh"],
                    "description": "Docker endpoint type (docker only)"
                },
                "docker_socket_path": {
                    "type": "string",
                    "description": "Docker Unix socket path (docker unix mode only)"
                },
                "k8s_kubeconfig_path": {
                    "type": "string",
                    "description": "Kubeconfig file path (k8s only)"
                },
                "k8s_api_server": {
                    "type": "string",
                    "description": "Kubernetes API Server URL (k8s token mode only)"
                },
                "k8s_bearer_token": {
                    "type": "string",
                    "description": "Kubernetes Bearer Token (k8s token mode only)"
                },
                "mongo_uri": {
                    "type": "string",
                    "description": "MongoDB connection URI (optional)"
                },
                "reason": {
                    "type": "string",
                    "description": "Purpose of creating this connection (shown on approval card)"
                }
            },
            "required": ["name", "type"]
        })
    }

    fn format_title(&self, arguments: &str) -> String {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
        let typ = args.get("type").and_then(|v| v.as_str()).unwrap_or("").trim();
        if name.is_empty() {
            "Create connection".to_string()
        } else {
            format!("Create {} connection `{}`", typ, name)
        }
    }

    async fn execute(&self, ctx: &ToolCtx, arguments: &str) -> ToolResult {
        if ctx.cancel.is_cancelled() {
            return ToolResult::err("任务已取消");
        }
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));

        let mut cfg = ServerConfig::default();
        cfg.name = args.get("name").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
        cfg.conn_type = args
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("ssh")
            .trim()
            .to_ascii_lowercase();
        cfg.host = args.get("host").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
        cfg.port = args.get("port").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        cfg.username = args.get("username").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
        cfg.auth_type = args
            .get("auth_type")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        cfg.password = args.get("password").and_then(|v| v.as_str()).unwrap_or("").to_string();
        cfg.private_key = args
            .get("private_key")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        cfg.passphrase = args.get("passphrase").and_then(|v| v.as_str()).unwrap_or("").to_string();
        cfg.remark = args.get("remark").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();

        let db = args.get("database").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
        match cfg.normalized_type() {
            "mysql" => cfg.database = db,
            "postgres" => cfg.postgres_database = db,
            "mongo" => cfg.mongo_database = db,
            _ => {}
        }

        cfg.sqlite_path = args.get("sqlite_path").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
        cfg.docker_endpoint_type = args
            .get("docker_endpoint_type")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        cfg.docker_socket_path = args
            .get("docker_socket_path")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        cfg.k8s_kubeconfig_path = args
            .get("k8s_kubeconfig_path")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        cfg.k8s_api_server = args
            .get("k8s_api_server")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        cfg.k8s_bearer_token = args
            .get("k8s_bearer_token")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        cfg.mongo_uri = args.get("mongo_uri").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();

        if cfg.normalized_type() == "k8s" && !cfg.k8s_bearer_token.is_empty() {
            cfg.k8s_auth_mode = "token".to_string();
        }
        if cfg.normalized_type() == "ssh" && cfg.auth_type.is_empty() {
            cfg.auth_type = if cfg.private_key.is_empty() {
                "password".to_string()
            } else {
                "key".to_string()
            };
        }

        if let Err(e) = cfg.validate() {
            return ToolResult::err(e);
        }

        let target_display = format_target_display(&cfg);
        let auth_summary = build_auth_summary(&cfg);
        let reason = args
            .get("reason")
            .and_then(|v| v.as_str())
            .unwrap_or("保存新的连接配置")
            .trim()
            .to_string();

        if let Err(deny_err) = authorize_conn_action(
            &self.runtime,
            "conn_create",
            cfg.normalized_type(),
            &cfg.label(),
            &target_display,
            &auth_summary,
            &reason,
            &cfg.remark,
            ctx,
        )
        .await
        {
            return ToolResult::err(deny_err);
        }

        match self.conns.store.save(cfg) {
            Ok(saved) => {
                if let Some(ref app) = ctx.app {
                    let _ = app.emit("servers:changed", json!({ "id": saved.id }));
                }
                ToolResult::success(json!({
                    "created": true,
                    "connection": sanitize_server_config(&saved, false, None, false),
                }))
            }
            Err(e) => ToolResult::err(format!("保存连接失败: {}", e)),
        }
    }
}

// ============================================================================
// conn_activate (Activate an existing connection & optionally enable subagent)
// ============================================================================

pub struct ConnActivateTool {
    pub runtime: Arc<AgentRuntime>,
    pub conns: ConnManagers,
}

#[async_trait]
impl AgentTool for ConnActivateTool {
    fn name(&self) -> &str {
        "conn_activate"
    }

    fn description(&self) -> &str {
        "Activate a saved connection (matched by server_id or connection name/host): establishes the underlying network connection and syncs it to the UI session bar. \
        For SSH and MySQL connections, enables sub-agent dispatch permission by default so `dispatch_task` can be used immediately."
    }

    fn parameters_schema(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "server_id": {
                    "type": "string",
                    "description": "Target connection ID (or connection name/host for automatic matching)"
                },
                "enable_subagent": {
                    "type": "boolean",
                    "description": "For SSH/MySQL connections, whether to automatically enable sub-agent dispatch permission after activation (default true)"
                },
                "reason": {
                    "type": "string",
                    "description": "Purpose of activating this connection (shown on approval card)"
                }
            },
            "required": ["server_id"]
        })
    }

    fn format_title(&self, arguments: &str) -> String {
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let sid = args.get("server_id").and_then(|v| v.as_str()).unwrap_or("").trim();
        if sid.is_empty() {
            "Activate connection".to_string()
        } else {
            format!("Activate connection `{}`", sid)
        }
    }

    async fn execute(&self, ctx: &ToolCtx, arguments: &str) -> ToolResult {
        if ctx.cancel.is_cancelled() {
            return ToolResult::err("任务已取消");
        }
        let args: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let query = args
            .get("server_id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if query.is_empty() {
            return ToolResult::err("server_id 不能为空");
        }
        let enable_subagent = args
            .get("enable_subagent")
            .and_then(|v| v.as_bool())
            .unwrap_or(true);
        let reason = args
            .get("reason")
            .and_then(|v| v.as_str())
            .unwrap_or("激活目标连接以便后续操作")
            .trim()
            .to_string();

        let cfg = if let Some(exact) = self.conns.store.get(query) {
            exact
        } else {
            let all = self.conns.store.list();
            let q_lower = query.to_ascii_lowercase();
            let matched = all.into_iter().find(|s| {
                s.name.eq_ignore_ascii_case(query)
                    || s.label().eq_ignore_ascii_case(query)
                    || s.host.eq_ignore_ascii_case(query)
                    || s.name.to_ascii_lowercase().contains(&q_lower)
            });
            match matched {
                Some(c) => c,
                None => return ToolResult::err(format!("未找到匹配的连接配置: {}", query)),
            }
        };

        let ct = cfg.normalized_type().to_string();
        let target_display = format_target_display(&cfg);
        let auth_summary = build_auth_summary(&cfg);
        let extra_note = if (ct == "ssh" || ct == "mysql") && enable_subagent {
            "激活后将自动开启子 Agent 调度授权".to_string()
        } else {
            String::new()
        };

        if let Err(deny_err) = authorize_conn_action(
            &self.runtime,
            "conn_activate",
            &ct,
            &cfg.label(),
            &target_display,
            &auth_summary,
            &reason,
            &extra_note,
            ctx,
        )
        .await
        {
            return ToolResult::err(deny_err);
        }

        let Some(ref app) = ctx.app else {
            return ToolResult::err("缺少应用上下文，无法激活连接");
        };

        match ct.as_str() {
            "ssh" => {
                // Check if already connected for this server_id
                let existing = self
                    .conns
                    .ssh
                    .list_sessions()
                    .await
                    .into_iter()
                    .find(|s| s.server_id == cfg.id && s.connected);

                let session_info = if let Some(s) = existing {
                    s
                } else {
                    match self.conns.ssh.connect(app.clone(), cfg.clone(), 120, 32).await {
                        Ok(info) => info,
                        Err(e) => return ToolResult::err(format!("SSH 连接失败: {}", e)),
                    }
                };

                let agent_id = format!("ssh:{}", session_info.id);
                if enable_subagent {
                    let _ = self
                        .runtime
                        .set_subagent_enabled(app, &self.conns.ssh, &self.conns.mysql, &agent_id, true)
                        .await;
                } else {
                    self.runtime
                        .emit_subagents_sync(app, &self.conns.ssh, &self.conns.mysql)
                        .await;
                }

                let _ = app.emit(
                    "conn:activated",
                    json!({
                        "kind": "ssh",
                        "session": session_info,
                    }),
                );

                ToolResult::success(json!({
                    "activated": true,
                    "kind": "ssh",
                    "serverId": cfg.id,
                    "sessionId": session_info.id,
                    "agentId": agent_id,
                    "agentEnabled": self.runtime.is_agent_enabled(&agent_id),
                    "target": target_display,
                }))
            }
            "mysql" => {
                if let Err(e) = self.conns.mysql.open(&cfg.id, cfg.clone()).await {
                    return ToolResult::err(format!("MySQL 连接失败: {}", e));
                }

                let session_info = json!({
                    "id": cfg.id,
                    "serverId": cfg.id,
                    "title": cfg.label(),
                    "host": cfg.host,
                    "port": cfg.display_port(),
                    "database": cfg.database,
                    "connected": true,
                });

                let agent_id = format!("mysql:{}", cfg.id);
                if enable_subagent {
                    let _ = self
                        .runtime
                        .set_subagent_enabled(app, &self.conns.ssh, &self.conns.mysql, &agent_id, true)
                        .await;
                } else {
                    self.runtime
                        .emit_subagents_sync(app, &self.conns.ssh, &self.conns.mysql)
                        .await;
                }

                let _ = app.emit(
                    "conn:activated",
                    json!({
                        "kind": "mysql",
                        "session": session_info,
                    }),
                );

                ToolResult::success(json!({
                    "activated": true,
                    "kind": "mysql",
                    "serverId": cfg.id,
                    "agentId": agent_id,
                    "agentEnabled": self.runtime.is_agent_enabled(&agent_id),
                    "target": target_display,
                }))
            }
            "redis" => {
                if let Err(e) = self.conns.redis.open(cfg.id.clone(), cfg.clone()).await {
                    return ToolResult::err(format!("Redis 连接失败: {}", e));
                }
                let session_info = json!({
                    "id": cfg.id,
                    "serverId": cfg.id,
                    "title": cfg.label(),
                    "host": cfg.host,
                    "port": cfg.display_port(),
                    "db": cfg.db,
                    "connected": true,
                });
                let _ = app.emit("conn:activated", json!({ "kind": "redis", "session": session_info }));
                ToolResult::success(json!({
                    "activated": true,
                    "kind": "redis",
                    "serverId": cfg.id,
                    "target": target_display,
                }))
            }
            "postgres" => {
                if let Err(e) = self.conns.postgres.connect_ex(cfg.clone()).await {
                    return ToolResult::err(format!("PostgreSQL 连接失败: {}", e));
                }
                let session_info = json!({
                    "id": cfg.id,
                    "serverId": cfg.id,
                    "title": cfg.label(),
                    "host": cfg.host,
                    "port": cfg.display_port(),
                    "database": cfg.postgres_database,
                    "connected": true,
                });
                let _ = app.emit("conn:activated", json!({ "kind": "postgres", "session": session_info }));
                ToolResult::success(json!({
                    "activated": true,
                    "kind": "postgres",
                    "serverId": cfg.id,
                    "target": target_display,
                }))
            }
            "mongo" => {
                if let Err(e) = self.conns.mongo.open(cfg.id.clone(), cfg.clone()).await {
                    return ToolResult::err(format!("MongoDB 连接失败: {}", e));
                }
                let session_info = json!({
                    "id": cfg.id,
                    "serverId": cfg.id,
                    "title": cfg.label(),
                    "host": cfg.host,
                    "port": cfg.display_port(),
                    "database": cfg.mongo_database,
                    "connected": true,
                });
                let _ = app.emit("conn:activated", json!({ "kind": "mongo", "session": session_info }));
                ToolResult::success(json!({
                    "activated": true,
                    "kind": "mongo",
                    "serverId": cfg.id,
                    "target": target_display,
                }))
            }
            "docker" => {
                let client = match self.conns.docker.connect(cfg.clone()).await {
                    Ok(c) => c,
                    Err(e) => return ToolResult::err(format!("Docker 连接失败: {}", e)),
                };
                let session_info = json!({
                    "id": cfg.id,
                    "serverId": cfg.id,
                    "title": cfg.label(),
                    "host": client.target_info,
                    "endpointType": client.endpoint_type,
                    "connected": true,
                });
                let _ = app.emit("conn:activated", json!({ "kind": "docker", "session": session_info }));
                ToolResult::success(json!({
                    "activated": true,
                    "kind": "docker",
                    "serverId": cfg.id,
                    "target": target_display,
                }))
            }
            "k8s" => {
                let client = match self.conns.k8s.connect(cfg.clone()).await {
                    Ok(c) => c,
                    Err(e) => return ToolResult::err(format!("Kubernetes 连接失败: {}", e)),
                };
                let session_info = json!({
                    "id": cfg.id,
                    "serverId": cfg.id,
                    "title": cfg.label(),
                    "context": cfg.k8s_context,
                    "namespace": client.default_namespace,
                    "connected": true,
                });
                let _ = app.emit("conn:activated", json!({ "kind": "k8s", "session": session_info }));
                ToolResult::success(json!({
                    "activated": true,
                    "kind": "k8s",
                    "serverId": cfg.id,
                    "target": target_display,
                }))
            }
            other => ToolResult::err(format!("{} 连接暂不支持通过 Agent 后台激活，请在左侧连接列表中打开", other)),
        }
    }
}
