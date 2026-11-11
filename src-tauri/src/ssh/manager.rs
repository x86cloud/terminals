use crate::core::ServerConfig;
use crate::ssh::tunnel::{connect_russh, exec_ssh_command, SshClientHandler};
use crate::ssh::types::{
    join_remote, join_remote_relative, normalize_remote, parent_remote, shell_quote, SessionInfo,
    Transfer,
};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use chrono::Utc;
use russh::client;
use russh::ChannelMsg;
use russh_sftp::client::fs::File as SftpFile;
use russh_sftp::client::SftpSession;
use serde_json::json;
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{mpsc, watch, Mutex as TokioMutex, RwLock};
use uuid::Uuid;

pub const STATUS_RUNNING: &str = "running";
pub const STATUS_DONE: &str = "done";
pub const STATUS_ERROR: &str = "error";
pub const STATUS_CANCELED: &str = "canceled";
const MAX_TERMINAL_BUFFER: usize = 512 * 1024;

pub enum ShellCmd {
    Data(Vec<u8>),
    Resize(u32, u32),
    Close,
}

pub struct TerminalBufferState {
    pub buffer: Vec<u8>,
    pub attached: bool,
}

pub struct SshSession {
    pub id: String,
    pub cfg: ServerConfig,
    pub handle: Arc<client::Handle<SshClientHandler>>,
    pub home_dir: String,
    pub os_info: String,
    pub shell_tx: mpsc::UnboundedSender<ShellCmd>,
    pub sftp_cache: TokioMutex<Option<Arc<SftpSession>>>,
    pub closed: AtomicBool,
    pub buf_state: Arc<StdMutex<TerminalBufferState>>,
}

impl SshSession {
    pub fn info(&self) -> SessionInfo {
        SessionInfo {
            id: self.id.clone(),
            server_id: self.cfg.id.clone(),
            title: self.cfg.label(),
            host: self.cfg.host.clone(),
            port: self.cfg.display_port(),
            username: self.cfg.username.clone(),
            connected: !self.is_closed(),
            home_dir: self.home_dir.clone(),
            os_info: self.os_info.clone(),
        }
    }

    pub fn is_closed(&self) -> bool {
        self.closed.load(Ordering::SeqCst)
    }

    pub fn mark_closed(&self) -> bool {
        !self.closed.swap(true, Ordering::SeqCst)
    }

    pub async fn close(&self) {
        if self.mark_closed() {
            let _ = self.shell_tx.send(ShellCmd::Close);
            let mut sftp_guard = self.sftp_cache.lock().await;
            if let Some(sftp) = sftp_guard.take() {
                let _ = sftp.close().await;
            }
            if let Ok(mut b) = self.buf_state.lock() {
                b.buffer.clear();
            }
            let _ = self
                .handle
                .disconnect(russh::Disconnect::ByApplication, "User disconnected", "en")
                .await;
        }
    }

    pub async fn open_new_sftp(&self) -> Result<SftpSession, String> {
        if self.is_closed() {
            return Err("会话已断开".to_string());
        }
        let channel = self
            .handle
            .channel_open_session()
            .await
            .map_err(|e| format!("打开 SFTP 会话通道失败: {}", e))?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| format!("请求 SFTP 子系统失败: {}", e))?;
        SftpSession::new(channel.into_stream())
            .await
            .map_err(|e| format!("初始化 SFTP 会话失败: {}", e))
    }

    pub async fn sftp_conn(&self) -> Result<Arc<SftpSession>, String> {
        if self.is_closed() {
            return Err("会话已断开".to_string());
        }
        let mut guard = self.sftp_cache.lock().await;
        if let Some(existing) = guard.as_ref() {
            return Ok(existing.clone());
        }
        let session = Arc::new(self.open_new_sftp().await?);
        *guard = Some(session.clone());
        Ok(session)
    }

    pub async fn invalidate_sftp(&self) {
        let mut guard = self.sftp_cache.lock().await;
        *guard = None;
    }

    pub fn resolve_remote_path(&self, remote_path: &str) -> String {
        let target = normalize_remote(remote_path);
        if target.starts_with('~') && !self.home_dir.is_empty() {
            let suffix = target.trim_start_matches('~').trim_start_matches('/');
            if suffix.is_empty() {
                return normalize_remote(&self.home_dir);
            }
            return normalize_remote(&join_remote(&self.home_dir, suffix));
        }
        target
    }

    pub async fn exec_combined(&self, cmd: &str) -> Result<String, String> {
        if self.is_closed() {
            return Err("会话已断开".to_string());
        }
        let safe_cmd = format!("exec 0</dev/null; {}", cmd);
        let fut = exec_ssh_command(&self.handle, &safe_cmd);
        match tokio::time::timeout(Duration::from_secs(60), fut).await {
            Ok(Ok((out, exit_code))) => {
                if exit_code != 0 && out.trim().is_empty() {
                    return Err(format!("远程命令退出码: {}", exit_code));
                }
                Ok(out)
            }
            Ok(Err(e)) => Err(e),
            Err(_) => Err(format!(
                "命令执行超时 (超过 60 秒上限)，已终止在服务器上运行: {}",
                cmd
            )),
        }
    }
}

