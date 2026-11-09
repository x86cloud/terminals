use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ServerGroup {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub group_id: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub auth_type: String,
    pub password: String,
    pub private_key: String,
    pub passphrase: String,
    pub remark: String,
    #[serde(rename = "type")]
    pub conn_type: String,
    #[serde(default)]
    pub db: i32,

    // Redis
    pub redis_mode: String,
    pub redis_sentinels: String,
    pub redis_master_name: String,
    pub redis_cluster_nodes: String,
    pub redis_username: String,
    pub redis_serialization: String,
    pub redis_pool_size: i32,
    pub redis_min_idle_conns: i32,
    pub redis_max_idle_conns: i32,
    pub redis_pool_timeout: i32,
    pub redis_conn_max_idle_time: i32,
    pub redis_conn_max_lifetime: i32,
    pub redis_dial_timeout: i32,
    pub redis_read_timeout: i32,
    pub redis_write_timeout: i32,
    pub redis_max_retries: i32,
    pub redis_min_retry_backoff: i32,
    pub redis_max_retry_backoff: i32,
    pub redis_breaker_threshold: i32,
    pub redis_breaker_cooldown: i32,

    // MySQL
    pub database: String,
    pub mysql_max_open_conns: i32,
    pub mysql_max_idle_conns: i32,
    pub mysql_conn_max_lifetime: i32,
    #[serde(rename = "mysqlTLS")]
    pub mysql_tls: String,
    #[serde(rename = "mysqlSSLEnabled")]
    pub mysql_ssl_enabled: bool,
    #[serde(rename = "mysqlSSHEnabled")]
    pub mysql_ssh_enabled: bool,
    #[serde(rename = "mysqlSSHHost")]
    pub mysql_ssh_host: String,
    #[serde(rename = "mysqlSSHHostPort")]
    pub mysql_ssh_host_port: i32,
    #[serde(rename = "mysqlSSHUser")]
    pub mysql_ssh_user: String,
    #[serde(rename = "mysqlSSHKeyPath")]
    pub mysql_ssh_key_path: String,
    #[serde(rename = "mysqlSSHKeyData")]
    pub mysql_ssh_key_data: String,
    #[serde(rename = "mysqlSSHPassphrase")]
    pub mysql_ssh_passphrase: String,
    #[serde(rename = "mysqlSSHProxyLocalPort")]
    pub mysql_ssh_proxy_local_port: i32,

    // PostgreSQL
    pub postgres_database: String,
    pub postgres_schema: String,
    #[serde(rename = "postgresSSLMode")]
    pub postgres_ssl_mode: String,
    pub postgres_max_open_conns: i32,
    pub postgres_min_idle_conns: i32,
    pub postgres_conn_max_lifetime: i32,
    pub postgres_conn_max_idle_time: i32,
    pub postgres_connect_timeout: i32,
    #[serde(rename = "postgresSSHEnabled")]
    pub postgres_ssh_enabled: bool,
    #[serde(rename = "postgresSSHHost")]
    pub postgres_ssh_host: String,
    #[serde(rename = "postgresSSHHostPort")]
    pub postgres_ssh_host_port: i32,
    #[serde(rename = "postgresSSHUser")]
    pub postgres_ssh_user: String,
    #[serde(rename = "postgresSSHAuthType")]
    pub postgres_ssh_auth_type: String,
    #[serde(rename = "postgresSSHPassword")]
    pub postgres_ssh_password: String,
    #[serde(rename = "postgresSSHKeyPath")]
    pub postgres_ssh_key_path: String,
    #[serde(rename = "postgresSSHKeyData")]
    pub postgres_ssh_key_data: String,
    #[serde(rename = "postgresSSHPassphrase")]
    pub postgres_ssh_passphrase: String,

    // MongoDB
    pub mongo_uri: String,
    pub mongo_srv: bool,
    pub mongo_hosts: String,
    pub mongo_database: String,
    pub mongo_auth_mech: String,
    pub mongo_auth_source: String,
    pub mongo_replica_set: String,
    pub mongo_read_preference: String,
    pub mongo_tls_enabled: bool,
    pub mongo_tls_insecure: bool,
    pub mongo_tls_ca_cert: String,
    pub mongo_tls_client_cert: String,
    pub mongo_tls_client_key: String,
    pub mongo_max_pool_size: i32,
    pub mongo_min_pool_size: i32,
    pub mongo_max_conn_idle_time: i32,
    pub mongo_connect_timeout: i32,
    pub mongo_server_select_timeout: i32,
    pub mongo_socket_timeout: i32,
    pub mongo_compressors: String,
    pub mongo_app_name: String,

    // MQTT & SQLite
    pub client_id: String,
    #[serde(rename = "useTLS")]
    pub use_tls: bool,
    pub sqlite_path: String,

    // Docker
    pub docker_endpoint_type: String,
    pub docker_socket_path: String,
    pub docker_tls_enabled: bool,
    pub docker_tls_insecure: bool,
    pub docker_tls_ca_cert: String,
    pub docker_tls_client_cert: String,
    pub docker_tls_client_key: String,
    pub docker_ssh_host: String,
    pub docker_ssh_port: i32,
    pub docker_ssh_user: String,
    pub docker_ssh_auth_type: String,
    pub docker_ssh_password: String,
    pub docker_ssh_key_path: String,
    pub docker_ssh_key_data: String,
    pub docker_ssh_passphrase: String,

    // K8s
    pub k8s_auth_mode: String,
    pub k8s_kubeconfig_data: String,
    pub k8s_kubeconfig_path: String,
    pub k8s_context: String,
    pub k8s_api_server: String,
    pub k8s_auth_type: String,
    pub k8s_bearer_token: String,
    pub k8s_ca_data: String,
    pub k8s_cert_data: String,
    pub k8s_key_data: String,
    #[serde(rename = "k8sInsecureSkipTLS")]
    pub k8s_insecure_skip_tls: bool,
    pub k8s_namespace: String,
    pub k8s_ssh_enabled: bool,
    pub k8s_ssh_host: String,
    pub k8s_ssh_port: i32,
    pub k8s_ssh_user: String,
    pub k8s_ssh_auth_type: String,
    pub k8s_ssh_password: String,
    pub k8s_ssh_key_path: String,
    pub k8s_ssh_key_data: String,
    pub k8s_ssh_passphrase: String,

    // MQTT Extended
    pub mqtt_proto: String,
    pub mqtt_keep_alive: i32,
    pub mqtt_connect_timeout: i32,
    pub mqtt_clean_session: bool,
    pub mqtt_auto_reconnect: bool,
    pub mqtt_reconnect_intvl: i32,
    pub mqtt_insecure: bool,
    pub mqtt_ca_cert: String,
    pub mqtt_client_cert: String,
    pub mqtt_client_key: String,
    pub mqtt_will_topic: String,
    pub mqtt_will_payload: String,
    pub mqtt_will_qos: i32,
    pub mqtt_will_retained: bool,

    pub updated_at: i64,
}

