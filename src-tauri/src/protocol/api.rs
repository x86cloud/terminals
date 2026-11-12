use crate::protocol::mqtt::{read_pem_bytes, NoCertificateVerification};
use crate::storage;
use crate::AppState;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufReader, Cursor};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use uuid::Uuid;

pub fn build_rustls_client_config(
    insecure: bool,
    ca_input: &str,
    cert_input: &str,
    key_input: &str,
) -> Result<Arc<rustls::ClientConfig>, String> {
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let builder = rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|e| format!("初始化 TLS 失败: {}", e))?;

    let mut root_store = rustls::RootCertStore::empty();
    let ca_bytes = read_pem_bytes(ca_input);
    if !ca_bytes.is_empty() {
        let certs = rustls_pemfile::certs(&mut BufReader::new(Cursor::new(ca_bytes)))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("解析 CA 证书失败: {}", e))?;
        for cert in certs {
            root_store
                .add(cert)
                .map_err(|e| format!("添加 CA 证书失败: {}", e))?;
        }
    }

    let cert_bytes = read_pem_bytes(cert_input);
    let key_bytes = read_pem_bytes(key_input);
    let client_auth = if !cert_bytes.is_empty() && !key_bytes.is_empty() {
        let certs = rustls_pemfile::certs(&mut BufReader::new(Cursor::new(cert_bytes)))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("解析客户端证书失败: {}", e))?;
        let key = rustls_pemfile::private_key(&mut BufReader::new(Cursor::new(key_bytes)))
            .map_err(|e| format!("读取客户端私钥失败: {}", e))?
            .ok_or_else(|| "未找到有效的客户端私钥".to_string())?;
        Some((certs, key))
    } else {
        None
    };

    let config = if insecure || root_store.is_empty() {
        let verifier = Arc::new(NoCertificateVerification);
        let b = builder.dangerous().with_custom_certificate_verifier(verifier);
        if let Some((certs, key)) = client_auth {
            b.with_client_auth_cert(certs, key)
                .map_err(|e| format!("设置客户端证书失败: {}", e))?
        } else {
            b.with_no_client_auth()
        }
    } else {
        let b = builder.with_root_certificates(root_store);
        if let Some((certs, key)) = client_auth {
            b.with_client_auth_cert(certs, key)
                .map_err(|e| format!("设置客户端证书失败: {}", e))?
        } else {
            b.with_no_client_auth()
        }
    };

    Ok(Arc::new(config))
}

pub(crate) struct WsConnEntry {
    pub(crate) tx: mpsc::UnboundedSender<WsMessage>,
    pub(crate) stop_tx: Mutex<Option<oneshot::Sender<()>>>,
}

impl WsConnEntry {
    pub(crate) async fn close(&self) {
        let _ = self.tx.send(WsMessage::Close(None));
        if let Some(tx) = self.stop_tx.lock().await.take() {
            let _ = tx.send(());
        }
    }
}