pub struct TransferInner {
    pub items: HashMap<String, Transfer>,
    pub order: Vec<String>,
    pub cancels: HashMap<String, watch::Sender<bool>>,
    pub last_emit: HashMap<String, Instant>,
}

pub struct DropUploadFileHandle {
    pub remote_path: String,
    pub file: SftpFile,
}

pub struct DropUploadInner {
    pub sftp: SftpSession,
    pub current_file: Option<DropUploadFileHandle>,
}

pub struct DropUploadSession {
    pub id: String,
    pub session_id: String,
    pub remote_dir: String,
    pub cancel_rx: TokioMutex<watch::Receiver<bool>>,
    pub inner: TokioMutex<DropUploadInner>,
}

pub struct SshManager {
    pub sessions: RwLock<HashMap<String, Arc<SshSession>>>,
    pub transfers: StdMutex<TransferInner>,
    pub drop_uploads: TokioMutex<HashMap<String, Arc<DropUploadSession>>>,
}

impl Default for SshManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SshManager {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            transfers: StdMutex::new(TransferInner {
                items: HashMap::new(),
                order: Vec::new(),
                cancels: HashMap::new(),
                last_emit: HashMap::new(),
            }),
            drop_uploads: TokioMutex::new(HashMap::new()),
        }
    }

    pub async fn get_session(&self, id: &str) -> Result<Arc<SshSession>, String> {
        let guard = self.sessions.read().await;
        let s = guard
            .get(id)
            .cloned()
            .ok_or_else(|| format!("会话不存在: {}", id))?;
        if s.is_closed() {
            return Err("会话已断开，请重新连接".to_string());
        }
        Ok(s)
    }

    pub async fn list_sessions(&self) -> Vec<SessionInfo> {
        let guard = self.sessions.read().await;
        guard.values().map(|s| s.info()).collect()
    }

    pub async fn remove_session(&self, id: &str) {
        let removed = {
            let mut guard = self.sessions.write().await;
            guard.remove(id)
        };
        let stale_uploads: Vec<Arc<DropUploadSession>> = {
            let mut guard = self.drop_uploads.lock().await;
            let keys: Vec<String> = guard
                .iter()
                .filter(|(_, v)| v.session_id == id)
                .map(|(k, _)| k.clone())
                .collect();
            keys.into_iter().filter_map(|k| guard.remove(&k)).collect()
        };
        for up in stale_uploads {
            self.cancel_transfer(&up.id);
            let mut inner = up.inner.lock().await;
            if let Some(mut f) = inner.current_file.take() {
                let _ = f.file.shutdown().await;
            }
            let _ = inner.sftp.close().await;
        }
        if let Some(s) = removed {
            s.close().await;
        }
    }

    pub async fn close_all(&self) {
        let stale_uploads: Vec<Arc<DropUploadSession>> = {
            let mut guard = self.drop_uploads.lock().await;
            guard.drain().map(|(_, v)| v).collect()
        };
        for up in stale_uploads {
            self.cancel_transfer(&up.id);
            let mut inner = up.inner.lock().await;
            if let Some(mut f) = inner.current_file.take() {
                let _ = f.file.shutdown().await;
            }
            let _ = inner.sftp.close().await;
        }
        let all: Vec<Arc<SshSession>> = {
            let mut guard = self.sessions.write().await;
            guard.drain().map(|(_, v)| v).collect()
        };
        for s in all {
            s.close().await;
        }
    }

    pub async fn connect(
        &self,
        app: AppHandle,
        cfg: ServerConfig,
        cols: u32,
        rows: u32,
    ) -> Result<SessionInfo, String> {
        cfg.validate()?;
        let port = cfg.display_port() as u16;
        let handle = Arc::new(
            connect_russh(
                &cfg.host,
                port,
                &cfg.username,
                &cfg.auth_type,
                &cfg.password,
                &cfg.private_key,
                &cfg.passphrase,
                15,
            )
            .await?,
        );

        let cols = if cols == 0 { 120 } else { cols };
        let rows = if rows == 0 { 32 } else { rows };

        let shell_channel = handle
            .channel_open_session()
            .await
            .map_err(|e| format!("创建 shell 会话失败: {}", e))?;

        shell_channel
            .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
            .await
            .map_err(|e| format!("申请 PTY 失败: {}", e))?;

        shell_channel
            .request_shell(false)
            .await
            .map_err(|e| format!("启动远程 shell 失败: {}", e))?;

        let session_id = Uuid::new_v4().to_string();
        let (shell_tx, mut shell_rx) = mpsc::unbounded_channel::<ShellCmd>();
        let buf_state = Arc::new(StdMutex::new(TerminalBufferState {
            buffer: Vec::new(),
            attached: false,
        }));

        let session = Arc::new(SshSession {
            id: session_id.clone(),
            cfg: cfg.clone(),
            handle: handle.clone(),
            home_dir: "/".to_string(),
            os_info: String::new(),
            shell_tx,
            sftp_cache: TokioMutex::new(None),
            closed: AtomicBool::new(false),
            buf_state: buf_state.clone(),
        });

        // Detect home directory via SFTP or pwd fallback
        let detected_home = match session.sftp_conn().await {
            Ok(sftp) => sftp
                .canonicalize(".")
                .await
                .unwrap_or_else(|_| "/".to_string()),
            Err(_) => {
                if let Ok((out, 0)) = exec_ssh_command(&handle, "pwd").await {
                    let trimmed = out.trim();
                    if !trimmed.is_empty() {
                        trimmed.to_string()
                    } else {
                        "/".to_string()
                    }
                } else {
                    "/".to_string()
                }
            }
        };

        let session = Arc::new(SshSession {
            id: session_id.clone(),
            cfg,
            handle,
            home_dir: if detected_home.is_empty() {
                "/".to_string()
            } else {
                detected_home
            },
            os_info: String::new(),
            shell_tx: session.shell_tx.clone(),
            sftp_cache: TokioMutex::new(session.sftp_cache.lock().await.clone()),
            closed: AtomicBool::new(false),
            buf_state: buf_state.clone(),
        });

        {
            let mut guard = self.sessions.write().await;
            guard.insert(session_id.clone(), session.clone());
        }

        let app_clone = app.clone();
        let session_id_clone = session_id.clone();
        let buf_state_clone = buf_state.clone();
        let session_clone = session.clone();

        tokio::spawn(async move {
            let mut channel = shell_channel;
            loop {
                tokio::select! {
                    cmd_opt = shell_rx.recv() => {
                        match cmd_opt {
                            Some(ShellCmd::Data(data)) => {
                                if channel.data(&data[..]).await.is_err() {
                                    break;
                                }
                            }
                            Some(ShellCmd::Resize(c, r)) => {
                                let _ = channel.window_change(c, r, 0, 0).await;
                            }
                            Some(ShellCmd::Close) | None => {
                                let _ = channel.close().await;
                                break;
                            }
                        }
                    }
                    msg_opt = channel.wait() => {
                        match msg_opt {
                            Some(ChannelMsg::Data { ref data }) => {
                                emit_or_buffer_terminal_data(
                                    &app_clone,
                                    &session_id_clone,
                                    &buf_state_clone,
                                    data,
                                );
                            }
                            Some(ChannelMsg::ExtendedData { ref data, ext }) => {
                                if ext == 1 {
                                    emit_or_buffer_terminal_data(
                                        &app_clone,
                                        &session_id_clone,
                                        &buf_state_clone,
                                        data,
                                    );
                                }
                            }
                            Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                                break;
                            }
                            _ => {}
                        }
                    }
                }
            }
            session_clone.mark_closed();
            let _ = app_clone.emit(
                &format!("session:closed:{}", session_id_clone),
                json!({
                    "sessionId": session_id_clone,
                    "reason": "remote shell exited",
                }),
            );
        });

        Ok(session.info())
    }

    pub async fn send_input(&self, session_id: &str, data: &str) -> Result<(), String> {
        let s = self.get_session(session_id).await?;
        s.shell_tx
            .send(ShellCmd::Data(data.as_bytes().to_vec()))
            .map_err(|_| "终端未就绪或已关闭".to_string())
    }

    pub async fn resize_terminal(&self, session_id: &str, cols: u32, rows: u32) -> Result<(), String> {
        let s = self.get_session(session_id).await?;
        s.shell_tx
            .send(ShellCmd::Resize(cols, rows))
            .map_err(|_| "终端未就绪或已关闭".to_string())
    }

    pub async fn attach_terminal(
        &self,
        app: &AppHandle,
        session_id: &str,
        cols: u32,
        rows: u32,
    ) -> Result<(), String> {
        let s = self.get_session(session_id).await?;
        if cols > 0 && rows > 0 {
            let _ = s.shell_tx.send(ShellCmd::Resize(cols, rows));
        }
        let payload_opt = {
            let mut guard = s.buf_state.lock().map_err(|e| e.to_string())?;
            guard.attached = true;
            if !guard.buffer.is_empty() {
                let encoded = BASE64.encode(&guard.buffer);
                guard.buffer.clear();
                Some(encoded)
            } else {
                None
            }
        };
        if let Some(payload) = payload_opt {
            let _ = app.emit(&format!("terminal:data:{}", s.id), payload);
        }
        Ok(())
    }

    pub fn create_transfer(
        &self,
        app: &AppHandle,
        session_id: &str,
        kind: &str,
        name: &str,
        local_path: &str,
        remote_path: &str,
        initial_size: i64,
    ) -> (String, watch::Receiver<bool>) {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp_millis();
        let transfer = Transfer {
            id: id.clone(),
            session_id: session_id.to_string(),
            kind: kind.to_string(),
            direction: kind.to_string(),
            name: name.to_string(),
            local_path: local_path.to_string(),
            remote_path: remote_path.to_string(),
            size: initial_size,
            transferred: 0,
            status: STATUS_RUNNING.to_string(),
            error: String::new(),
            speed: 0,
            started_at: now,
            updated_at: now,
        };
        let (tx, rx) = watch::channel(false);
        if let Ok(mut guard) = self.transfers.lock() {
            guard.items.insert(id.clone(), transfer.clone());
            guard.order.push(id.clone());
            guard.cancels.insert(id.clone(), tx);
            guard.last_emit.insert(id.clone(), Instant::now());
        }
        let _ = app.emit("transfer:update", &transfer);
        let _ = app.emit("transfer:progress", &transfer);
        (id, rx)
    }

    pub fn set_transfer_size(&self, app: &AppHandle, id: &str, size: i64) {
        let snapshot_opt = {
            if let Ok(mut guard) = self.transfers.lock() {
                if let Some(t) = guard.items.get_mut(id) {
                    t.size = size;
                    t.updated_at = Utc::now().timestamp_millis();
                    Some(t.clone())
                } else {
                    None
                }
            } else {
                None
            }
        };
        if let Some(snapshot) = snapshot_opt {
            let _ = app.emit("transfer:update", &snapshot);
            let _ = app.emit("transfer:progress", &snapshot);
        }
    }

    pub fn add_transfer_progress(&self, app: &AppHandle, id: &str, delta: i64) {
        let snapshot_opt = {
            if let Ok(mut guard) = self.transfers.lock() {
                let should_emit = guard
                    .last_emit
                    .get(id)
                    .map(|last| last.elapsed() >= Duration::from_millis(120))
                    .unwrap_or(true);
                if let Some(t) = guard.items.get_mut(id) {
                    t.transferred += delta;
                    let now_ms = Utc::now().timestamp_millis();
                    let elapsed_ms = (now_ms - t.started_at).max(1);
                    t.speed = (t.transferred * 1000) / elapsed_ms;
                    t.updated_at = now_ms;
                    if should_emit {
                        let snap = t.clone();
                        guard.last_emit.insert(id.to_string(), Instant::now());
                        Some(snap)
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            }
        };
        if let Some(snapshot) = snapshot_opt {
            let _ = app.emit("transfer:update", &snapshot);
            let _ = app.emit("transfer:progress", &snapshot);
        }
    }

    pub fn finish_transfer(&self, app: &AppHandle, id: &str, res: Result<(), String>) {
        let snapshot_opt = {
            if let Ok(mut guard) = self.transfers.lock() {
                guard.cancels.remove(id);
                guard.last_emit.remove(id);
                if let Some(t) = guard.items.get_mut(id) {
                    t.updated_at = Utc::now().timestamp_millis();
                    match res {
                        Ok(()) => {
                            t.status = STATUS_DONE.to_string();
                            if t.size > 0 {
                                t.transferred = t.size;
                            }
                        }
                        Err(err) if err == "已取消" => {
                            t.status = STATUS_CANCELED.to_string();
                            t.error = "已取消".to_string();
                        }
                        Err(err) => {
                            t.status = STATUS_ERROR.to_string();
                            t.error = err;
                        }
                    }
                    Some(t.clone())
                } else {
                    None
                }
            } else {
                None
            }
        };
        if let Some(snapshot) = snapshot_opt {
            let _ = app.emit("transfer:update", &snapshot);
            let _ = app.emit("transfer:progress", &snapshot);
        }
    }

    pub fn list_transfers(&self) -> Vec<Transfer> {
        if let Ok(guard) = self.transfers.lock() {
            guard
                .order
                .iter()
                .filter_map(|id| guard.items.get(id).cloned())
                .collect()
        } else {
            Vec::new()
        }
    }

    pub fn cancel_transfer(&self, id: &str) {
        if let Ok(guard) = self.transfers.lock() {
            if let Some(tx) = guard.cancels.get(id) {
                let _ = tx.send(true);
            }
        }
    }

    pub fn clear_finished_transfers(&self) {
        if let Ok(mut guard) = self.transfers.lock() {
            let mut next_order = Vec::new();
            let order_clone = guard.order.clone();
            for id in order_clone {
                let keep = guard
                    .items
                    .get(&id)
                    .map(|t| t.status == STATUS_RUNNING)
                    .unwrap_or(false);
                if keep {
                    next_order.push(id);
                } else {
                    guard.items.remove(&id);
                    guard.cancels.remove(&id);
                    guard.last_emit.remove(&id);
                }
            }
            guard.order = next_order;
        }
    }

    pub fn notify_dir_changed(&self, app: &AppHandle, session_id: &str, dir: &str) {
        let _ = app.emit(
            "sftp:changed",
            json!({
                "sessionId": session_id,
                "path": dir,
                "dir": dir,
            }),
        );
    }

    pub async fn exec_command(&self, session_id: &str, cmd: &str) -> Result<String, String> {
        let session = self.get_session(session_id).await?;
        session.exec_combined(cmd).await
    }

    pub async fn upload_file_direct(
        &self,
        app: Option<&AppHandle>,
        session_id: &str,
        local_path: &str,
        remote_path: &str,
    ) -> Result<(), String> {
        let data = tokio::fs::read(local_path)
            .await
            .map_err(|e| format!("读取本地文件失败 [{}]: {}", local_path, e))?;
        self.write_file_content(app, session_id, remote_path, &data)
            .await
    }

    pub async fn download_file_direct(
        &self,
        session_id: &str,
        remote_path: &str,
        local_path: &str,
    ) -> Result<(), String> {
        let data = self.read_file_content(session_id, remote_path).await?;
        if let Some(parent) = Path::new(local_path).parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("创建本地目录失败: {}", e))?;
        }
        tokio::fs::write(local_path, &data)
            .await
            .map_err(|e| format!("写入本地文件失败 [{}]: {}", local_path, e))
    }

    pub async fn read_file_content(
        &self,
        session_id: &str,
        remote_path: &str,
    ) -> Result<Vec<u8>, String> {
        let session = self.get_session(session_id).await?;
        let target = session.resolve_remote_path(remote_path);

        if let Ok(sftp) = session.sftp_conn().await {
            if let Ok(mut f) = sftp.open(&target).await {
                let mut buf = Vec::new();
                let mut take = (&mut f).take(10 * 1024 * 1024);
                if take.read_to_end(&mut buf).await.is_ok() {
                    return Ok(buf);
                }
            } else {
                session.invalidate_sftp().await;
            }
        }

        // Fallback via SSH exec cat
        let cmd = format!("cat {}", shell_quote(&target));
        let (out, code) = exec_ssh_command(&session.handle, &cmd).await?;
        if code != 0 && out.is_empty() {
            return Err(format!("读取远程文件失败 (exit {})", code));
        }
        Ok(out.into_bytes())
    }

    pub async fn write_file_content(
        &self,
        app: Option<&AppHandle>,
        session_id: &str,
        remote_path: &str,
        data: &[u8],
    ) -> Result<(), String> {
        let session = self.get_session(session_id).await?;
        let target = session.resolve_remote_path(remote_path);
        let target_dir = parent_remote(&target);

        if let Ok(sftp) = session.sftp_conn().await {
            let _ = mkdir_all_remote(&sftp, &target_dir).await;
            if let Ok(mut f) = sftp.create(&target).await {
                f.write_all(data)
                    .await
                    .map_err(|e| format!("写入远程文件内容失败: {}", e))?;
                let _ = f.flush().await;
                let _ = f.shutdown().await;
                if let Some(a) = app {
                    self.notify_dir_changed(a, session_id, &target_dir);
                }
                return Ok(());
            } else {
                session.invalidate_sftp().await;
            }
        }

        // Fallback via SSH exec
        let _ = session
            .exec_combined(&format!("mkdir -p {}", shell_quote(&target_dir)))
            .await;
        let b64 = BASE64.encode(data);
        let cmd = format!(
            "sh -c 'echo {} | base64 -d > {}'",
            b64,
            shell_quote(&target)
        );
        session.exec_combined(&cmd).await?;
        if let Some(a) = app {
            self.notify_dir_changed(a, session_id, &target_dir);
        }
        Ok(())
    }

    async fn get_drop_upload(&self, upload_id: &str) -> Result<Arc<DropUploadSession>, String> {
        let guard = self.drop_uploads.lock().await;
        guard
            .get(upload_id)
            .cloned()
            .ok_or_else(|| format!("上传会话不存在或已结束: {}", upload_id))
    }

    async fn check_drop_canceled(drop: &DropUploadSession) -> Result<(), String> {
        let rx = drop.cancel_rx.lock().await;
        if *rx.borrow() {
            return Err("已取消".to_string());
        }
        Ok(())
    }

    /// Starts an aggregated drop upload transfer reusing a single dedicated SFTP session.
    pub async fn begin_drop_upload(
        &self,
        app: &AppHandle,
        session_id: &str,
        remote_dir: &str,
        name: &str,
        total_size: i64,
    ) -> Result<String, String> {
        let session = self.get_session(session_id).await?;
        let remote_dir_norm = session.resolve_remote_path(remote_dir);
        let sftp = session.open_new_sftp().await?;
        if let Err(err) = mkdir_all_remote(&sftp, &remote_dir_norm).await {
            let _ = sftp.close().await;
            return Err(err);
        }

        let display_name = name.trim();
        let transfer_name = if display_name.is_empty() {
            "upload".to_string()
        } else {
            display_name.to_string()
        };
        let remote_path = join_remote_relative(&remote_dir_norm, &transfer_name)
            .unwrap_or_else(|_| remote_dir_norm.clone());

        let (tid, cancel_rx) = self.create_transfer(
            app,
            session_id,
            "upload",
            &transfer_name,
            "",
            &remote_path,
            total_size.max(0),
        );

        let drop_sess = Arc::new(DropUploadSession {
            id: tid.clone(),
            session_id: session_id.to_string(),
            remote_dir: remote_dir_norm,
            cancel_rx: TokioMutex::new(cancel_rx),
            inner: TokioMutex::new(DropUploadInner {
                sftp,
                current_file: None,
            }),
        });

        let mut guard = self.drop_uploads.lock().await;
        guard.insert(tid.clone(), drop_sess);
        Ok(tid)
    }

    /// Creates a directory (including nested empty directories) inside an active drop upload session.
    pub async fn drop_upload_mkdir(
        &self,
        upload_id: &str,
        relative_dir: &str,
    ) -> Result<(), String> {
        let drop = self.get_drop_upload(upload_id).await?;
        Self::check_drop_canceled(&drop).await?;
        let target_dir = join_remote_relative(&drop.remote_dir, relative_dir)?;
        let inner = drop.inner.lock().await;
        mkdir_all_remote(&inner.sftp, &target_dir).await
    }

    /// Streams a file chunk (supports empty 0-byte files) on the reused SFTP session.
    pub async fn drop_upload_write_chunk(
        &self,
        app: &AppHandle,
        upload_id: &str,
        relative_path: &str,
        data_base64: &str,
        is_first_chunk: bool,
        is_last_chunk: bool,
    ) -> Result<(), String> {
        let drop = self.get_drop_upload(upload_id).await?;
        Self::check_drop_canceled(&drop).await?;

        let raw = if data_base64.trim().is_empty() {
            Vec::new()
        } else {
            BASE64
                .decode(data_base64.trim())
                .map_err(|e| format!("分块数据解码失败: {}", e))?
        };

        let mut inner = drop.inner.lock().await;
        if is_first_chunk {
            if let Some(mut stale) = inner.current_file.take() {
                let _ = stale.file.flush().await;
                let _ = stale.file.shutdown().await;
            }
            let target_path = join_remote_relative(&drop.remote_dir, relative_path)?;
            if target_path == drop.remote_dir {
                return Err("非法文件路径：文件名不能为空".to_string());
            }
            let parent_dir = parent_remote(&target_path);
            mkdir_all_remote(&inner.sftp, &parent_dir).await?;
            let dst = inner
                .sftp
                .create(&target_path)
                .await
                .map_err(|e| format!("创建远程文件 {} 失败: {}", target_path, e))?;
            inner.current_file = Some(DropUploadFileHandle {
                remote_path: target_path,
                file: dst,
            });
        }

        if !raw.is_empty() {
            let handle = inner
                .current_file
                .as_mut()
                .ok_or_else(|| "文件句柄未打开，请先发送首块".to_string())?;
            handle
                .file
                .write_all(&raw)
                .await
                .map_err(|e| format!("写入远程文件 {} 失败: {}", handle.remote_path, e))?;
            self.add_transfer_progress(app, upload_id, raw.len() as i64);
        }

        if is_last_chunk {
            if let Some(mut handle) = inner.current_file.take() {
                handle
                    .file
                    .flush()
                    .await
                    .map_err(|e| format!("刷新远程文件 {} 失败: {}", handle.remote_path, e))?;
                handle
                    .file
                    .shutdown()
                    .await
                    .map_err(|e| format!("关闭远程文件 {} 失败: {}", handle.remote_path, e))?;
            }
        }

        Ok(())
    }

    /// Finalizes a drop upload session, closing SFTP resources and emitting transfer completion.
    pub async fn finish_drop_upload(
        &self,
        app: &AppHandle,
        upload_id: &str,
        error_msg: Option<String>,
    ) -> Result<(), String> {
        let drop_opt = {
            let mut guard = self.drop_uploads.lock().await;
            guard.remove(upload_id)
        };
        let Some(drop) = drop_opt else {
            return Ok(());
        };

        let canceled = *drop.cancel_rx.lock().await.borrow();
        {
            let mut inner = drop.inner.lock().await;
            if let Some(mut stale) = inner.current_file.take() {
                let _ = stale.file.flush().await;
                let _ = stale.file.shutdown().await;
            }
            let _ = inner.sftp.close().await;
        }

        let res = if canceled {
            Err("已取消".to_string())
        } else if let Some(err) = error_msg.filter(|s| !s.trim().is_empty()) {
            Err(err)
        } else {
            Ok(())
        };

        self.finish_transfer(app, upload_id, res);
        self.notify_dir_changed(app, &drop.session_id, &drop.remote_dir);
        Ok(())
    }
}

