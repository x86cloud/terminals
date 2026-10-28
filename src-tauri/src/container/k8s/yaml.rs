use crate::container::k8s::manager::K8sClient;
use crate::container::k8s::types::{K8sApplyResult, K8sDeleteResult};
use crate::container::k8s::utils::{
    extract_k8s_error, normalize_typemeta, parse_yaml_documents, parse_yaml_resource_summaries,
    resolve_resource_paths, str_at,
};
use crate::core::K8sOrchestrationRecord;
use crate::AppState;
use reqwest::header::CONTENT_TYPE;
use serde_json::Value;
use tauri::State;

impl K8sClient {
    pub async fn get_resource_yaml(
        &self,
        kind: &str,
        namespace: &str,
        name: &str,
    ) -> Result<String, String> {
        let ns = if namespace.is_empty() {
            "default"
        } else {
            namespace
        };
        let (_, item_path, api_ver, canonical_kind) = resolve_resource_paths(kind, "", ns, name)?;
        let mut obj = self.get_json(&item_path).await?;
        if let Some(map) = obj.as_object_mut() {
            map.entry("apiVersion".to_string())
                .or_insert_with(|| Value::String(api_ver));
            map.entry("kind".to_string())
                .or_insert_with(|| Value::String(canonical_kind));
            if let Some(meta) = map.get_mut("metadata").and_then(|m| m.as_object_mut()) {
                meta.remove("managedFields");
            }
        }
        serde_yaml::to_string(&obj).map_err(|e| format!("序列化 YAML 失败: {}", e))
    }

    pub async fn apply_yaml(&self, yaml_content: &str) -> Result<Vec<K8sApplyResult>, String> {
        if yaml_content.trim().is_empty() {
            return Err("YAML 内容为空".to_string());
        }

        let docs = parse_yaml_documents(yaml_content)?;
        let mut results = Vec::new();

        for mut doc in docs {
            if !doc.is_object() {
                continue;
            }
            normalize_typemeta(&mut doc);

            let kind = str_at(&doc, &["kind"])
                .or_else(|| str_at(&doc, &["Kind"]))
                .unwrap_or_default();
            if kind.is_empty() {
                results.push(K8sApplyResult {
                    kind: String::new(),
                    name: String::new(),
                    namespace: String::new(),
                    action: "failed".to_string(),
                    message: "YAML 资源缺少 kind 定义".to_string(),
                });
                continue;
            }

            let api_version = str_at(&doc, &["apiVersion"]).unwrap_or_default();
            let name = str_at(&doc, &["metadata", "name"]).unwrap_or_default();
            if name.is_empty() {
                results.push(K8sApplyResult {
                    kind,
                    name: String::new(),
                    namespace: String::new(),
                    action: "failed".to_string(),
                    message: "资源缺少 metadata.name".to_string(),
                });
                continue;
            }

            let mut ns = str_at(&doc, &["metadata", "namespace"]).unwrap_or_default();
            if ns.is_empty() {
                ns = "default".to_string();
            }

            let (coll_path, item_path, resolved_api_ver, resolved_kind) =
                match resolve_resource_paths(&kind, &api_version, &ns, &name) {
                    Ok(v) => v,
                    Err(e) => {
                        results.push(K8sApplyResult {
                            kind,
                            name,
                            namespace: ns,
                            action: "failed".to_string(),
                            message: e,
                        });
                        continue;
                    }
                };

            let is_cluster_scoped = !coll_path.contains("/namespaces/");
            let effective_ns = if is_cluster_scoped {
                String::new()
            } else {
                ns.clone()
            };

            if let Some(map) = doc.as_object_mut() {
                map.insert("apiVersion".to_string(), Value::String(resolved_api_ver));
                map.insert("kind".to_string(), Value::String(resolved_kind.clone()));
                if !is_cluster_scoped {
                    if let Some(meta) = map.get_mut("metadata").and_then(|m| m.as_object_mut()) {
                        meta.entry("namespace".to_string())
                            .or_insert_with(|| Value::String(ns.clone()));
                    }
                }
            }

            // 1. Try Server-Side Apply
            let ssa_url = format!(
                "{}{}?fieldManager=terminal-k8s-client&force=true",
                self.base_url, item_path
            );
            let payload_bytes = serde_json::to_vec(&doc).unwrap_or_default();
            let ssa_resp = self
                .http
                .patch(&ssa_url)
                .header(CONTENT_TYPE, "application/apply-patch+yaml")
                .body(payload_bytes)
                .send()
                .await;

            if let Ok(r) = ssa_resp {
                if r.status().is_success() {
                    results.push(K8sApplyResult {
                        kind: resolved_kind,
                        name,
                        namespace: effective_ns,
                        action: "configured".to_string(),
                        message: String::new(),
                    });
                    continue;
                }
            }

            // 2. Fallback: GET -> POST (create) or PUT (update)
            let existing = self.get_json(&item_path).await;
            match existing {
                Err(_) => {
                    let create_url = format!("{}{}", self.base_url, coll_path);
                    match self.http.post(&create_url).json(&doc).send().await {
                        Ok(resp) => {
                            let st = resp.status();
                            let txt = resp.text().await.unwrap_or_default();
                            if st.is_success() {
                                results.push(K8sApplyResult {
                                    kind: resolved_kind,
                                    name,
                                    namespace: effective_ns,
                                    action: "created".to_string(),
                                    message: String::new(),
                                });
                            } else {
                                results.push(K8sApplyResult {
                                    kind: resolved_kind,
                                    name,
                                    namespace: effective_ns,
                                    action: "failed".to_string(),
                                    message: extract_k8s_error(st.as_u16(), &txt),
                                });
                            }
                        }
                        Err(e) => {
                            results.push(K8sApplyResult {
                                kind: resolved_kind,
                                name,
                                namespace: effective_ns,
                                action: "failed".to_string(),
                                message: e.to_string(),
                            });
                        }
                    }
                }
                Ok(ex_obj) => {
                    if let Some(rv) = str_at(&ex_obj, &["metadata", "resourceVersion"]) {
                        if let Some(meta) = doc.get_mut("metadata").and_then(|m| m.as_object_mut())
                        {
                            meta.insert("resourceVersion".to_string(), Value::String(rv));
                        }
                    }
                    let update_url = format!("{}{}", self.base_url, item_path);
                    match self.http.put(&update_url).json(&doc).send().await {
                        Ok(resp) => {
                            let st = resp.status();
                            let txt = resp.text().await.unwrap_or_default();
                            if st.is_success() {
                                results.push(K8sApplyResult {
                                    kind: resolved_kind,
                                    name,
                                    namespace: effective_ns,
                                    action: "configured".to_string(),
                                    message: String::new(),
                                });
                            } else {
                                results.push(K8sApplyResult {
                                    kind: resolved_kind,
                                    name,
                                    namespace: effective_ns,
                                    action: "failed".to_string(),
                                    message: extract_k8s_error(st.as_u16(), &txt),
                                });
                            }
                        }
                        Err(e) => {
                            results.push(K8sApplyResult {
                                kind: resolved_kind,
                                name,
                                namespace: effective_ns,
                                action: "failed".to_string(),
                                message: e.to_string(),
                            });
                        }
                    }
                }
            }
        }

        Ok(results)
    }

