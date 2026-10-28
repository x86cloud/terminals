use crate::container::k8s::types::{KubeconfigContextInfo, ResolvedK8sAuth};
use crate::core::{K8sResourceItemSummary, ServerConfig};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;

pub fn parse_kubeconfig_info(
    kubeconfig_data: &str,
    kubeconfig_path: &str,
) -> Result<KubeconfigContextInfo, String> {
    let raw_yaml = if !kubeconfig_data.trim().is_empty() {
        kubeconfig_data.to_string()
    } else if !kubeconfig_path.trim().is_empty() {
        fs::read_to_string(kubeconfig_path.trim())
            .map_err(|e| format!("读取 Kubeconfig 文件失败: {}", e))?
    } else {
        return Err("未提供 Kubeconfig 配置内容或文件路径".to_string());
    };

    let doc: Value =
        serde_yaml::from_str(&raw_yaml).map_err(|e| format!("解析 Kubeconfig 失败: {}", e))?;

    let current_context = doc
        .get("current-context")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let mut contexts = Vec::new();
    let mut current_cluster_name = String::new();

    if let Some(ctx_arr) = doc.get("contexts").and_then(|v| v.as_array()) {
        for item in ctx_arr {
            if let Some(name) = item.get("name").and_then(|v| v.as_str()) {
                contexts.push(name.to_string());
                if name == current_context {
                    if let Some(cl) = item
                        .get("context")
                        .and_then(|c| c.get("cluster"))
                        .and_then(|v| v.as_str())
                    {
                        current_cluster_name = cl.to_string();
                    }
                }
            }
        }
    }
    contexts.sort();

    let mut cluster_host = String::new();
    if let Some(cl_arr) = doc.get("clusters").and_then(|v| v.as_array()) {
        for item in cl_arr {
            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
            if (!current_cluster_name.is_empty() && name == current_cluster_name)
                || (current_cluster_name.is_empty() && cluster_host.is_empty())
            {
                if let Some(srv) = item
                    .get("cluster")
                    .and_then(|c| c.get("server"))
                    .and_then(|v| v.as_str())
                {
                    cluster_host = srv.to_string();
                }
            }
        }
    }

    Ok(KubeconfigContextInfo {
        current_context,
        contexts,
        cluster_host,
    })
}

pub(crate) fn load_bytes_or_base64_or_file(raw: &str) -> Vec<u8> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    if trimmed.contains("-----BEGIN") {
        return trimmed.as_bytes().to_vec();
    }
    if let Ok(bytes) = fs::read(trimmed) {
        return bytes;
    }
    if let Ok(decoded) = BASE64.decode(trimmed) {
        return decoded;
    }
    trimmed.as_bytes().to_vec()
}

