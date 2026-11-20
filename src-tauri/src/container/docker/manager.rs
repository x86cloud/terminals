use crate::container::docker::types::{DockerOverview, DockerPruneReport};
use crate::container::docker::utils::{format_bytes, i64_field, str_field, str_vec_field};
use crate::core::ServerConfig;
use crate::tunnel::SshTunnel;
use bollard::Docker;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, RwLock};

#[derive(Clone)]
pub struct DockerClient {
    pub cfg: ServerConfig,
    pub cli: Docker,
    pub target_info: String,
    pub endpoint_type: String,
    pub(crate) ssh_tunnel: Option<Arc<Mutex<SshTunnel>>>,
}

impl DockerClient {
    pub async fn connect(cfg: ServerConfig) -> Result<Self, String> {
        let mut ep_type = cfg.docker_endpoint_type.trim().to_lowercase();
        if ep_type.is_empty() {
            if !cfg.docker_socket_path.trim().is_empty() {
                ep_type = "unix".to_string();
            } else if !cfg.docker_ssh_host.trim().is_empty() {
                ep_type = "ssh".to_string();
            } else if !cfg.host.trim().is_empty() {
                ep_type = "tcp".to_string();
            } else {
                ep_type = "unix".to_string();
            }
        }

        let mut ssh_tunnel_holder = None;
        let target_info: String;

        let cli = match ep_type.as_str() {
            "unix" => {
                let mut socket_path = cfg.docker_socket_path.trim().to_string();
                if socket_path.is_empty() {
                    if cfg!(target_os = "windows") {
                        socket_path = "//./pipe/docker_engine".to_string();
                    } else {
                        socket_path = "/var/run/docker.sock".to_string();
                    }
                }
                target_info = socket_path.clone();

                let is_default_sock = socket_path == "/var/run/docker.sock"
                    || socket_path == "//./pipe/docker_engine"
                    || socket_path == "npipe:////./pipe/docker_engine"
                    || socket_path == "unix:///var/run/docker.sock";

                if is_default_sock {
                    Docker::connect_with_local_defaults()
                        .or_else(|_| {
                            Docker::connect_with_socket(
                                &socket_path,
                                120,
                                bollard::API_DEFAULT_VERSION,
                            )
                        })
                        .map_err(|e| format!("初始化本地 Docker 客户端失败: {}", e))?
                } else {
                    Docker::connect_with_socket(&socket_path, 120, bollard::API_DEFAULT_VERSION)
                        .or_else(|_| Docker::connect_with_local_defaults())
                        .map_err(|e| format!("连接 Docker Socket ({}) 失败: {}", socket_path, e))?
                }
            }
            "tcp" | "http" | "https" => {
                let host = if cfg.host.trim().is_empty() {
                    "127.0.0.1".to_string()
                } else {
                    cfg.host.trim().to_string()
                };
                let port = if cfg.port > 0 {
                    cfg.port
                } else if cfg.docker_tls_enabled {
                    2376
                } else {
                    2375
                };
                target_info = format!("{}:{}", host, port);
                let url = if host.starts_with("http://") || host.starts_with("https://") {
                    format!("{}:{}", host, port)
                } else {
                    format!("http://{}:{}", host, port)
                };
                Docker::connect_with_http(&url, 120, bollard::API_DEFAULT_VERSION)
                    .map_err(|e| format!("连接 Docker HTTP ({}) 失败: {}", url, e))?
            }
            "ssh" => {
                let ssh_host = if cfg.docker_ssh_host.trim().is_empty() {
                    cfg.host.trim().to_string()
                } else {
                    cfg.docker_ssh_host.trim().to_string()
                };
                let ssh_port = if cfg.docker_ssh_port > 0 {
                    cfg.docker_ssh_port as u16
                } else if cfg.port > 0 {
                    cfg.port as u16
                } else {
                    22
                };
                let ssh_user = if !cfg.docker_ssh_user.trim().is_empty() {
                    cfg.docker_ssh_user.trim().to_string()
                } else if !cfg.username.trim().is_empty() {
                    cfg.username.trim().to_string()
                } else {
                    "root".to_string()
                };
                let auth_type = if !cfg.docker_ssh_auth_type.trim().is_empty() {
                    cfg.docker_ssh_auth_type.trim().to_string()
                } else if !cfg.auth_type.trim().is_empty() {
                    cfg.auth_type.trim().to_string()
                } else {
                    "password".to_string()
                };
                let password = if !cfg.docker_ssh_password.is_empty() {
                    cfg.docker_ssh_password.clone()
                } else {
                    cfg.password.clone()
                };
                let key_str = if !cfg.docker_ssh_key_data.trim().is_empty() {
                    cfg.docker_ssh_key_data.clone()
                } else if !cfg.docker_ssh_key_path.trim().is_empty() {
                    cfg.docker_ssh_key_path.clone()
                } else {
                    cfg.private_key.clone()
                };
                let passphrase = if !cfg.docker_ssh_passphrase.is_empty() {
                    cfg.docker_ssh_passphrase.clone()
                } else {
                    cfg.passphrase.clone()
                };
                let remote_socket = if cfg.docker_socket_path.trim().is_empty() {
                    "/var/run/docker.sock".to_string()
                } else {
                    cfg.docker_socket_path.trim().to_string()
                };

                let tunnel = SshTunnel::start_docker_forward(
                    &ssh_host,
                    ssh_port,
                    &ssh_user,
                    &auth_type,
                    &password,
                    &key_str,
                    &passphrase,
                    &remote_socket,
                )
                .await?;

                let local_url = format!("http://{}", tunnel.local_addr);
                target_info = format!(
                    "ssh://{}@{}:{} -> {}",
                    ssh_user, ssh_host, ssh_port, remote_socket
                );
                ssh_tunnel_holder = Some(Arc::new(Mutex::new(tunnel)));

                Docker::connect_with_http(&local_url, 120, bollard::API_DEFAULT_VERSION)
                    .map_err(|e| format!("初始化 SSH 隧道 Docker 客户端失败: {}", e))?
            }
            other => {
                return Err(format!("不支持的 Docker 端点类型: {}", other));
            }
        };

        let client = Self {
            cfg,
            cli,
            target_info,
            endpoint_type: ep_type,
            ssh_tunnel: ssh_tunnel_holder,
        };

        tokio::time::timeout(Duration::from_secs(10), client.cli.ping())
            .await
            .map_err(|_| "Docker Ping 超时".to_string())?
            .map_err(|e| format!("Docker Ping 失败: {}", e))?;

        Ok(client)
    }