    pub async fn delete_yaml(&self, yaml_content: &str) -> Result<Vec<K8sDeleteResult>, String> {
        if yaml_content.trim().is_empty() {
            return Err("YAML 内容为空".to_string());
        }

        let docs = parse_yaml_documents(yaml_content)?;
        let mut results = Vec::new();

        for mut doc in docs {
            if !doc.is_object() {
                continue;
            }
            normalize_typemeta(&mut doc);

            let kind = str_at(&doc, &["kind"])
                .or_else(|| str_at(&doc, &["Kind"]))
                .unwrap_or_default();
            if kind.is_empty() {
                continue;
            }
            let api_version = str_at(&doc, &["apiVersion"]).unwrap_or_default();
            let name = str_at(&doc, &["metadata", "name"]).unwrap_or_default();
            if name.is_empty() {
                continue;
            }
            let mut ns = str_at(&doc, &["metadata", "namespace"]).unwrap_or_default();
            if ns.is_empty() {
                ns = "default".to_string();
            }

            let (coll_path, item_path, _, resolved_kind) =
                match resolve_resource_paths(&kind, &api_version, &ns, &name) {
                    Ok(v) => v,
                    Err(e) => {
                        results.push(K8sDeleteResult {
                            kind,
                            name,
                            namespace: ns,
                            action: "failed".to_string(),
                            message: e,
                        });
                        continue;
                    }
                };

            let effective_ns = if coll_path.contains("/namespaces/") {
                ns
            } else {
                String::new()
            };

            match self.delete_path(&item_path).await {
                Ok((code, text)) => {
                    if (200..300).contains(&code) {
                        results.push(K8sDeleteResult {
                            kind: resolved_kind,
                            name,
                            namespace: effective_ns,
                            action: "deleted".to_string(),
                            message: String::new(),
                        });
                    } else if code == 404 {
                        results.push(K8sDeleteResult {
                            kind: resolved_kind,
                            name,
                            namespace: effective_ns,
                            action: "not_found".to_string(),
                            message: "资源已不存在".to_string(),
                        });
                    } else {
                        results.push(K8sDeleteResult {
                            kind: resolved_kind,
                            name,
                            namespace: effective_ns,
                            action: "failed".to_string(),
                            message: extract_k8s_error(code, &text),
                        });
                    }
                }
                Err(e) => {
                    results.push(K8sDeleteResult {
                        kind: resolved_kind,
                        name,
                        namespace: effective_ns,
                        action: "failed".to_string(),
                        message: e,
                    });
                }
            }
        }

        Ok(results)
    }
}

