use crate::container::k8s::manager::K8sClient;
use crate::container::k8s::types::{K8sContainerSummary, K8sDeploymentInfo, K8sNodeInfo, K8sPodInfo};
use crate::container::k8s::utils::{
    extract_container_state, extract_k8s_error, format_k8s_age, format_k8s_memory_gib,
    format_k8s_time, i32_at, is_node_ready, map_at, str_at,
};
use crate::AppState;
use chrono::Utc;
use reqwest::header::CONTENT_TYPE;
use serde_json::{json, Value};
use tauri::State;

impl K8sClient {
    pub async fn list_nodes(&self) -> Result<Vec<K8sNodeInfo>, String> {
        let v = self.get_json("/api/v1/nodes").await?;
        let mut res = Vec::new();
        if let Some(items) = v.get("items").and_then(|x| x.as_array()) {
            for n in items {
                let status = if is_node_ready(n) {
                    "Ready".to_string()
                } else {
                    "NotReady".to_string()
                };
                let labels = map_at(n, &["metadata", "labels"]);
                let mut roles = Vec::new();
                for k in labels.keys() {
                    if let Some(r) = k.strip_prefix("node-role.kubernetes.io/") {
                        if !r.is_empty() {
                            roles.push(r.to_string());
                        }
                    }
                }
                roles.sort();
                if roles.is_empty() {
                    roles.push("worker".to_string());
                }

                let mut internal_ip = String::new();
                let mut external_ip = String::new();
                if let Some(addrs) = n
                    .get("status")
                    .and_then(|s| s.get("addresses"))
                    .and_then(|a| a.as_array())
                {
                    for addr in addrs {
                        let a_type = str_at(addr, &["type"]).unwrap_or_default();
                        let a_val = str_at(addr, &["address"]).unwrap_or_default();
                        if a_type == "InternalIP" {
                            internal_ip = a_val;
                        } else if a_type == "ExternalIP" {
                            external_ip = a_val;
                        }
                    }
                }

                let cpu_cap = str_at(n, &["status", "capacity", "cpu"]).unwrap_or_default();
                let mem_raw = str_at(n, &["status", "capacity", "memory"]).unwrap_or_default();
                let mem_cap = format_k8s_memory_gib(&mem_raw);
                let pods_cap = str_at(n, &["status", "capacity", "pods"]).unwrap_or_default();

                res.push(K8sNodeInfo {
                    name: str_at(n, &["metadata", "name"]).unwrap_or_default(),
                    status,
                    roles: roles.join(", "),
                    kubelet_version: str_at(n, &["status", "nodeInfo", "kubeletVersion"])
                        .unwrap_or_default(),
                    os_image: str_at(n, &["status", "nodeInfo", "osImage"]).unwrap_or_default(),
                    kernel_version: str_at(n, &["status", "nodeInfo", "kernelVersion"])
                        .unwrap_or_default(),
                    internal_ip,
                    external_ip,
                    cpu_capacity: cpu_cap,
                    mem_capacity: mem_cap,
                    pods_capacity: pods_cap,
                    created_at: format_k8s_time(
                        &str_at(n, &["metadata", "creationTimestamp"]).unwrap_or_default(),
                    ),
                    labels,
                });
            }
        }
        res.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(res)
    }