    pub async fn close(&self) {
        if let Some(t) = &self.ssh_tunnel {
            let mut guard = t.lock().await;
            guard.close();
        }
    }

    pub async fn ping(&self) -> Result<String, String> {
        self.cli
            .ping()
            .await
            .map_err(|e| format!("Docker Ping 失败: {}", e))?;
        if let Ok(ver) = self.cli.version().await {
            let v = serde_json::to_value(&ver).unwrap_or_default();
            if let Some(api_v) = v
                .get("ApiVersion")
                .or_else(|| v.get("apiVersion"))
                .and_then(|x| x.as_str())
            {
                if !api_v.is_empty() {
                    return Ok(api_v.to_string());
                }
            }
        }
        Ok("1.45".to_string())
    }

    pub async fn get_overview(&self) -> Result<DockerOverview, String> {
        let info = self
            .cli
            .info()
            .await
            .map_err(|e| format!("获取 Docker 守护进程信息失败: {}", e))?;
        let ver = self
            .cli
            .version()
            .await
            .map_err(|e| format!("获取 Docker 版本失败: {}", e))?;

        let info_v = serde_json::to_value(&info).unwrap_or_default();
        let ver_v = serde_json::to_value(&ver).unwrap_or_default();

        let volumes_total = self
            .list_volumes()
            .await
            .map(|v| v.len())
            .unwrap_or(0);
        let networks_total = self
            .list_networks()
            .await
            .map(|n| n.len())
            .unwrap_or(0);
        let compose_total = self
            .list_compose_stacks()
            .await
            .map(|s| s.len())
            .unwrap_or(0);

        Ok(DockerOverview {
            connected: true,
            server_version: str_field(&ver_v, &["Version", "version"]),
            api_version: str_field(&ver_v, &["ApiVersion", "apiVersion"]),
            os: str_field(&ver_v, &["Os", "os"]),
            arch: str_field(&ver_v, &["Arch", "arch"]),
            kernel_version: str_field(&ver_v, &["KernelVersion", "kernelVersion"]),
            operating_system: str_field(&info_v, &["OperatingSystem", "operatingSystem"]),
            ncpu: i64_field(&info_v, &["NCPU", "ncpu"]),
            mem_total: i64_field(&info_v, &["MemTotal", "memTotal"]),
            containers_total: i64_field(&info_v, &["Containers", "containers"]),
            containers_running: i64_field(&info_v, &["ContainersRunning", "containersRunning"]),
            containers_paused: i64_field(&info_v, &["ContainersPaused", "containersPaused"]),
            containers_stopped: i64_field(&info_v, &["ContainersStopped", "containersStopped"]),
            images_total: i64_field(&info_v, &["Images", "images"]),
            compose_total,
            volumes_total,
            networks_total,
            docker_root_dir: str_field(&info_v, &["DockerRootDir", "dockerRootDir"]),
            storage_driver: str_field(&info_v, &["Driver", "driver"]),
            endpoint_type: self.endpoint_type.clone(),
            endpoint_target: self.target_info.clone(),
        })
    }