pub fn emit_or_buffer_terminal_data(
    app: &AppHandle,
    session_id: &str,
    buf_state: &Arc<StdMutex<TerminalBufferState>>,
    data: &[u8],
) {
    if data.is_empty() {
        return;
    }
    let attached = if let Ok(mut guard) = buf_state.lock() {
        if !guard.attached {
            if guard.buffer.len() < MAX_TERMINAL_BUFFER {
                let remaining = MAX_TERMINAL_BUFFER - guard.buffer.len();
                let slice = &data[..data.len().min(remaining)];
                guard.buffer.extend_from_slice(slice);
            }
            false
        } else {
            true
        }
    } else {
        true
    };

    if attached {
        let payload = BASE64.encode(data);
        let _ = app.emit(&format!("terminal:data:{}", session_id), payload);
    }
}

// ------------------------------------------------------------------------
// SFTP IO Helper Functions
// ------------------------------------------------------------------------

pub async fn mkdir_all_remote(sftp: &SftpSession, dir: &str) -> Result<(), String> {
    let norm = normalize_remote(dir);
    if norm.is_empty() || norm == "/" || norm == "." {
        return Ok(());
    }
    if let Ok(meta) = sftp.metadata(&norm).await {
        if meta.is_dir() {
            return Ok(());
        }
        return Err(format!("{} 已存在且不是目录", norm));
    }
    let parent = parent_remote(&norm);
    if parent != norm && parent != "/" {
        Box::pin(mkdir_all_remote(sftp, &parent)).await?;
    }
    if let Err(e) = sftp.create_dir(&norm).await {
        if let Ok(meta) = sftp.metadata(&norm).await {
            if meta.is_dir() {
                return Ok(());
            }
        }
        return Err(format!("创建目录 {} 失败: {}", norm, e));
    }
    Ok(())
}