pub(crate) fn resolve_k8s_auth(cfg: &ServerConfig) -> Result<ResolvedK8sAuth, String> {
    let is_kubeconfig = (cfg.k8s_auth_mode == "kubeconfig" || cfg.k8s_auth_mode.is_empty())
        && (!cfg.k8s_kubeconfig_data.trim().is_empty()
            || !cfg.k8s_kubeconfig_path.trim().is_empty());

    if is_kubeconfig {
        let raw_yaml = if !cfg.k8s_kubeconfig_data.trim().is_empty() {
            cfg.k8s_kubeconfig_data.clone()
        } else {
            fs::read_to_string(cfg.k8s_kubeconfig_path.trim())
                .map_err(|e| format!("读取 Kubeconfig 文件失败: {}", e))?
        };
        let doc: Value = serde_yaml::from_str(&raw_yaml)
            .map_err(|e| format!("解析 Kubeconfig 文本配置失败: {}", e))?;

        let ctx_name = if !cfg.k8s_context.trim().is_empty() {
            cfg.k8s_context.trim().to_string()
        } else {
            doc.get("current-context")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        };

        let mut cluster_name = String::new();
        let mut user_name = String::new();
        let mut namespace = cfg.k8s_namespace.clone();

        if let Some(ctx_arr) = doc.get("contexts").and_then(|v| v.as_array()) {
            let chosen = ctx_arr
                .iter()
                .find(|c| c.get("name").and_then(|n| n.as_str()) == Some(&ctx_name))
                .or_else(|| ctx_arr.first());

            if let Some(c_item) = chosen {
                if let Some(ctx_obj) = c_item.get("context") {
                    cluster_name = ctx_obj
                        .get("cluster")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    user_name = ctx_obj
                        .get("user")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    if namespace.is_empty() {
                        namespace = ctx_obj
                            .get("namespace")
                            .and_then(|v| v.as_str())
                            .unwrap_or("default")
                            .to_string();
                    }
                }
            }
        }

        let mut api_server = String::new();
        let mut ca_pem = Vec::new();
        let mut insecure = cfg.k8s_insecure_skip_tls;

        if let Some(cl_arr) = doc.get("clusters").and_then(|v| v.as_array()) {
            let chosen = cl_arr
                .iter()
                .find(|c| c.get("name").and_then(|n| n.as_str()) == Some(&cluster_name))
                .or_else(|| cl_arr.first());
            if let Some(cl_item) = chosen {
                if let Some(cl_obj) = cl_item.get("cluster") {
                    api_server = cl_obj
                        .get("server")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    if cl_obj
                        .get("insecure-skip-tls-verify")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false)
                    {
                        insecure = true;
                    }
                    if let Some(ca_b64) = cl_obj
                        .get("certificate-authority-data")
                        .and_then(|v| v.as_str())
                    {
                        ca_pem = load_bytes_or_base64_or_file(ca_b64);
                    } else if let Some(ca_file) =
                        cl_obj.get("certificate-authority").and_then(|v| v.as_str())
                    {
                        ca_pem = load_bytes_or_base64_or_file(ca_file);
                    }
                }
            }
        }

        let mut bearer_token = String::new();
        let mut cert_pem = Vec::new();
        let mut key_pem = Vec::new();

        if let Some(u_arr) = doc.get("users").and_then(|v| v.as_array()) {
            let chosen = u_arr
                .iter()
                .find(|u| u.get("name").and_then(|n| n.as_str()) == Some(&user_name))
                .or_else(|| u_arr.first());
            if let Some(u_item) = chosen {
                if let Some(u_obj) = u_item.get("user") {
                    if let Some(t) = u_obj.get("token").and_then(|v| v.as_str()) {
                        bearer_token = t.trim().to_string();
                    }
                    if let Some(cert_b64) =
                        u_obj.get("client-certificate-data").and_then(|v| v.as_str())
                    {
                        cert_pem = load_bytes_or_base64_or_file(cert_b64);
                    } else if let Some(cert_file) =
                        u_obj.get("client-certificate").and_then(|v| v.as_str())
                    {
                        cert_pem = load_bytes_or_base64_or_file(cert_file);
                    }
                    if let Some(key_b64) = u_obj.get("client-key-data").and_then(|v| v.as_str()) {
                        key_pem = load_bytes_or_base64_or_file(key_b64);
                    } else if let Some(key_file) = u_obj.get("client-key").and_then(|v| v.as_str())
                    {
                        key_pem = load_bytes_or_base64_or_file(key_file);
                    }
                }
            }
        }

        if api_server.is_empty() {
            return Err("Kubeconfig 中未找到有效的集群 API Server 地址".to_string());
        }

        Ok(ResolvedK8sAuth {
            api_server,
            bearer_token,
            ca_pem,
            cert_pem,
            key_pem,
            insecure,
            namespace: if namespace.is_empty() {
                "default".to_string()
            } else {
                namespace
            },
        })
    } else {
        let mut api_server = if !cfg.k8s_api_server.trim().is_empty() {
            cfg.k8s_api_server.trim().to_string()
        } else {
            cfg.host.trim().to_string()
        };
        if api_server.is_empty() {
            return Err("Kubernetes API Server 地址或 Kubeconfig 不能为空".to_string());
        }
        if !api_server.starts_with("http://") && !api_server.starts_with("https://") {
            api_server = format!("https://{}", api_server);
        }

        let bearer_token = if !cfg.k8s_bearer_token.trim().is_empty() {
            cfg.k8s_bearer_token.trim().to_string()
        } else {
            cfg.password.trim().to_string()
        };

        let ca_pem = load_bytes_or_base64_or_file(&cfg.k8s_ca_data);
        let cert_pem = load_bytes_or_base64_or_file(&cfg.k8s_cert_data);
        let key_pem = load_bytes_or_base64_or_file(&cfg.k8s_key_data);

        Ok(ResolvedK8sAuth {
            api_server,
            bearer_token,
            ca_pem,
            cert_pem,
            key_pem,
            insecure: cfg.k8s_insecure_skip_tls,
            namespace: if cfg.k8s_namespace.is_empty() {
                "default".to_string()
            } else {
                cfg.k8s_namespace.clone()
            },
        })
    }
}

