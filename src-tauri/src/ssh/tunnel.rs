use async_trait::async_trait;
use russh::client;
use russh_keys::key;
use std::fs;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::sync::oneshot;

pub struct SshClientHandler;

#[async_trait]
impl client::Handler for SshClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

pub fn load_pem_or_file(str_or_path: &str) -> Result<String, String> {
    let trimmed = str_or_path.trim();
    if trimmed.contains("-----BEGIN") {
        return Ok(trimmed.to_string());
    }
    fs::read_to_string(trimmed).map_err(|e| format!("读取密钥/证书文件失败 [{}]: {}", trimmed, e))
}

pub async fn connect_russh(
    host: &str,
    port: u16,
    user: &str,
    auth_type: &str,
    password: &str,
    key_data_or_path: &str,
    passphrase: &str,
    timeout_secs: u64,
) -> Result<client::Handle<SshClientHandler>, String> {
    let mut config = client::Config::default();
    config.inactivity_timeout = Some(Duration::from_secs(3600));
    config.keepalive_interval = Some(Duration::from_secs(30));
    let config = Arc::new(config);
    let addr = format!("{}:{}", host.trim(), if port > 0 { port } else { 22 });

    let connect_fut = client::connect(config, &addr, SshClientHandler);
    let mut session = tokio::time::timeout(
        Duration::from_secs(if timeout_secs > 0 { timeout_secs } else { 15 }),
        connect_fut,
    )
    .await
    .map_err(|_| format!("连接 SSH 服务器 {} 超时", addr))?
    .map_err(|e| format!("连接 SSH 服务器 {} 失败: {}", addr, e))?;

    let user = if user.trim().is_empty() {
        "root"
    } else {
        user.trim()
    };

    let authed = if auth_type == "key" || (!key_data_or_path.trim().is_empty() && password.is_empty())
    {
        let pem = load_pem_or_file(key_data_or_path)?;
        let pass_opt = if passphrase.is_empty() {
            None
        } else {
            Some(passphrase)
        };
        let key_pair = russh_keys::decode_secret_key(&pem, pass_opt)
            .map_err(|e| format!("解析 SSH 私钥失败: {}", e))?;
        session
            .authenticate_publickey(user, Arc::new(key_pair))
            .await
            .map_err(|e| format!("SSH 公钥认证失败: {}", e))?
    } else {
        session
            .authenticate_password(user, password)
            .await
            .map_err(|e| format!("SSH 密码认证失败: {}", e))?
    };

    if !authed {
        return Err(format!("SSH 认证未通过 ({}@{})", user, addr));
    }

    Ok(session)
}

pub async fn exec_ssh_command(
    session: &client::Handle<SshClientHandler>,
    cmd: &str,
) -> Result<(String, u32), String> {
    let mut channel = session
        .channel_open_session()
        .await
        .map_err(|e| format!("打开 SSH 会话通道失败: {}", e))?;
    channel
        .exec(true, cmd)
        .await
        .map_err(|e| format!("执行远程命令失败: {}", e))?;

    let mut out = Vec::new();
    let mut err_out = Vec::new();
    let mut exit_code = 0u32;

    while let Some(msg) = channel.wait().await {
        match msg {
            russh::ChannelMsg::Data { ref data } => {
                out.extend_from_slice(data);
            }
            russh::ChannelMsg::ExtendedData { ref data, ext } => {
                if ext == 1 {
                    err_out.extend_from_slice(data);
                }
            }
            russh::ChannelMsg::ExitStatus { exit_status } => {
                exit_code = exit_status;
            }
            _ => {}
        }
    }

    let mut combined = String::from_utf8_lossy(&out).to_string();
    if combined.is_empty() && !err_out.is_empty() {
        combined = String::from_utf8_lossy(&err_out).to_string();
    } else if !err_out.is_empty() && exit_code != 0 {
        combined.push_str(&String::from_utf8_lossy(&err_out));
    }
    Ok((combined, exit_code))
}

pub struct SshTunnel {
    pub local_addr: String,
    pub local_port: u16,
    stop_tx: Option<oneshot::Sender<()>>,
}

