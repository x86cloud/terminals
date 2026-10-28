use crate::container::k8s::manager::K8sClient;
use crate::container::k8s::types::{K8sIngressInfo, K8sServiceInfo};
use crate::container::k8s::utils::{extract_k8s_error, format_k8s_time, i32_at, map_at, str_at};
use crate::AppState;
use serde_json::Value;
use tauri::State;

impl K8sClient {
    pub async fn list_services(&self, namespace: &str) -> Result<Vec<K8sServiceInfo>, String> {
        let path = if namespace.is_empty() || namespace == "_all" {
            "/api/v1/services".to_string()
        } else {
            format!("/api/v1/namespaces/{}/services", namespace)
        };
        let v = self.get_json(&path).await?;
        let mut res = Vec::new();
        if let Some(items) = v.get("items").and_then(|x| x.as_array()) {
            for s in items {
                let mut ports = Vec::new();
                if let Some(p_arr) = s
                    .get("spec")
                    .and_then(|sp| sp.get("ports"))
                    .and_then(|p| p.as_array())
                {
                    for p in p_arr {
                        let port = i32_at(p, &["port"]);
                        let node_port = i32_at(p, &["nodePort"]);
                        let proto = str_at(p, &["protocol"]).unwrap_or_else(|| "TCP".to_string());
                        if node_port > 0 {
                            ports.push(format!("{}:{}/{}", port, node_port, proto));
                        } else {
                            ports.push(format!("{}/{}", port, proto));
                        }
                    }
                }

                let mut ext_ip = String::new();
                if let Some(ing_arr) = s
                    .get("status")
                    .and_then(|st| st.get("loadBalancer"))
                    .and_then(|lb| lb.get("ingress"))
                    .and_then(|i| i.as_array())
                {
                    if let Some(first) = ing_arr.first() {
                        ext_ip = str_at(first, &["ip"])
                            .or_else(|| str_at(first, &["hostname"]))
                            .unwrap_or_default();
                    }
                }

                res.push(K8sServiceInfo {
                    name: str_at(s, &["metadata", "name"]).unwrap_or_default(),
                    namespace: str_at(s, &["metadata", "namespace"]).unwrap_or_default(),
                    svc_type: str_at(s, &["spec", "type"]).unwrap_or_default(),
                    cluster_ip: str_at(s, &["spec", "clusterIP"]).unwrap_or_default(),
                    external_ip: ext_ip,
                    ports,
                    selector: map_at(s, &["spec", "selector"]),
                    created_at: format_k8s_time(
                        &str_at(s, &["metadata", "creationTimestamp"]).unwrap_or_default(),
                    ),
                });
            }
        }
        res.sort_by(|a, b| a.namespace.cmp(&b.namespace).then_with(|| a.name.cmp(&b.name)));
        Ok(res)
    }

    pub async fn delete_service(&self, namespace: &str, name: &str) -> Result<(), String> {
        let path = format!("/api/v1/namespaces/{}/services/{}", namespace, name);
        let (code, text) = self.delete_path(&path).await?;
        if (200..300).contains(&code) {
            Ok(())
        } else {
            Err(extract_k8s_error(code, &text))
        }
    }

    pub async fn list_ingresses(&self, namespace: &str) -> Result<Vec<K8sIngressInfo>, String> {
        let path = if namespace.is_empty() || namespace == "_all" {
            "/apis/networking.k8s.io/v1/ingresses".to_string()
        } else {
            format!("/apis/networking.k8s.io/v1/namespaces/{}/ingresses", namespace)
        };
        let v = self.get_json(&path).await?;
        let mut res = Vec::new();
        if let Some(items) = v.get("items").and_then(|x| x.as_array()) {
            for ing in items {
                let mut hosts = Vec::new();
                let mut rules = Vec::new();
                if let Some(r_arr) = ing
                    .get("spec")
                    .and_then(|sp| sp.get("rules"))
                    .and_then(|r| r.as_array())
                {
                    for r in r_arr {
                        let host = str_at(r, &["host"]).unwrap_or_default();
                        if !host.is_empty() {
                            hosts.push(host.clone());
                        }
                        if let Some(paths) = r
                            .get("http")
                            .and_then(|h| h.get("paths"))
                            .and_then(|p| p.as_array())
                        {
                            for p in paths {
                                let p_str = str_at(p, &["path"]).unwrap_or_default();
                                let svc_name =
                                    str_at(p, &["backend", "service", "name"]).unwrap_or_default();
                                let svc_port =
                                    i32_at(p, &["backend", "service", "port", "number"]);
                                rules.push(format!("{}{} -> {}:{}", host, p_str, svc_name, svc_port));
                            }
                        }
                    }
                }

                res.push(K8sIngressInfo {
                    name: str_at(ing, &["metadata", "name"]).unwrap_or_default(),
                    namespace: str_at(ing, &["metadata", "namespace"]).unwrap_or_default(),
                    ingress_class: str_at(ing, &["spec", "ingressClassName"]).unwrap_or_default(),
                    hosts,
                    rules,
                    created_at: format_k8s_time(
                        &str_at(ing, &["metadata", "creationTimestamp"]).unwrap_or_default(),
                    ),
                });
            }
        }
        res.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(res)
    }

    pub async fn delete_ingress(&self, namespace: &str, name: &str) -> Result<(), String> {
        let path = format!(
            "/apis/networking.k8s.io/v1/namespaces/{}/ingresses/{}",
            namespace, name
        );
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
pub async fn k8s_list_services(
    state: State<'_, AppState>,
    id: String,
    namespace: String,
) -> Result<Vec<Value>, String> {
    let cli = state.k8s.get_client(&id).await?;
    let list = cli.list_services(&namespace).await?;
    list.into_iter()
        .map(|x| serde_json::to_value(x).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn k8s_delete_service(
    state: State<'_, AppState>,
    id: String,
    namespace: String,
    name: String,
) -> Result<(), String> {
    let cli = state.k8s.get_client(&id).await?;
    cli.delete_service(&namespace, &name).await
}

#[tauri::command]
pub async fn k8s_list_ingresses(
    state: State<'_, AppState>,
    id: String,
    namespace: String,
) -> Result<Vec<Value>, String> {
    let cli = state.k8s.get_client(&id).await?;
    let list = cli.list_ingresses(&namespace).await?;
    list.into_iter()
        .map(|x| serde_json::to_value(x).map_err(|e| e.to_string()))
        .collect()
}

#[tauri::command]
pub async fn k8s_delete_ingress(
    state: State<'_, AppState>,
    id: String,
    namespace: String,
    name: String,
) -> Result<(), String> {
    let cli = state.k8s.get_client(&id).await?;
    cli.delete_ingress(&namespace, &name).await
}