pub(crate) fn str_at(v: &Value, path: &[&str]) -> Option<String> {
    let mut cur = v;
    for p in path {
        cur = cur.get(*p)?;
    }
    cur.as_str().map(|s| s.to_string())
}

pub(crate) fn i32_at(v: &Value, path: &[&str]) -> i32 {
    let mut cur = v;
    for p in path {
        match cur.get(*p) {
            Some(next) => cur = next,
            None => return 0,
        }
    }
    cur.as_i64().unwrap_or(0) as i32
}

pub(crate) fn map_at(v: &Value, path: &[&str]) -> HashMap<String, String> {
    let mut cur = v;
    for p in path {
        match cur.get(*p) {
            Some(next) => cur = next,
            None => return HashMap::new(),
        }
    }
    let mut out = HashMap::new();
    if let Some(obj) = cur.as_object() {
        for (k, val) in obj {
            if let Some(s) = val.as_str() {
                out.insert(k.clone(), s.to_string());
            }
        }
    }
    out
}

pub(crate) fn is_node_ready(n: &Value) -> bool {
    if let Some(conds) = n
        .get("status")
        .and_then(|s| s.get("conditions"))
        .and_then(|c| c.as_array())
    {
        for c in conds {
            if str_at(c, &["type"]).as_deref() == Some("Ready")
                && str_at(c, &["status"]).as_deref() == Some("True")
            {
                return true;
            }
        }
    }
    false
}

pub(crate) fn extract_container_state(state_opt: Option<&Value>) -> (String, String) {
    let Some(st) = state_opt else {
        return ("unknown".to_string(), String::new());
    };
    if st.get("running").is_some() {
        return ("running".to_string(), String::new());
    }
    if let Some(w) = st.get("waiting") {
        return (
            "waiting".to_string(),
            str_at(w, &["reason"]).unwrap_or_default(),
        );
    }
    if let Some(t) = st.get("terminated") {
        return (
            "terminated".to_string(),
            str_at(t, &["reason"]).unwrap_or_default(),
        );
    }
    ("unknown".to_string(), String::new())
}

pub(crate) fn format_k8s_time(ts: &str) -> String {
    if ts.is_empty() {
        return String::new();
    }
    if let Ok(dt) = DateTime::parse_from_rfc3339(ts) {
        return dt.format("%Y-%m-%d %H:%M:%S").to_string();
    }
    ts.to_string()
}

pub(crate) fn format_k8s_age(ts: &str) -> String {
    let Ok(dt) = DateTime::parse_from_rfc3339(ts) else {
        return String::new();
    };
    let secs = (Utc::now() - dt.with_timezone(&Utc)).num_seconds().max(0);
    if secs >= 48 * 3600 {
        format!("{}d", secs / 86400)
    } else if secs >= 3600 {
        format!("{}h", secs / 3600)
    } else if secs >= 60 {
        format!("{}m", secs / 60)
    } else {
        format!("{}s", secs)
    }
}

