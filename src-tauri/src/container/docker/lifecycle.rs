use crate::container::docker::manager::DockerClient;
use crate::AppState;
use crate::core::{storage, ServerConfig};
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub async fn docker_connect(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let cfg = state
        .store
        .get(&id)
        .ok_or_else(|| "服务器配置不存在".to_string())?;
    storage::log_info(format!(
        "正在发起 Docker 连接: ServerID={}, 名称={}",
        cfg.id, cfg.name
    ));
    state.docker.connect(cfg).await?;
    Ok(true)
}

#[tauri::command]
pub async fn docker_close(state: State<'_, AppState>, id: String) -> Result<(), String> {
    storage::log_info(format!("关闭 Docker 连接: ServerID={}", id));
    state.docker.disconnect(&id).await
}

#[tauri::command]
pub async fn docker_test_connection(cfg: ServerConfig) -> Result<String, String> {
    let cli = DockerClient::connect(cfg).await?;
    let api_ver = cli.ping().await;
    cli.close().await;
    let ver = api_ver?;
    Ok(format!("连接成功！Docker API 版本: {}", ver))
}

#[tauri::command]
pub async fn docker_ping(state: State<'_, AppState>, id: String) -> Result<String, String> {
    let cli = state.docker.get_client(&id).await?;
    cli.ping().await
}

#[tauri::command]
pub async fn docker_get_overview(state: State<'_, AppState>, id: String) -> Result<Value, String> {
    let cli = state.docker.get_client(&id).await?;
    let ov = cli.get_overview().await?;
    serde_json::to_value(ov).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn docker_system_prune(
    state: State<'_, AppState>,
    id: String,
    prune_containers: bool,
    prune_images: bool,
    prune_volumes: bool,
    prune_networks: bool,
) -> Result<Value, String> {
    let cli = state.docker.get_client(&id).await?;
    let rep = cli
        .system_prune(prune_containers, prune_images, prune_volumes, prune_networks)
        .await?;
    serde_json::to_value(rep).map_err(|e| e.to_string())
}
