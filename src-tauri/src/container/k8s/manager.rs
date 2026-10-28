use crate::container::k8s::types::K8sOverview;
use crate::container::k8s::utils::{extract_k8s_error, is_node_ready, resolve_k8s_auth, str_at};
use crate::core::ServerConfig;
use crate::tunnel::SshTunnel;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, RwLock};

#[derive(Clone)]
pub struct K8sClient {
    pub cfg: ServerConfig,
    pub http: reqwest::Client,
    pub base_url: String,
    pub target_info: String,
    pub bearer_token: String,
    pub insecure: bool,
    pub default_namespace: String,
    pub(crate) ssh_tunnel: Option<Arc<Mutex<SshTunnel>>>,
}

impl K8sClient {
    pub async fn connect(cfg: ServerConfig) -> Result<Self, String> {
        let auth = resolve_k8s_auth(&cfg)?;
        let target_info = auth.api_server.trim_end_matches('/').to_string();
        let mut base_url = target_info.clone();
        let mut ssh_tunnel_holder = None;
        let mut insecure = auth.insecure;

        if cfg.k8s_ssh_enabled && !cfg.k8s_ssh_host.trim().is_empty() {
            let parsed_url = url::Url::parse(&base_url)
                .map_err(|e| format!("解析 API Server URL 失败: {}", e))?;
            let remote_host = parsed_url
                .host_str()
                .ok_or_else(|| "API Server URL 缺少主机名".to_string())?
                .to_string();
            let remote_port = parsed_url.port_or_known_default().unwrap_or(6443);

            let ssh_port = if cfg.k8s_ssh_port > 0 {
                cfg.k8s_ssh_port as u16
            } else {
                22
            };
            let ssh_key = if !cfg.k8s_ssh_key_data.trim().is_empty() {
                cfg.k8s_ssh_key_data.clone()
            } else {
                cfg.k8s_ssh_key_path.clone()
            };

            let tunnel = SshTunnel::start_tcp_forward(
                &cfg.k8s_ssh_host,
                ssh_port,
                &cfg.k8s_ssh_user,
                &cfg.k8s_ssh_auth_type,
                &cfg.k8s_ssh_password,
                &ssh_key,
                &cfg.k8s_ssh_passphrase,
                &remote_host,
                remote_port,
            )
            .await?;

            base_url = format!("{}://{}", parsed_url.scheme(), tunnel.local_addr);
            insecure = true;
            ssh_tunnel_holder = Some(Arc::new(Mutex::new(tunnel)));
        }

        let mut builder = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .danger_accept_invalid_certs(insecure);

        if !insecure && !auth.ca_pem.is_empty() {
            if let Ok(cert) = reqwest::Certificate::from_pem(&auth.ca_pem) {
                builder = builder.add_root_certificate(cert);
            }
        }

        if !auth.cert_pem.is_empty() && !auth.key_pem.is_empty() {
            let mut combined = auth.cert_pem.clone();
            if !combined.ends_with(b"\n") {
                combined.push(b'\n');
            }
            combined.extend_from_slice(&auth.key_pem);
            if let Ok(identity) = reqwest::Identity::from_pem(&combined) {
                builder = builder.identity(identity);
            }
        }

        let mut default_headers = HeaderMap::new();
        default_headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        if !auth.bearer_token.is_empty() {
            if let Ok(hv) = HeaderValue::from_str(&format!("Bearer {}", auth.bearer_token)) {
                default_headers.insert(AUTHORIZATION, hv);
            }
        }
        builder = builder.default_headers(default_headers);

        let http = builder
            .build()
            .map_err(|e| format!("初始化 Kubernetes HTTP 客户端失败: {}", e))?;

        Ok(Self {
            cfg,
            http,
            base_url,
            target_info,
            bearer_token: auth.bearer_token,
            insecure,
            default_namespace: auth.namespace,
            ssh_tunnel: ssh_tunnel_holder,
        })
    }

    pub async fn close(&self) {
        if let Some(t) = &self.ssh_tunnel {
            let mut guard = t.lock().await;
            guard.close();
        }
    }

