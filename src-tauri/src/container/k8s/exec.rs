use crate::container::k8s::manager::{K8sClient, K8sManager};
use crate::AppState;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use reqwest::header::{HeaderValue, AUTHORIZATION};
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::protocol::Message as WsMessage;
use uuid::Uuid;

pub struct K8sExecSession {
    pub id: String,
    tx: mpsc::UnboundedSender<Vec<u8>>,
}

impl K8sExecSession {
    pub fn write(&self, data: &str) -> Result<(), String> {
        let mut frame = Vec::with_capacity(1 + data.len());
        frame.push(0u8); // Channel 0: stdin
        frame.extend_from_slice(data.as_bytes());
        self.tx
            .send(frame)
            .map_err(|_| "终端会话已关闭".to_string())
    }

    pub fn resize(&self, cols: u32, rows: u32) -> Result<(), String> {
        if cols == 0 || rows == 0 {
            return Ok(());
        }
        let msg = json!({
            "Width": cols as u16,
            "Height": rows as u16,
        })
        .to_string();
        let mut frame = Vec::with_capacity(1 + msg.len());
        frame.push(4u8); // Channel 4: resize
        frame.extend_from_slice(msg.as_bytes());
        let _ = self.tx.send(frame);
        Ok(())
    }

    pub fn close(&self) {
        let _ = self.tx.send(Vec::new());
    }
}

impl K8sManager {
    #[allow(clippy::too_many_arguments)]
    pub async fn start_exec(
        &self,
        app: AppHandle,
        k8s_cli: &K8sClient,
        namespace: &str,
        pod_name: &str,
        container: &str,
        command: &str,
        cols: u32,
        rows: u32,
    ) -> Result<String, String> {
        let ns = if namespace.trim().is_empty() {
            "default"
        } else {
            namespace.trim()
        };
        let cmd_str = if command.trim().is_empty() {
            "/bin/sh"
        } else {
            command.trim()
        };
        let cols_val = if cols == 0 { 120 } else { cols };
        let rows_val = if rows == 0 { 32 } else { rows };

        let ws_base = if let Some(rest) = k8s_cli.base_url.strip_prefix("https://") {
            format!("wss://{}", rest)
        } else if let Some(rest) = k8s_cli.base_url.strip_prefix("http://") {
            format!("ws://{}", rest)
        } else {
            format!("wss://{}", k8s_cli.base_url)
        };

        let mut ws_url = url::Url::parse(&format!(
            "{}/api/v1/namespaces/{}/pods/{}/exec",
            ws_base, ns, pod_name
        ))
        .map_err(|e| format!("构造 Exec URL 失败: {}", e))?;

        {
            let mut qp = ws_url.query_pairs_mut();
            qp.append_pair("stdin", "true");
            qp.append_pair("stdout", "true");
            qp.append_pair("stderr", "true");
            qp.append_pair("tty", "true");
            qp.append_pair("command", cmd_str);
            if !container.trim().is_empty() {
                qp.append_pair("container", container.trim());
            }
        }

        let mut req = ws_url
            .as_str()
            .into_client_request()
            .map_err(|e| format!("构造 WebSocket 请求失败: {}", e))?;

        req.headers_mut().insert(
            "Sec-WebSocket-Protocol",
            HeaderValue::from_static("v4.channel.k8s.io"),
        );
        if !k8s_cli.bearer_token.is_empty() {
            if let Ok(hv) = HeaderValue::from_str(&format!("Bearer {}", k8s_cli.bearer_token)) {
                req.headers_mut().insert(AUTHORIZATION, hv);
            }
        }

        let connector = build_ws_tls_connector(k8s_cli.insecure);
        let (ws_stream, _) =
            tokio_tungstenite::connect_async_tls_with_config(req, None, false, connector)
                .await
                .map_err(|e| format!("连接 Pod 远程终端失败: {}", e))?;

        let (mut ws_sink, mut ws_source) = ws_stream.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();

        let exec_id = Uuid::new_v4().to_string();
        let session = Arc::new(K8sExecSession {
            id: exec_id.clone(),
            tx,
        });
        let _ = session.resize(cols_val, rows_val);

        self.exec_sessions
            .write()
            .await
            .insert(exec_id.clone(), session.clone());

        let sessions_ref = self.exec_sessions.clone();
        let eid_clone = exec_id.clone();

        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            let data_event = format!("k8s:terminal:data:{}", eid_clone);
            let closed_event = format!("k8s:terminal:closed:{}", eid_clone);

            loop {
                tokio::select! {
                    maybe_out = rx.recv() => {
                        match maybe_out {
                            Some(frame) if !frame.is_empty() => {
                                if ws_sink.send(WsMessage::Binary(frame)).await.is_err() {
                                    break;
                                }
                            }
                            _ => {
                                let _ = ws_sink.close().await;
                                break;
                            }
                        }
                    }
                    maybe_in = ws_source.next() => {
                        match maybe_in {
                            Some(Ok(WsMessage::Binary(data))) => {
                                if data.len() > 1 {
                                    let channel = data[0];
                                    if channel == 1 || channel == 2 || channel == 3 {
                                        let payload = BASE64.encode(&data[1..]);
                                        let _ = app.emit(&data_event, payload);
                                    }
                                }
                            }
                            Some(Ok(WsMessage::Close(_))) | None | Some(Err(_)) => {
                                break;
                            }
                            _ => {}
                        }
                    }
                }
            }

            sessions_ref.write().await.remove(&eid_clone);
            let _ = app.emit(&closed_event, "容器会话已退出".to_string());
        });

        Ok(exec_id)
    }

    pub async fn exec_write(&self, exec_id: &str, data: &str) -> Result<(), String> {
        let session = self
            .exec_sessions
            .read()
            .await
            .get(exec_id)
            .cloned()
            .ok_or_else(|| format!("终端会话不存在或已断开: {}", exec_id))?;
        session.write(data)
    }

    pub async fn exec_resize(&self, exec_id: &str, cols: u32, rows: u32) -> Result<(), String> {
        if let Some(session) = self.exec_sessions.read().await.get(exec_id).cloned() {
            let _ = session.resize(cols, rows);
        }
        Ok(())
    }

    pub async fn exec_close(&self, exec_id: &str) -> Result<(), String> {
        if let Some(session) = self.exec_sessions.write().await.remove(exec_id) {
            session.close();
        }
        Ok(())
    }
}

