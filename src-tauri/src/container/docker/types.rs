use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

pub const COMPOSE_PROJECT_LABEL: &str = "com.docker.compose.project";
pub const COMPOSE_SERVICE_LABEL: &str = "com.docker.compose.service";
pub const COMPOSE_VERSION_LABEL: &str = "com.docker.compose.version";
pub const COMPOSE_CONFIG_HASH: &str = "com.docker.compose.config-hash";
pub const COMPOSE_ONEOFF_LABEL: &str = "com.docker.compose.oneoff";
pub const COMPOSE_NUMBER_LABEL: &str = "com.docker.compose.container-number";
pub const COMPOSE_IMAGE_LABEL: &str = "com.docker.compose.image";
pub const COMPOSE_NETWORK_LABEL: &str = "com.docker.compose.network";
pub const COMPOSE_VOLUME_LABEL: &str = "com.docker.compose.volume";
pub const COMPOSE_WORKING_DIR: &str = "com.docker.compose.project.working_dir";
pub const COMPOSE_CONFIG_FILES: &str = "com.docker.compose.project.config_files";
pub const TERMINAL_COMPOSE_ID_LABEL: &str = "terminal.compose.id";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DockerOverview {
    pub connected: bool,
    pub server_version: String,
    pub api_version: String,
    pub os: String,
    pub arch: String,
    pub kernel_version: String,
    pub operating_system: String,
    pub ncpu: i64,
    pub mem_total: i64,
    pub containers_total: i64,
    pub containers_running: i64,
    pub containers_paused: i64,
    pub containers_stopped: i64,
    pub images_total: i64,
    pub compose_total: usize,
    pub volumes_total: usize,
    pub networks_total: usize,
    pub docker_root_dir: String,
    pub storage_driver: String,
    pub endpoint_type: String,
    pub endpoint_target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DockerPortMapping {
    #[serde(skip_serializing_if = "String::is_empty")]
    pub ip: String,
    pub private_port: u16,
    #[serde(skip_serializing_if = "is_zero_u16")]
    pub public_port: u16,
    #[serde(rename = "type")]
    pub port_type: String,
}

pub fn is_zero_u16(v: &u16) -> bool {
    *v == 0
}

pub fn is_zero_i64(v: &i64) -> bool {
    *v == 0
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DockerContainerInfo {
    pub id: String,
    pub short_id: String,
    pub names: Vec<String>,
    pub name: String,
    pub image: String,
    pub image_id: String,
    pub command: String,
    pub created: i64,
    pub state: String,
    pub status: String,
    pub ports: Vec<DockerPortMapping>,
    pub port_str: String,
    pub ip_address: String,
    #[serde(skip_serializing_if = "is_zero_i64")]
    pub size_rw: i64,
    #[serde(skip_serializing_if = "is_zero_i64")]
    pub size_root_fs: i64,
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub labels: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DockerImageInfo {
    pub id: String,
    pub short_id: String,
    pub repo_tags: Vec<String>,
    pub repository: String,
    pub tag: String,
    pub size: i64,
    pub size_str: String,
    pub created: i64,
    pub containers: i64,
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub labels: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DockerVolumeInfo {
    pub name: String,
    pub driver: String,
    pub scope: String,
    pub mountpoint: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub labels: HashMap<String, String>,
    #[serde(skip_serializing_if = "is_zero_i64")]
    pub size: i64,
    #[serde(skip_serializing_if = "is_zero_i64")]
    pub ref_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DockerNetworkInfo {
    pub id: String,
    pub short_id: String,
    pub name: String,
    pub driver: String,
    pub scope: String,
    pub internal: bool,
    #[serde(rename = "enableIPv6")]
    pub enable_ipv6: bool,
    pub subnet: String,
    pub gateway: String,
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub containers: HashMap<String, String>,
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub labels: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DockerCreateContainerReq {
    pub name: String,
    pub image: String,
    pub cmd: Vec<String>,
    pub env: Vec<String>,
    pub ports: Vec<String>,
    pub volumes: Vec<String>,
    pub restart_policy: String,
    pub auto_remove: bool,
    pub network_mode: String,
    pub memory_limit: i64,
    #[serde(rename = "cpuShares", alias = "cpu_shares")]
    pub cpu_shares: i64,
    pub labels: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DockerPruneReport {
    pub containers_deleted: Vec<String>,
    pub images_deleted: Vec<String>,
    pub volumes_deleted: Vec<String>,
    pub networks_deleted: Vec<String>,
    pub space_reclaimed: u64,
    pub space_reclaimed_str: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DockerComposeServiceInfo {
    pub service_name: String,
    pub container_id: String,
    pub short_id: String,
    pub container_name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub ports: String,
    pub health: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DockerComposeStackInfo {
    #[serde(skip_serializing_if = "String::is_empty")]
    pub uuid: String,
    pub name: String,
    pub status: String,
    pub running_services: usize,
    pub total_services: usize,
    pub services: Vec<DockerComposeServiceInfo>,
    pub config_files: String,
    pub yaml_content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DockerComposeDeployReq {
    pub id: String,
    pub project_name: String,
    pub yaml_content: String,
    pub env_vars: HashMap<String, String>,
    pub force_pull: bool,
    pub recreate: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub(crate) struct ComposeFileSpec {
    pub(crate) version: String,
    pub(crate) services: HashMap<String, ComposeServiceSpec>,
    pub(crate) networks: HashMap<String, ComposeNetworkSpec>,
    pub(crate) volumes: HashMap<String, ComposeVolumeSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub(crate) struct ComposeServiceSpec {
    pub(crate) image: String,
    pub(crate) container_name: String,
    pub(crate) command: Option<Value>,
    pub(crate) entrypoint: Option<Value>,
    pub(crate) environment: Option<Value>,
    pub(crate) ports: Option<Value>,
    pub(crate) expose: Vec<String>,
    pub(crate) volumes: Option<Value>,
    pub(crate) networks: Option<Value>,
    pub(crate) restart: String,
    pub(crate) depends_on: Option<Value>,
    pub(crate) labels: HashMap<String, String>,
    pub(crate) working_dir: String,
    pub(crate) user: String,
    pub(crate) privileged: bool,
    pub(crate) hostname: String,
    pub(crate) network_mode: String,
    pub(crate) dns: Option<Value>,
    pub(crate) extra_hosts: Vec<String>,
    pub(crate) healthcheck: Option<ComposeHealthCheckSpec>,
    pub(crate) shm_size: Option<Value>,
    pub(crate) cap_add: Vec<String>,
    pub(crate) cap_drop: Vec<String>,
    pub(crate) sysctls: Option<Value>,
    pub(crate) logging: Option<ComposeLoggingSpec>,
    pub(crate) stop_signal: String,
    pub(crate) stop_grace_period: Option<Value>,
    pub(crate) tty: bool,
    pub(crate) stdin_open: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub(crate) struct ComposeHealthCheckSpec {
    pub(crate) test: Option<Value>,
    pub(crate) interval: String,
    pub(crate) timeout: String,
    pub(crate) retries: i64,
    pub(crate) start_period: String,
    pub(crate) disable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub(crate) struct ComposeLoggingSpec {
    pub(crate) driver: String,
    pub(crate) options: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub(crate) struct ComposeNetworkSpec {
    pub(crate) driver: String,
    pub(crate) external: bool,
    pub(crate) name: String,
    pub(crate) labels: HashMap<String, String>,
    pub(crate) attachable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub(crate) struct ComposeVolumeSpec {
    pub(crate) driver: String,
    pub(crate) external: bool,
    pub(crate) name: String,
    pub(crate) labels: HashMap<String, String>,
}

