use crate::container::k8s::manager::K8sClient;
use crate::container::k8s::types::{
    K8sConfigMapInfo, K8sNamespaceInfo, K8sPVCInfo, K8sSecretInfo,
};
use crate::container::k8s::utils::{extract_k8s_error, format_k8s_time, map_at, str_at};
use crate::AppState;
use serde_json::{json, Value};
use tauri::State;

impl K8sClient {
    pub async fn list_namespaces(&self) -> Result<Vec<K8sNamespaceInfo>, String> {
        let v = self.get_json("/api/v1/namespaces").await?;
        let mut res = Vec::new();
        if let Some(items) = v.get("items").and_then(|x| x.as_array()) {
            for item in items {
                res.push(K8sNamespaceInfo {
                    name: str_at(item, &["metadata", "name"]).unwrap_or_default(),
                    status: str_at(item, &["status", "phase"]).unwrap_or_default(),
                    created_at: format_k8s_time(
                        &str_at(item, &["metadata", "creationTimestamp"]).unwrap_or_default(),
                    ),
                    labels: map_at(item, &["metadata", "labels"]),
                });
            }
        }
        res.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(res)
    }

    pub async fn list_config_maps(&self, namespace: &str) -> Result<Vec<K8sConfigMapInfo>, String> {
        let path = if namespace.is_empty() || namespace == "_all" {
            "/api/v1/configmaps".to_string()
        } else {
            format!("/api/v1/namespaces/{}/configmaps", namespace)
        };
        let v = self.get_json(&path).await?;
        let mut res = Vec::new();
        if let Some(items) = v.get("items").and_then(|x| x.as_array()) {
            for cm in items {
                let data = map_at(cm, &["data"]);
                let bin_count = cm
                    .get("binaryData")
                    .and_then(|b| b.as_object())
                    .map(|m| m.len())
                    .unwrap_or(0);
                res.push(K8sConfigMapInfo {
                    name: str_at(cm, &["metadata", "name"]).unwrap_or_default(),
                    namespace: str_at(cm, &["metadata", "namespace"]).unwrap_or_default(),
                    data_count: data.len() + bin_count,
                    data,
                    created_at: format_k8s_time(
                        &str_at(cm, &["metadata", "creationTimestamp"]).unwrap_or_default(),
                    ),
                });
            }
        }
        res.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(res)
    }

    pub async fn delete_config_map(&self, namespace: &str, name: &str) -> Result<(), String> {
        let path = format!("/api/v1/namespaces/{}/configmaps/{}", namespace, name);
        let (code, text) = self.delete_path(&path).await?;
        if (200..300).contains(&code) {
            Ok(())
        } else {
            Err(extract_k8s_error(code, &text))
        }
    }

    pub async fn list_secrets(&self, namespace: &str) -> Result<Vec<K8sSecretInfo>, String> {
        let path = if namespace.is_empty() || namespace == "_all" {
            "/api/v1/secrets".to_string()
        } else {
            format!("/api/v1/namespaces/{}/secrets", namespace)
        };
        let v = self.get_json(&path).await?;
        let mut res = Vec::new();
        if let Some(items) = v.get("items").and_then(|x| x.as_array()) {
            for sec in items {
                let mut keys: Vec<String> = sec
                    .get("data")
                    .and_then(|d| d.as_object())
                    .map(|m| m.keys().cloned().collect())
                    .unwrap_or_default();
                keys.sort();
                let data_count = keys.len();
                res.push(K8sSecretInfo {
                    name: str_at(sec, &["metadata", "name"]).unwrap_or_default(),
                    namespace: str_at(sec, &["metadata", "namespace"]).unwrap_or_default(),
                    secret_type: str_at(sec, &["type"]).unwrap_or_default(),
                    data_count,
                    keys,
                    created_at: format_k8s_time(
                        &str_at(sec, &["metadata", "creationTimestamp"]).unwrap_or_default(),
                    ),
                });
            }
        }
        res.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(res)
    }

    pub async fn delete_secret(&self, namespace: &str, name: &str) -> Result<(), String> {
        let path = format!("/api/v1/namespaces/{}/secrets/{}", namespace, name);
        let (code, text) = self.delete_path(&path).await?;
        if (200..300).contains(&code) {
            Ok(())
        } else {
            Err(extract_k8s_error(code, &text))
        }
    }