impl SshTunnel {
    pub async fn start_tcp_forward(
        ssh_host: &str,
        ssh_port: u16,
        ssh_user: &str,
        ssh_auth_type: &str,
        ssh_password: &str,
        ssh_key: &str,
        ssh_passphrase: &str,
        target_host: &str,
        target_port: u16,
    ) -> Result<Self, String> {
        let handle = Arc::new(
            connect_russh(
                ssh_host,
                ssh_port,
                ssh_user,
                ssh_auth_type,
                ssh_password,
                ssh_key,
                ssh_passphrase,
                15,
            )
            .await?,
        );

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("绑定本地转发端口失败: {}", e))?;
        let addr = listener
            .local_addr()
            .map_err(|e| format!("获取本地监听地址失败: {}", e))?;
        let local_port = addr.port();
        let local_addr = format!("127.0.0.1:{}", local_port);

        let (stop_tx, mut stop_rx) = oneshot::channel::<()>();
        let t_host = target_host.to_string();
        let t_port = target_port as u32;

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut stop_rx => {
                        break;
                    }
                    accept_res = listener.accept() => {
                        let (mut local_stream, peer) = match accept_res {
                            Ok(v) => v,
                            Err(_) => break,
                        };
                        let h = handle.clone();
                        let remote_host = t_host.clone();
                        tokio::spawn(async move {
                            let ch = match h.channel_open_direct_tcpip(
                                &remote_host,
                                t_port,
                                &peer.ip().to_string(),
                                peer.port() as u32,
                            ).await {
                                Ok(c) => c,
                                Err(_) => return,
                            };
                            let mut remote_stream = ch.into_stream();
                            let _ = tokio::io::copy_bidirectional(&mut local_stream, &mut remote_stream).await;
                        });
                    }
                }
            }
        });

        Ok(Self {
            local_addr,
            local_port,
            stop_tx: Some(stop_tx),
        })
    }

    pub async fn start_docker_forward(
        ssh_host: &str,
        ssh_port: u16,
        ssh_user: &str,
        ssh_auth_type: &str,
        ssh_password: &str,
        ssh_key: &str,
        ssh_passphrase: &str,
        remote_socket: &str,
    ) -> Result<Self, String> {
        let handle = Arc::new(
            connect_russh(
                ssh_host,
                ssh_port,
                ssh_user,
                ssh_auth_type,
                ssh_password,
                ssh_key,
                ssh_passphrase,
                15,
            )
            .await?,
        );

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("绑定本地转发端口失败: {}", e))?;
        let addr = listener
            .local_addr()
            .map_err(|e| format!("获取本地监听地址失败: {}", e))?;
        let local_port = addr.port();
        let local_addr = format!("127.0.0.1:{}", local_port);

        let (stop_tx, mut stop_rx) = oneshot::channel::<()>();
        let sock_path = if remote_socket.trim().is_empty() {
            "/var/run/docker.sock".to_string()
        } else {
            remote_socket.trim().to_string()
        };

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut stop_rx => {
                        break;
                    }
                    accept_res = listener.accept() => {
                        let (mut local_stream, _) = match accept_res {
                            Ok(v) => v,
                            Err(_) => break,
                        };
                        let h = handle.clone();
                        let sp = sock_path.clone();
                        tokio::spawn(async move {
                            if let Ok(ch) = h.channel_open_direct_streamlocal(&sp).await {
                                let mut remote_stream = ch.into_stream();
                                let _ = tokio::io::copy_bidirectional(&mut local_stream, &mut remote_stream).await;
                                return;
                            }
                            if let Ok(ch) = h.channel_open_session().await {
                                if ch.exec(true, "docker system dial-stdio").await.is_ok() {
                                    let mut remote_stream = ch.into_stream();
                                    let _ = tokio::io::copy_bidirectional(&mut local_stream, &mut remote_stream).await;
                                }
                            }
                        });
                    }
                }
            }
        });

        Ok(Self {
            local_addr,
            local_port,
            stop_tx: Some(stop_tx),
        })
    }

    pub fn close(&mut self) {
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }
    }
}

impl Drop for SshTunnel {
    fn drop(&mut self) {
        self.close();
    }
}

