use crate::container::docker::types::{ComposeServiceSpec, ComposeVolumeSpec};
use regex::Regex;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::OnceLock;

pub(crate) fn str_field(v: &Value, keys: &[&str]) -> String {
    for k in keys {
        if let Some(s) = v.get(*k).and_then(|x| x.as_str()) {
            return s.to_string();
        }
    }
    String::new()
}

pub(crate) fn i64_field(v: &Value, keys: &[&str]) -> i64 {
    for k in keys {
        if let Some(n) = v.get(*k).and_then(|x| x.as_i64()) {
            return n;
        }
    }
    0
}

pub(crate) fn bool_field(v: &Value, keys: &[&str]) -> bool {
    for k in keys {
        if let Some(b) = v.get(*k).and_then(|x| x.as_bool()) {
            return b;
        }
    }
    false
}

pub(crate) fn str_map_field(v: &Value, keys: &[&str]) -> HashMap<String, String> {
    for k in keys {
        if let Some(obj) = v.get(*k).and_then(|x| x.as_object()) {
            let mut map = HashMap::new();
            for (mk, mv) in obj {
                if let Some(s) = mv.as_str() {
                    map.insert(mk.clone(), s.to_string());
                }
            }
            return map;
        }
    }
    HashMap::new()
}

pub(crate) fn str_vec_field(v: &Value, keys: &[&str]) -> Vec<String> {
    for k in keys {
        if let Some(arr) = v.get(*k).and_then(|x| x.as_array()) {
            return arr
                .iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect();
        }
    }
    Vec::new()
}

pub(crate) fn format_bytes(b: i64) -> String {
    const UNIT: i64 = 1024;
    if b < UNIT {
        return format!("{} B", b);
    }
    let mut div = UNIT;
    let mut exp = 0usize;
    let mut n = b / UNIT;
    let units = ['K', 'M', 'G', 'T', 'P', 'E'];
    while n >= UNIT && exp + 1 < units.len() {
        div *= UNIT;
        exp += 1;
        n /= UNIT;
    }
    format!("{:.2} {}B", (b as f64) / (div as f64), units[exp])
}

pub(crate) fn sanitize_project_name(name: &str) -> String {
    let lower = name.trim().to_lowercase();
    lower
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
        .collect()
}

pub(crate) fn sanitize_image_name(image: &str) -> String {
    let mut img = image
        .trim()
        .trim_matches(|c| c == '"' || c == '\'' || c == '`' || c == '\r' || c == '\n' || c == '\t')
        .to_string();
    if img.ends_with(':') {
        img.pop();
        img.push_str(":latest");
    }
    if let Some(stripped) = img.strip_prefix('/') {
        img = stripped.to_string();
    }
    img
}

pub(crate) fn compute_service_config_hash(svc: &ComposeServiceSpec) -> String {
    let bytes = serde_json::to_vec(svc).unwrap_or_default();
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    hex::encode(hasher.finalize())
}

fn env_braced_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"\$\{([a-zA-Z_][a-zA-Z0-9_]*)(?:(:[-?+]|[-?+])([^}]*))?\}")
            .expect("valid braced env regex")
    })
}

fn env_simple_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\$([a-zA-Z_][a-zA-Z0-9_]*)").expect("valid simple env regex"))
}

pub(crate) fn interpolate_env(content: &str, env_vars: &HashMap<String, String>) -> String {
    let mut merged: HashMap<String, String> = std::env::vars().collect();
    for (k, v) in env_vars {
        merged.insert(k.clone(), v.clone());
    }

    let escaped = content.replace("$$", "\x00ESCAPED_DOLLAR\x00");
    let re = env_braced_regex();

    let step1 = re
        .replace_all(&escaped, |caps: &regex::Captures| {
            let var_name = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let op = caps.get(2).map(|m| m.as_str()).unwrap_or("");
            let operand = caps.get(3).map(|m| m.as_str()).unwrap_or("");
            let val_opt = merged.get(var_name);

            match op {
                ":-" => match val_opt {
                    Some(v) if !v.is_empty() => v.clone(),
                    _ => operand.to_string(),
                },
                "-" => match val_opt {
                    Some(v) => v.clone(),
                    None => operand.to_string(),
                },
                ":?" => match val_opt {
                    Some(v) if !v.is_empty() => v.clone(),
                    _ => operand.to_string(),
                },
                "?" => match val_opt {
                    Some(v) => v.clone(),
                    None => operand.to_string(),
                },
                ":+" => match val_opt {
                    Some(v) if !v.is_empty() => operand.to_string(),
                    _ => String::new(),
                },
                "+" => match val_opt {
                    Some(_) => operand.to_string(),
                    None => String::new(),
                },
                _ => val_opt.cloned().unwrap_or_default(),
            }
        })
        .to_string();

    let re_simple = env_simple_regex();
    let step2 = re_simple
        .replace_all(&step1, |caps: &regex::Captures| {
            let var_name = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            merged.get(var_name).cloned().unwrap_or_default()
        })
        .to_string();

    step2.replace("\x00ESCAPED_DOLLAR\x00", "$")
}