// ======================== Tauri Commands ========================

#[tauri::command]
pub async fn k8s_get_resource_yaml(
    state: State<'_, AppState>,
    id: String,
    kind: String,
    namespace: String,
    name: String,
) -> Result<String, String> {
    let cli = state.k8s.get_client(&id).await?;
    cli.get_resource_yaml(&kind, &namespace, &name).await
}

#[tauri::command]
pub async fn k8s_apply_yaml(
    state: State<'_, AppState>,
    id: String,
    yaml_content: String,
) -> Result<Vec<Value>, String> {
    let cli = state.k8s.get_client(&id).await?;
    let res = cli.apply_yaml(&yaml_content).await?;
    res.into_iter()
        .map(|x| serde_json::to_value(x).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn k8s_delete_yaml(
    state: State<'_, AppState>,
    id: String,
    yaml_content: String,
) -> Result<Vec<Value>, String> {
    let cli = state.k8s.get_client(&id).await?;
    let res = cli.delete_yaml(&yaml_content).await?;
    res.into_iter()
        .map(|x| serde_json::to_value(x).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn k8s_list_orchestration_records(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<K8sOrchestrationRecord>, String> {
    Ok(state.store.list_k8s_orchestration_records(&server_id))
}

#[tauri::command]
pub async fn k8s_get_orchestration_record(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<K8sOrchestrationRecord>, String> {
    Ok(state.store.get_k8s_orchestration_record(&id))
}

#[tauri::command]
pub async fn k8s_apply_orchestration(
    state: State<'_, AppState>,
    server_id: String,
    mut record: K8sOrchestrationRecord,
) -> Result<Vec<Value>, String> {
    let cli = state
        .k8s
        .get_client(&server_id)
        .await
        .map_err(|e| format!("无法连接至集群: {}", e))?;

    let results = cli
        .apply_yaml(&record.yaml_content)
        .await
        .map_err(|e| format!("部署失败: {}", e))?;

    let has_success = results
        .iter()
        .any(|r| r.action == "created" || r.action == "configured");

    if !has_success && !results.is_empty() {
        return Err("所有资源均应用失败，拒绝保存到本地配置".to_string());
    }

    let (res_list, res_summary) = parse_yaml_resource_summaries(&record.yaml_content);
    record.server_id = server_id;
    record.status = "deployed".to_string();
    record.resources = res_list.clone();
    record.resources_summary = res_summary;
    if record.namespace.is_empty() || record.namespace == "default" {
        if let Some(found) = res_list.iter().find(|r| !r.namespace.is_empty()) {
            record.namespace = found.namespace.clone();
        }
    }
    if record.namespace.is_empty() {
        record.namespace = "default".to_string();
    }

    state
        .store
        .save_k8s_orchestration_record(record)
        .map_err(|e| format!("集群部署成功但本地记录保存失败: {}", e))?;

    results
        .into_iter()
        .map(|x| serde_json::to_value(x).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn k8s_offline_orchestration(
    state: State<'_, AppState>,
    server_id: String,
    record_id: String,
    delete_local_file: bool,
) -> Result<Vec<Value>, String> {
    let mut rec = state
        .store
        .get_k8s_orchestration_record(&record_id)
        .ok_or_else(|| "未找到编排记录".to_string())?;

    let cli = state
        .k8s
        .get_client(&server_id)
        .await
        .map_err(|e| format!("无法连接至集群: {}", e))?;

    let results = cli
        .delete_yaml(&rec.yaml_content)
        .await
        .map_err(|e| format!("下线资源失败: {}", e))?;

    if delete_local_file {
        let _ = state.store.delete_k8s_orchestration_record(&record_id);
    } else {
        rec.status = "not_deployed".to_string();
        let _ = state.store.save_k8s_orchestration_record(rec);
    }

    results
        .into_iter()
        .map(|x| serde_json::to_value(x).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn k8s_delete_orchestration_record_only(
    state: State<'_, AppState>,
    record_id: String,
) -> Result<(), String> {
    state.store.delete_k8s_orchestration_record(&record_id)
}