pub(crate) fn format_k8s_memory_gib(mem_str: &str) -> String {
    let trimmed = mem_str.trim();
    if trimmed.is_empty() {
        return "0.0 GiB".to_string();
    }
    let bytes: f64 = if let Some(ki) = trimmed.strip_suffix("Ki") {
        ki.parse::<f64>().unwrap_or(0.0) * 1024.0
    } else if let Some(mi) = trimmed.strip_suffix("Mi") {
        mi.parse::<f64>().unwrap_or(0.0) * 1024.0 * 1024.0
    } else if let Some(gi) = trimmed.strip_suffix("Gi") {
        gi.parse::<f64>().unwrap_or(0.0) * 1024.0 * 1024.0 * 1024.0
    } else {
        trimmed.parse::<f64>().unwrap_or(0.0)
    };
    format!("{:.1} GiB", bytes / (1024.0 * 1024.0 * 1024.0))
}

pub(crate) fn extract_k8s_error(code: u16, body: &str) -> String {
    if let Ok(v) = serde_json::from_str::<Value>(body) {
        if let Some(msg) = v.get("message").and_then(|x| x.as_str()) {
            return msg.to_string();
        }
    }
    if body.trim().is_empty() {
        format!("HTTP {}", code)
    } else {
        format!("HTTP {}: {}", code, body)
    }
}

pub(crate) fn resolve_resource_paths(
    kind: &str,
    api_version: &str,
    namespace: &str,
    name: &str,
) -> Result<(String, String, String, String), String> {
    let k_lower = kind.trim().to_lowercase();
    let ns = if namespace.is_empty() {
        "default"
    } else {
        namespace
    };

    let (base_prefix, plural, resolved_api_ver, canonical_kind, namespaced) =
        match k_lower.as_str() {
            "pod" | "pods" => ("/api/v1", "pods", "v1", "Pod", true),
            "service" | "services" | "svc" => ("/api/v1", "services", "v1", "Service", true),
            "configmap" | "configmaps" | "cm" => {
                ("/api/v1", "configmaps", "v1", "ConfigMap", true)
            }
            "secret" | "secrets" => ("/api/v1", "secrets", "v1", "Secret", true),
            "pvc" | "persistentvolumeclaim" | "persistentvolumeclaims" => (
                "/api/v1",
                "persistentvolumeclaims",
                "v1",
                "PersistentVolumeClaim",
                true,
            ),
            "serviceaccount" | "serviceaccounts" | "sa" => {
                ("/api/v1", "serviceaccounts", "v1", "ServiceAccount", true)
            }
            "namespace" | "namespaces" | "ns" => {
                ("/api/v1", "namespaces", "v1", "Namespace", false)
            }
            "node" | "nodes" => ("/api/v1", "nodes", "v1", "Node", false),
            "pv" | "persistentvolume" | "persistentvolumes" => (
                "/api/v1",
                "persistentvolumes",
                "v1",
                "PersistentVolume",
                false,
            ),
            "deployment" | "deployments" | "deploy" => (
                "/apis/apps/v1",
                "deployments",
                "apps/v1",
                "Deployment",
                true,
            ),
            "statefulset" | "statefulsets" | "sts" => (
                "/apis/apps/v1",
                "statefulsets",
                "apps/v1",
                "StatefulSet",
                true,
            ),
            "daemonset" | "daemonsets" | "ds" => {
                ("/apis/apps/v1", "daemonsets", "apps/v1", "DaemonSet", true)
            }
            "replicaset" | "replicasets" | "rs" => (
                "/apis/apps/v1",
                "replicasets",
                "apps/v1",
                "ReplicaSet",
                true,
            ),
            "ingress" | "ingresses" | "ing" => (
                "/apis/networking.k8s.io/v1",
                "ingresses",
                "networking.k8s.io/v1",
                "Ingress",
                true,
            ),
            "networkpolicy" | "networkpolicies" => (
                "/apis/networking.k8s.io/v1",
                "networkpolicies",
                "networking.k8s.io/v1",
                "NetworkPolicy",
                true,
            ),
            "job" | "jobs" => ("/apis/batch/v1", "jobs", "batch/v1", "Job", true),
            "cronjob" | "cronjobs" | "cj" => {
                ("/apis/batch/v1", "cronjobs", "batch/v1", "CronJob", true)
            }
            "role" | "roles" => (
                "/apis/rbac.authorization.k8s.io/v1",
                "roles",
                "rbac.authorization.k8s.io/v1",
                "Role",
                true,
            ),
            "rolebinding" | "rolebindings" => (
                "/apis/rbac.authorization.k8s.io/v1",
                "rolebindings",
                "rbac.authorization.k8s.io/v1",
                "RoleBinding",
                true,
            ),
            "clusterrole" | "clusterroles" => (
                "/apis/rbac.authorization.k8s.io/v1",
                "clusterroles",
                "rbac.authorization.k8s.io/v1",
                "ClusterRole",
                false,
            ),
            "clusterrolebinding" | "clusterrolebindings" => (
                "/apis/rbac.authorization.k8s.io/v1",
                "clusterrolebindings",
                "rbac.authorization.k8s.io/v1",
                "ClusterRoleBinding",
                false,
            ),
            "storageclass" | "storageclasses" | "sc" => (
                "/apis/storage.k8s.io/v1",
                "storageclasses",
                "storage.k8s.io/v1",
                "StorageClass",
                false,
            ),
            "horizontalpodautoscaler" | "horizontalpodautoscalers" | "hpa" => (
                "/apis/autoscaling/v2",
                "horizontalpodautoscalers",
                "autoscaling/v2",
                "HorizontalPodAutoscaler",
                true,
            ),
            _ => {
                if api_version.is_empty() {
                    return Err(format!("不支持的资源类型: {}", kind));
                }
                let prefix = if api_version.contains('/') {
                    format!("/apis/{}", api_version)
                } else {
                    format!("/api/{}", api_version)
                };
                let plural_str = if k_lower.ends_with('s') {
                    k_lower.clone()
                } else {
                    format!("{}s", k_lower)
                };
                let coll = format!("{}/namespaces/{}/{}", prefix, ns, plural_str);
                let item = format!("{}/{}", coll, name);
                return Ok((coll, item, api_version.to_string(), kind.to_string()));
            }
        };

    let coll_path = if namespaced {
        format!("{}/namespaces/{}/{}", base_prefix, ns, plural)
    } else {
        format!("{}/{}", base_prefix, plural)
    };
    let item_path = format!("{}/{}", coll_path, name);
    Ok((
        coll_path,
        item_path,
        resolved_api_ver.to_string(),
        canonical_kind.to_string(),
    ))
}