    pub(crate) async fn get_json(&self, path: &str) -> Result<Value, String> {
        let url = format!("{}{}", self.base_url, path);
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("请求 Kubernetes API ({}) 失败: {}", path, e))?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(extract_k8s_error(status.as_u16(), &text));
        }
        serde_json::from_str(&text).map_err(|e| format!("解析响应 JSON 失败: {}", e))
    }

    pub(crate) async fn delete_path(&self, path: &str) -> Result<(u16, String), String> {
        let url = format!("{}{}", self.base_url, path);
        let resp = self
            .http
            .delete(&url)
            .header(CONTENT_TYPE, "application/json")
            .body(r#"{"propagationPolicy":"Background"}"#)
            .send()
            .await
            .map_err(|e| format!("DELETE 请求失败 ({}): {}", path, e))?;
        let code = resp.status().as_u16();
        let text = resp.text().await.unwrap_or_default();
        Ok((code, text))
    }

    pub async fn ping(&self) -> Result<(), String> {
        let _ = self
            .get_json("/version")
            .await
            .map_err(|e| format!("无法连接 Kubernetes API Server ({}): {}", self.target_info, e))?;
        Ok(())
    }

    pub async fn get_overview(&self) -> Result<K8sOverview, String> {
        let ver = self.get_json("/version").await.unwrap_or_default();
        let git_version = str_at(&ver, &["gitVersion"]).unwrap_or_else(|| "Unknown".to_string());
        let platform = str_at(&ver, &["platform"]).unwrap_or_else(|| "Unknown".to_string());

        let nodes_v = self.get_json("/api/v1/nodes").await.unwrap_or_default();
        let mut nodes_total = 0usize;
        let mut nodes_ready = 0usize;
        if let Some(items) = nodes_v.get("items").and_then(|x| x.as_array()) {
            nodes_total = items.len();
            for n in items {
                if is_node_ready(n) {
                    nodes_ready += 1;
                }
            }
        }

        let ns_total = self
            .get_json("/api/v1/namespaces")
            .await
            .ok()
            .and_then(|v| v.get("items")?.as_array().map(|a| a.len()))
            .unwrap_or(0);

        let pods_v = self.get_json("/api/v1/pods").await.unwrap_or_default();
        let mut pods_total = 0usize;
        let mut pods_running = 0usize;
        if let Some(items) = pods_v.get("items").and_then(|x| x.as_array()) {
            pods_total = items.len();
            for p in items {
                if str_at(p, &["status", "phase"]).as_deref() == Some("Running") {
                    pods_running += 1;
                }
            }
        }

        let deployments_total = self
            .get_json("/apis/apps/v1/deployments")
            .await
            .ok()
            .and_then(|v| v.get("items")?.as_array().map(|a| a.len()))
            .unwrap_or(0);

        let services_total = self
            .get_json("/api/v1/services")
            .await
            .ok()
            .and_then(|v| v.get("items")?.as_array().map(|a| a.len()))
            .unwrap_or(0);

        Ok(K8sOverview {
            connected: true,
            api_server: self.target_info.clone(),
            git_version,
            platform,
            nodes_total,
            nodes_ready,
            namespaces_total: ns_total,
            pods_total,
            pods_running,
            deployments_total,
            services_total,
        })
    }
}

pub struct K8sManager {
    pub(crate) clients: RwLock<HashMap<String, K8sClient>>,
    pub(crate) configs: RwLock<HashMap<String, ServerConfig>>,
    pub(crate) exec_sessions: Arc<RwLock<HashMap<String, Arc<crate::container::k8s::exec::K8sExecSession>>>>,
}

impl Default for K8sManager {
    fn default() -> Self {
        Self::new()
    }
}

impl K8sManager {
    pub fn new() -> Self {
        Self {
            clients: RwLock::new(HashMap::new()),
            configs: RwLock::new(HashMap::new()),
            exec_sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn connect(&self, cfg: ServerConfig) -> Result<K8sClient, String> {
        let id = cfg.id.clone();
        self.configs.write().await.insert(id.clone(), cfg.clone());
        if let Some(existing) = self.clients.read().await.get(&id).cloned() {
            if existing.ping().await.is_ok() {
                return Ok(existing);
            }
        }
        let cli = K8sClient::connect(cfg).await?;
        cli.ping().await?;
        self.clients.write().await.insert(id, cli.clone());
        Ok(cli)
    }

    pub async fn get_client(&self, server_id: &str) -> Result<K8sClient, String> {
        self.clients
            .read()
            .await
            .get(server_id)
            .cloned()
            .ok_or_else(|| format!("Kubernetes 未连接或连接已断开: {}", server_id))
    }

    pub async fn disconnect(&self, server_id: &str) -> Result<(), String> {
        self.configs.write().await.remove(server_id);
        if let Some(cli) = self.clients.write().await.remove(server_id) {
            cli.close().await;
        }
        Ok(())
    }

    pub async fn list_connections(&self) -> Vec<Value> {
        let clients = self.clients.read().await;
        let configs = self.configs.read().await;
        let mut list = Vec::with_capacity(clients.len());
        for (id, cli) in clients.iter() {
            let cfg = configs.get(id).cloned().unwrap_or_default();
            list.push(json!({
                "id": id,
                "name": cfg.name,
                "auth_mode": cfg.k8s_auth_mode,
                "context": cfg.k8s_context,
                "target": cli.target_info,
                "namespace": cfg.k8s_namespace,
            }));
        }
        list
    }

    pub async fn resolve_id(&self, id_or_name: &str) -> Result<String, String> {
        let clients = self.clients.read().await;
        let configs = self.configs.read().await;
        let trimmed = id_or_name.trim();
        if !trimmed.is_empty() {
            if clients.contains_key(trimmed) {
                return Ok(trimmed.to_string());
            }
            for id in clients.keys() {
                if let Some(cfg) = configs.get(id) {
                    if cfg.name.eq_ignore_ascii_case(trimmed)
                        || cfg.k8s_context.eq_ignore_ascii_case(trimmed)
                        || id.eq_ignore_ascii_case(trimmed)
                    {
                        return Ok(id.clone());
                    }
                }
            }
        }
        if clients.len() == 1 {
            if let Some(id) = clients.keys().next() {
                return Ok(id.clone());
            }
        }
        if clients.is_empty() {
            return Err(
                "当前暂无已连接的 Kubernetes 集群，请先在界面中连接 Kubernetes 集群".to_string(),
            );
        }
        Err(format!(
            "存在多个活跃的 Kubernetes 连接，请指定明确的 server_id (当前活跃连接数: {})",
            clients.len()
        ))
    }

    pub async fn close_all(&self) {
        let sessions: Vec<Arc<crate::container::k8s::exec::K8sExecSession>> = {
            let mut guard = self.exec_sessions.write().await;
            guard.drain().map(|(_, s)| s).collect()
        };
        for s in sessions {
            s.close();
        }
        let clients: Vec<K8sClient> = {
            let mut guard = self.clients.write().await;
            guard.drain().map(|(_, c)| c).collect()
        };
        for c in clients {
            c.close().await;
        }
        self.configs.write().await.clear();
    }
}