pub(crate) fn sort_services_by_dependencies(
    services: &HashMap<String, ComposeServiceSpec>,
) -> Result<Vec<String>, String> {
    let mut result = Vec::new();
    let mut visited = HashMap::new();
    let mut temp = HashMap::new();

    fn visit(
        name: &str,
        services: &HashMap<String, ComposeServiceSpec>,
        visited: &mut HashMap<String, bool>,
        temp: &mut HashMap<String, bool>,
        result: &mut Vec<String>,
    ) -> Result<(), String> {
        if temp.get(name).copied().unwrap_or(false) {
            return Err(format!("检测到循环依赖: {}", name));
        }
        if visited.get(name).copied().unwrap_or(false) {
            return Ok(());
        }
        temp.insert(name.to_string(), true);

        if let Some(svc) = services.get(name) {
            let deps = parse_string_slice_or_map(&svc.depends_on);
            for dep in deps {
                if services.contains_key(&dep) {
                    visit(&dep, services, visited, temp, result)?;
                }
            }
        }

        temp.insert(name.to_string(), false);
        visited.insert(name.to_string(), true);
        result.push(name.to_string());
        Ok(())
    }

    let mut names: Vec<String> = services.keys().cloned().collect();
    names.sort();
    for name in names {
        if !visited.get(&name).copied().unwrap_or(false) {
            visit(&name, services, &mut visited, &mut temp, &mut result)?;
        }
    }
    Ok(result)
}

pub(crate) fn parse_port_strings(
    port_str_list: &[String],
) -> Result<(serde_json::Map<String, Value>, serde_json::Map<String, Value>), String> {
    let mut port_map = serde_json::Map::new();
    let mut exposed_ports = serde_json::Map::new();

    for p in port_str_list {
        let trimmed = p.trim();
        if trimmed.is_empty() {
            continue;
        }
        let parts: Vec<&str> = trimmed.split(':').collect();
        let (host_ip, host_port, mut container_port_str) = match parts.len() {
            1 => ("", parts[0], parts[0]),
            2 => ("", parts[0], parts[1]),
            3 => (parts[0], parts[1], parts[2]),
            _ => continue,
        };
        let mut proto = "tcp";
        if let Some((cp, pr)) = container_port_str.split_once('/') {
            container_port_str = cp;
            proto = pr;
        }
        let key = format!("{}/{}", container_port_str, proto);
        exposed_ports.insert(key.clone(), json!({}));
        let entry = port_map
            .entry(key)
            .or_insert_with(|| Value::Array(Vec::new()));
        if let Some(arr) = entry.as_array_mut() {
            arr.push(json!({
                "HostIp": host_ip,
                "HostPort": host_port,
            }));
        }
    }

    Ok((port_map, exposed_ports))
}

pub(crate) fn parse_compose_ports(
    ports: &Option<Value>,
) -> Result<(serde_json::Map<String, Value>, serde_json::Map<String, Value>), String> {
    let mut port_strs = Vec::new();
    if let Some(Value::Array(arr)) = ports {
        for item in arr {
            match item {
                Value::String(s) => port_strs.push(s.clone()),
                Value::Number(n) => port_strs.push(n.to_string()),
                Value::Object(m) => {
                    let target = val_to_str(m.get("target"));
                    let published = val_to_str(m.get("published"));
                    let proto = m
                        .get("protocol")
                        .and_then(|x| x.as_str())
                        .unwrap_or("tcp");
                    if !target.is_empty() {
                        if !published.is_empty() {
                            port_strs.push(format!("{}:{}/{}", published, target, proto));
                        } else {
                            port_strs.push(format!("{}/{}", target, proto));
                        }
                    }
                }
                _ => {}
            }
        }
    }
    parse_port_strings(&port_strs)
}

pub(crate) fn val_to_str(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        _ => String::new(),
    }
}

pub(crate) fn parse_compose_env(env: &Option<Value>) -> Vec<String> {
    let mut list = Vec::new();
    match env {
        Some(Value::Array(arr)) => {
            for item in arr {
                if let Some(s) = item.as_str() {
                    if !s.is_empty() {
                        list.push(s.to_string());
                    }
                }
            }
        }
        Some(Value::Object(map)) => {
            for (k, v) in map {
                list.push(format!("{}={}", k, val_to_str(Some(v))));
            }
        }
        _ => {}
    }
    list
}

