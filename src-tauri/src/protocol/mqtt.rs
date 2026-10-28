use crate::core::ServerConfig;
use crate::storage;
use crate::AppState;
use chrono::Utc;
use rumqttc::{AsyncClient, Event, Incoming, LastWill, MqttOptions, QoS, TlsConfiguration, Transport};
use std::collections::HashMap;
use std::fs;
use std::io::{BufReader, Cursor};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{oneshot, Mutex};
use uuid::Uuid;

// ===================== TLS 无校验 Verifier =====================

#[derive(Debug)]
pub(crate) struct NoCertificateVerification;

impl rustls::client::danger::ServerCertVerifier for NoCertificateVerification {
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
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

impl rumqttc::tokio_rustls::rustls::client::danger::ServerCertVerifier
    for NoCertificateVerification
{
    fn verify_server_cert(
        &self,
        _end_entity: &rustls::pki_types::CertificateDer<'_>,
        _intermediates: &[rustls::pki_types::CertificateDer<'_>],
        _server_name: &rustls::pki_types::ServerName<'_>,
        _ocsp_response: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> Result<
        rumqttc::tokio_rustls::rustls::client::danger::ServerCertVerified,
        rumqttc::tokio_rustls::rustls::Error,
    > {
        Ok(rumqttc::tokio_rustls::rustls::client::danger::ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::pki_types::CertificateDer<'_>,
        _dss: &rumqttc::tokio_rustls::rustls::DigitallySignedStruct,
    ) -> Result<
        rumqttc::tokio_rustls::rustls::client::danger::HandshakeSignatureValid,
        rumqttc::tokio_rustls::rustls::Error,
    > {
        Ok(rumqttc::tokio_rustls::rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &rustls::pki_types::CertificateDer<'_>,
        _dss: &rumqttc::tokio_rustls::rustls::DigitallySignedStruct,
    ) -> Result<
        rumqttc::tokio_rustls::rustls::client::danger::HandshakeSignatureValid,
        rumqttc::tokio_rustls::rustls::Error,
    > {
        Ok(rumqttc::tokio_rustls::rustls::client::danger::HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<rumqttc::tokio_rustls::rustls::SignatureScheme> {
        rumqttc::tokio_rustls::rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

pub(crate) fn read_pem_bytes(input: &str) -> Vec<u8> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    if let Ok(bytes) = fs::read(trimmed) {
        bytes
    } else {
        trimmed.as_bytes().to_vec()
    }
}

fn to_qos(qos: u8) -> QoS {
    match qos {
        1 => QoS::AtLeastOnce,
        2 => QoS::ExactlyOnce,
        _ => QoS::AtMostOnce,
    }
}

fn from_qos(qos: QoS) -> u8 {
    match qos {
        QoS::AtMostOnce => 0,
        QoS::AtLeastOnce => 1,
        QoS::ExactlyOnce => 2,
    }
}

fn build_mqtt_rustls_client_config(
    insecure: bool,
    ca_input: &str,
    cert_input: &str,
    key_input: &str,
) -> Result<Arc<rumqttc::tokio_rustls::rustls::ClientConfig>, String> {
    use rumqttc::tokio_rustls::rustls as mqtt_rustls;
    let provider = Arc::new(mqtt_rustls::crypto::ring::default_provider());
    let builder = mqtt_rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|e| format!("初始化 MQTT TLS 失败: {}", e))?;

    let mut root_store = mqtt_rustls::RootCertStore::empty();
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

fn build_mqtt_options(cfg: &ServerConfig, is_test: bool) -> Result<(MqttOptions, Duration), String> {
    let port = if cfg.port <= 0 {
        if cfg.use_tls {
            8883
        } else {
            1883
        }
    } else {
        cfg.port as u16
    };

    let client_id = if !cfg.client_id.trim().is_empty() {
        cfg.client_id.trim().to_string()
    } else if is_test {
        format!("tauri-test-mqtt-{}", Uuid::new_v4())
    } else {
        format!("tauri-mqtt-{}", Uuid::new_v4())
    };

    let keep_alive = if cfg.mqtt_keep_alive <= 0 {
        30
    } else {
        cfg.mqtt_keep_alive as u64
    };
    let connect_timeout = if is_test {
        5
    } else if cfg.mqtt_connect_timeout <= 0 {
        10
    } else {
        cfg.mqtt_connect_timeout as u64
    };

    let mut opts = MqttOptions::new(client_id, cfg.host.trim(), port);
    opts.set_keep_alive(Duration::from_secs(keep_alive));
    opts.set_clean_session(if is_test { true } else { cfg.mqtt_clean_session });

    if !cfg.username.is_empty() || !cfg.password.is_empty() {
        opts.set_credentials(cfg.username.clone(), cfg.password.clone());
    }

    if !is_test && !cfg.mqtt_will_topic.trim().is_empty() {
        let w_qos = to_qos(cfg.mqtt_will_qos.clamp(0, 2) as u8);
        opts.set_last_will(LastWill::new(
            cfg.mqtt_will_topic.trim(),
            cfg.mqtt_will_payload.as_bytes().to_vec(),
            w_qos,
            cfg.mqtt_will_retained,
        ));
    }

    if cfg.use_tls {
        let tls_cfg = build_mqtt_rustls_client_config(
            cfg.mqtt_insecure,
            &cfg.mqtt_ca_cert,
            &cfg.mqtt_client_cert,
            &cfg.mqtt_client_key,
        )?;
        opts.set_transport(Transport::Tls(TlsConfiguration::Rustls(tls_cfg)));
    }

    Ok((opts, Duration::from_secs(connect_timeout)))
}

pub(crate) struct MqttConnEntry {
    pub(crate) client: AsyncClient,
    pub(crate) subs: Mutex<HashMap<String, u8>>,
    pub(crate) stop_tx: Mutex<Option<oneshot::Sender<()>>>,
}

impl MqttConnEntry {
    pub(crate) async fn close(&self) {
        if let Some(tx) = self.stop_tx.lock().await.take() {
            let _ = tx.send(());
        }
        let _ = self.client.disconnect().await;
    }
}

// ===================== MQTT Commands =====================

#[tauri::command]
pub async fn mqtt_connect(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    let cfg = state
        .store
        .get(&id)
        .ok_or_else(|| "服务器配置不存在".to_string())?;
    if cfg.normalized_type() != "mqtt" {
        return Err("该连接不是 MQTT 类型".to_string());
    }
    state.mqtt_api.close_mqtt(&id).await;

    let (opts, connect_timeout) = build_mqtt_options(&cfg, false)?;
    let (client, mut eventloop) = AsyncClient::new(opts, 64);

    let deadline = tokio::time::Instant::now() + connect_timeout;
    loop {
        let poll_res = tokio::time::timeout_at(deadline, eventloop.poll())
            .await
            .map_err(|_| "MQTT 连接超时".to_string())?;
        match poll_res {
            Ok(Event::Incoming(Incoming::ConnAck(_))) => break,
            Ok(_) => continue,
            Err(e) => return Err(format!("MQTT 连接失败: {}", e)),
        }
    }

    let (stop_tx, mut stop_rx) = oneshot::channel::<()>();
    let entry = Arc::new(MqttConnEntry {
        client,
        subs: Mutex::new(HashMap::new()),
        stop_tx: Mutex::new(Some(stop_tx)),
    });

    state.mqtt_api.insert_mqtt(id.clone(), entry).await;

    let status_event = format!("mqtt:status:{}", id);
    let msg_event = format!("mqtt:message:{}", id);
    let _ = app.emit(
        &status_event,
        serde_json::json!({
            "connected": true,
            "reason": "",
        }),
    );

    let auto_reconnect = cfg.mqtt_auto_reconnect;
    let reconnect_intvl = if cfg.mqtt_reconnect_intvl <= 0 {
        5
    } else {
        cfg.mqtt_reconnect_intvl as u64
    };

    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut stop_rx => break,
                ev = eventloop.poll() => {
                    match ev {
                        Ok(Event::Incoming(Incoming::Publish(p))) => {
                            let payload_str = String::from_utf8_lossy(&p.payload).to_string();
                            let _ = app.emit(&msg_event, serde_json::json!({
                                "topic": p.topic,
                                "payload": payload_str,
                                "qos": from_qos(p.qos),
                                "retained": p.retain,
                                "ts": Utc::now().timestamp_millis(),
                            }));
                        }
                        Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                            let _ = app.emit(&status_event, serde_json::json!({
                                "connected": true,
                                "reason": "",
                            }));
                        }
                        Ok(Event::Incoming(Incoming::Disconnect)) => {
                            let _ = app.emit(&status_event, serde_json::json!({
                                "connected": false,
                                "reason": "disconnected",
                                "error": "disconnected",
                            }));
                            if !auto_reconnect {
                                break;
                            }
                        }
                        Ok(_) => {}
                        Err(e) => {
                            let err_str = e.to_string();
                            let _ = app.emit(&status_event, serde_json::json!({
                                "connected": false,
                                "reason": err_str,
                                "error": err_str,
                            }));
                            if !auto_reconnect {
                                break;
                            }
                            tokio::time::sleep(Duration::from_secs(reconnect_intvl)).await;
                        }
                    }
                }
            }
        }
    });

    Ok(true)
}

#[tauri::command]
pub async fn mqtt_close(state: State<'_, AppState>, id: String) -> Result<(), String> {
    storage::log_info(format!("关闭 MQTT Broker 连接 [ID={}]", id));
    state.mqtt_api.close_mqtt(&id).await;
    Ok(())
}

#[tauri::command]
pub async fn mqtt_publish(
    state: State<'_, AppState>,
    id: String,
    topic: String,
    payload: String,
    qos: u8,
    retained: bool,
) -> Result<(), String> {
    let c = state.mqtt_api.get_mqtt(&id).await?;
    let t = topic.trim();
    if t.is_empty() {
        return Err("主题不能为空".to_string());
    }
    c.client
        .publish(t, to_qos(qos), retained, payload.into_bytes())
        .await
        .map_err(|e| format!("发布失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn mqtt_subscribe(
    state: State<'_, AppState>,
    id: String,
    topic: String,
    qos: u8,
) -> Result<(), String> {
    let c = state.mqtt_api.get_mqtt(&id).await?;
    let t = topic.trim();
    if t.is_empty() {
        return Err("主题不能为空".to_string());
    }
    let normalized_qos = qos.min(2);
    c.client
        .subscribe(t, to_qos(normalized_qos))
        .await
        .map_err(|e| format!("订阅失败: {}", e))?;
    let mut subs = c.subs.lock().await;
    subs.insert(t.to_string(), normalized_qos);
    Ok(())
}

#[tauri::command]
pub async fn mqtt_unsubscribe(
    state: State<'_, AppState>,
    id: String,
    topic: String,
) -> Result<(), String> {
    let c = state.mqtt_api.get_mqtt(&id).await?;
    c.client
        .unsubscribe(&topic)
        .await
        .map_err(|e| format!("取消订阅失败: {}", e))?;
    let mut subs = c.subs.lock().await;
    subs.remove(&topic);
    Ok(())
}

#[tauri::command]
pub async fn mqtt_subscriptions(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let c = state.mqtt_api.get_mqtt(&id).await?;
    let subs = c.subs.lock().await;
    let mut list: Vec<(String, u8)> = subs.iter().map(|(k, v)| (k.clone(), *v)).collect();
    list.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(list
        .into_iter()
        .map(|(t, q)| serde_json::json!({ "topic": t, "qos": q }))
        .collect())
}

#[tauri::command]
pub async fn mqtt_test_connection(cfg: ServerConfig) -> Result<serde_json::Value, String> {
    let (opts, connect_timeout) = build_mqtt_options(&cfg, true)?;
    let (client, mut eventloop) = AsyncClient::new(opts, 16);
    let start = Instant::now();
    let deadline = tokio::time::Instant::now() + connect_timeout;

    loop {
        let poll_res = tokio::time::timeout_at(deadline, eventloop.poll())
            .await
            .map_err(|_| "MQTT 连接超时 (5s)".to_string())?;
        match poll_res {
            Ok(Event::Incoming(Incoming::ConnAck(_))) => break,
            Ok(_) => continue,
            Err(e) => return Err(format!("MQTT 连接失败: {}", e)),
        }
    }

    let latency = start.elapsed().as_millis() as i64;
    let _ = client.disconnect().await;
    Ok(serde_json::json!({
        "connected": true,
        "pingMs": latency,
    }))
}