pub async fn remove_remote_recursive(sftp: &SftpSession, target: &str) -> Result<(), String> {
    let meta = sftp
        .symlink_metadata(target)
        .await
        .map_err(|e| format!("获取路径信息失败 [{}]: {}", target, e))?;
    if meta.is_dir() && !meta.is_symlink() {
        let entries = sftp
            .read_dir(target)
            .await
            .map_err(|e| format!("读取目录失败 [{}]: {}", target, e))?;
        for entry in entries {
            let name = entry.file_name();
            if name == "." || name == ".." {
                continue;
            }
            let child = join_remote(target, &name);
            Box::pin(remove_remote_recursive(sftp, &child)).await?;
        }
        sftp.remove_dir(target)
            .await
            .map_err(|e| format!("删除目录失败 [{}]: {}", target, e))
    } else {
        sftp.remove_file(target)
            .await
            .map_err(|e| format!("删除文件失败 [{}]: {}", target, e))
    }
}

pub async fn query_remote_space(session: &SshSession, remote_dir: &str) -> (u64, u64, bool) {
    let target = if remote_dir.trim().is_empty() {
        "."
    } else {
        remote_dir
    };
    let cmd = format!(
        "LC_ALL=C df -Pk {} 2>/dev/null || LC_ALL=C df -Pk / 2>/dev/null",
        shell_quote(target)
    );
    if let Ok(out) = session.exec_combined(&cmd).await {
        for line in out.lines().skip(1) {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() >= 4 {
                if let (Ok(total_kb), Ok(avail_kb)) =
                    (fields[1].parse::<u64>(), fields[3].parse::<u64>())
                {
                    if total_kb > 0 {
                        return (avail_kb * 1024, total_kb * 1024, true);
                    }
                }
            }
        }
    }
    (0, 0, false)
}