// ----------------- TLS & Websocket Helpers -----------------

#[derive(Debug)]
struct NoCertVerifier;

impl rustls::client::danger::ServerCertVerifier for NoCertVerifier {
    fn verify_server_cert(
        &self,
        _end_entity: &rustls::pki_types::CertificateDer<'_>,
        _intermediates: &[rustls::pki_types::CertificateDer<'_>],
        _server_name: &rustls::pki_types::ServerName<'_>,
        _ocsp_response: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::pki_types::CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::pki_types::CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
        vec![
            rustls::SignatureScheme::RSA_PKCS1_SHA256,
            rustls::SignatureScheme::RSA_PKCS1_SHA384,
            rustls::SignatureScheme::RSA_PKCS1_SHA512,
            rustls::SignatureScheme::ECDSA_NISTP256_SHA256,
            rustls::SignatureScheme::ECDSA_NISTP384_SHA384,
            rustls::SignatureScheme::ECDSA_NISTP521_SHA512,
            rustls::SignatureScheme::RSA_PSS_SHA256,
            rustls::SignatureScheme::RSA_PSS_SHA384,
            rustls::SignatureScheme::RSA_PSS_SHA512,
            rustls::SignatureScheme::ED25519,
        ]
    }
}

fn build_ws_tls_connector(insecure: bool) -> Option<tokio_tungstenite::Connector> {
    if !insecure {
        return None;
    }
    let provider = rustls::crypto::ring::default_provider();
    let cfg = rustls::ClientConfig::builder_with_provider(Arc::new(provider))
        .with_safe_default_protocol_versions()
        .ok()?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(NoCertVerifier))
        .with_no_client_auth();
    Some(tokio_tungstenite::Connector::Rustls(Arc::new(cfg)))
}

// ======================== Tauri Commands ========================

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn k8s_exec_start(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    namespace: String,
    pod_name: String,
    container: String,
    command: String,
    cols: u32,
    rows: u32,
) -> Result<String, String> {
    let cli = state.k8s.get_client(&id).await?;
    state
        .k8s
        .start_exec(
            app, &cli, &namespace, &pod_name, &container, &command, cols, rows,
        )
        .await
}

#[tauri::command]
pub async fn k8s_exec_write(
    state: State<'_, AppState>,
    exec_id: String,
    data: String,
) -> Result<(), String> {
    state.k8s.exec_write(&exec_id, &data).await
}

#[tauri::command]
pub async fn k8s_exec_resize(
    state: State<'_, AppState>,
    exec_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    state.k8s.exec_resize(&exec_id, cols, rows).await
}

#[tauri::command]
pub async fn k8s_exec_close(state: State<'_, AppState>, exec_id: String) -> Result<(), String> {
    state.k8s.exec_close(&exec_id).await
}

