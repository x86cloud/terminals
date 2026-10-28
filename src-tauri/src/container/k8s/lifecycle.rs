use crate::container::k8s::manager::K8sClient;
use crate::container::k8s::utils::parse_kubeconfig_info;
use crate::core::{storage, ServerConfig};
use crate::AppState;
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub async fn k8s_connect(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let cfg = state
        .store
        .get(&id)
        .ok_or_else(|| "服务器配置不存在".to_string())?;
    storage::log_info(format!(
        "正在发起 K8s 集群连接: ServerID={}, 名称={}",
        cfg.id, cfg.name
    ));
    state.k8s.connect(cfg).await?;
    Ok(true)
}

#[tauri::command]
pub async fn k8s_close(state: State<'_, AppState>, id: String) -> Result<(), String> {
    storage::log_info(format!("关闭 K8s 连接: ServerID={}", id));
    state.k8s.disconnect(&id).await
}

#[tauri::command]
pub async fn k8s_test_connection(cfg: ServerConfig) -> Result<String, String> {
    let cli = K8sClient::connect(cfg).await?;
    let ping_res = cli.ping().await;
    if let Err(e) = ping_res {
        cli.close().await;
        return Err(format!("连接测试失败: {}", e));
    }
    let ov_res = cli.get_overview().await;
    cli.close().await;
    if let Ok(ov) = ov_res {
        return Ok(format!(
            "连接成功！Kubernetes 版本: {} ({}), 节点数: {}",
            ov.git_version, ov.platform, ov.nodes_total
        ));
    }
    Ok("连接成功！Kubernetes API Server 响应正常".to_string())
}

#[tauri::command]
pub async fn k8s_parse_kubeconfig(data: String, path: String) -> Result<Value, String> {
    let info = parse_kubeconfig_info(&data, &path)?;
    serde_json::to_value(info).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn k8s_ping(state: State<'_, AppState>, id: String) -> Result<String, String> {
    let cli = state.k8s.get_client(&id).await?;
    cli.ping().await?;
    Ok("ok".to_string())
}

#[tauri::command]
pub async fn k8s_get_overview(state: State<'_, AppState>, id: String) -> Result<Value, String> {
    let cli = state.k8s.get_client(&id).await?;
    let ov = cli.get_overview().await?;
    serde_json::to_value(ov).map_err(|e| e.to_string())
}