pub fn calc_local_paths_stats(paths: &[String]) -> Result<(i64, usize, usize), String> {
    let mut total_size = 0i64;
    let mut file_count = 0usize;
    let mut folder_count = 0usize;

    fn visit_dir(
        dir: &Path,
        total_size: &mut i64,
        file_count: &mut usize,
        folder_count: &mut usize,
    ) -> Result<(), String> {
        let rd = std::fs::read_dir(dir)
            .map_err(|e| format!("读取本地目录失败 [{}]: {}", dir.display(), e))?;
        for entry in rd {
            let entry = entry.map_err(|e| e.to_string())?;
            let meta = entry.metadata().map_err(|e| e.to_string())?;
            if meta.is_dir() {
                *folder_count += 1;
                visit_dir(&entry.path(), total_size, file_count, folder_count)?;
            } else if meta.is_file() {
                *total_size += meta.len() as i64;
                *file_count += 1;
            }
        }
        Ok(())
    }

    for p in paths {
        let path = Path::new(p);
        let meta =
            std::fs::metadata(path).map_err(|e| format!("读取本地路径失败 [{}]: {}", p, e))?;
        if meta.is_dir() {
            folder_count += 1;
            visit_dir(path, &mut total_size, &mut file_count, &mut folder_count)?;
        } else {
            total_size += meta.len() as i64;
            file_count += 1;
        }
    }

    Ok((total_size, file_count, folder_count))
}

