use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct KubeconfigContextInfo {
    pub current_context: String,
    pub contexts: Vec<String>,
    pub cluster_host: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct K8sOverview {
    pub connected: bool,
    pub api_server: String,
    pub git_version: String,
    pub platform: String,
    pub nodes_total: usize,
    pub nodes_ready: usize,
    pub namespaces_total: usize,
    pub pods_total: usize,
    pub pods_running: usize,
    pub deployments_total: usize,
    pub services_total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct K8sNodeInfo {
    pub name: String,
    pub status: String,
    pub roles: String,
    pub kubelet_version: String,
    pub os_image: String,
    pub kernel_version: String,
    pub internal_ip: String,
    pub external_ip: String,
    pub cpu_capacity: String,
    pub mem_capacity: String,
    pub pods_capacity: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub labels: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct K8sNamespaceInfo {
    pub name: String,
    pub status: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub labels: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct K8sContainerSummary {
    pub name: String,
    pub image: String,
    pub ready: bool,
    pub state: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub reason: String,
    pub restart_count: i32,
    #[serde(skip_serializing_if = "is_false")]
    pub is_init: bool,
}

fn is_false(b: &bool) -> bool {
    !*b
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct K8sPodInfo {
    pub name: String,
    pub namespace: String,
    pub status: String,
    pub ready: String,
    pub restarts: i32,
    pub node_name: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub host_ip: String,
    pub ip: String,
    pub containers: Vec<K8sContainerSummary>,
    pub created_at: String,
    pub age: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct K8sDeploymentInfo {
    pub name: String,
    pub namespace: String,
    pub replicas: i32,
    pub ready_replicas: i32,
    pub available_replicas: i32,
    pub updated_replicas: i32,
    pub images: Vec<String>,
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub selector: HashMap<String, String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct K8sServiceInfo {
    pub name: String,
    pub namespace: String,
    #[serde(rename = "type")]
    pub svc_type: String,
    pub cluster_ip: String,
    pub external_ip: String,
    pub ports: Vec<String>,
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub selector: HashMap<String, String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct K8sIngressInfo {
    pub name: String,
    pub namespace: String,
    pub ingress_class: String,
    pub hosts: Vec<String>,
    pub rules: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct K8sConfigMapInfo {
    pub name: String,
    pub namespace: String,
    pub data_count: usize,
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub data: HashMap<String, String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct K8sSecretInfo {
    pub name: String,
    pub namespace: String,
    #[serde(rename = "type")]
    pub secret_type: String,
    pub data_count: usize,
    pub keys: Vec<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct K8sPVCInfo {
    pub name: String,
    pub namespace: String,
    pub status: String,
    pub volume_name: String,
    pub capacity: String,
    pub access_modes: Vec<String>,
    pub storage_class: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct K8sApplyResult {
    pub kind: String,
    pub name: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub namespace: String,
    pub action: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct K8sDeleteResult {
    pub kind: String,
    pub name: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub namespace: String,
    pub action: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub message: String,
}

pub(crate) struct ResolvedK8sAuth {
    pub api_server: String,
    pub bearer_token: String,
    pub ca_pem: Vec<u8>,
    pub cert_pem: Vec<u8>,
    pub key_pem: Vec<u8>,
    pub insecure: bool,
    pub namespace: String,
}