impl ServerConfig {
    pub fn normalized_type(&self) -> &str {
        match self.conn_type.as_str() {
            "redis" | "mysql" | "postgres" | "mqtt" | "mongo" | "sqlite" | "docker" | "k8s" => {
                self.conn_type.as_str()
            }
            _ => "ssh",
        }
    }

    pub fn display_port(&self) -> i32 {
        if self.port > 0 {
            return self.port;
        }
        match self.normalized_type() {
            "redis" => 6379,
            "mysql" => 3306,
            "postgres" => 5432,
            "mqtt" => 1883,
            "mongo" => 27017,
            "sqlite" => 0,
            "docker" => {
                if self.docker_endpoint_type == "tcp" {
                    if self.docker_tls_enabled {
                        2376
                    } else {
                        2375
                    }
                } else if self.docker_endpoint_type == "ssh" {
                    22
                } else {
                    0
                }
            }
            _ => 22,
        }
    }

    pub fn label(&self) -> String {
        if !self.name.trim().is_empty() {
            return self.name.clone();
        }
        match self.normalized_type() {
            "redis" | "mysql" | "postgres" | "mqtt" | "mongo" => {
                format!("{}:{}", self.host, self.display_port())
            }
            "sqlite" => {
                if !self.sqlite_path.is_empty() {
                    std::path::Path::new(&self.sqlite_path)
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or(&self.sqlite_path)
                        .to_string()
                } else {
                    "SQLite".to_string()
                }
            }
            "docker" => {
                if self.docker_endpoint_type == "unix"
                    || (self.docker_endpoint_type.is_empty()
                        && !self.docker_socket_path.is_empty())
                {
                    format!("Docker ({})", self.docker_socket_path)
                } else if self.docker_endpoint_type == "ssh" {
                    format!("Docker ({}@{})", self.docker_ssh_user, self.docker_ssh_host)
                } else {
                    format!("Docker ({}:{})", self.host, self.display_port())
                }
            }
            "k8s" => {
                if !self.k8s_kubeconfig_path.is_empty() {
                    let base = std::path::Path::new(&self.k8s_kubeconfig_path)
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or(&self.k8s_kubeconfig_path);
                    format!("K8s ({})", base)
                } else if !self.k8s_context.is_empty() {
                    format!("K8s ({})", self.k8s_context)
                } else if !self.k8s_api_server.is_empty() {
                    format!("K8s ({})", self.k8s_api_server)
                } else {
                    format!("K8s ({})", self.host)
                }
            }
            _ => format!("{}@{}", self.username, self.host),
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        let ct = self.normalized_type();
        if ct == "mongo" {
            if self.host.trim().is_empty()
                && self.mongo_uri.trim().is_empty()
                && self.mongo_hosts.trim().is_empty()
            {
                return Err("请填写主机地址、种子节点或完整连接字符串".to_string());
            }
            if self.mongo_auth_mech == "MONGODB-X509"
                && self.mongo_tls_client_cert.trim().is_empty()
            {
                return Err("X.509 认证需要提供客户端证书".to_string());
            }
            return Ok(());
        }
        if ct == "sqlite" {
            if self.sqlite_path.trim().is_empty() {
                return Err("请选择 SQLite 数据库文件（.db / .sqlite）".to_string());
            }
            return Ok(());
        }
        if ct == "docker" {
            let ep = if self.docker_endpoint_type.trim().is_empty() {
                "unix".to_string()
            } else {
                self.docker_endpoint_type.trim().to_lowercase()
            };
            match ep.as_str() {
                "unix" => return Ok(()),
                "tcp" | "http" | "https" => {
                    if self.host.trim().is_empty() {
                        return Err("Docker TCP 主机地址不能为空".to_string());
                    }
                    return Ok(());
                }
                "ssh" => {
                    let h = if self.docker_ssh_host.trim().is_empty() {
                        self.host.trim()
                    } else {
                        self.docker_ssh_host.trim()
                    };
                    if h.is_empty() {
                        return Err("SSH 主机地址不能为空".to_string());
                    }
                    let u = if self.docker_ssh_user.trim().is_empty() {
                        self.username.trim()
                    } else {
                        self.docker_ssh_user.trim()
                    };
                    if u.is_empty() {
                        return Err("SSH 登录用户名不能为空".to_string());
                    }
                    return Ok(());
                }
                _ => return Ok(()),
            }
        }
        if ct == "k8s" {
            let auth_mode = if self.k8s_auth_mode.is_empty() {
                "kubeconfig"
            } else {
                self.k8s_auth_mode.as_str()
            };
            if auth_mode == "kubeconfig" {
                if self.k8s_kubeconfig_data.trim().is_empty()
                    && self.k8s_kubeconfig_path.trim().is_empty()
                    && self.k8s_api_server.trim().is_empty()
                    && self.host.trim().is_empty()
                {
                    return Err("请提供 Kubeconfig 配置内容或文件路径".to_string());
                }
                return Ok(());
            }
            if self.k8s_api_server.trim().is_empty() && self.host.trim().is_empty() {
                return Err(
                    "Kubernetes API Server 地址不能为空 (例如 https://192.168.1.100:6443)"
                        .to_string(),
                );
            }
            return Ok(());
        }
        if self.host.trim().is_empty() {
            return Err("主机地址不能为空".to_string());
        }
        match ct {
            "redis" | "mqtt" => return Ok(()),
            "mysql" | "postgres" => {
                if self.username.trim().is_empty() {
                    return Err("用户名不能为空".to_string());
                }
                return Ok(());
            }
            _ => {}
        }
        if self.username.trim().is_empty() {
            return Err("用户名不能为空".to_string());
        }
        if self.auth_type == "key" && self.private_key.trim().is_empty() {
            return Err("请选择私钥文件或填写私钥内容".to_string());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AiModelItem {
    pub id: String,
    pub name: String,
    pub model: String,
    pub base_url: String,
    pub api_key: String,
    pub context_tokens: i32,
    pub temperature: f64,
    pub enable_multimodal: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub theme_mode: String,
    pub font_family: String,
    pub font_size: String,
    pub auto_connect: bool,
    pub db_default_limit: String,
    pub global_font_family: String,
    pub ai_enabled: bool,
    pub ai_base_url: String,
    pub ai_api_key: String,
    pub ai_model: String,
    pub ai_models: Vec<AiModelItem>,
    pub active_model_id: String,
    pub ai_temperature: f64,
    pub ai_model_context_tokens: i32,
    pub ai_context_compress_ratio: i32,
    pub ai_max_context_tokens: i32,
    pub ai_compression_strategy: String,
    pub ai_enable_multimodal: bool,
    pub ai_system_prompt: String,
    pub ai_workspace_dir: String,
    pub ai_enable_web_search: bool,
    pub ai_enable_permission_guard: bool,
    pub ai_block_high_risk_commands: bool,
    pub ai_enable_thinking: bool,
    pub ai_reasoning_effort: String,
    pub ai_enable_verifier: bool,
    pub ai_max_parallel: i32,
    pub mcp_server_enabled: bool,
    pub mcp_server_port: i32,
    pub mcp_server_host: String,
    pub close_action: String,
    pub language: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        let default_model = AiModelItem {
            id: "model_deepseek".to_string(),
            name: "DeepSeek Flash".to_string(),
            model: "deepseek-v4-flash".to_string(),
            base_url: "https://api.deepseek.com".to_string(),
            api_key: String::new(),
            context_tokens: 65536,
            temperature: 0.7,
            enable_multimodal: false,
        };
        Self {
            language: "system".to_string(),
            theme_mode: "light".to_string(),
            font_family: "Consolas".to_string(),
            font_size: "13".to_string(),
            auto_connect: false,
            db_default_limit: "50".to_string(),
            global_font_family: "system".to_string(),
            ai_enabled: false,
            ai_base_url: default_model.base_url.clone(),
            ai_api_key: String::new(),
            ai_model: default_model.model.clone(),
            ai_models: vec![default_model],
            active_model_id: "model_deepseek".to_string(),
            ai_temperature: 0.7,
            ai_model_context_tokens: 65536,
            ai_context_compress_ratio: 80,
            ai_max_context_tokens: 52428,
            ai_compression_strategy: "summary".to_string(),
            ai_enable_multimodal: false,
            ai_system_prompt: "你是一个有用的 AI 助手，能够回答用户的各种技术与日常问题，并给出精准优雅的解答。".to_string(),
            ai_workspace_dir: String::new(),
            ai_enable_web_search: false,
            ai_enable_permission_guard: true,
            ai_block_high_risk_commands: true,
            ai_enable_thinking: false,
            ai_reasoning_effort: "medium".to_string(),
            ai_enable_verifier: false,
            ai_max_parallel: 4,
            mcp_server_enabled: false,
            mcp_server_port: 4096,
            mcp_server_host: "127.0.0.1".to_string(),
            close_action: "ask".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DockerComposeRecord {
    pub id: String,
    pub server_id: String,
    pub project_name: String,
    pub yaml_content: String,
    pub env_vars: HashMap<String, String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct K8sResourceItemSummary {
    pub kind: String,
    pub name: String,
    pub namespace: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct K8sOrchestrationRecord {
    pub id: String,
    pub server_id: String,
    pub name: String,
    pub namespace: String,
    pub yaml_content: String,
    pub status: String,
    pub resources: Vec<K8sResourceItemSummary>,
    pub resources_summary: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppVersionInfo {
    pub version: String,
    pub git_commit: String,
    pub build_date: String,
    pub go_version: String,
    pub platform: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_url: String,
    pub repo_url: String,
    pub checked_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ConfigIOResult {
    pub success: bool,
    pub cancelled: bool,
    pub file_path: String,
    pub servers_count: usize,
    pub groups_count: usize,
    pub message: String,
}