// ===================== HTTP / WebSocket 数据结构 =====================

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ApiHeader {
    pub name: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ApiAuth {
    #[serde(rename = "type")]
    pub auth_type: String, // none | basic | bearer | apikey
    pub username: String,
    pub password: String,
    pub token: String,
    pub key: String,
    pub value: String,
    pub add_to: String, // header | query
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ApiRequest {
    pub method: String,
    pub url: String,
    pub params: Vec<ApiHeader>,
    pub headers: Vec<ApiHeader>,
    pub body_type: String,
    pub body: String,
    pub timeout_ms: i64,
    #[serde(rename = "insecureTLS", alias = "insecureTls")]
    pub insecure_tls: bool,
    pub follow_redirects: bool,
    pub auth: Option<ApiAuth>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ApiResponse {
    pub status: String,
    pub status_code: i32,
    pub proto: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub duration_ms: i64,
    pub size: i64,
    pub content_type: String,
    pub is_base64: bool,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WsConnectRequest {
    pub url: String,
    pub headers: Vec<ApiHeader>,
    #[serde(rename = "insecureTLS", alias = "insecureTls")]
    pub insecure_tls: bool,
    pub auth: Option<ApiAuth>,
    pub protocols: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WsConnectResult {
    pub id: String,
    pub url: String,
    pub status: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WsStatusEvent {
    pub status: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WsMessageEvent {
    pub dir: String,
    pub payload: String,
    #[serde(rename = "type")]
    pub msg_type: String,
    pub ts: i64,
    pub error: String,
}

const DEFAULT_API_TREE_JSON: &str = r#"[
  {
    "id": "folder_default",
    "name": "默认分组",
    "isFolder": true,
    "createdAt": 1700000000000,
    "updatedAt": 1700000000000,
    "children": [
      {
        "id": "api_example_get",
        "name": "示例: GET 请求",
        "isFolder": false,
        "mode": "http",
        "method": "GET",
        "url": "https://httpbin.org/get",
        "params": [
          {
            "name": "test",
            "value": "123",
            "enabled": true
          }
        ],
        "headers": [],
        "bodyType": "none",
        "body": "",
        "auth": {
          "type": "none"
        },
        "timeoutMs": 30000,
        "insecureTLS": false,
        "followRedirects": true,
        "createdAt": 1700000000000,
        "updatedAt": 1700000000000
      }
    ]
  }
]"#;

// ===================== HTTP API Commands =====================

#[tauri::command]
pub async fn api_request(req: ApiRequest) -> Result<ApiResponse, String> {
    let mut resp = ApiResponse::default();
    let raw_url = req.url.trim();
    if raw_url.is_empty() {
        resp.error = "请求地址不能为空".to_string();
        return Ok(resp);
    }

    let mut parsed_url = match url::Url::parse(raw_url) {
        Ok(u) => u,
        Err(e) => {
            resp.error = format!("无效的请求地址: {}", e);
            return Ok(resp);
        }
    };

    if parsed_url.scheme().is_empty() || parsed_url.host_str().is_none() {
        resp.error = "请求地址需要包含协议和主机，如 https://example.com/api".to_string();
        return Ok(resp);
    }

    // 附加查询参数
    {
        let mut query_pairs = parsed_url.query_pairs_mut();
        for p in &req.params {
            if p.enabled && !p.name.trim().is_empty() {
                query_pairs.append_pair(p.name.trim(), &p.value);
            }
        }
        if let Some(auth) = &req.auth {
            if auth.auth_type == "apikey"
                && auth.add_to.eq_ignore_ascii_case("query")
                && !auth.key.trim().is_empty()
            {
                query_pairs.append_pair(auth.key.trim(), &auth.value);
            }
        }
    }

    let method_str = if req.method.trim().is_empty() {
        "GET".to_string()
    } else {
        req.method.trim().to_uppercase()
    };

    let method = match reqwest::Method::from_bytes(method_str.as_bytes()) {
        Ok(m) => m,
        Err(e) => {
            resp.error = format!("构造请求方法失败: {}", e);
            return Ok(resp);
        }
    };

    let timeout_ms = if req.timeout_ms <= 0 {
        30_000
    } else {
        req.timeout_ms as u64
    };

    let redirect_policy = if req.follow_redirects {
        reqwest::redirect::Policy::limited(10)
    } else {
        reqwest::redirect::Policy::none()
    };

    let client = match reqwest::Client::builder()
        .danger_accept_invalid_certs(req.insecure_tls)
        .redirect(redirect_policy)
        .timeout(Duration::from_millis(timeout_ms))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            resp.error = format!("构造 HTTP 客户端失败: {}", e);
            return Ok(resp);
        }
    };

    let mut builder = client.request(method, parsed_url);

    for h in &req.headers {
        let name = h.name.trim();
        if !h.enabled || name.is_empty() || name.eq_ignore_ascii_case("host") {
            continue;
        }
        builder = builder.header(name, &h.value);
    }

    if let Some(auth) = &req.auth {
        match auth.auth_type.as_str() {
            "basic" => {
                builder = builder.basic_auth(&auth.username, Some(&auth.password));
            }
            "bearer" => {
                let token = auth.token.trim();
                if !token.is_empty() {
                    builder = builder.bearer_auth(token);
                }
            }
            "apikey" => {
                if !auth.add_to.eq_ignore_ascii_case("query") && !auth.key.trim().is_empty() {
                    builder = builder.header(auth.key.trim(), &auth.value);
                }
            }
            _ => {}
        }
    }

    if method_str != "GET" && method_str != "HEAD" && !req.body.is_empty() {
        builder = builder.body(req.body.clone());
    }

    let start = Instant::now();
    let http_resp = match builder.send().await {
        Ok(r) => r,
        Err(e) => {
            resp.duration_ms = start.elapsed().as_millis() as i64;
            resp.error = format!("请求失败: {}", e);
            return Ok(resp);
        }
    };
    resp.duration_ms = start.elapsed().as_millis() as i64;

    let status = http_resp.status();
    resp.status_code = status.as_u16() as i32;
    resp.status = format!(
        "{} {}",
        status.as_u16(),
        status.canonical_reason().unwrap_or("")
    )
    .trim()
    .to_string();
    resp.proto = format!("{:?}", http_resp.version());

    for (k, v) in http_resp.headers().iter() {
        if let Ok(val_str) = v.to_str() {
            if k.as_str().eq_ignore_ascii_case("content-type") {
                resp.content_type = val_str.to_string();
            }
            resp.headers.insert(k.to_string(), val_str.to_string());
        }
    }

    const MAX_BODY: usize = 16 << 20;
    match http_resp.bytes().await {
        Ok(bytes) => {
            resp.size = bytes.len() as i64;
            let slice = if bytes.len() > MAX_BODY {
                &bytes[..MAX_BODY]
            } else {
                &bytes[..]
            };
            match std::str::from_utf8(slice) {
                Ok(text) => {
                    if bytes.len() > MAX_BODY {
                        resp.body = format!("{}\n\n[响应体过大，已截断至 16MB]", text);
                    } else {
                        resp.body = text.to_string();
                    }
                    resp.is_base64 = false;
                }
                Err(_) => {
                    resp.body = BASE64.encode(slice);
                    resp.is_base64 = true;
                }
            }
        }
        Err(e) => {
            resp.error = format!("读取响应失败: {}", e);
        }
    }

    Ok(resp)
}

#[tauri::command]
pub async fn load_api_tree(state: State<'_, AppState>) -> Result<String, String> {
    let _guard = state.mqtt_api.api_tree_lock.lock().await;
    let file_path = storage::apis_path();
    match fs::read(&file_path) {
        Ok(data) if !data.is_empty() => Ok(String::from_utf8_lossy(&data).to_string()),
        Ok(_) => {
            let _ = storage::write_file_atomic(&file_path, DEFAULT_API_TREE_JSON.as_bytes());
            Ok(DEFAULT_API_TREE_JSON.to_string())
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let _ = storage::write_file_atomic(&file_path, DEFAULT_API_TREE_JSON.as_bytes());
            Ok(DEFAULT_API_TREE_JSON.to_string())
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn save_api_tree(state: State<'_, AppState>, content: String) -> Result<(), String> {
    let _guard = state.mqtt_api.api_tree_lock.lock().await;
    let file_path = storage::apis_path();
    storage::write_file_atomic(&file_path, content.as_bytes())
}

#[tauri::command]
pub async fn choose_import_api_file(_app: AppHandle) -> Result<String, String> {
    let picked = tokio::task::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("选择要导入的 API 接口 JSON 文件")
            .add_filter("JSON", &["json"])
            .pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;

    let Some(file_path) = picked else {
        return Ok(String::new());
    };
    fs::read_to_string(&file_path).map_err(|e| format!("读取文件失败: {}", e))
}

#[tauri::command]
pub async fn choose_export_api_file(
    _app: AppHandle,
    content: String,
    default_name: String,
) -> Result<String, String> {
    let file_name = if default_name.trim().is_empty() {
        "apis_backup.json".to_string()
    } else {
        default_name
    };
    let picked = tokio::task::spawn_blocking(move || {
        rfd::FileDialog::new()
            .set_title("导出 API 接口数据")
            .set_file_name(&file_name)
            .add_filter("JSON", &["json"])
            .save_file()
    })
    .await
    .map_err(|e| e.to_string())?;

    let Some(file_path) = picked else {
        return Ok(String::new());
    };
    storage::write_file_atomic(&file_path, content.as_bytes())?;
    Ok(file_path.to_string_lossy().to_string())
}

// ===================== WebSocket Commands =====================

#[tauri::command]
pub async fn ws_connect(
    app: AppHandle,
    state: State<'_, AppState>,
    req: WsConnectRequest,
) -> Result<WsConnectResult, String> {
    let url_str = req.url.trim().to_string();
    if url_str.is_empty() {
        return Err("WebSocket 地址不能为空".to_string());
    }
    if !url_str.starts_with("ws://") && !url_str.starts_with("wss://") {
        return Err("WebSocket 地址需以 ws:// 或 wss:// 开头".to_string());
    }

    let id = Uuid::new_v4().to_string();
    let mut client_req = url_str
        .as_str()
        .into_client_request()
        .map_err(|e| format!("无效的 WebSocket 地址: {}", e))?;

    for h in &req.headers {
        let name = h.name.trim();
        if !h.enabled || name.is_empty() {
            continue;
        }
        if let (Ok(hn), Ok(hv)) = (
            name.parse::<tokio_tungstenite::tungstenite::http::HeaderName>(),
            HeaderValue::from_str(&h.value),
        ) {
            client_req.headers_mut().insert(hn, hv);
        }
    }

    if let Some(auth) = &req.auth {
        match auth.auth_type.as_str() {
            "basic" => {
                let raw = format!("{}:{}", auth.username, auth.password);
                let val = format!("Basic {}", BASE64.encode(raw.as_bytes()));
                if let Ok(hv) = HeaderValue::from_str(&val) {
                    client_req.headers_mut().insert("Authorization", hv);
                }
            }
            "bearer" => {
                let token = auth.token.trim();
                if !token.is_empty() {
                    let val = format!("Bearer {}", token);
                    if let Ok(hv) = HeaderValue::from_str(&val) {
                        client_req.headers_mut().insert("Authorization", hv);
                    }
                }
            }
            _ => {}
        }
    }

    if !req.protocols.is_empty() {
        let proto_val = req.protocols.join(", ");
        if let Ok(hv) = HeaderValue::from_str(&proto_val) {
            client_req
                .headers_mut()
                .insert("Sec-WebSocket-Protocol", hv);
        }
    }

    let connector = if req.insecure_tls && url_str.starts_with("wss://") {
        let tls_cfg = build_rustls_client_config(true, "", "", "")?;
        Some(tokio_tungstenite::Connector::Rustls(tls_cfg))
    } else {
        None
    };

    let connect_fut =
        tokio_tungstenite::connect_async_tls_with_config(client_req, None, false, connector);
    let (ws_stream, _) = match tokio::time::timeout(Duration::from_secs(15), connect_fut).await {
        Ok(Ok(pair)) => pair,
        Ok(Err(e)) => {
            return Err(format!("握手失败: {}", e));
        }
        Err(_) => {
            return Err("WebSocket 握手超时".to_string());
        }
    };

    let (mut ws_write, mut ws_read) = ws_stream.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<WsMessage>();
    let (stop_tx, mut stop_rx) = oneshot::channel::<()>();

    let entry = Arc::new(WsConnEntry {
        tx,
        stop_tx: Mutex::new(Some(stop_tx)),
    });

    state.mqtt_api.insert_ws(id.clone(), entry).await;

    let status_event = format!("ws:status:{}", id);
    let msg_event = format!("ws:message:{}", id);

    let _ = app.emit(
        &status_event,
        WsStatusEvent {
            status: "open".to_string(),
            error: String::new(),
        },
    );
    let _ = app.emit(
        &msg_event,
        WsMessageEvent {
            dir: "sys".to_string(),
            payload: format!("已连接到 {}", url_str),
            msg_type: "system".to_string(),
            ts: Utc::now().timestamp_millis(),
            error: String::new(),
        },
    );

    let mqtt_api_mgr = state.mqtt_api.clone();
    let id_clone = id.clone();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut stop_rx => {
                    let _ = ws_write.close().await;
                    break;
                }
                Some(out_msg) = rx.recv() => {
                    let is_close = matches!(out_msg, WsMessage::Close(_));
                    if ws_write.send(out_msg).await.is_err() || is_close {
                        break;
                    }
                }
                incoming = ws_read.next() => {
                    match incoming {
                        Some(Ok(WsMessage::Text(text))) => {
                            let _ = app.emit(&msg_event, WsMessageEvent {
                                dir: "in".to_string(),
                                payload: text.to_string(),
                                msg_type: "text".to_string(),
                                ts: Utc::now().timestamp_millis(),
                                error: String::new(),
                            });
                        }
                        Some(Ok(WsMessage::Binary(bin))) => {
                            let _ = app.emit(&msg_event, WsMessageEvent {
                                dir: "in".to_string(),
                                payload: BASE64.encode(&bin),
                                msg_type: "binary".to_string(),
                                ts: Utc::now().timestamp_millis(),
                                error: String::new(),
                            });
                        }
                        Some(Ok(WsMessage::Close(frame))) => {
                            let reason = frame
                                .map(|f| f.reason.to_string())
                                .unwrap_or_else(|| "正常关闭".to_string());
                            let _ = app.emit(&status_event, WsStatusEvent {
                                status: "closed".to_string(),
                                error: String::new(),
                            });
                            let _ = app.emit(&msg_event, WsMessageEvent {
                                dir: "sys".to_string(),
                                payload: format!("连接已关闭: {}", reason),
                                msg_type: "system".to_string(),
                                ts: Utc::now().timestamp_millis(),
                                error: String::new(),
                            });
                            mqtt_api_mgr.close_ws(&id_clone).await;
                            break;
                        }
                        Some(Ok(_)) => {}
                        Some(Err(e)) => {
                            let err_str = e.to_string();
                            let _ = app.emit(&status_event, WsStatusEvent {
                                status: "closed".to_string(),
                                error: err_str.clone(),
                            });
                            let _ = app.emit(&msg_event, WsMessageEvent {
                                dir: "sys".to_string(),
                                payload: format!("连接已关闭: {}", err_str),
                                msg_type: "system".to_string(),
                                ts: Utc::now().timestamp_millis(),
                                error: err_str,
                            });
                            mqtt_api_mgr.close_ws(&id_clone).await;
                            break;
                        }
                        None => {
                            let _ = app.emit(&status_event, WsStatusEvent {
                                status: "closed".to_string(),
                                error: String::new(),
                            });
                            mqtt_api_mgr.close_ws(&id_clone).await;
                            break;
                        }
                    }
                }
            }
        }
    });

    Ok(WsConnectResult {
        id,
        url: url_str,
        status: "open".to_string(),
        error: String::new(),
    })
}

#[tauri::command]
pub async fn ws_send(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    message: String,
) -> Result<(), String> {
    let conn = state.mqtt_api.get_ws(&id).await?;

    conn.tx
        .send(WsMessage::Text(message.clone()))
        .map_err(|e| format!("WebSocket 发送失败: {}", e))?;

    let msg_event = format!("ws:message:{}", id);
    let _ = app.emit(
        &msg_event,
        WsMessageEvent {
            dir: "out".to_string(),
            payload: message,
            msg_type: "text".to_string(),
            ts: Utc::now().timestamp_millis(),
            error: String::new(),
        },
    );
    Ok(())
}

#[tauri::command]
pub async fn ws_close(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    state.mqtt_api.close_ws(&id).await;
    let msg_event = format!("ws:message:{}", id);
    let status_event = format!("ws:status:{}", id);
    let _ = app.emit(
        &msg_event,
        WsMessageEvent {
            dir: "sys".to_string(),
            payload: "已主动断开连接".to_string(),
            msg_type: "system".to_string(),
            ts: Utc::now().timestamp_millis(),
            error: String::new(),
        },
    );
    let _ = app.emit(
        &status_event,
        WsStatusEvent {
            status: "closed".to_string(),
            error: String::new(),
        },
    );
    Ok(())
}