pub async fn upload_single_file(
    ssh_mgr: &SshManager,
    app: &AppHandle,
    transfer_id: &str,
    cancel_rx: &mut watch::Receiver<bool>,
    sftp: &SftpSession,
    local_path: &Path,
    remote_path: &str,
) -> Result<(), String> {
    if *cancel_rx.borrow() {
        return Err("已取消".to_string());
    }
    let parent = parent_remote(remote_path);
    mkdir_all_remote(sftp, &parent).await?;

    let mut src = tokio::fs::File::open(local_path)
        .await
        .map_err(|e| format!("打开本地文件失败 [{}]: {}", local_path.display(), e))?;
    let mut dst = sftp
        .create(remote_path)
        .await
        .map_err(|e| format!("创建远程文件 {} 失败: {}", remote_path, e))?;

    let mut buf = vec![0u8; 256 * 1024];
    loop {
        if *cancel_rx.borrow() {
            return Err("已取消".to_string());
        }
        let n = tokio::select! {
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() {
                    return Err("已取消".to_string());
                }
                0
            }
            res = src.read(&mut buf) => {
                res.map_err(|e| format!("读取本地文件失败: {}", e))?
            }
        };
        if n == 0 {
            break;
        }
        dst.write_all(&buf[..n])
            .await
            .map_err(|e| format!("写入远程文件失败: {}", e))?;
        ssh_mgr.add_transfer_progress(app, transfer_id, n as i64);
    }
    let _ = dst.flush().await;
    let _ = dst.shutdown().await;
    Ok(())
}