    pub async fn list_pods(&self, namespace: &str) -> Result<Vec<K8sPodInfo>, String> {
        let path = if namespace.is_empty() || namespace == "_all" {
            "/api/v1/pods".to_string()
        } else {
            format!("/api/v1/namespaces/{}/pods", namespace)
        };
        let v = self.get_json(&path).await?;
        let mut res = Vec::new();
        if let Some(items) = v.get("items").and_then(|x| x.as_array()) {
            for p in items {
                let spec_containers = p
                    .get("spec")
                    .and_then(|s| s.get("containers"))
                    .and_then(|c| c.as_array())
                    .cloned()
                    .unwrap_or_default();
                let total_containers = spec_containers.len();
                let mut ready_containers = 0usize;
                let mut restarts = 0i32;
                let mut summaries = Vec::new();

                if let Some(cs_arr) = p
                    .get("status")
                    .and_then(|s| s.get("containerStatuses"))
                    .and_then(|c| c.as_array())
                {
                    for cs in cs_arr {
                        let ready = cs.get("ready").and_then(|x| x.as_bool()).unwrap_or(false);
                        if ready {
                            ready_containers += 1;
                        }
                        let rc = cs
                            .get("restartCount")
                            .and_then(|x| x.as_i64())
                            .unwrap_or(0) as i32;
                        restarts += rc;

                        let (state, reason) = extract_container_state(cs.get("state"));
                        summaries.push(K8sContainerSummary {
                            name: str_at(cs, &["name"]).unwrap_or_default(),
                            image: str_at(cs, &["image"]).unwrap_or_default(),
                            ready,
                            state,
                            reason,
                            restart_count: rc,
                            is_init: false,
                        });
                    }
                }

                if summaries.is_empty() {
                    for c in &spec_containers {
                        summaries.push(K8sContainerSummary {
                            name: str_at(c, &["name"]).unwrap_or_default(),
                            image: str_at(c, &["image"]).unwrap_or_default(),
                            ready: false,
                            state: "waiting".to_string(),
                            reason: String::new(),
                            restart_count: 0,
                            is_init: false,
                        });
                    }
                }

                if let Some(ics_arr) = p
                    .get("status")
                    .and_then(|s| s.get("initContainerStatuses"))
                    .and_then(|c| c.as_array())
                {
                    for ics in ics_arr {
                        let ready = ics.get("ready").and_then(|x| x.as_bool()).unwrap_or(false);
                        let rc = ics
                            .get("restartCount")
                            .and_then(|x| x.as_i64())
                            .unwrap_or(0) as i32;
                        let (state, reason) = extract_container_state(ics.get("state"));
                        summaries.push(K8sContainerSummary {
                            name: str_at(ics, &["name"]).unwrap_or_default(),
                            image: str_at(ics, &["image"]).unwrap_or_default(),
                            ready,
                            state,
                            reason,
                            restart_count: rc,
                            is_init: true,
                        });
                    }
                }

                let mut status = str_at(p, &["status", "phase"]).unwrap_or_default();
                if let Some(cs_arr) = p
                    .get("status")
                    .and_then(|s| s.get("containerStatuses"))
                    .and_then(|c| c.as_array())
                {
                    for cs in cs_arr {
                        if let Some(w_reason) = str_at(cs, &["state", "waiting", "reason"]) {
                            if !w_reason.is_empty() {
                                status = w_reason;
                                break;
                            }
                        }
                    }
                }

                let raw_ts = str_at(p, &["metadata", "creationTimestamp"]).unwrap_or_default();
                res.push(K8sPodInfo {
                    name: str_at(p, &["metadata", "name"]).unwrap_or_default(),
                    namespace: str_at(p, &["metadata", "namespace"]).unwrap_or_default(),
                    status,
                    ready: format!("{}/{}", ready_containers, total_containers),
                    restarts,
                    node_name: str_at(p, &["spec", "nodeName"]).unwrap_or_default(),
                    host_ip: str_at(p, &["status", "hostIP"]).unwrap_or_default(),
                    ip: str_at(p, &["status", "podIP"]).unwrap_or_default(),
                    containers: summaries,
                    created_at: format_k8s_time(&raw_ts),
                    age: format_k8s_age(&raw_ts),
                });
            }
        }
        res.sort_by(|a, b| a.namespace.cmp(&b.namespace).then_with(|| a.name.cmp(&b.name)));
        Ok(res)
    }