pub(crate) fn parse_compose_volumes(
    project_name: &str,
    vols: &Option<Value>,
    top_volumes: &HashMap<String, ComposeVolumeSpec>,
) -> (Vec<Value>, Vec<String>) {
    let mut mounts = Vec::new();
    let mut binds = Vec::new();
    let mut vol_list = Vec::new();

    if let Some(Value::Array(arr)) = vols {
        for item in arr {
            match item {
                Value::String(s) => vol_list.push(s.clone()),
                Value::Object(m) => {
                    let m_type = val_to_str(m.get("type"));
                    let source = val_to_str(m.get("source"));
                    let target = val_to_str(m.get("target"));
                    let read_only = m
                        .get("read_only")
                        .and_then(|x| x.as_bool())
                        .unwrap_or(false);
                    if m_type == "volume" {
                        let actual = resolve_volume_name(project_name, &source, top_volumes);
                        mounts.push(json!({
                            "Type": "volume",
                            "Source": actual,
                            "Target": target,
                            "ReadOnly": read_only,
                        }));
                    } else {
                        mounts.push(json!({
                            "Type": "bind",
                            "Source": source,
                            "Target": target,
                            "ReadOnly": read_only,
                        }));
                    }
                }
                _ => {}
            }
        }
    }

    for v in vol_list {
        let trimmed = v.trim();
        if trimmed.is_empty() {
            continue;
        }
        let parts: Vec<&str> = trimmed.split(':').collect();
        if parts.len() >= 2 {
            let source = parts[0];
            let target = parts[1];
            let ro = parts.len() >= 3 && parts[2].contains("ro");

            if !source.starts_with('/')
                && !source.starts_with("./")
                && !source.starts_with("../")
                && !source.starts_with('~')
                && !source.contains('\\')
            {
                let actual = resolve_volume_name(project_name, source, top_volumes);
                mounts.push(json!({
                    "Type": "volume",
                    "Source": actual,
                    "Target": target,
                    "ReadOnly": ro,
                }));
            } else {
                binds.push(trimmed.to_string());
            }
        }
    }

    (mounts, binds)
}

pub(crate) fn resolve_volume_name(
    project_name: &str,
    source: &str,
    top_volumes: &HashMap<String, ComposeVolumeSpec>,
) -> String {
    if let Some(top_v) = top_volumes.get(source) {
        if top_v.external {
            if !top_v.name.is_empty() {
                return top_v.name.clone();
            }
            return source.to_string();
        }
        if !top_v.name.is_empty() {
            return top_v.name.clone();
        }
    }
    format!("{}_{}", project_name, source)
}

pub(crate) struct ServiceNetworkAttachment {
    pub(crate) network_id: String,
    pub(crate) aliases: Vec<String>,
    pub(crate) ipv4_address: String,
}

pub(crate) fn resolve_service_networks(
    project_name: &str,
    networks: &Option<Value>,
    network_map: &HashMap<String, String>,
) -> Vec<ServiceNetworkAttachment> {
    let mut attachments = Vec::new();
    match networks {
        Some(Value::Array(arr)) => {
            for item in arr {
                if let Some(n_name) = item.as_str() {
                    let net_id = network_map
                        .get(n_name)
                        .cloned()
                        .unwrap_or_else(|| format!("{}_{}", project_name, n_name));
                    attachments.push(ServiceNetworkAttachment {
                        network_id: net_id,
                        aliases: vec![n_name.to_string()],
                        ipv4_address: String::new(),
                    });
                }
            }
        }
        Some(Value::Object(map)) => {
            for (n_name, conf) in map {
                let net_id = network_map
                    .get(n_name)
                    .cloned()
                    .unwrap_or_else(|| format!("{}_{}", project_name, n_name));
                let mut aliases = Vec::new();
                let mut ipv4 = String::new();
                if let Some(c_map) = conf.as_object() {
                    if let Some(a_list) = c_map.get("aliases").and_then(|x| x.as_array()) {
                        for a in a_list {
                            if let Some(s) = a.as_str() {
                                aliases.push(s.to_string());
                            }
                        }
                    }
                    if let Some(ip) = c_map.get("ipv4_address").and_then(|x| x.as_str()) {
                        ipv4 = ip.to_string();
                    }
                }
                attachments.push(ServiceNetworkAttachment {
                    network_id: net_id,
                    aliases,
                    ipv4_address: ipv4,
                });
            }
        }
        _ => {}
    }
    attachments
}

pub(crate) fn parse_shm_size(val: &Option<Value>) -> i64 {
    match val {
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0),
        Some(Value::String(s)) => {
            let v = s.trim().to_lowercase();
            if v.ends_with("gb") || v.ends_with('g') {
                let num = v.trim_end_matches(['g', 'b']).parse::<i64>().unwrap_or(0);
                num * 1024 * 1024 * 1024
            } else if v.ends_with("mb") || v.ends_with('m') {
                let num = v.trim_end_matches(['m', 'b']).parse::<i64>().unwrap_or(0);
                num * 1024 * 1024
            } else if v.ends_with("kb") || v.ends_with('k') {
                let num = v.trim_end_matches(['k', 'b']).parse::<i64>().unwrap_or(0);
                num * 1024
            } else {
                v.parse::<i64>().unwrap_or(0)
            }
        }
        _ => 0,
    }
}

pub(crate) fn parse_string_slice_or_string(input: &Option<Value>) -> Vec<String> {
    match input {
        Some(Value::String(s)) => s.split_whitespace().map(|x| x.to_string()).collect(),
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|x| x.as_str().map(|s| s.to_string()))
            .collect(),
        _ => Vec::new(),
    }
}

pub(crate) fn parse_string_slice_or_map(input: &Option<Value>) -> Vec<String> {
    match input {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(|x| x.as_str().map(|s| s.to_string()))
            .collect(),
        Some(Value::Object(map)) => map.keys().cloned().collect(),
        _ => Vec::new(),
    }
}