pub async fn upload_tree_recursive(
    ssh_mgr: &SshManager,
    app: &AppHandle,
    transfer_id: &str,
    cancel_rx: &mut watch::Receiver<bool>,
    sftp: &SftpSession,
    local_dir: &Path,
    remote_dir: &str,
) -> Result<(), String> {
    if *cancel_rx.borrow() {
        return Err("已取消".to_string());
    }
    mkdir_all_remote(sftp, remote_dir).await?;
    let mut rd = tokio::fs::read_dir(local_dir)
        .await
        .map_err(|e| format!("读取本地目录失败 [{}]: {}", local_dir.display(), e))?;

    while let Some(entry) = rd.next_entry().await.map_err(|e| e.to_string())? {
        if *cancel_rx.borrow() {
            return Err("已取消".to_string());
        }
        let file_type = entry.file_type().await.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let child_remote = join_remote(remote_dir, &name);
        let child_local = entry.path();
        if file_type.is_dir() {
            Box::pin(upload_tree_recursive(
                ssh_mgr,
                app,
                transfer_id,
                cancel_rx,
                sftp,
                &child_local,
                &child_remote,
            ))
            .await?;
        } else if file_type.is_file() {
            upload_single_file(
                ssh_mgr,
                app,
                transfer_id,
                cancel_rx,
                sftp,
                &child_local,
                &child_remote,
            )
            .await?;
        }
    }
    Ok(())
}