pub(crate) fn parse_yaml_documents(yaml_content: &str) -> Result<Vec<Value>, String> {
    let mut docs = Vec::new();
    for document in serde_yaml::Deserializer::from_str(yaml_content) {
        let val = Value::deserialize(document)
            .map_err(|e| format!("解析 YAML 语法失败: {}", e))?;
        if !val.is_null() {
            docs.push(val);
        }
    }
    Ok(docs)
}

pub(crate) fn normalize_typemeta(doc: &mut Value) {
    if let Some(map) = doc.as_object_mut() {
        if let Some(Value::Object(tm)) = map.remove("typemeta") {
            for (k, v) in tm {
                map.entry(k).or_insert(v);
            }
        }
    }
}

pub fn parse_yaml_resource_summaries(
    yaml_content: &str,
) -> (Vec<K8sResourceItemSummary>, String) {
    let Ok(docs) = parse_yaml_documents(yaml_content) else {
        return (Vec::new(), String::new());
    };
    let mut list = Vec::new();
    let mut kind_counts: HashMap<String, usize> = HashMap::new();

    for mut doc in docs {
        normalize_typemeta(&mut doc);
        let kind = str_at(&doc, &["kind"])
            .or_else(|| str_at(&doc, &["Kind"]))
            .unwrap_or_default();
        let name = str_at(&doc, &["metadata", "name"]).unwrap_or_default();
        let namespace = str_at(&doc, &["metadata", "namespace"]).unwrap_or_default();
        if !kind.is_empty() && !name.is_empty() {
            *kind_counts.entry(kind.clone()).or_insert(0) += 1;
            list.push(K8sResourceItemSummary {
                kind,
                name,
                namespace,
            });
        }
    }

    let mut summary_parts: Vec<String> = kind_counts
        .into_iter()
        .map(|(k, c)| format!("{} ({})", k, c))
        .collect();
    summary_parts.sort();
    (list, summary_parts.join(", "))
}

