use crate::core::ServerConfig;
use crate::ssh::tunnel::connect_russh;
use crate::ssh::types::SessionInfo;
use crate::storage;
use crate::AppState;
use serde_json::json;
use std::time::Instant;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn list_sessions(state: State<'_, AppState>) -> Result<Vec<SessionInfo>, String> {
    Ok(state.ssh.list_sessions().await)
}

#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
    cols: u32,
    rows: u32,
) -> Result<SessionInfo, String> {
    let cfg = state
        .store
        .get(&server_id)
        .ok_or_else(|| "服务器配置不存在".to_string())?;
    storage::log_info(format!(
        "正在发起 SSH 连接: ServerID={}, 主机={}:{}, 用户={}",
        cfg.id,
        cfg.host,
        cfg.display_port(),
        cfg.username
    ));
    let info = state.ssh.connect(app, cfg, cols, rows).await?;
    storage::log_info(format!("SSH 连接成功: SessionID={}", info.id));
    Ok(info)
}

#[tauri::command]
pub async fn ssh_connect_with_config(
    app: AppHandle,
    state: State<'_, AppState>,
    cfg: ServerConfig,
    cols: u32,
    rows: u32,
) -> Result<SessionInfo, String> {
    storage::log_info(format!(
        "使用临时配置发起 SSH 连接: 主机={}:{}, 用户={}",
        cfg.host,
        cfg.display_port(),
        cfg.username
    ));
    state.ssh.connect(app, cfg, cols, rows).await
}

#[tauri::command]
pub async fn ssh_test_connection(cfg: ServerConfig) -> Result<serde_json::Value, String> {
    cfg.validate()?;
    let port = cfg.display_port() as u16;
    let start = Instant::now();
    let session = connect_russh(
        &cfg.host,
        port,
        &cfg.username,
        &cfg.auth_type,
        &cfg.password,
        &cfg.private_key,
        &cfg.passphrase,
        8,
    )
    .await?;
    let latency = start.elapsed().as_millis() as i64;
    let _ = session
        .disconnect(russh::Disconnect::ByApplication, "Test complete", "en")
        .await;
    Ok(json!({
        "connected": true,
        "pingMs": latency,
    }))
}

#[tauri::command]
pub async fn ssh_disconnect(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    storage::log_info(format!("断开 SSH 会话: SessionID={}", session_id));
    state.ssh.remove_session(&session_id).await;
    let _ = app.emit("session:closed", &session_id);
    Ok(())
}

#[tauri::command]
pub async fn ssh_send_input(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    state.ssh.send_input(&session_id, &data).await
}

#[tauri::command]
pub async fn ssh_resize_terminal(
    state: State<'_, AppState>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    state.ssh.resize_terminal(&session_id, cols, rows).await
}

#[tauri::command]
pub async fn ssh_terminal_attach(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    state
        .ssh
        .attach_terminal(&app, &session_id, cols, rows)
        .await
}

