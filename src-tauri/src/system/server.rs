use crate::core::{ConfigIOResult, ServerConfig, ServerGroup};
use crate::storage;
use crate::AppState;
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use tauri::State;
use uuid::Uuid;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServersExportData {
    version: String,
    exported_at: String,
    servers: Vec<ServerConfig>,
    groups: Vec<ServerGroup>,
}

#[tauri::command]
pub async fn list_servers(state: State<'_, AppState>) -> Result<Vec<ServerConfig>, String> {
    Ok(state.store.list())
}

#[tauri::command]
pub async fn save_server(
    state: State<'_, AppState>,
    cfg: ServerConfig,
) -> Result<ServerConfig, String> {
    state.store.save(cfg)
}

#[tauri::command]
pub async fn delete_server(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.store.delete(&id)
}

#[tauri::command]
pub async fn select_private_key() -> Result<String, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("选择 SSH 私钥文件")
        .pick_file()
        .await;
    Ok(file
        .map(|f| f.path().to_string_lossy().to_string())
        .unwrap_or_default())
}

#[tauri::command]
pub async fn select_cert_file() -> Result<String, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("选择证书文件 (CA/Cert/Key)")
        .pick_file()
        .await;
    Ok(file
        .map(|f| f.path().to_string_lossy().to_string())
        .unwrap_or_default())
}

#[tauri::command]
pub async fn list_groups(state: State<'_, AppState>) -> Result<Vec<ServerGroup>, String> {
    Ok(state.store.list_groups())
}

#[tauri::command]
pub async fn save_group(
    state: State<'_, AppState>,
    g: ServerGroup,
) -> Result<ServerGroup, String> {
    state.store.save_group(g)
}

#[tauri::command]
pub async fn delete_group(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.store.delete_group(&id)
}

#[tauri::command]
pub async fn move_server_to_group(
    state: State<'_, AppState>,
    server_id: String,
    group_id: String,
) -> Result<(), String> {
    state.store.move_server_to_group(&server_id, &group_id)
}

#[tauri::command]
pub async fn export_servers_config(state: State<'_, AppState>) -> Result<ConfigIOResult, String> {
    let servers = state.store.list();
    let groups = state.store.list_groups();
    let default_filename = format!(
        "terminals_backup_{}.json",
        Local::now().format("%Y%m%d_%H%M%S")
    );

    let file = rfd::AsyncFileDialog::new()
        .set_title("导出连接与分组配置")
        .set_file_name(&default_filename)
        .save_file()
        .await;

    let file_path = match file {
        Some(f) => f.path().to_path_buf(),
        None => {
            return Ok(ConfigIOResult {
                cancelled: true,
                ..Default::default()
            })
        }
    };

    let data = ServersExportData {
        version: "1.0".to_string(),
        exported_at: Local::now().to_rfc3339(),
        servers: servers.clone(),
        groups: groups.clone(),
    };

    storage::write_json_atomic(&file_path, &data)?;

    let path_str = file_path.to_string_lossy().to_string();
    Ok(ConfigIOResult {
        success: true,
        cancelled: false,
        file_path: path_str,
        servers_count: servers.len(),
        groups_count: groups.len(),
        message: format!(
            "已成功导出 {} 个连接与 {} 个分组",
            servers.len(),
            groups.len()
        ),
    })
}

#[tauri::command]
pub async fn import_servers_config(state: State<'_, AppState>) -> Result<ConfigIOResult, String> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("选择要导入的配置文件 (.json)")
        .add_filter("JSON", &["json"])
        .pick_file()
        .await;

    let file_path = match file {
        Some(f) => f.path().to_path_buf(),
        None => {
            return Ok(ConfigIOResult {
                cancelled: true,
                ..Default::default()
            })
        }
    };

    let raw_bytes =
        fs::read(&file_path).map_err(|e| format!("读取配置文件失败: {}", e))?;

    let mut export_data: ServersExportData =
        if let Ok(d) = serde_json::from_slice::<ServersExportData>(&raw_bytes) {
            if d.servers.is_empty() && d.groups.is_empty() {
                let legacy: Vec<ServerConfig> = serde_json::from_slice(&raw_bytes)
                    .map_err(|_| "配置文件格式错误，无法识别有效的连接或分组数据".to_string())?;
                ServersExportData {
                    version: "1.0".to_string(),
                    exported_at: String::new(),
                    servers: legacy,
                    groups: Vec::new(),
                }
            } else {
                d
            }
        } else {
            let legacy: Vec<ServerConfig> = serde_json::from_slice(&raw_bytes)
                .map_err(|_| "配置文件格式错误，无法识别有效的连接或分组数据".to_string())?;
            ServersExportData {
                version: "1.0".to_string(),
                exported_at: String::new(),
                servers: legacy,
                groups: Vec::new(),
            }
        };

    let existing_servers = state.store.list();
    let existing_groups = state.store.list_groups();

    let mut existing_server_ids: HashSet<String> =
        existing_servers.into_iter().map(|s| s.id).collect();
    let mut existing_group_ids: HashSet<String> =
        existing_groups.iter().map(|g| g.id.clone()).collect();
    let mut existing_group_names: HashMap<String, String> = existing_groups
        .into_iter()
        .map(|g| (g.name, g.id))
        .collect();

    let mut group_id_map: HashMap<String, String> = HashMap::new();
    let mut imported_groups_count = 0usize;

    for mut grp in export_data.groups.drain(..) {
        let old_id = grp.id.clone();
        let trimmed = grp.name.trim().to_string();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(target_id) = existing_group_names.get(&trimmed) {
            group_id_map.insert(old_id, target_id.clone());
            continue;
        }
        if existing_group_ids.contains(&grp.id) || grp.id.is_empty() {
            grp.id = Uuid::new_v4().to_string();
        }
        if let Ok(saved_group) = state.store.save_group(grp) {
            existing_group_ids.insert(saved_group.id.clone());
            existing_group_names.insert(saved_group.name.clone(), saved_group.id.clone());
            group_id_map.insert(old_id, saved_group.id);
            imported_groups_count += 1;
        }
    }

    let mut imported_servers_count = 0usize;
    for mut srv in export_data.servers.drain(..) {
        if existing_server_ids.contains(&srv.id) || srv.id.is_empty() {
            srv.id = Uuid::new_v4().to_string();
        }
        if !srv.group_id.is_empty() {
            if let Some(new_gid) = group_id_map.get(&srv.group_id) {
                srv.group_id = new_gid.clone();
            } else if !existing_group_ids.contains(&srv.group_id) {
                srv.group_id.clear();
            }
        }
        if srv.name.is_empty() {
            srv.name = srv.host.clone();
        }
        if let Ok(saved_srv) = state.store.save(srv) {
            existing_server_ids.insert(saved_srv.id);
            imported_servers_count += 1;
        }
    }

    Ok(ConfigIOResult {
        success: true,
        cancelled: false,
        file_path: file_path.to_string_lossy().to_string(),
        servers_count: imported_servers_count,
        groups_count: imported_groups_count,
        message: format!(
            "成功导入 {} 个连接配置与 {} 个分组",
            imported_servers_count, imported_groups_count
        ),
    })
}