    pub async fn system_prune(
        &self,
        prune_containers: bool,
        prune_images: bool,
        prune_volumes: bool,
        prune_networks: bool,
    ) -> Result<DockerPruneReport, String> {
        let mut report = DockerPruneReport::default();

        if prune_containers {
            if let Ok(c_rep) = self
                .cli
                .prune_containers(None::<bollard::container::PruneContainersOptions<String>>)
                .await
            {
                let v = serde_json::to_value(&c_rep).unwrap_or_default();
                report.containers_deleted = str_vec_field(&v, &["ContainersDeleted", "containersDeleted"]);
                report.space_reclaimed += i64_field(&v, &["SpaceReclaimed", "spaceReclaimed"]).max(0) as u64;
            }
        }

        if prune_images {
            if let Ok(i_rep) = self
                .cli
                .prune_images(None::<bollard::image::PruneImagesOptions<String>>)
                .await
            {
                let v = serde_json::to_value(&i_rep).unwrap_or_default();
                if let Some(arr) = v
                    .get("ImagesDeleted")
                    .or_else(|| v.get("imagesDeleted"))
                    .and_then(|x| x.as_array())
                {
                    for item in arr {
                        let deleted = str_field(item, &["Deleted", "deleted"]);
                        let untagged = str_field(item, &["Untagged", "untagged"]);
                        if !deleted.is_empty() {
                            report.images_deleted.push(deleted);
                        } else if !untagged.is_empty() {
                            report.images_deleted.push(untagged);
                        }
                    }
                }
                report.space_reclaimed += i64_field(&v, &["SpaceReclaimed", "spaceReclaimed"]).max(0) as u64;
            }
        }

        if prune_volumes {
            if let Ok(v_rep) = self
                .cli
                .prune_volumes(None::<bollard::volume::PruneVolumesOptions<String>>)
                .await
            {
                let v = serde_json::to_value(&v_rep).unwrap_or_default();
                report.volumes_deleted = str_vec_field(&v, &["VolumesDeleted", "volumesDeleted"]);
                report.space_reclaimed += i64_field(&v, &["SpaceReclaimed", "spaceReclaimed"]).max(0) as u64;
            }
        }

        if prune_networks {
            if let Ok(n_rep) = self
                .cli
                .prune_networks(None::<bollard::network::PruneNetworksOptions<String>>)
                .await
            {
                let v = serde_json::to_value(&n_rep).unwrap_or_default();
                report.networks_deleted = str_vec_field(&v, &["NetworksDeleted", "networksDeleted"]);
            }
        }

        report.space_reclaimed_str = format_bytes(report.space_reclaimed as i64);
        Ok(report)
    }
}

