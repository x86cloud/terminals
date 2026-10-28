use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use crate::container::docker::manager::{DockerClient, DockerManager};
use crate::AppState;
use futures_util::StreamExt;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use uuid::Uuid;

pub struct DockerExecSession {
    pub id: String,
    pub server_id: String,
    pub container_id: String,
    pub exec_id: String,
    pub(crate) input: Arc<Mutex<Option<Pin<Box<dyn tokio::io::AsyncWrite + Send>>>>>,
}

impl DockerExecSession {
    pub async fn write(&self, data: &str) -> Result<(), String> {
        let mut guard = self.input.lock().await;
        let writer = guard
            .as_mut()
            .ok_or_else(|| "终端会话已关闭".to_string())?;
        writer
            .write_all(data.as_bytes())
            .await
            .map_err(|e| format!("写入容器终端失败: {}", e))?;
        let _ = writer.flush().await;
        Ok(())
    }

    pub async fn close(&self) {
        let mut guard = self.input.lock().await;
        if let Some(mut w) = guard.take() {
            let _ = w.shutdown().await;
        }
    }
}

impl DockerManager {
    pub async fn start_exec(
        &self,
        app: AppHandle,
        docker_cli: &DockerClient,
        container_id: &str,
        command: &str,
        cols: u32,
        rows: u32,
    ) -> Result<String, String> {
        let cmd_str = if command.trim().is_empty() {
            "/bin/sh".to_string()
        } else {
            command.trim().to_string()
        };
        let cols_val = if cols == 0 { 120 } else { cols };
        let rows_val = if rows == 0 { 32 } else { rows };

        let exec_opts = bollard::exec::CreateExecOptions {
            attach_stdin: Some(true),
            attach_stdout: Some(true),
            attach_stderr: Some(true),
            tty: Some(true),
            cmd: Some(vec![cmd_str]),
            ..Default::default()
        };

        let created = docker_cli
            .cli
            .create_exec(container_id, exec_opts)
            .await
            .map_err(|e| format!("创建容器 Exec 任务失败: {}", e))?;

        let started = docker_cli
            .cli
            .start_exec(&created.id, None)
            .await
            .map_err(|e| format!("附加容器终端流失败: {}", e))?;

        let (mut output, input) = match started {
            bollard::exec::StartExecResults::Attached { output, input } => (output, input),
            bollard::exec::StartExecResults::Detached => {
                return Err("Exec 启动为非交互模式".to_string());
            }
        };

        let _ = docker_cli
            .cli
            .resize_exec(
                &created.id,
                bollard::exec::ResizeExecOptions {
                    height: rows_val as u16,
                    width: cols_val as u16,
                },
            )
            .await;

        let session_id = Uuid::new_v4().to_string();
        let session = Arc::new(DockerExecSession {
            id: session_id.clone(),
            server_id: docker_cli.cfg.id.clone(),
            container_id: container_id.to_string(),
            exec_id: created.id,
            input: Arc::new(Mutex::new(Some(input))),
        });

        self.exec_sessions
            .write()
            .await
            .insert(session_id.clone(), session.clone());

        let sessions_ref = self.exec_sessions.clone();
        let sid_clone = session_id.clone();

        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            let data_event = format!("docker:terminal:data:{}", sid_clone);
            let closed_event = format!("docker:terminal:closed:{}", sid_clone);

            while let Some(item) = output.next().await {
                match item {
                    Ok(log_output) => {
                        let bytes = log_output.into_bytes();
                        if !bytes.is_empty() {
                            let payload = BASE64.encode(&bytes);
                            let _ = app.emit(&data_event, payload);
                        }
                    }
                    Err(_) => break,
                }
            }

            session.close().await;
            sessions_ref.write().await.remove(&sid_clone);
            let _ = app.emit(&closed_event, "容器会话已退出".to_string());
        });

        Ok(session_id)
    }

    pub async fn exec_write(&self, session_id: &str, data: &str) -> Result<(), String> {
        let session = self
            .exec_sessions
            .read()
            .await
            .get(session_id)
            .cloned()
            .ok_or_else(|| "会话不存在或已关闭".to_string())?;
        session.write(data).await
    }

    pub async fn exec_resize(
        &self,
        docker_cli: &DockerClient,
        session_id: &str,
        cols: u32,
        rows: u32,
    ) -> Result<(), String> {
        if cols == 0 || rows == 0 {
            return Ok(());
        }
        let session = self
            .exec_sessions
            .read()
            .await
            .get(session_id)
            .cloned()
            .ok_or_else(|| "会话不存在".to_string())?;
        docker_cli
            .cli
            .resize_exec(
                &session.exec_id,
                bollard::exec::ResizeExecOptions {
                    height: rows as u16,
                    width: cols as u16,
                },
            )
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn exec_close(&self, session_id: &str) -> Result<(), String> {
        if let Some(session) = self.exec_sessions.write().await.remove(session_id) {
            session.close().await;
        }
        Ok(())
    }
}

// ======================== Tauri Commands ========================

#[tauri::command]
pub async fn docker_exec_start(
    app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
    container_id: String,
    command: String,
    cols: u32,
    rows: u32,
) -> Result<String, String> {
    let cli = state.docker.get_client(&server_id).await?;
    state
        .docker
        .start_exec(app, &cli, &container_id, &command, cols, rows)
        .await
}

#[tauri::command]
pub async fn docker_exec_write(
    state: State<'_, AppState>,
    exec_id: String,
    data: String,
) -> Result<(), String> {
    state.docker.exec_write(&exec_id, &data).await
}

#[tauri::command]
pub async fn docker_exec_resize(
    state: State<'_, AppState>,
    server_id: String,
    exec_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    let cli = state.docker.get_client(&server_id).await?;
    state.docker.exec_resize(&cli, &exec_id, cols, rows).await
}

#[tauri::command]
pub async fn docker_exec_close(
    state: State<'_, AppState>,
    exec_id: String,
) -> Result<(), String> {
    state.docker.exec_close(&exec_id).await
}