    pub async fn get_pod_logs(
        &self,
        namespace: &str,
        pod_name: &str,
        container_name: &str,
        tail: i64,
        timestamps: bool,
    ) -> Result<String, String> {
        let tail_val = if tail <= 0 { 200 } else { tail };
        let ns = if namespace.is_empty() {
            "default"
        } else {
            namespace
        };
        let mut url = format!(
            "{}/api/v1/namespaces/{}/pods/{}/log?tailLines={}&timestamps={}",
            self.base_url, ns, pod_name, tail_val, timestamps
        );
        if !container_name.trim().is_empty() {
            url.push_str(&format!("&container={}", container_name.trim()));
        }
        let resp = self
            .http
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("读取 Pod 日志失败: {}", e))?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(extract_k8s_error(status.as_u16(), &text));
        }
        Ok(text)
    }

    pub async fn delete_pod(&self, namespace: &str, pod_name: &str) -> Result<(), String> {
        let path = format!("/api/v1/namespaces/{}/pods/{}", namespace, pod_name);
        let (code, text) = self.delete_path(&path).await?;
        if (200..300).contains(&code) {
            Ok(())
        } else {
            Err(extract_k8s_error(code, &text))
        }
    }

    pub async fn list_deployments(&self, namespace: &str) -> Result<Vec<K8sDeploymentInfo>, String> {
        let path = if namespace.is_empty() || namespace == "_all" {
            "/apis/apps/v1/deployments".to_string()
        } else {
            format!("/apis/apps/v1/namespaces/{}/deployments", namespace)
        };
        let v = self.get_json(&path).await?;
        let mut res = Vec::new();
        if let Some(items) = v.get("items").and_then(|x| x.as_array()) {
            for d in items {
                let mut images = Vec::new();
                if let Some(c_arr) = d
                    .get("spec")
                    .and_then(|s| s.get("template"))
                    .and_then(|t| t.get("spec"))
                    .and_then(|sp| sp.get("containers"))
                    .and_then(|c| c.as_array())
                {
                    for c in c_arr {
                        if let Some(img) = str_at(c, &["image"]) {
                            images.push(img);
                        }
                    }
                }
                res.push(K8sDeploymentInfo {
                    name: str_at(d, &["metadata", "name"]).unwrap_or_default(),
                    namespace: str_at(d, &["metadata", "namespace"]).unwrap_or_default(),
                    replicas: i32_at(d, &["spec", "replicas"]),
                    ready_replicas: i32_at(d, &["status", "readyReplicas"]),
                    available_replicas: i32_at(d, &["status", "availableReplicas"]),
                    updated_replicas: i32_at(d, &["status", "updatedReplicas"]),
                    images,
                    selector: map_at(d, &["spec", "selector", "matchLabels"]),
                    created_at: format_k8s_time(
                        &str_at(d, &["metadata", "creationTimestamp"]).unwrap_or_default(),
                    ),
                });
            }
        }
        res.sort_by(|a, b| a.namespace.cmp(&b.namespace).then_with(|| a.name.cmp(&b.name)));
        Ok(res)
    }

    pub async fn scale_deployment(
        &self,
        namespace: &str,
        name: &str,
        replicas: i32,
    ) -> Result<(), String> {
        let url = format!(
            "{}/apis/apps/v1/namespaces/{}/deployments/{}",
            self.base_url, namespace, name
        );
        let body = json!({
            "spec": {
                "replicas": replicas
            }
        });
        let resp = self
            .http
            .patch(&url)
            .header(CONTENT_TYPE, "application/merge-patch+json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("调整 Deployment [{}] 副本数失败: {}", name, e))?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(extract_k8s_error(status.as_u16(), &text));
        }
        Ok(())
    }

    pub async fn restart_deployment(&self, namespace: &str, name: &str) -> Result<(), String> {
        let url = format!(
            "{}/apis/apps/v1/namespaces/{}/deployments/{}",
            self.base_url, namespace, name
        );
        let now_str = Utc::now().to_rfc3339();
        let body = json!({
            "spec": {
                "template": {
                    "metadata": {
                        "annotations": {
                            "kubectl.kubernetes.io/restartedAt": now_str
                        }
                    }
                }
            }
        });
        let resp = self
            .http
            .patch(&url)
            .header(CONTENT_TYPE, "application/strategic-merge-patch+json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("重启 Deployment [{}] 失败: {}", name, e))?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(extract_k8s_error(status.as_u16(), &text));
        }
        Ok(())
    }

    pub async fn delete_deployment(&self, namespace: &str, name: &str) -> Result<(), String> {
        let path = format!("/apis/apps/v1/namespaces/{}/deployments/{}", namespace, name);
        let (code, text) = self.delete_path(&path).await?;
        if (200..300).contains(&code) {
            Ok(())
        } else {
            Err(extract_k8s_error(code, &text))
        }
    }
}

// ======================== Tauri Commands ========================

#[tauri::command]
pub async fn k8s_list_nodes(state: State<'_, AppState>, id: String) -> Result<Vec<Value>, String> {
    let cli = state.k8s.get_client(&id).await?;
    let list = cli.list_nodes().await?;
    list.into_iter()
        .map(|x| serde_json::to_value(x).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn k8s_list_pods(
    state: State<'_, AppState>,
    id: String,
    namespace: String,
) -> Result<Vec<Value>, String> {
    let cli = state.k8s.get_client(&id).await?;
    let list = cli.list_pods(&namespace).await?;
    list.into_iter()
        .map(|x| serde_json::to_value(x).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn k8s_get_pod_logs(
    state: State<'_, AppState>,
    id: String,
    namespace: String,
    pod_name: String,
    container_name: String,
    tail: i64,
    timestamps: bool,
) -> Result<String, String> {
    let cli = state.k8s.get_client(&id).await?;
    cli.get_pod_logs(&namespace, &pod_name, &container_name, tail, timestamps)
        .await
}

#[tauri::command]
pub async fn k8s_delete_pod(
    state: State<'_, AppState>,
    id: String,
    namespace: String,
    pod_name: String,
) -> Result<(), String> {
    let cli = state.k8s.get_client(&id).await?;
    cli.delete_pod(&namespace, &pod_name).await
}

#[tauri::command]
pub async fn k8s_list_deployments(
    state: State<'_, AppState>,
    id: String,
    namespace: String,
) -> Result<Vec<Value>, String> {
    let cli = state.k8s.get_client(&id).await?;
    let list = cli.list_deployments(&namespace).await?;
    list.into_iter()
        .map(|x| serde_json::to_value(x).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn k8s_scale_deployment(
    state: State<'_, AppState>,
    id: String,
    namespace: String,
    name: String,
    replicas: i32,
) -> Result<(), String> {
    let cli = state.k8s.get_client(&id).await?;
    cli.scale_deployment(&namespace, &name, replicas).await
}

#[tauri::command]
pub async fn k8s_restart_deployment(
    state: State<'_, AppState>,
    id: String,
    namespace: String,
    name: String,
) -> Result<(), String> {
    let cli = state.k8s.get_client(&id).await?;
    cli.restart_deployment(&namespace, &name).await
}

#[tauri::command]
pub async fn k8s_delete_deployment(
    state: State<'_, AppState>,
    id: String,
    namespace: String,
    name: String,
) -> Result<(), String> {
    let cli = state.k8s.get_client(&id).await?;
    cli.delete_deployment(&namespace, &name).await
}