pub struct DockerManager {
    pub(crate) clients: RwLock<HashMap<String, DockerClient>>,
    pub(crate) configs: RwLock<HashMap<String, ServerConfig>>,
    pub(crate) exec_sessions: Arc<RwLock<HashMap<String, Arc<crate::container::docker::exec::DockerExecSession>>>>,
    pub(crate) log_streams: Arc<RwLock<HashMap<String, (String, tokio::task::AbortHandle)>>>,
}

impl Default for DockerManager {
    fn default() -> Self {
        Self::new()
    }
}

impl DockerManager {
    pub fn new() -> Self {
        Self {
            clients: RwLock::new(HashMap::new()),
            configs: RwLock::new(HashMap::new()),
            exec_sessions: Arc::new(RwLock::new(HashMap::new())),
            log_streams: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn connect(&self, cfg: ServerConfig) -> Result<DockerClient, String> {
        let id = cfg.id.clone();
        self.configs.write().await.insert(id.clone(), cfg.clone());
        if let Some(existing) = self.clients.read().await.get(&id).cloned() {
            if existing.ping().await.is_ok() {
                return Ok(existing);
            }
        }
        let client = DockerClient::connect(cfg).await?;
        self.clients.write().await.insert(id, client.clone());
        Ok(client)
    }

    pub async fn get_client(&self, server_id: &str) -> Result<DockerClient, String> {
        self.clients
            .read()
            .await
            .get(server_id)
            .cloned()
            .ok_or_else(|| format!("Docker 未连接或连接已断开: {}", server_id))
    }

    pub async fn disconnect(&self, server_id: &str) -> Result<(), String> {
        self.configs.write().await.remove(server_id);
        {
            let mut guard = self.log_streams.write().await;
            let keys: Vec<String> = guard
                .iter()
                .filter(|(_, (sid, _))| sid == server_id)
                .map(|(k, _)| k.clone())
                .collect();
            for k in keys {
                if let Some((_, handle)) = guard.remove(&k) {
                    handle.abort();
                }
            }
        }
        let matching_execs: Vec<Arc<crate::container::docker::exec::DockerExecSession>> = {
            let mut guard = self.exec_sessions.write().await;
            let keys: Vec<String> = guard
                .iter()
                .filter(|(_, s)| s.server_id == server_id)
                .map(|(k, _)| k.clone())
                .collect();
            keys.into_iter().filter_map(|k| guard.remove(&k)).collect()
        };
        for s in matching_execs {
            s.close().await;
        }
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
                "endpoint_type": cfg.docker_endpoint_type,
                "target": cli.target_info,
                "host": cfg.host,
                "port": cfg.port,
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
                        || cfg.host.eq_ignore_ascii_case(trimmed)
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
            return Err("当前暂无已连接的 Docker 实例，请先在界面中连接 Docker 实例".to_string());
        }
        Err(format!(
            "存在多个活跃的 Docker 连接，请指定明确的 server_id (当前活跃连接数: {})",
            clients.len()
        ))
    }

    pub async fn close_all(&self) {
        {
            let mut guard = self.log_streams.write().await;
            for (_, (_, handle)) in guard.drain() {
                handle.abort();
            }
        }
        let sessions: Vec<Arc<crate::container::docker::exec::DockerExecSession>> = {
            let mut guard = self.exec_sessions.write().await;
            guard.drain().map(|(_, s)| s).collect()
        };
        for s in sessions {
            s.close().await;
        }
        let clients: Vec<DockerClient> = {
            let mut guard = self.clients.write().await;
            guard.drain().map(|(_, c)| c).collect()
        };
        for c in clients {
            c.close().await;
        }
        self.configs.write().await.clear();
    }
}