pub async fn remote_tree_size(sftp: &SftpSession, root: &str) -> i64 {
    let mut total = 0i64;
    if let Ok(entries) = sftp.read_dir(root).await {
        for entry in entries {
            let name = entry.file_name();
            if name == "." || name == ".." {
                continue;
            }
            let child = join_remote(root, &name);
            let ft = entry.file_type();
            if ft.is_dir() {
                total += Box::pin(remote_tree_size(sftp, &child)).await;
            } else if ft.is_file() {
                total += entry.metadata().size.unwrap_or(0) as i64;
            }
        }
    }
    total
}

pub async fn download_single_file(
    ssh_mgr: &SshManager,
    app: &AppHandle,
    transfer_id: &str,
    cancel_rx: &mut watch::Receiver<bool>,
    sftp: &SftpSession,
    remote_path: &str,
    local_path: &Path,
) -> Result<(), String> {
    if *cancel_rx.borrow() {
        return Err("已取消".to_string());
    }
    if let Some(parent) = local_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("创建本地目录失败: {}", e))?;
    }
    let mut src = sftp
        .open(remote_path)
        .await
        .map_err(|e| format!("打开远程文件 {} 失败: {}", remote_path, e))?;
    let mut dst = tokio::fs::File::create(local_path)
        .await
        .map_err(|e| format!("创建本地文件失败 [{}]: {}", local_path.display(), e))?;

    let mut buf = vec![0u8; 256 * 1024];
    loop {
        if *cancel_rx.borrow() {
            return Err("已取消".to_string());
        }
        let n = tokio::select! {
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() {
                    return Err("已取消".to_string());
                }
                0
            }
            res = src.read(&mut buf) => {
                res.map_err(|e| format!("读取远程文件失败: {}", e))?
            }
        };
        if n == 0 {
            break;
        }
        dst.write_all(&buf[..n])
            .await
            .map_err(|e| format!("写入本地文件失败: {}", e))?;
        ssh_mgr.add_transfer_progress(app, transfer_id, n as i64);
    }
    let _ = dst.flush().await;
    Ok(())
}

pub async fn download_tree_recursive(
    ssh_mgr: &SshManager,
    app: &AppHandle,
    transfer_id: &str,
    cancel_rx: &mut watch::Receiver<bool>,
    sftp: &SftpSession,
    remote_dir: &str,
    local_dir: &Path,
) -> Result<(), String> {
    if *cancel_rx.borrow() {
        return Err("已取消".to_string());
    }
    tokio::fs::create_dir_all(local_dir)
        .await
        .map_err(|e| format!("创建本地目录失败: {}", e))?;

    let entries = sftp
        .read_dir(remote_dir)
        .await
        .map_err(|e| format!("读取远程目录失败 [{}]: {}", remote_dir, e))?;

    for entry in entries {
        if *cancel_rx.borrow() {
            return Err("已取消".to_string());
        }
        let name = entry.file_name();
        if name == "." || name == ".." || name.contains('/') || name.contains('\\') {
            continue;
        }
        let child_remote = join_remote(remote_dir, &name);
        let child_local = local_dir.join(&name);
        let ft = entry.file_type();
        if ft.is_dir() {
            Box::pin(download_tree_recursive(
                ssh_mgr,
                app,
                transfer_id,
                cancel_rx,
                sftp,
                &child_remote,
                &child_local,
            ))
            .await?;
        } else if ft.is_file() {
            download_single_file(
                ssh_mgr,
                app,
                transfer_id,
                cancel_rx,
                sftp,
                &child_remote,
                &child_local,
            )
            .await?;
        }
    }
    Ok(())
}