    pub async fn list_pvcs(&self, namespace: &str) -> Result<Vec<K8sPVCInfo>, String> {
        let path = if namespace.is_empty() || namespace == "_all" {
            "/api/v1/persistentvolumeclaims".to_string()
        } else {
            format!("/api/v1/namespaces/{}/persistentvolumeclaims", namespace)
        };
        let v = self.get_json(&path).await?;
        let mut res = Vec::new();
        if let Some(items) = v.get("items").and_then(|x| x.as_array()) {
            for pvc in items {
                let access_modes: Vec<String> = pvc
                    .get("spec")
                    .and_then(|s| s.get("accessModes"))
                    .and_then(|a| a.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|x| x.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default();

                res.push(K8sPVCInfo {
                    name: str_at(pvc, &["metadata", "name"]).unwrap_or_default(),
                    namespace: str_at(pvc, &["metadata", "namespace"]).unwrap_or_default(),
                    status: str_at(pvc, &["status", "phase"]).unwrap_or_default(),
                    volume_name: str_at(pvc, &["spec", "volumeName"]).unwrap_or_default(),
                    capacity: str_at(pvc, &["status", "capacity", "storage"]).unwrap_or_default(),
                    access_modes,
                    storage_class: str_at(pvc, &["spec", "storageClassName"]).unwrap_or_default(),
                    created_at: format_k8s_time(
                        &str_at(pvc, &["metadata", "creationTimestamp"]).unwrap_or_default(),
                    ),
                });
            }
        }
        res.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(res)
    }

    pub async fn delete_pvc(&self, namespace: &str, name: &str) -> Result<(), String> {
        let path = format!(
            "/api/v1/namespaces/{}/persistentvolumeclaims/{}",
            namespace, name
        );
        let (code, text) = self.delete_path(&path).await?;
        if (200..300).contains(&code) {
            Ok(())
        } else {
            Err(extract_k8s_error(code, &text))
        }
    }

    pub async fn create_namespace(&self, name: &str) -> Result<(), String> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err("命名空间名称不能为空".to_string());
        }
        let url = format!("{}/api/v1/namespaces", self.base_url);
        let body = json!({
            "apiVersion": "v1",
            "kind": "Namespace",
            "metadata": {
                "name": trimmed
            }
        });
        let resp = self
            .http
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("创建命名空间 [{}] 失败: {}", trimmed, e))?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(extract_k8s_error(status.as_u16(), &text));
        }
        Ok(())
    }

    pub async fn delete_namespace(&self, name: &str) -> Result<(), String> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err("命名空间名称不能为空".to_string());
        }
        if matches!(
            trimmed,
            "default" | "kube-system" | "kube-public" | "kube-node-lease"
        ) {
            return Err(format!("系统核心命名空间 [{}] 禁止删除", trimmed));
        }
        let path = format!("/api/v1/namespaces/{}", trimmed);
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
pub async fn k8s_list_namespaces(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<Value>, String> {
    let cli = state.k8s.get_client(&id).await?;
    let list = cli.list_namespaces().await?;
    list.into_iter()
        .map(|x| serde_json::to_value(x).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn k8s_create_namespace(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<(), String> {
    let cli = state.k8s.get_client(&id).await?;
    cli.create_namespace(&name).await
}

#[tauri::command]
pub async fn k8s_delete_namespace(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<(), String> {
    let cli = state.k8s.get_client(&id).await?;
    cli.delete_namespace(&name).await
}

#[tauri::command]
pub async fn k8s_list_config_maps(
    state: State<'_, AppState>,
    id: String,
    namespace: String,
) -> Result<Vec<Value>, String> {
    let cli = state.k8s.get_client(&id).await?;
    let list = cli.list_config_maps(&namespace).await?;
    list.into_iter()
        .map(|x| serde_json::to_value(x).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn k8s_delete_config_map(
    state: State<'_, AppState>,
    id: String,
    namespace: String,
    name: String,
) -> Result<(), String> {
    let cli = state.k8s.get_client(&id).await?;
    cli.delete_config_map(&namespace, &name).await
}

#[tauri::command]
pub async fn k8s_list_secrets(
    state: State<'_, AppState>,
    id: String,
    namespace: String,
) -> Result<Vec<Value>, String> {
    let cli = state.k8s.get_client(&id).await?;
    let list = cli.list_secrets(&namespace).await?;
    list.into_iter()
        .map(|x| serde_json::to_value(x).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn k8s_delete_secret(
    state: State<'_, AppState>,
    id: String,
    namespace: String,
    name: String,
) -> Result<(), String> {
    let cli = state.k8s.get_client(&id).await?;
    cli.delete_secret(&namespace, &name).await
}

#[tauri::command]
pub async fn k8s_list_pvcs(
    state: State<'_, AppState>,
    id: String,
    namespace: String,
) -> Result<Vec<Value>, String> {
    let cli = state.k8s.get_client(&id).await?;
    let list = cli.list_pvcs(&namespace).await?;
    list.into_iter()
        .map(|x| serde_json::to_value(x).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn k8s_delete_pvc(
    state: State<'_, AppState>,
    id: String,
    namespace: String,
    name: String,
) -> Result<(), String> {
    let cli = state.k8s.get_client(&id).await?;
    cli.delete_pvc(&namespace, &name).await
}

